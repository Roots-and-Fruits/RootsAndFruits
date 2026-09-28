import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { checkDb, HttpError } from "@/features/admin/http";
import { customerSessionCookie, requestOrigin } from "./redirect";
export type Account = { id: string; kind: "kakao" | "tablet" | "staff" };
export async function getAccount(): Promise<Account | null> {
  if (!getSupabaseConfig()) return null;
  const jar = await cookies();
  const hasSession =
    jar.has(customerSessionCookie) ||
    jar.getAll().some((c) => /^sb-.+-auth-token(?:\.\d+)?$/.test(c.name));
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (!user || error) {
    if (hasSession)
      throw new HttpError(
        "로그인이 만료되었어요. 다시 로그인한 뒤 접수해주세요.",
        401,
      );
    if (error && error.name !== "AuthSessionMissingError")
      throw new HttpError(
        "로그인 상태를 확인하지 못했어요. 다시 시도해주세요.",
        503,
      );
    return null;
  }
  const { data: kind, error: kindError } = await createServiceClient().rpc(
    "account_kind",
    { p_user: user.id },
  );
  checkDb(kindError);
  if (!["kakao", "tablet", "staff"].includes(kind))
    throw new HttpError(
      "사용할 수 없는 계정입니다. 로그인 계정을 확인해주세요.",
      403,
    );
  return { id: user.id, kind };
}
export async function markCustomerSession(request: Request) {
  (await cookies()).set(customerSessionCookie, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(requestOrigin(request)).protocol === "https:",
    path: "/",
    maxAge: 31536000,
  });
}
