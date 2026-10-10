"use client";

import { useState } from "react";
import { getPendingSubmission } from "@/features/orders/submission-storage";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AdminButton } from "./admin-button";
import type { Checkout, ReorderKind } from "./schema";

export function ReorderAction({
  disabled,
  order,
  onSelect,
}: {
  disabled: boolean;
  order: Checkout;
  onSelect: (
    kind: ReorderKind,
    cancelOriginal?: boolean,
  ) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [showCancellation, setShowCancellation] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCancel =
    order.deliveries.length > 0 &&
    order.deliveries.every((delivery) => delivery.status === "waiting");
  const canCorrect = order.status === "cancelled" || canCancel;
  const saving = disabled || pending;
  async function select(kind: ReorderKind, cancelOriginal = false) {
    setPending(true);
    setError(null);
    try {
      const message = await onSelect(kind, cancelOriginal);
      if (message) setError(message);
      else setOpen(false);
    } catch {
      setError(
        "처리 결과를 확인하지 못했습니다. 같은 선택으로 다시 시도해주세요.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (saving) return;
        setOpen(value);
        setShowCancellation(false);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <AdminButton variant="outline" disabled={disabled}>
          주문 재접수
        </AdminButton>
      </DialogTrigger>
      <DialogContent showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>
            {showCancellation ? "원본 주문 취소 안내" : "재접수 구분 선택"}
          </DialogTitle>
          <DialogDescription>
            {showCancellation
              ? `원본 ${order.order_number}번 주문이 아직 취소되지 않았습니다. 수정 내용은 새 주문번호로 접수되므로 원본 주문의 처리 여부를 확인해주세요.`
              : canCorrect
                ? "주문을 수정하거나 다시 주문하는 경우를 구분해 기록합니다. 두 경우 모두 새 주문번호로 접수하며 원본은 자동 취소되지 않습니다."
                : "이미 엑셀 출력된 주문은 재주문만 가능합니다. 새 주문번호로 접수하며 원본 주문은 유지됩니다."}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {showCancellation ? (
          <>
            <p className="text-sm">
              {canCancel
                ? "원본을 취소하면 모든 배송지가 취소되고 차감 재고가 반환됩니다. 이후 수정 주문 접수를 중단해도 원본 취소는 유지됩니다."
                : "이미 엑셀 출력된 배송지가 있어 원본 주문을 취소할 수 없습니다. 원본을 유지한 채 수정 주문을 접수할 수 있습니다."}
            </p>
            <div className="flex flex-col gap-3">
              {canCancel && (
                <AdminButton
                  disabled={saving}
                  onClick={() => select("correction", true)}
                >
                  {pending ? "처리 중…" : "원본 취소 후 수정"}
                </AdminButton>
              )}
              <AdminButton
                variant="outline"
                disabled={saving}
                onClick={() => select("correction")}
              >
                원본 유지하고 수정
              </AdminButton>
              <AdminButton
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setShowCancellation(false);
                  setError(null);
                }}
              >
                다시 선택
              </AdminButton>
            </div>
          </>
        ) : (
          <div className={`grid gap-3 ${canCorrect ? "sm:grid-cols-2" : ""}`}>
            {canCorrect && (
              <AdminButton
                disabled={saving}
                onClick={() => {
                  if (
                    order.status !== "cancelled" &&
                    !getPendingSubmission(`admin:${order.id}`)
                  )
                    setShowCancellation(true);
                  else void select("correction");
                }}
              >
                주문 수정
              </AdminButton>
            )}
            <AdminButton
              variant="outline"
              disabled={saving}
              onClick={() => select("repeat")}
            >
              재주문
            </AdminButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
