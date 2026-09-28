import { SiteHeader } from "@/components/site/site-header";
import { LoginPanel } from "@/features/auth/login-panel";
import { customerReturnPath } from "@/features/auth/redirect";
import { getSupabaseConfig } from "@/lib/supabase/config";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "공용 태블릿 로그인",
  robots: { index: false, follow: false },
};
export default async function TabletLogin({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-xl px-5 py-16">
        <p className="eyebrow">TABLET</p>
        <h1 className="mt-4 text-3xl font-semibold">공용 태블릿 로그인</h1>
        <p className="mt-5 leading-7 text-muted-foreground">
          발급받은 태블릿 계정으로 로그인해주세요.
        </p>
        <LoginPanel
          tablet
          configured={!!getSupabaseConfig()}
          next={customerReturnPath(params.next)}
        />
      </main>
    </>
  );
}
