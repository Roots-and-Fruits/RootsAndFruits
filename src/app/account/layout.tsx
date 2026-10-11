import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getAccount } from "@/features/auth/server";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { AccountNavigation } from "@/features/account/navigation";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "마이페이지",
  robots: { index: false, follow: false },
};
export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const account = await getAccount().catch(() => null);
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-4xl px-5 py-8 sm:px-10">
        {account?.kind === "kakao" ? (
          <>
            <AccountNavigation />
            {children}
          </>
        ) : (
          <div className="space-y-5 py-8">
            <h1 className="text-2xl font-semibold">
              카카오 개인 회원 전용이에요.
            </h1>
            <p>
              내 주문과 주소록은 카카오 계정으로 로그인한 뒤 확인할 수 있어요.
            </p>
            <Link
              className="inline-flex min-h-11 items-center text-primary underline"
              href="/login?next=%2Faccount%2Forders"
            >
              로그인 상태 확인
            </Link>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
