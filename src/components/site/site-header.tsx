import Link from "next/link";
import { ArrowUpRight, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";
import { OrderGuideDialog } from "./order-guide-dialog";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header
      className={cn(
        "mx-auto flex w-full max-w-6xl items-center justify-between px-5 sm:px-10",
        compact ? "h-16 sm:h-24" : "h-24",
      )}
    >
      <Link
        href="/"
        className="flex items-center gap-2.5 text-primary"
        aria-label="나무와열매 홈"
      >
        <Sprout className="size-7" strokeWidth={1.7} aria-hidden="true" />
        <span className="text-xl font-bold tracking-[-0.07em]">
          나무와열매
          <span className="mt-0.5 hidden text-[9px] font-medium tracking-[0.22em] sm:block">
            ROOTS & FRUITS
          </span>
        </span>
      </Link>
      {compact ? (
        <OrderGuideDialog />
      ) : (
        <Link
          href="/guide"
          className="flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          주문 안내
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </header>
  );
}
