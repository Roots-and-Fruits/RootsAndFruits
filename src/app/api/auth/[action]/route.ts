import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { readBody, apiError, HttpError } from "@/features/admin/http";
import { getAccount, markCustomerSession } from "@/features/auth/server";
import {
  requestOrigin,
  customerReturnPath,
  customerSessionCookie,
} from "@/features/auth/redirect";
type Context = { params: Promise<{ action: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    if ((await params).action !== "session")
      throw new HttpError("찾을 수 없는 요청입니다.", 404);
    return Response.json(
      { account: await getAccount() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const body = await readBody(request);
    const { action } = await params;
    const client = await createClient();
    if (action === "kakao") {
      const next = customerReturnPath(body.next);
      const callback = new URL("/auth/callback", requestOrigin(request));
      callback.searchParams.set("next", next);
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo: callback.toString(),
          // Supabase adds `scopes` to Kakao defaults; singular `scope`
          // overrides the provider request so email/image aren't requested.
          queryParams: { scope: "profile_nickname" },
          skipBrowserRedirect: true,
        },
      });
      if (error || !data.url)
        throw new HttpError(
          "카카오 로그인을 시작하지 못했어요. 잠시 후 다시 시도해주세요.",
          503,
        );
      return Response.json(
        { url: data.url },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (action === "tablet-login") {
      const { username, password } = z
        .object({
          username: z
            .string()
            .trim()
            .regex(/^[a-zA-Z0-9_-]{3,40}$/),
          password: z.string().min(1).max(200),
        })
        .parse(body);
      const { data: email, error } = await createServiceClient().rpc(
        "tablet_email",
        { p_username: username },
      );
      const result = await client.auth.signInWithPassword({
        email:
          !error && email ? email : "unknown@tablet.roots-and-fruits.invalid",
        password,
      });
      if (result.error) {
        throw new HttpError("아이디 또는 비밀번호를 확인해주세요.", 401);
      }
      try {
        const account = await getAccount();
        if (account?.kind !== "tablet") throw new Error("invalid account");
      } catch {
        await client.auth.signOut({ scope: "local" });
        throw new HttpError("아이디 또는 비밀번호를 확인해주세요.", 401);
      }
      await markCustomerSession(request);
      return Response.json({ ok: true });
    }
    if (action === "logout") {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error)
        throw new HttpError("로그아웃하지 못했어요. 다시 시도해주세요.", 503);
      (await cookies()).delete(customerSessionCookie);
      return Response.json({ ok: true });
    }
    throw new HttpError("찾을 수 없는 요청입니다.", 404);
  } catch (error) {
    return apiError(error);
  }
}
