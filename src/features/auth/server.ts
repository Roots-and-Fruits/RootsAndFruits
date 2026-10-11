import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { checkDb, HttpError } from "@/features/admin/http";
import { customerSessionCookie, requestOrigin } from "./redirect";
import { customerEpochCookie } from "./session-version";
export type Account = { id: string; kind: "kakao" | "tablet" | "staff" };
export async function getAccount(): Promise<Account | null> {
  if (!getSupabaseConfig()) return null;
  const jar = await cookies();
  const hasSession =
    Boolean(jar.get(customerSessionCookie)?.value) ||
    jar
      .getAll()
      .some((c) => c.value && /^sb-.+-auth-token(?:\.\d+)?$/.test(c.name));
  if (!hasSession) return null;
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
  await rotateCustomerEpoch(request);
}
export async function rotateCustomerEpoch(request: Request) {
  (await cookies()).set(customerEpochCookie, crypto.randomUUID(), {
    httpOnly: false,
    sameSite: "lax",
    secure: new URL(requestOrigin(request)).protocol === "https:",
    path: "/",
    maxAge: 31536000,
  });
}
export async function assertCustomerEpoch(request: Request) {
  const expected = request.headers.get("x-customer-epoch");
  if (
    expected !== null &&
    expected !== ((await cookies()).get(customerEpochCookie)?.value ?? "")
  )
    throw new HttpError(
      "로그인 상태가 변경되었어요. 화면을 새로고침해주세요.",
      409,
    );
}

// Explicit logout owns all auth-cookie removal, including stale chunk cookies.
export async function clearCustomerSession(request: Request) {
  const jar = await cookies();
  for (const { name } of jar.getAll()) {
    if (
      name === customerSessionCookie ||
      /^sb-.+-auth-token(?:[.-].*)?$/.test(name)
    )
      jar.set(name, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
        sameSite: "lax",
        secure: new URL(requestOrigin(request)).protocol === "https:",
      });
  }
  await rotateCustomerEpoch(request);
}
