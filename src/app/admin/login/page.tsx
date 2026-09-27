import { SiteHeader } from "@/components/site/site-header";
import { LoginForm } from "@/features/admin/login-form";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getStaff } from "@/features/admin/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function AdminLogin() {
  if (await getStaff()) redirect("/admin/counter");
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-md px-5 py-14">
        <p className="eyebrow">STAFF ONLY</p>
        <h1 className="mt-4 text-3xl font-semibold">관리자 로그인</h1>
        <LoginForm
          configured={
            !!getSupabaseConfig() &&
            !!(
              process.env.SUPABASE_SECRET_KEY ||
              process.env.SUPABASE_SERVICE_ROLE_KEY
            )
          }
        />
      </main>
    </>
  );
}
