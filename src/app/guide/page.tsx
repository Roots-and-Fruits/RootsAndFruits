import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { OrderGuide, OrderGuideNotes } from "@/components/site/order-guide";

export const metadata: Metadata = { title: "주문 안내" };
export default function GuidePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-6xl px-5 py-12 sm:px-10">
        <p className="eyebrow">HOW TO ORDER</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          마음을 보내는 방법
        </h1>
        <div className="mt-12">
          <OrderGuide />
        </div>
        <div className="mt-12">
          <OrderGuideNotes />
        </div>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
        >
          주문 시작하기 →
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
