import {
  customerDeletionReady,
  deleteCustomerAccount,
} from "@/features/account/delete-account";
import { z } from "zod";
import {
  getAccount,
  assertCustomerEpoch,
  clearCustomerSession,
} from "@/features/auth/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  apiError,
  checkDb,
  HttpError,
  readBody,
  assertRequestOrigin,
} from "@/features/admin/http";
import {
  savedAddressSchema,
  savedSenderSchema,
} from "@/features/account/schema";

type Context = { params: Promise<{ path: string[] }> };
const uuid = z.string().uuid();
async function handle(request: Request, { params }: Context) {
  let response: Response;
  try {
    await assertCustomerEpoch(request);
    const account = await getAccount();
    if (!account) throw new HttpError("로그인 후 이용해주세요.", 401);
    if (account.kind !== "kakao")
      throw new HttpError("카카오 개인 회원만 이용할 수 있습니다.", 403);
    const path = (await params).path;
    const db = createServiceClient();
    const member = { p_member: account.id };
    let result;
    if (request.method === "GET") {
      if (path.join("/") === "settings")
        result = {
          data: { deletionReady: await customerDeletionReady(account.id) },
          error: null,
        };
      else if (path.join("/") === "preferences")
        result = await db.rpc("customer_preferences", member);
      else if (path.join("/") === "orders") {
        const before = new URL(request.url).searchParams.get("before");
        const cursor =
          before === null
            ? null
            : z
                .string()
                .regex(/^[1-9]\d{0,17}$/)
                .parse(before);
        result = await db.rpc("list_customer_orders", {
          ...member,
          p_before: cursor,
        });
      } else if (path.length === 2 && path[0] === "orders") {
        result = await db.rpc("get_customer_order", {
          ...member,
          p_id: uuid.parse(path[1]),
        });
        if (!result.error && !result.data)
          throw new HttpError("주문을 찾을 수 없습니다.", 404);
      }
    } else if (request.method === "PUT") {
      const body = await readBody(request);
      if (path.join("/") === "sender")
        result = await db.rpc("save_customer_sender", {
          ...member,
          p_value: savedSenderSchema.parse(body),
        });
      else if (path.length === 2 && path[0] === "addresses")
        result = await db.rpc("save_customer_address", {
          ...member,
          p_id: uuid.parse(path[1]),
          p_value: savedAddressSchema.parse(body),
        });
    } else if (request.method === "DELETE" && path.join("/") === "membership") {
      const body = await readBody(request);
      z.object({ confirmation: z.literal("delete-my-account") })
        .strict()
        .parse(body);
      await deleteCustomerAccount(account.id);
      await clearCustomerSession(request);
      result = { data: { ok: true }, error: null };
    } else if (
      request.method === "DELETE" &&
      path.length === 2 &&
      path[0] === "addresses"
    ) {
      assertRequestOrigin(request);
      result = await db.rpc("delete_customer_address", {
        ...member,
        p_id: uuid.parse(path[1]),
      });
    }
    if (!result) throw new HttpError("찾을 수 없는 요청입니다.", 404);
    if (result.error?.code === "PGRST202")
      throw new HttpError(
        "회원 기능을 준비하고 있어요. 잠시 후 다시 이용해주세요.",
        503,
      );
    checkDb(result.error);
    response = Response.json(result.data ?? { ok: true });
  } catch (error) {
    response = apiError(error);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
