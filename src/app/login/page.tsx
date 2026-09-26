import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-xl px-5 py-16">
        <p className="eyebrow">MEMBER</p>
        <h1 className="mt-4 text-3xl font-semibold">회원 로그인</h1>
        <p className="mt-5 leading-7 text-muted-foreground">
          회원 로그인은 준비 중이에요. 주문 내역과 배송지를 편리하게 관리할 수
          있도록 준비하고 있어요.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
        >
          시작 화면으로 돌아가기
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
