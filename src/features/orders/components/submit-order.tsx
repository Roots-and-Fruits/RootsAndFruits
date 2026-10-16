"use client";
import { createRequestId } from "@/lib/request-id";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  customerEpoch,
  isCurrentCustomerEpoch,
} from "@/features/auth/session-version";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CatalogCategory } from "@/features/catalog/types";
import type { Sender, DeliveryDraft } from "../schema";
import {
  getPendingSubmission,
  savePendingSubmission,
  clearPendingSubmission,
  notifySubmission,
  saveReceipt,
} from "../submission-storage";
import { draftStorageKey } from "../draft-storage";
export function SubmitOrder({
  category,
  sender,
  deliveries,
}: {
  category: CatalogCategory;
  sender: Sender;
  deliveries: DeliveryDraft[];
}) {
  const router = useRouter();
  const epoch = useRef(customerEpoch()).current;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submitting = useRef(false);
  async function submit() {
    if (submitting.current || !isCurrentCustomerEpoch(epoch)) return;
    submitting.current = true;
    setConfirmOpen(false);
    setBusy(true);
    setError("");
    try {
      // Keep the exact request on transport failure: retries must not create another order.
      const old = getPendingSubmission(category);
      const request = old
        ? JSON.parse(old)
        : {
            requestId: createRequestId(),
            order: { category, sender, deliveries },
          };
      const persisted = savePendingSubmission(
        category,
        JSON.stringify(request),
      );
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Customer-Epoch": epoch,
        },
        body: JSON.stringify(request),
      });
      const data = await response.json();
      if (!isCurrentCustomerEpoch(epoch)) return;
      if (!response.ok) {
        if (response.status === 400 || response.status === 422)
          clearPendingSubmission(category);
        throw new Error(
          data.error || "접수를 완료하지 못했어요. 다시 시도해주세요.",
        );
      }
      let storageWarning = !persisted;
      try {
        localStorage.removeItem(draftStorageKey(category, false));
      } catch {
        storageWarning = true;
      }
      clearPendingSubmission(category);
      saveReceipt({
        orderNumber: data.orderNumber,
        total: data.total,
        category,
        storageWarning,
      });
      router.replace("/order-complete");
      router.refresh();
    } catch (e) {
      if (!isCurrentCustomerEpoch(epoch)) return;
      const pending = getPendingSubmission(category);
      if (pending) notifySubmission();
      const message =
        e instanceof Error ? e.message : "접수를 완료하지 못했어요.";
      setError(
        pending
          ? `${message} 다시 누르면 같은 요청의 접수 결과를 확인해요.`
          : message,
      );
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="w-full">
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        className="h-13 w-full rounded-xl text-base sm:h-16 sm:text-xl"
        disabled={busy}
        onClick={() => {
          if (getPendingSubmission(category)) void submit();
          else setConfirmOpen(true);
        }}
      >
        {busy ? "주문 접수 중…" : "주문 접수"}
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-lg sm:p-8">
          <DialogHeader>
            <DialogTitle className="pr-6 text-xl sm:text-2xl">
              주문 내용을 모두 확인하셨나요?
            </DialogTitle>
            <DialogDescription className="text-base leading-7 sm:text-lg sm:leading-8">
              주문 접수 후에는 내용을 수정할 수 없어요. 받는 분, 주소, 상품과
              수량을 다시 확인해주세요. 추가로 보낼 배송지가 있다면 지금
              추가해주세요.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-xl bg-secondary p-4 text-base font-semibold sm:text-lg">
            총 {deliveries.length}곳의 배송지로 접수해요.
          </p>
          <DialogFooter className="gap-3 sm:flex-col">
            <Button
              variant="outline"
              className="min-h-14 w-full text-base sm:text-lg"
              onClick={() => setConfirmOpen(false)}
            >
              돌아가서 확인·배송지 추가
            </Button>
            <Button
              className="min-h-14 w-full text-base sm:text-lg"
              disabled={busy}
              onClick={() => void submit()}
            >
              확인했어요 · 주문 접수
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {error && !getPendingSubmission(category) && (
        <Button variant="outline" onClick={() => window.location.reload()}>
          입력 내용 다시 확인
        </Button>
      )}
    </div>
  );
}
