"use client";
import { AdminButton as Button } from "./admin-button";
import { AdminInput as Input } from "./admin-fields";
import { ConfirmAction } from "./confirm-action";
import {
  paymentMethodLabels,
  savedItemLabel,
  stateLabel,
  type Checkout,
  type PaymentMethod,
} from "./schema";
import { formatWon } from "@/features/orders/calculations";
import { PaymentAction } from "./payment-action";
import { ReorderNotice } from "./order-notes";
export function OrderDetail({
  order: c,
  busy,
  onAction,
  onPay,
  onReorder,
  onNote,
}: {
  order: Checkout;
  busy: boolean;
  onAction: (action: string) => Promise<string | null>;
  onPay: (method: PaymentMethod) => Promise<string | null>;
  onReorder: () => void;
  onNote: (id: string, note: string) => void;
}) {
  const beforeExport =
    c.deliveries.length > 0 &&
    c.deliveries.every((d) => d.status === "waiting");
  const aggregate = new Map<
    string,
    { label: string; quantity: number; amount: number }
  >();
  for (const d of c.deliveries)
    for (const i of d.order_items) {
      const old = aggregate.get(i.product_id);
      aggregate.set(i.product_id, {
        label: savedItemLabel(i, c.category),
        quantity: (old?.quantity ?? 0) + i.quantity,
        amount: (old?.amount ?? 0) + i.unit_price * i.quantity,
      });
    }
  return (
    <div className="space-y-5 lg:text-sm">
      <p>
        {c.sender.name} · {c.sender.phone} · {stateLabel[c.status]}
        {c.status === "paid" &&
          ` · ${c.payment_method ? paymentMethodLabels[c.payment_method] : "결제 방식 미기록"}`}
      </p>
      {c.status === "cancelled" && (c.payment_method || c.paid_at) && (
        <p className="text-sm text-muted-foreground">
          취소 전 결제 방식:{" "}
          {c.payment_method ? paymentMethodLabels[c.payment_method] : "미기록"}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        접수 구분:{" "}
        {c.order_source === "tablet"
          ? "공용 태블릿 회원"
          : c.order_source === "kakao"
            ? "카카오 회원"
            : c.original_id
              ? "관리자 재접수"
              : "비회원"}
      </p>
      <ul className="space-y-2 rounded-xl bg-secondary p-4">
        {[...aggregate].map(([id, i]) => (
          <li key={id} className="flex justify-between gap-4">
            <span>
              {i.label} × {i.quantity}
            </span>
            <span className="shrink-0">{formatWon(i.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="space-y-2 text-right">
        <p>상품 합계 {formatWon(c.subtotal)}</p>
        {(c.category === "product" || c.discount > 0) && (
          <p>묶음 할인 −{formatWon(c.discount)}</p>
        )}
        <p className="text-2xl font-semibold">결제금액 {formatWon(c.total)}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {c.status === "pending" && (
          <PaymentAction busy={busy} onConfirm={onPay} />
        )}
        {c.status !== "cancelled" && beforeExport && (
          <ConfirmAction
            label="주문 취소"
            disabled={busy}
            description="이 주문의 모든 배송지를 취소합니다. 차감한 재고가 있으면 반환합니다. 엑셀 출력 전 주문만 취소할 수 있습니다."
            onConfirm={() => onAction("cancel")}
          />
        )}
        <Button variant="outline" onClick={onReorder}>
          주문 재접수
        </Button>
      </div>
      {c.status !== "cancelled" && !beforeExport && (
        <p className="text-sm text-muted-foreground">
          엑셀 출력된 배송지가 있어 주문을 취소할 수 없습니다.
        </p>
      )}
      {[...c.deliveries]
        .sort((a, b) => a.position - b.position)
        .map((d) => (
          <section key={d.id} className="space-y-2 border-t pt-4">
            <h3 className="font-semibold">
              배송지 {d.position} · {d.recipient.name}
            </h3>
            <p>{d.recipient.phone}</p>
            <p>
              ({d.recipient.postalCode}) {d.recipient.address}{" "}
              {d.recipient.addressDetail}
            </p>
            <p className="text-sm">
              출발 {d.processing_date} ·{" "}
              {c.status === "cancelled" ? "발송 제외" : stateLabel[d.status]}
            </p>
            <p className="text-sm">
              {d.order_items
                .map((i) => `${savedItemLabel(i, c.category)} × ${i.quantity}`)
                .join(", ")}
            </p>
            <p className="text-sm">
              상품 {formatWon(d.subtotal)}{" "}
              {(c.category === "product" || d.discount > 0) && (
                <>· 할인 {formatWon(d.discount)} </>
              )}
              · 합계 {formatWon(d.total)}
            </p>
            <ReorderNotice order={c} />
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onNote(
                  d.id,
                  String(new FormData(e.currentTarget).get("note") ?? ""),
                );
              }}
            >
              <Input
                aria-label={`배송지 ${d.position} 운영 메모`}
                name="note"
                defaultValue={d.note}
                maxLength={3000}
              />
              <Button disabled={busy} variant="outline">
                메모 저장
              </Button>
            </form>
          </section>
        ))}
    </div>
  );
}
