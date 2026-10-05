import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatWon } from "@/features/orders/calculations";
import { AdminButton } from "./admin-button";
import { OrderNotes } from "./order-notes";
import { ReceiptLink } from "./receipt-link";
import { summarizeOrderItems } from "./order-summary";
import {
  paymentMethodLabels,
  savedItemLabel,
  stateLabel,
  type Checkout,
  type Shipment,
} from "./schema";

const checkoutColumns =
  "lg:grid-cols-[4.5rem_7.5rem_5.5rem_minmax(0,1fr)_3rem_6.5rem_8rem]";
const managementColumns =
  "lg:grid-cols-[4.5rem_7.5rem_minmax(0,1fr)_3rem_6.5rem_8rem_7rem]";
const shippingColumns =
  "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_7rem_12rem_6rem]";

function OrderList({
  label,
  columns,
  headings,
  children,
  receipt = false,
}: {
  label: string;
  columns: string;
  headings: string[];
  children: ReactNode;
  receipt?: boolean;
}) {
  return (
    <section
      aria-label={label}
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div
        aria-hidden="true"
        className={cn(
          "hidden items-center border-b bg-muted/50 text-xs font-medium text-muted-foreground lg:grid",
          receipt && "lg:grid-cols-[minmax(0,1fr)_7rem]",
        )}
      >
        <div className={cn("grid items-center gap-4 px-4 py-3", columns)}>
          {headings.map((heading) => (
            <span key={heading}>{heading}</span>
          ))}
        </div>
        {receipt && <span>주문서 인쇄</span>}
      </div>
      <ul className="divide-y">{children}</ul>
    </section>
  );
}

function PaymentStatus({
  status,
  method,
}: {
  status: Checkout["status"];
  method: Checkout["payment_method"];
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-bold",
        status === "paid"
          ? "border-emerald-300 bg-emerald-100 text-emerald-900"
          : status === "cancelled"
            ? "border-red-300 bg-red-100 text-red-800"
            : "border-amber-300 bg-amber-100 text-amber-900",
      )}
    >
      {stateLabel[status]}
      {(status === "paid" || (status === "cancelled" && method)) && (
        <span> · {method ? paymentMethodLabels[method] : "방식 미기록"}</span>
      )}
    </span>
  );
}

export function CheckoutList({
  orders,
  counter,
  onOpen,
}: {
  orders: Checkout[];
  counter: boolean;
  onOpen: (order: Checkout) => void;
}) {
  const columns = counter ? checkoutColumns : managementColumns;
  return (
    <OrderList
      label={counter ? "카운터 주문 목록" : "주문 관리 목록"}
      columns={columns}
      receipt
      headings={[
        "주문번호",
        "접수 시각",
        "보내는 분",
        ...(counter ? ["상품 · 수량"] : []),
        "배송지",
        "결제금액",
        "결제 상태",
        ...(!counter ? ["발송 현황"] : []),
      ]}
    >
      {orders.map((order) => (
        <li
          key={order.id}
          className="grid items-center lg:grid-cols-[minmax(0,1fr)_7rem]"
        >
          <button
            onClick={() => onOpen(order)}
            aria-label={`${order.order_number}번 ${order.sender.name} 주문 상세`}
            className={cn(
              "grid w-full min-w-0 grid-cols-2 items-center gap-x-4 gap-y-1.5 break-words px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring lg:gap-x-4 lg:gap-y-1.5 lg:py-2",
              columns,
            )}
          >
            <span className="text-lg font-semibold tabular-nums">
              {order.order_number}번
            </span>
            <time
              dateTime={order.created_at}
              className="text-right text-xs tabular-nums text-muted-foreground lg:text-left"
            >
              {new Date(order.created_at).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </time>
            <span className="min-w-0 font-medium">
              <span className="mr-2 text-xs font-normal text-muted-foreground lg:hidden">
                보내는 분
              </span>
              {order.sender.name}
            </span>
            {counter && (
              <span className="order-1 col-span-2 min-w-0 text-xs leading-5 [overflow-wrap:anywhere] lg:order-none lg:col-span-1">
                <span className="mr-2 text-muted-foreground lg:hidden">
                  상품
                </span>
                {summarizeOrderItems(order)
                  .map((item) => `${item.label} × ${item.quantity}`)
                  .join(", ")}
              </span>
            )}
            <span className="text-right text-muted-foreground lg:text-left">
              <span className="lg:hidden">배송지 </span>
              {order.deliveries.length}곳
            </span>
            <span className="font-semibold tabular-nums text-primary">
              {formatWon(order.total)}
            </span>
            <span className="justify-self-end lg:justify-self-start">
              <PaymentStatus
                status={order.status}
                method={order.payment_method}
              />
            </span>
            {!counter && (
              <span className="col-span-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground lg:col-span-1 lg:flex-col">
                {order.status === "cancelled" ? (
                  <span>발송 제외</span>
                ) : (
                  (["waiting", "exported", "shipped"] as const).map(
                    (status) => {
                      const count = order.deliveries.filter(
                        (d) => d.status === status,
                      ).length;
                      return count > 0 ? (
                        <span key={status}>
                          {stateLabel[status]} {count}건
                        </span>
                      ) : null;
                    },
                  )
                )}
              </span>
            )}
            {(order.original_id ||
              order.deliveries.some((d) => d.note.trim())) && (
              <span className="order-2 col-span-full min-w-0 border-t border-dashed pt-1 lg:order-none">
                <OrderNotes order={order} />
              </span>
            )}
          </button>
          <div className="px-4 pb-3 lg:py-2 lg:pl-0">
            <ReceiptLink order={order} />
          </div>
        </li>
      ))}
    </OrderList>
  );
}

export function ShippingList({
  rows,
  selected,
  onSelect,
  onOpen,
  disabled = false,
  today,
}: {
  rows: { checkout: Checkout; delivery: Shipment }[];
  selected: string[];
  disabled?: boolean;
  today: string;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (order: Checkout) => void;
}) {
  return (
    <OrderList
      label="배송지별 발송 목록"
      columns={shippingColumns}
      headings={[
        "선택 · 주문번호 / 받는 분",
        "상품 · 수량 / 주소 · 메모",
        "출발 날짜",
        "결제 · 발송 상태",
        "상세 조회",
      ]}
    >
      {rows.map(({ checkout: c, delivery: d }) => (
        <li key={d.id}>
          <article
            className={cn(
              "grid min-w-0 gap-2 break-words px-4 py-3 text-sm lg:items-center lg:gap-x-4 lg:gap-y-1.5 lg:py-2",
              shippingColumns,
            )}
          >
            <label className="flex min-h-11 items-center gap-3 font-semibold lg:min-h-9">
              <Checkbox
                checked={selected.includes(d.id)}
                disabled={
                  disabled || c.status !== "paid" || d.status === "shipped"
                }
                onCheckedChange={(checked) => onSelect(d.id, checked === true)}
              />
              <span>
                {c.order_number}번 · {d.recipient.name}
              </span>
            </label>
            <div className="min-w-0 space-y-1">
              <p>
                {d.order_items
                  .map(
                    (i) => `${savedItemLabel(i, c.category)} × ${i.quantity}`,
                  )
                  .join(", ")}
              </p>
              <p className="text-xs text-muted-foreground">
                {d.recipient.address} {d.recipient.addressDetail}
              </p>
              <OrderNotes order={c} delivery={d} />
            </div>
            <p className="tabular-nums">
              <span className="mr-2 text-muted-foreground lg:hidden">출발</span>
              <time dateTime={d.processing_date}>{d.processing_date}</time>
              {d.processing_date < today && (
                <span className="mt-1 block text-xs font-semibold text-amber-800">
                  출발 예정일 경과
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <PaymentStatus status={c.status} method={c.payment_method} />
              <span className="text-xs text-muted-foreground">
                {c.status === "cancelled" ? "발송 제외" : stateLabel[d.status]}
              </span>
            </div>
            <AdminButton
              variant="outline"
              className="justify-self-start lg:justify-self-end"
              disabled={disabled}
              onClick={() => onOpen(c)}
            >
              상세
            </AdminButton>
          </article>
        </li>
      ))}
    </OrderList>
  );
}
