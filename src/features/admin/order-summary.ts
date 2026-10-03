import { savedItemLabel, type Checkout } from "./schema";

// Use order-time snapshots, including for products that have since changed or been deleted.
export function summarizeOrderItems(order: Checkout) {
  const items = new Map<
    string,
    {
      key: string;
      label: string;
      quantity: number;
      unitPrice: number;
      amount: number;
    }
  >();
  for (const delivery of order.deliveries) {
    for (const item of delivery.order_items) {
      const label = savedItemLabel(item, order.category);
      const key = JSON.stringify([item.product_id, label, item.unit_price]);
      const quantity = (items.get(key)?.quantity ?? 0) + item.quantity;
      items.set(key, {
        key,
        label,
        quantity,
        unitPrice: item.unit_price,
        amount: quantity * item.unit_price,
      });
    }
  }
  return [...items.values()];
}
