import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";

export default function AdminLoginPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-xl px-5 py-16">
        <LockKeyhole className="mb-6 size-8 text-primary" />
        <p className="eyebrow">STAFF ONLY</p>
        <h1 className="mt-4 text-3xl font-semibold">관리자 로그인</h1>
        <p className="mt-5 leading-7 text-muted-foreground">
          관리자 서비스는 준비 중입니다. 계정과 권한 설정을 마친 뒤 이용할 수
          있습니다.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-12 items-center text-primary underline underline-offset-4"
        >
          시작 화면으로
        </Link>
      </main>
    </>
  );
}
