import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccount, markCustomerSession } from "@/features/auth/server";
import { customerReturnPath, requestOrigin } from "@/features/auth/redirect";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const next = customerReturnPath(url.searchParams.get("next"));
  const failure = new URL("/login", origin);
  failure.searchParams.set("error", "kakao");
  failure.searchParams.set("next", next);
  try {
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.has("error"))
      return NextResponse.redirect(failure);
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(failure);
    try {
      if ((await getAccount())?.kind !== "kakao")
        throw new Error("invalid account");
      await markCustomerSession(request);
    } catch {
      await client.auth.signOut({ scope: "local" });
      return NextResponse.redirect(failure);
    }
    const response = NextResponse.redirect(new URL(next, origin));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return NextResponse.redirect(failure);
  }
}
