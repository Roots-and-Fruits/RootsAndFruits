import { addDays } from "@/features/orders/calculations";
import type { Checkout, Shipment } from "./schema";

export type ShippingRow = { checkout: Checkout; delivery: Shipment };
export const shippingRequestLimit = 1000;

export function shippingRows(orders: Checkout[]): ShippingRow[] {
  return orders
    .filter((c) => c.status === "paid")
    .flatMap((checkout) =>
      checkout.deliveries
        .filter((d) => d.status === "waiting" || d.status === "exported")
        .map((delivery) => ({ checkout, delivery })),
    )
    .sort(
      (a, b) =>
        b.delivery.processing_date.localeCompare(a.delivery.processing_date) ||
        a.checkout.order_number - b.checkout.order_number ||
        a.delivery.position - b.delivery.position,
    );
}

export function canBulkExport(delivery: Shipment, today: string) {
  return (
    delivery.status === "waiting" &&
    delivery.processing_date <= addDays(today, 1)
  );
}

export function departureWarning(dates: string[], today: string): string {
  const tomorrow = addDays(today, 1);
  const counts = new Map<string, number>();
  for (const date of dates) {
    if (date !== tomorrow) counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  if (!counts.size) return "";
  const count = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return `내일(${tomorrow}) 출발 예정이 아닌 배송지 ${count}건이 포함되어 있습니다. ${[
    ...counts,
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, n]) => `${date} ${n}건`)
    .join(" · ")}. 실제 발송 여부를 확인해주세요.`;
}
