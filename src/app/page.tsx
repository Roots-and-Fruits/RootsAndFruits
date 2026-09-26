import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  HandHeart,
  Package,
  Sprout,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { OrderGuide } from "@/components/site/order-guide";
import { isOrderPreviewEnabled } from "@/lib/preview";

export const dynamic = "force-dynamic";

const entryCards = [
  {
    href: "/product",
    icon: Package,
    eyebrow: "01 / FARM SHOP",
    title: "상품 구매",
    description: "농장에서 준비한 과일을 골라 소중한 사람에게 보내주세요.",
    action: "상품 주문하기",
  },
  {
    href: "/experience",
    icon: HandHeart,
    eyebrow: "02 / FARM EXPERIENCE",
    title: "체험 과일 보내기",
    description: "오늘 직접 체험한 과일을 집에서도 즐겨보세요.",
    action: "체험 택배 접수하기",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-6xl px-5 pb-8 sm:px-10">
        <section className="relative overflow-hidden rounded-[2rem] bg-primary px-7 py-12 text-primary-foreground sm:px-12 sm:py-16 lg:min-h-[360px]">
          <div className="relative z-10 max-w-xl">
            <p className="mb-7 flex items-center gap-2 text-[10px] font-medium tracking-[0.26em] text-primary-foreground/65">
              <span className="size-1.5 rounded-full bg-accent" /> A LITTLE FROM
              OUR FARM
            </p>
            <h1 className="text-4xl font-semibold leading-[1.35] tracking-[-0.055em] sm:text-5xl">
              좋은 과일에,
              <br />
              보내는 마음을 담아.
            </h1>
            <p className="mt-6 max-w-sm text-sm leading-7 text-primary-foreground/70 sm:text-base">
              농장에서 만난 싱그러움을 집으로 전해요.
              <br />
              어떤 과일을 보내시나요?
            </p>
          </div>
          <div className="orchard-art pointer-events-none" aria-hidden="true">
            <div className="orchard-ring" />
            <div className="orchard-fruit fruit-one" />
            <div className="orchard-fruit fruit-two" />
            <div className="orchard-leaf leaf-one" />
            <div className="orchard-leaf leaf-two" />
            <span>GROWN WITH CARE</span>
          </div>
        </section>
        <section
          className="mt-9 grid gap-4 sm:grid-cols-2"
          aria-label="주문 종류 선택"
        >
          {entryCards.map(
            ({ href, icon: Icon, eyebrow, title, description, action }) => (
              <Link
                key={href}
                href={href}
                className="group rounded-3xl border border-border bg-card p-7 transition-colors hover:border-primary/40 hover:bg-secondary/40 sm:p-8"
              >
                <div className="mb-7 flex items-start justify-between">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                    <Icon
                      className="size-6"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </span>
                  <ArrowUpRight
                    className="size-5 text-muted-foreground transition-transform group-hover:-translate-y-1 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </div>
                <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-muted-foreground">
                  {eyebrow}
                </p>
                <h2 className="text-2xl font-semibold tracking-[-0.04em]">
                  {title}
                </h2>
                <p className="mt-3 max-w-64 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
                <span className="mt-7 flex items-center gap-2 text-sm font-semibold text-primary">
                  {action}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </span>
              </Link>
            ),
          )}
        </section>
        <section className="mt-14" aria-labelledby="guide-title">
          <div className="mb-7 flex items-center gap-2">
            <Sprout className="size-4 text-primary" aria-hidden="true" />
            <h2 id="guide-title" className="text-sm font-semibold">
              이렇게 보내드려요
            </h2>
          </div>
          <OrderGuide />
        </section>
        {isOrderPreviewEnabled() && (
          <aside className="mt-10 rounded-2xl border border-dashed border-primary/30 bg-secondary/40 p-5 text-sm">
            <p className="font-semibold">개발용 화면 미리보기</p>
            <p className="mt-1 text-muted-foreground">
              가상 상품으로 주문 입력을 확인할 수 있어요. 실제 주문은 접수되지
              않아요.
            </p>
            <div className="mt-3 flex flex-wrap gap-5">
              <Link
                className="underline underline-offset-4"
                href="/preview/product"
              >
                일반 주문 미리보기
              </Link>
              <Link
                className="underline underline-offset-4"
                href="/preview/experience"
              >
                체험 주문 미리보기
              </Link>
            </div>
          </aside>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
