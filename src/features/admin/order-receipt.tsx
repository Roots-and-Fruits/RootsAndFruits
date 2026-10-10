import { formatWon } from "@/features/orders/calculations";
import {
  paymentMethodLabels,
  savedItemLabel,
  stateLabel,
  type Checkout,
} from "./schema";
import { summarizeOrderItems } from "./order-summary";
import styles from "./receipt.module.css";
import { reorderOriginLabel } from "./reorder-label";

export function OrderReceipt({ order }: { order: Checkout }) {
  const items = summarizeOrderItems(order);
  return (
    <article
      className={styles.receipt}
      aria-label={`${order.order_number}번 주문서`}
    >
      <header className={styles.header}>
        <p className={styles.brand}>TREE & BERRY</p>
        <p>나무와열매 · 주문서</p>
        <h2 className={styles.number}>{order.order_number}번</h2>
        <p>
          {order.category === "experience" ? "체험 과일 보내기" : "상품 구매"}
        </p>
      </header>
      <section className={styles.section}>
        <p>
          접수{" "}
          {new Date(order.created_at).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </p>
        <p className={styles.status}>
          {order.status === "cancelled"
            ? "취소된 주문"
            : stateLabel[order.status]}
        </p>
        {(order.status === "paid" ||
          (order.status === "cancelled" &&
            (order.paid_at || order.payment_method))) && (
          <p>
            {order.status === "cancelled" ? "취소 전 결제 방식" : "결제 방식"}:{" "}
            {order.payment_method
              ? paymentMethodLabels[order.payment_method]
              : "미기록"}
          </p>
        )}
        {order.original_id && (
          <p>{reorderOriginLabel(order)}</p>
        )}
      </section>
      <section className={styles.section}>
        <h3>보내는 분</h3>
        <p>
          {order.sender.name} · {order.sender.phone}
        </p>
      </section>
      <section className={styles.section}>
        <h3>주문 상품</h3>
        <ul className={styles.items}>
          {items.map((item) => (
            <li key={item.key}>
              <p className={styles.itemLabel}>{item.label}</p>
              <p className={styles.amountRow}>
                <span>
                  {formatWon(item.unitPrice)} × {item.quantity}
                </span>
                <strong>{formatWon(item.amount)}</strong>
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.section}>
        <p className={styles.amountRow}>
          <span>상품 합계</span>
          <span>{formatWon(order.subtotal)}</span>
        </p>
        {order.discount > 0 && (
          <p className={styles.amountRow}>
            <span>묶음 할인</span>
            <span>−{formatWon(order.discount)}</span>
          </p>
        )}
        <p className={`${styles.amountRow} ${styles.total}`}>
          <strong>합계</strong>
          <strong>{formatWon(order.total)}</strong>
        </p>
      </section>
      {[...order.deliveries]
        .sort((a, b) => a.position - b.position)
        .map((delivery) => (
          <section
            className={styles.section}
            key={delivery.id}
            aria-label={`배송지 ${delivery.position}`}
          >
            <h3>
              배송지 {delivery.position} / {order.deliveries.length}
            </h3>
            <p>
              <strong>{delivery.recipient.name}</strong> ·{" "}
              {delivery.recipient.phone}
            </p>
            <p>
              ({delivery.recipient.postalCode}) {delivery.recipient.address}{" "}
              {delivery.recipient.addressDetail}
            </p>
            <p>
              출발 날짜: {delivery.processing_date}
              {delivery.delivery_mode === "scheduled" ? " · 예약" : ""}
            </p>
            <ul className={styles.deliveryItems}>
              {delivery.order_items.map((item) => (
                <li key={item.id}>
                  {savedItemLabel(item, order.category)} × {item.quantity}
                </li>
              ))}
            </ul>
            {delivery.note.trim() && (
              <p className={styles.note}>메모: {delivery.note}</p>
            )}
          </section>
        ))}
    </article>
  );
}
