"use client";
import { createRequestId } from "@/lib/request-id";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit() {
    if (busy) return;
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = await response.json();
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
      const pending = getPendingSubmission(category);
      if (pending) notifySubmission();
      const message =
        e instanceof Error ? e.message : "접수를 완료하지 못했어요.";
      setError(
        pending
          ? `${message} 다시 누르면 같은 요청의 접수 결과를 확인해요.`
          : message,
      );
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
        className="h-13 w-full rounded-xl text-base"
        disabled={busy}
        onClick={submit}
      >
        {busy ? "주문 접수 중…" : "주문 접수"}
      </Button>
      {error && !getPendingSubmission(category) && (
        <Button variant="outline" onClick={() => window.location.reload()}>
          입력 내용 다시 확인
        </Button>
      )}
    </div>
  );
}
