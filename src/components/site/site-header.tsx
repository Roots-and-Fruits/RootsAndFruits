import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
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
        <Image
          src="/brand/logo.svg"
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0"
          unoptimized
        />
        <span className="text-xl font-bold tracking-[-0.07em]">
          나무와열매
          <span className="mt-0.5 hidden text-[9px] font-medium tracking-[0.22em] sm:block">
            TREE & BERRY
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
