import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-xl px-5 py-20">
        <p className="eyebrow">404</p>
        <h1 className="mt-4 text-3xl font-semibold">
          페이지를 찾을 수 없어요.
        </h1>
        <p className="mt-4 text-muted-foreground">
          접속한 주소를 확인하거나 시작 화면으로 돌아가주세요.
        </p>
        <Link
          className="mt-8 inline-block text-primary underline underline-offset-4"
          href="/"
        >
          시작 화면으로
        </Link>
      </main>
    </>
  );
}
