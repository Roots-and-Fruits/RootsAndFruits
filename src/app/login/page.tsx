import { redirect } from "next/navigation";
import { getAccount } from "@/features/auth/server";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { LoginPanel } from "@/features/auth/login-panel";
import { customerReturnPath } from "@/features/auth/redirect";
import { getSupabaseConfig } from "@/lib/supabase/config";
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const account = await getAccount().catch(() => null);
  if (account?.kind === "kakao" || account?.kind === "tablet")
    redirect(
      params.next
        ? customerReturnPath(params.next)
        : account.kind === "kakao"
          ? "/account/orders"
          : "/",
    );
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-xl px-5 py-16">
        <p className="eyebrow">MEMBER</p>
        <h1 className="mt-4 text-3xl font-semibold">회원 로그인</h1>
        <p className="mt-5 leading-7 text-muted-foreground">
          카카오 계정으로 간편하게 로그인하세요.
        </p>
        <LoginPanel
          configured={!!getSupabaseConfig()}
          next={customerReturnPath(params.next)}
          callbackError={params.error === "kakao"}
        />
      </main>
      <SiteFooter />
    </>
  );
}
