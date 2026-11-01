import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizePayment } from "../../src/features/admin/order-summary";
import type { Checkout } from "../../src/features/admin/schema";

function order(
  id: string,
  quantity: number,
  discount = 0,
  price = 10000,
): Checkout {
  return {
    id,
    order_number: Number(id),
    category: "product",
    sender: {
      name: "테스트",
      phone: "01012345678",
      privacyConsent: true,
      marketingConsent: false,
    },
    subtotal: price * quantity,
    discount,
    total: price * quantity - discount,
    status: "pending",
    payment_method: null,
    original_id: null,
    created_at: "2026-10-31T00:00:00Z",
    deliveries: [
      {
        id: `delivery-${id}`,
        position: 1,
        tracking_numbers: [],
        recipient: {
          name: "수령인",
          phone: "01012345678",
          postalCode: "00000",
          address: "가상",
          addressDetail: "",
        },
        delivery_mode: "regular",
        requested_date: "2026-11-02",
        processing_date: "2026-11-01",
        subtotal: price * quantity,
        discount,
        total: price * quantity - discount,
        status: "waiting",
        note: "",
        order_items: [
          {
            id: `item-${id}`,
            product_id: "product",
            label: "감귤 3kg",
            weight_grams: 3000,
            quantity,
            unit_price: price,
            bundle_eligible: true,
          },
        ],
      },
    ],
  };
}

test("payment sum preserves per-order discounts without new cross-delivery discounts or duplicate orders", () => {
  const first = order("1", 1);
  const summary = summarizePayment([
    first,
    order("2", 1),
    order("3", 2, 3000),
    first,
  ]);
  assert.equal(summary.count, 3);
  assert.equal(summary.subtotal, 40000);
  assert.equal(summary.discount, 3000);
  assert.equal(summary.total, 37000);
  assert.equal(summary.items[0].quantity, 4);
  assert.equal(summary.items[0].amount, 40000);
});

test("payment summary separates snapshot prices and product identities, includes experience and handles empty selection", () => {
  const experience = order("3", 1, 0, 7000);
  experience.category = "experience";
  experience.deliveries[0].order_items[0].label = "귤 3kg · 체험 상자";
  const other = order("4", 1);
  other.deliveries[0].order_items[0].product_id = "other";
  const summary = summarizePayment([
    order("1", 1),
    order("2", 1, 0, 12000),
    experience,
    other,
  ]);
  assert.equal(summary.items.length, 4);
  assert.equal(summary.items[2].label, "체험 상자");
  assert.equal(summary.total, 39000);
  assert.deepEqual(summarizePayment([]), {
    items: [],
    count: 0,
    subtotal: 0,
    discount: 0,
    total: 0,
  });
});
