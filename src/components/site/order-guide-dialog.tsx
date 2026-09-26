"use client";

import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { OrderGuide, OrderGuideNotes } from "./order-guide";

export function OrderGuideDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          주문 안내 <CircleHelp className="size-4" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>주문 안내</DialogTitle>
          <DialogDescription>
            안내를 닫으면 작성하던 주문을 계속할 수 있어요.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-6 overflow-y-auto overscroll-y-contain py-3">
          <OrderGuide stacked />
          <OrderGuideNotes />
        </div>
        <DialogClose asChild>
          <Button className="min-h-12 shrink-0">계속 작성하기</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
