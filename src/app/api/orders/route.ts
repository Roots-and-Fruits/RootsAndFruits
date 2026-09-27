import { createServiceClient } from "@/lib/supabase/service";
import { submitSchema } from "@/features/admin/schema";
import { readBody, apiError, checkDb } from "@/features/admin/http";
export async function POST(request: Request) {
  try {
    const value = submitSchema.parse(await readBody(request));
    const db = createServiceClient();
    const { data, error } = await db.rpc("submit_checkout", {
      p_request: value.requestId,
      p_payload: value.order,
    });
    checkDb(error);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
