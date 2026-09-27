import type { Product } from "@/features/catalog/types";
import type { DeliveryDraft, OrderLine } from "./schema";

export function calculateSubtotal(
  items: OrderLine[],
  products: Product[],
): number {
  const prices = new Map(
    products.map((product) => [product.id, product.price]),
  );
  return items.reduce((sum, item) => {
    const price = prices.get(item.productId);
    if (price === undefined)
      throw new Error("선택한 상품 정보를 찾을 수 없습니다.");
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1)
      throw new Error("상품 수량이 올바르지 않습니다.");
    const next = sum + price * item.quantity;
    if (!Number.isSafeInteger(next))
      throw new Error("주문 금액의 범위를 초과했습니다.");
    return next;
  }, 0);
}

export function calculateTotal(
  deliveries: DeliveryDraft[],
  products: Product[],
  bundleDiscount = 0,
): number {
  return deliveries.reduce((total, delivery) => {
    const next =
      total +
      calculateDeliveryAmounts(delivery.items, products, bundleDiscount).total;
    if (!Number.isSafeInteger(next))
      throw new Error("주문 금액의 범위를 초과했습니다.");
    return next;
  }, 0);
}

export const formatWon = (amount: number) =>
  `${amount.toLocaleString("ko-KR")}원`;

// Date-only arithmetic: never depend on the browser's timezone.
export function dateInSeoul(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function isAllowedScheduledDate(
  date: string,
  today: string,
  maxDays: number,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(`${date}T12:00:00Z`);
  if (
    Number.isNaN(value.getTime()) ||
    value.toISOString().slice(0, 10) !== date
  )
    return false;
  return (
    date >= addDays(today, 3) &&
    date <= addDays(today, maxDays) &&
    value.getUTCDay() !== 0
  );
}

// Legacy DeliveryInfo.createDeliveryInfo subtracts one day from the request.
export const processingDate = (requestedDate: string) =>
  addDays(requestedDate, -1);

export function calculateDeliveryAmounts(
  items: OrderLine[],
  products: Product[],
  bundleDiscount = 0,
) {
  if (!Number.isSafeInteger(bundleDiscount) || bundleDiscount < 0)
    throw new Error("할인 금액을 확인해주세요.");
  const subtotal = calculateSubtotal(items, products);
  const eligible = new Map(
    products.filter((p) => p.bundleEligible).map((p) => [p.id, p]),
  );
  let count = 0,
    eligibleSubtotal = 0;
  for (const item of items) {
    const p = eligible.get(item.productId);
    if (p) {
      count += item.quantity;
      eligibleSubtotal += p.price * item.quantity;
    }
  }
  const discount = Math.min(
    eligibleSubtotal,
    Math.floor(count / 2) * bundleDiscount,
  );
  return { subtotal, discount, total: subtotal - discount };
}
