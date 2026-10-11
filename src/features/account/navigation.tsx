"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function AccountNavigation() {
  const path = usePathname();
  return (
    <nav
      aria-label="마이페이지 메뉴"
      className="mb-8 flex flex-wrap gap-2 border-b pb-4"
    >
      {[
        ["orders", "내 주문"],
        ["addresses", "주소록"],
        ["sender", "보내는 분 설정"],
        ["settings", "계정 관리"],
      ].map(([section, label]) => (
        <Link
          key={section}
          href={`/account/${section}`}
          aria-current={
            path.startsWith(`/account/${section}`) ? "page" : undefined
          }
          className={`inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium ${path.startsWith(`/account/${section}`) ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/70"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
