import { dateInSeoul } from "@/features/orders/calculations";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStaff } from "@/features/admin/auth";
import { readBody, apiError, checkDb, HttpError } from "@/features/admin/http";
import {
  productSchema,
  settingsSchema,
  submitSchema,
  type Checkout,
  type Shipment,
} from "@/features/admin/schema";
import { shippingWorkbook } from "@/features/admin/excel";
const uuid = z.string().uuid();
const idsSchema = z
  .array(uuid)
  .min(1)
  .max(1000)
  .refine((a) => new Set(a).size === a.length);
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  try {
    const staffUser = await getStaff();
    if (!staffUser) throw new HttpError("관리자 로그인이 필요합니다.", 401);
    const { path } = await context.params;
    const db = createServiceClient();
    const url = new URL(request.url);
    if (path[0] === "products") {
      const { data, error } = await db
        .from("products")
        .select("*")
        .order("sort_order")
        .order("id");
      checkDb(error);
      return Response.json(data);
    }
    if (path[0] === "settings") {
      const [a, b] = await Promise.all([
        db.from("delivery_settings").select("*").eq("id", 1).single(),
        db.from("shipping_settings").select("*").eq("id", 1).single(),
      ]);
      checkDb(a.error);
      checkDb(b.error);
      return Response.json({ ...a.data, ...b.data });
    }
    if (path[0] === "orders") {
      const filters: Record<string, string> = {};
      for (const name of [
        "number",
        "sender",
        "recipient",
        "status",
        "shipping",
        "date",
        "processing",
        "product",
      ]) {
        const value = url.searchParams.get(name);
        if (value) filters[name] = z.string().max(100).parse(value);
      }
      if (path[1]) filters.id = uuid.parse(path[1]);
      if (filters.number)
        z.coerce.number().int().positive().parse(filters.number);
      if (filters.product) uuid.parse(filters.product);
      for (const key of ["date", "processing"])
        if (filters[key])
          z.string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .parse(filters[key]);
      if (filters.status)
        z.enum(["pending", "paid", "cancelled"]).parse(filters.status);
      if (filters.shipping)
        z.enum(["waiting", "exported", "shipped"]).parse(filters.shipping);
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .max(1000000)
        .parse(url.searchParams.get("page") || 0);
      const { data, error } = await db.rpc("list_checkouts", {
        p_filters: filters,
        p_page: page,
        p_actor: staffUser.id,
      });
      checkDb(error);
      return Response.json(data);
    }
    if (path[0] === "exports") {
      if (path[1]) {
        const { data, error } = await db
          .from("export_batches")
          .select("filename,file_base64")
          .eq("id", uuid.parse(path[1]))
          .single();
        checkDb(error);
        return new Response(Buffer.from(data!.file_base64, "base64"), {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(data!.filename)}`,
            "Cache-Control": "private, no-store",
          },
        });
      }
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .parse(url.searchParams.get("page") || 0);
      const { data, error, count } = await db
        .from("export_batches")
        .select(
          "id,filename,created_at,created_by,export_members(delivery_id,deliveries(recipient,status,checkouts(order_number)))",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(page * 30, page * 30 + 29);
      checkDb(error);
      const staff = await db.rpc("staff_directory");
      checkDb(staff.error);
      const names = new Map(
        (staff.data as { user_id: string; username: string }[]).map((s) => [
          s.user_id,
          s.username,
        ]),
      );
      return Response.json({
        batches: data?.map((b) => ({
          ...b,
          created_by: names.get(b.created_by) ?? b.created_by,
        })),
        count,
      });
    }
    throw new HttpError("찾을 수 없는 요청입니다.", 404);
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const body = await readBody(request);
    const { path } = await context.params;
    if (path[0] === "login") {
      const { username, password } = z
        .object({
          username: z.string().regex(/^[a-zA-Z0-9_-]{3,40}$/),
          password: z.string().min(1).max(200),
        })
        .parse(body);
      const db = createServiceClient();
      const { data: email, error } = await db.rpc("staff_email", {
        p_username: username,
      });
      const client = await createClient();
      // Still authenticate unknown IDs to avoid revealing the staff directory through responses.
      const result = await client.auth.signInWithPassword({
        email: !error && email ? email : "unknown@invalid.local",
        password,
      });
      if (result.error || !(await getStaff())) {
        await client.auth.signOut();
        throw new HttpError("아이디 또는 비밀번호를 확인해주세요.", 401);
      }
      return Response.json({ ok: true });
    }
    if (path[0] === "logout") {
      const client = await createClient();
      await client.auth.signOut();
      return Response.json({ ok: true });
    }
    const staff = await getStaff();
    if (!staff) throw new HttpError("관리자 로그인이 필요합니다.", 401);
    const db = createServiceClient();
    let result;
    if (path[0] === "products" && path[1] === "order") {
      const value = z
        .object({
          category: z.enum(["product", "experience"]),
          ids: idsSchema,
          expected: z
            .array(
              z.object({
                id: uuid,
                fruit_type: z.string(),
                sort_order: z.number().int(),
              }),
            )
            .max(1000),
        })
        .parse(body);
      result = await db.rpc("reorder_products", {
        p_category: value.category,
        p_ids: value.ids,
        p_expected: value.expected,
        p_actor: staff.id,
      });
    } else if (path[0] === "products") {
      const { id, ...value } = productSchema.parse(body);
      result = await db.rpc("save_product", {
        p_id: id,
        p_data: value,
        p_actor: staff.id,
      });
    } else if (path[0] === "settings") {
      result = await db.rpc("save_settings", {
        p_data: settingsSchema.parse(body),
        p_actor: staff.id,
      });
    } else if (path[0] === "orders" && path[2] === "reorder") {
      const value = submitSchema.parse(body);
      result = await db.rpc("submit_checkout", {
        p_request: value.requestId,
        p_payload: value.order,
        p_actor: staff.id,
        p_original: uuid.parse(path[1]),
      });
    } else if (path[0] === "orders") {
      result = await db.rpc("change_checkout", {
        p_id: uuid.parse(path[1]),
        p_action: z.enum(["pay", "cancel"]).parse(path[2]),
        p_actor: staff.id,
      });
    } else if (path[0] === "notes") {
      result = await db.rpc("save_note", {
        p_id: uuid.parse(path[1]),
        p_note: z.string().max(3000).parse(body.note),
        p_actor: staff.id,
      });
    } else if (path[0] === "ship") {
      result = await db.rpc("mark_shipped", {
        p_ids: idsSchema.parse(body.ids),
        p_actor: staff.id,
      });
    } else if (path[0] === "exports") {
      const ids = idsSchema.parse(body.ids);
      const batchId = uuid.parse(body.requestId);
      const existing = await db
        .from("export_batches")
        .select("id,export_members(delivery_id)")
        .eq("id", batchId)
        .maybeSingle();
      checkDb(existing.error);
      if (existing.data) {
        if (
          JSON.stringify(
            existing.data.export_members.map((m) => m.delivery_id).sort(),
          ) !== JSON.stringify([...ids].sort())
        )
          throw new HttpError("출력 요청 내용이 변경되었습니다.");
        return Response.json({ id: batchId });
      }
      const [orders, settings] = await Promise.all([
        db.rpc("export_rows", { p_ids: ids, p_actor: staff.id }),
        db.from("shipping_settings").select("*").eq("id", 1).single(),
      ]);
      checkDb(orders.error);
      checkDb(settings.error);
      if (!settings.data?.postal_code || !settings.data?.address)
        throw new HttpError(
          "설정에서 송장 발송지 주소와 우편번호를 입력해주세요.",
        );
      const rows = orders.data as { checkout: Checkout; delivery: Shipment }[];
      if (
        rows.length !== ids.length ||
        rows.some((r) => r.delivery.status !== "waiting")
      )
        throw new HttpError("출력 대상 상태를 다시 확인해주세요.");
      const file = await shippingWorkbook(rows, settings.data);
      const filename = `택배송장_${dateInSeoul()}_${batchId.slice(0, 8)}.xlsx`;
      result = await db.rpc("commit_export", {
        p_id: batchId,
        p_ids: ids,
        p_filename: filename,
        p_file: file.toString("base64"),
        p_actor: staff.id,
      });
      checkDb(result.error);
      return Response.json({ id: batchId });
    } else throw new HttpError("찾을 수 없는 요청입니다.", 404);
    checkDb(result.error);
    return Response.json(result.data ?? { ok: true });
  } catch (error) {
    return apiError(error);
  }
}
