"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { AdminButton as Button } from "./admin-button";
import { adminRequest } from "./client";
import { CatalogAdmin } from "./catalog-admin";
import { OrdersAdmin } from "./orders-admin";
const links = [
  ["counter", "카운터"],
  ["orders", "주문 관리"],
  ["shipping", "발송 관리"],
  ["products", "상품·재고"],
  ["settings", "설정"],
];
export function AdminShell({ section }: { section: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card px-5 py-4 lg:px-8 lg:py-3">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 lg:flex-nowrap lg:gap-8">
          <Link
            className="shrink-0 font-semibold text-primary lg:text-sm"
            href="/admin/counter"
          >
            나무와 열매 · 관리자
          </Link>
          <Button
            className="lg:order-3"
            variant="outline"
            onClick={async () => {
              try {
                await adminRequest("logout", {});
                router.replace("/admin/login");
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            로그아웃
          </Button>
          <nav
            aria-label="관리자 메뉴"
            className="flex w-full flex-wrap gap-2 lg:w-auto lg:flex-1 lg:gap-1"
          >
            {links.map(([key, label]) => (
              <Link
                key={key}
                href={`/admin/${key}`}
                aria-current={section === key ? "page" : undefined}
                className={`rounded-lg px-4 py-3 text-sm transition-colors lg:px-3 lg:py-2 ${section === key ? "bg-primary text-primary-foreground" : "bg-secondary lg:bg-transparent lg:hover:bg-secondary"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto max-w-[1504px] p-5 sm:p-8 lg:py-6"
      >
        <h1 className="mb-7 text-2xl font-semibold lg:mb-5 lg:text-xl">
          {links.find(([key]) => key === section)?.[1]}
        </h1>
        {error && <p role="alert">{error}</p>}
        {section === "products" || section === "settings" ? (
          <CatalogAdmin key={section} section={section} />
        ) : (
          <OrdersAdmin key={section} section={section} />
        )}
      </main>
    </div>
  );
}
