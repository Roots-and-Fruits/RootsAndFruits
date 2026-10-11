"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CategoryBadge } from "@/features/catalog/category-badge";
import { TrackingNumbers } from "@/features/admin/tracking-numbers";
import { savedItemLabel } from "@/features/admin/schema";
import { formatPhone } from "@/lib/phone";
import { formatWon } from "@/features/orders/calculations";
import { AccountLoading } from "./account-settings";
import { useAccountData, useAccountRequest } from "./client";
import type { CustomerOrder, CustomerOrders } from "./schema";

function OrderStatus({ order }: { order: CustomerOrder }) {
  const shipped = order.deliveries.filter((d) => d.status === "shipped").length;
  const title =
    order.status === "cancelled"
      ? "취소"
      : order.status === "pending"
        ? "결제 대기"
        : "결제 완료";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      <span
        className={`rounded-md border px-2 py-1 ${order.status === "cancelled" ? "border-red-200 bg-red-50 text-red-800" : order.status === "pending" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-green-200 bg-green-50 text-green-800"}`}
      >
        {title}
      </span>
      {order.status === "paid" && (
        <span>
          {shipped === order.deliveries.length
            ? "발송 완료"
            : shipped
              ? `${order.deliveries.length}곳 중 ${shipped}곳 발송`
              : "발송 준비 중"}
        </span>
      )}
    </div>
  );
}
function orderDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function OrderCard({ order }: { order: CustomerOrder }) {
  const summaries = new Map<string, number>();
  for (const delivery of order.deliveries)
    for (const item of delivery.order_items) {
      const label = savedItemLabel(item, order.category);
      summaries.set(label, (summaries.get(label) ?? 0) + item.quantity);
    }
  return (
    <article className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {orderDate(order.created_at)} 접수
          </p>
          <Link
            className="text-lg font-semibold underline underline-offset-4"
            href={`/account/orders/${order.id}`}
          >
            주문 {order.order_number}번
          </Link>
        </div>
        <OrderStatus order={order} />
      </div>
      <CategoryBadge category={order.category} />
      <p className="break-words text-sm leading-6">
        {Array.from(
          summaries,
          ([label, quantity]) => `${label} × ${quantity}`,
        ).join(" / ")}
      </p>
      <p className="font-semibold">
        {formatWon(order.total)}{" "}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          배송지 {order.deliveries.length}곳
        </span>
      </p>
      {order.deliveries
        .filter((d) => d.tracking_numbers.length)
        .map((delivery) => (
          <div key={delivery.id} className="space-y-1 border-t pt-3">
            <p className="text-sm">
              배송지 {delivery.position} · {delivery.recipient.name}
            </p>
            <TrackingNumbers numbers={delivery.tracking_numbers} linked />
          </div>
        ))}
      <Button asChild variant="outline" size="sm">
        <Link href={`/account/orders/${order.id}`}>주문 상세</Link>
      </Button>
    </article>
  );
}
export function CustomerOrdersPage() {
  const { data, loading, error, reload } =
    useAccountData<CustomerOrders>("orders");
  const request = useAccountRequest();
  const [extra, setExtra] = useState<CustomerOrders | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState("");
  const cursor = extra ? extra.nextCursor : data?.nextCursor;
  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">내 주문 내역</h1>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || busy}
          onClick={() => {
            setExtra(null);
            setMoreError("");
            reload();
          }}
        >
          새로고침
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        이 계정으로 직접 접수한 주문을 확인할 수 있어요.
      </p>
      {loading || error || !data ? (
        <AccountLoading error={error} reload={reload} />
      ) : (
        <>
          {!data.orders.length && (
            <div className="space-y-4 rounded-2xl border bg-card p-8 text-center">
              <p>아직 접수한 주문이 없어요.</p>
              <Button asChild variant="outline">
                <Link href="/">주문하러 가기</Link>
              </Button>
            </div>
          )}
          {[...data.orders, ...(extra?.orders ?? [])].map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
          {moreError && (
            <p role="alert" className="text-sm text-destructive">
              {moreError}
            </p>
          )}
          {cursor && (
            <Button
              className="w-full"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMoreError("");
                try {
                  const next = await request<CustomerOrders>(
                    `orders?before=${cursor}`,
                  );
                  setExtra((old) => ({
                    ...next,
                    orders: [...(old?.orders ?? []), ...next.orders],
                  }));
                } catch (e) {
                  setMoreError(
                    e instanceof Error
                      ? e.message
                      : "다음 주문을 불러오지 못했어요.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "불러오는 중…" : "이전 주문 더 보기"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
export function CustomerOrderPage({ id }: { id: string }) {
  const {
    data: order,
    loading,
    error,
    reload,
  } = useAccountData<CustomerOrder>(`orders/${id}`);
  if (loading || error || !order)
    return <AccountLoading error={error} reload={reload} />;
  return (
    <section className="space-y-6">
      <Link
        href="/account/orders"
        className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4"
      >
        주문 목록으로
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            주문 {order.order_number}번
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {orderDate(order.created_at)} 접수
          </p>
        </div>
        <OrderStatus order={order} />
      </div>
      <div className="space-y-3 rounded-2xl border bg-card p-5">
        <CategoryBadge category={order.category} />
        <p className="text-sm">
          보내는 분: {order.sender.name} · {formatPhone(order.sender.phone)}
        </p>
        <p className="text-lg font-semibold">
          총 주문금액 {formatWon(order.total)}
        </p>
        {order.discount > 0 && (
          <p className="text-sm text-muted-foreground">
            상품금액 {formatWon(order.subtotal)} · 묶음 할인{" "}
            {formatWon(order.discount)}
          </p>
        )}
      </div>
      {order.deliveries.map((delivery) => (
        <article
          key={delivery.id}
          className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              배송지 {delivery.position} · {delivery.recipient.name}
            </h2>
            <span className="text-sm font-semibold text-primary">
              {order.status === "cancelled"
                ? "취소"
                : order.status === "pending"
                  ? "결제 대기"
                  : delivery.status === "shipped"
                    ? "발송 완료"
                    : "발송 준비 중"}
            </span>
          </div>
          <p className="text-sm">{formatPhone(delivery.recipient.phone)}</p>
          <p className="break-words text-sm leading-6">
            ({delivery.recipient.postalCode}) {delivery.recipient.address}{" "}
            {delivery.recipient.addressDetail}
          </p>
          <p className="text-sm text-muted-foreground">
            출발 예정일: {delivery.processing_date}
          </p>
          <ul className="space-y-3 border-t pt-4">
            {delivery.order_items.map((item, index) => (
              <li
                key={index}
                className="flex flex-wrap justify-between gap-2 text-sm"
              >
                <span className="min-w-0 break-words">
                  {savedItemLabel(item, order.category)} × {item.quantity}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatWon(item.unit_price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-right font-semibold">
            {formatWon(delivery.total)}
            {delivery.discount > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                (할인 {formatWon(delivery.discount)})
              </span>
            )}
          </p>
          <TrackingNumbers numbers={delivery.tracking_numbers} linked />
        </article>
      ))}
      <p className="text-sm text-muted-foreground">
        주문 관련 문의는 카운터에 주문번호를 알려주세요.
      </p>
    </section>
  );
}
