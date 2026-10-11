import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
export const metadata = {
  title: "회원 탈퇴",
  robots: { index: false, follow: false },
};
export default function AccountDeletedPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-xl space-y-5 px-5 py-16">
        <h1 className="text-2xl font-semibold">회원 탈퇴가 완료되었어요.</h1>
        <p className="leading-7 text-muted-foreground">
          카카오 연결과 회원 정보가 삭제되었어요. 이미 접수한 주문은 계속
          처리됩니다. 주문 관련 문의는 주문번호와 함께 카운터에 알려주세요.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-medium text-primary underline"
        >
          홈으로
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
