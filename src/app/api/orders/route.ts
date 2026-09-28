import { createServiceClient } from "@/lib/supabase/service";
import { submitSchema } from "@/features/admin/schema";
import { readBody, apiError, checkDb } from "@/features/admin/http";
import { getAccount } from "@/features/auth/server";
export async function POST(request: Request) {
  try {
    const value = submitSchema.parse(await readBody(request));
    const account = await getAccount();
    const db = createServiceClient();
    const { data, error } = await db.rpc("submit_customer_checkout", {
      p_request: value.requestId,
      p_payload: value.order,
      p_member: account && account.kind !== "staff" ? account.id : null,
    });
    checkDb(error);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
