"use client";
import { createRequestId } from "@/lib/request-id";
import {
  getPendingSubmission,
  savePendingSubmission,
  clearPendingSubmission,
} from "@/features/orders/submission-storage";
import { useState, useEffect } from "react";
import { AdminButton as Button } from "./admin-button";
import { adminRequest } from "./client";
import {
  reorderKindSchema,
  type ReorderKind,
  type Checkout,
  type AdminProduct,
  type Settings,
} from "./schema";
import { reorderKindLabels } from "./reorder-label";
import { dateInSeoul } from "@/features/orders/calculations";
import { OrderEdit } from "@/features/orders/components/order-edit";
import type { Sender, DeliveryDraft } from "@/features/orders/schema";
import type { Product } from "@/features/catalog/types";
export function ReorderEditor({
  original,
  kind,
  onClose,
  onDone,
}: {
  original: Checkout;
  kind: ReorderKind;
  onClose: () => void;
  onDone: (n: number, kind: ReorderKind | null) => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null),
    [products, setProducts] = useState<AdminProduct[]>([]),
    [loaded, setLoaded] = useState(false),
    [loadError, setLoadError] = useState(""),
    [loadAttempt, setLoadAttempt] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<{
      sender: Sender;
      deliveries: DeliveryDraft[];
    }>(() => ({
      sender: original.sender,
      deliveries: [...original.deliveries]
        .sort((a, b) => a.position - b.position)
        .map((d) => ({
          recipient: d.recipient,
          items: d.order_items.map((i) => ({
            productId: i.product_id,
            quantity: i.quantity,
          })),
          deliveryMode: d.delivery_mode,
          requestedDate: d.requested_date,
        })),
    }));
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    Promise.all([
      adminRequest<Settings>("settings", undefined, controller.signal),
      adminRequest<AdminProduct[]>("products", undefined, controller.signal),
    ])
      .then(([settings, products]) => {
        if (!live) return;
        setSettings(settings);
        setProducts(products);
        setLoaded(true);
      })
      .catch((e) => live && setLoadError(e.message));
    return () => {
      live = false;
      controller.abort();
    };
  }, [loadAttempt]);
  const [pending, setPending] = useState<string | null>(() =>
    getPendingSubmission(`admin:${original.id}`),
  );
  // Keep the original kind when recovering an unanswered request, even if the
  // operator selected another kind when reopening this editor.
  const pendingKind = pending
    ? reorderKindSchema.safeParse(JSON.parse(pending).reorderKind)
    : null;
  const activeKind = pending ? (pendingKind?.data ?? null) : kind;
  const kindLabel = activeKind ? reorderKindLabels[activeKind] : "재접수";
  const originalItems = new Set(
    original.deliveries.flatMap((d) => d.order_items.map((i) => i.product_id)),
  );
  const catalog: Product[] = products
    .filter(
      (p) =>
        (p.category === original.category && !p.is_deleted) ||
        originalItems.has(p.id!),
    )
    .map((p) => ({
      id: p.id!,
      category: p.category,
      fruitType: p.fruit_type,
      weightGrams: p.weight_grams,
      description: p.description,
      price: p.price,
      inventoryEnabled:
        p.inventory_enabled ||
        !p.is_active ||
        p.is_deleted ||
        p.category !== original.category,
      stockQuantity:
        !p.is_active || p.is_deleted || p.category !== original.category
          ? 0
          : p.stock_quantity,
      bundleEligible: p.bundle_eligible,
      unavailableReason:
        p.category !== original.category
          ? "상품 구분 변경 · 교체 필요"
          : p.is_deleted
            ? "삭제된 상품 · 교체 필요"
            : !p.is_active
              ? "판매 중지 · 교체 필요"
              : undefined,
    }));
  const unavailable = new Set(
    products
      .filter(
        (p) =>
          !p.is_active ||
          p.category !== original.category ||
          p.is_deleted ||
          (p.inventory_enabled && (p.stock_quantity ?? 0) <= 0),
      )
      .map((p) => p.id),
  );
  async function submit(value: typeof draft) {
    if (busy) return;
    if (
      !pending &&
      value.deliveries.some((d) =>
        d.items.some((i) => unavailable.has(i.productId)),
      )
    ) {
      setError(
        "판매 중지·삭제·품절 상품의 수량을 0으로 바꾸고 다른 상품을 선택해주세요.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const key = `admin:${original.id}`;
      const saved = getPendingSubmission(key);
      const body = saved
        ? JSON.parse(saved)
        : {
            requestId: createRequestId(),
            reorderKind: kind,
            order: { ...value, category: original.category },
          };
      savePendingSubmission(key, JSON.stringify(body));
      setPending(JSON.stringify(body));
      const result = await adminRequest<{ orderNumber: number }>(
        `orders/${original.id}/reorder`,
        body,
      );
      clearPendingSubmission(key);
      onDone(result.orderNumber, body.reorderKind ?? null);
    } catch (e) {
      if ((e as { status?: number }).status === 400) {
        clearPendingSubmission(`admin:${original.id}`);
        setPending(null);
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-3xl pb-[calc(var(--order-action-height,0px)+1rem)] lg:max-w-4xl lg:[&_input[data-slot=input]]:h-9 lg:[&_input[data-slot=input]]:rounded-lg lg:[&_input[data-slot=input]]:text-sm">
      <h2 className="mb-4 text-xl font-semibold">
        {original.order_number}번 주문 · {kindLabel}
      </h2>
      <p className="mb-5 rounded-xl bg-secondary p-4 text-sm">
        {original.status === "cancelled"
          ? "원본 주문은 취소 상태입니다."
          : "원본 주문은 취소되지 않습니다."}{" "}
        현재 상품·할인 가격이 적용됩니다. 판매 중지·삭제·품절 상품은 수량을
        0으로 바꾸고 교체해주세요. 지난 예약일은 다시 선택해주세요.
      </p>
      {error && (
        <p role="alert" className="my-4 text-destructive">
          {error}
        </p>
      )}
      {busy && <p role="status">재접수 처리 중…</p>}
      {pending && (
        <p className="mb-4 text-sm text-muted-foreground">
          결과를 확인하지 못한 {kindLabel} 요청이 있습니다. 먼저 기존 요청의
          결과를 확인해주세요.
        </p>
      )}
      {!loaded && (
        <div className="space-y-3">
          {loadError ? (
            <>
              <p role="alert" className="text-destructive">
                {loadError}
              </p>
              <Button
                onClick={() => {
                  setLoadError("");
                  setLoadAttempt((v) => v + 1);
                }}
              >
                상품·설정 다시 불러오기
              </Button>
            </>
          ) : (
            <p role="status">재접수에 필요한 상품·설정을 불러오는 중…</p>
          )}
          <Button variant="outline" onClick={onClose}>
            목록으로 돌아가기
          </Button>
        </div>
      )}
      {pending && (
        <Button
          disabled={busy}
          onClick={() => submit(JSON.parse(pending).order)}
        >
          보낸 재접수 요청의 결과 확인
        </Button>
      )}
      {loaded && settings && (
        <fieldset disabled={busy || !!pending}>
          <OrderEdit
            submitLabel="새 주문으로 접수"
            allowDeliveryChanges
            sender={draft.sender}
            deliveries={draft.deliveries}
            products={catalog}
            category={original.category}
            today={dateInSeoul()}
            maxDays={settings.max_days}
            bundleDiscount={settings.bundle_discount}
            preview={false}
            initialSection="sender"
            onChange={setDraft}
            onSave={submit}
            onCancel={onClose}
          />
        </fieldset>
      )}
    </section>
  );
}
