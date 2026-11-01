import { savedItemLabel, type Checkout } from "./schema";

// Use order-time snapshots, including for products that have since changed or been deleted.
export function summarizeOrderItems(order: Checkout) {
  return summarizeCheckoutItems([order]);
}

export function summarizeCheckoutItems(orders: Checkout[]) {
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
  for (const order of orders) {
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
  }
  return [...items.values()];
}

// Add saved amounts only: combining orders never creates another bundle discount.
export function summarizePayment(orders: Checkout[]) {
  const unique = [
    ...new Map(orders.map((order) => [order.id, order])).values(),
  ];
  return {
    items: summarizeCheckoutItems(unique),
    count: unique.length,
    subtotal: unique.reduce((sum, order) => sum + order.subtotal, 0),
    discount: unique.reduce((sum, order) => sum + order.discount, 0),
    total: unique.reduce((sum, order) => sum + order.total, 0),
  };
}
