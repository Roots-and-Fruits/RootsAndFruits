import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateDeliveryAmounts } from "../../src/features/orders/calculations";
import { sellingPrice } from "../../src/features/catalog/pricing";
import { productSchema } from "../../src/features/admin/schema";
import type { Product } from "../../src/features/catalog/types";
const product: Product = {
  id: "a",
  category: "product",
  fruitType: "감귤",
  weightGrams: 3000,
  description: "",
  price: 30000,
  specialDiscountEnabled: true,
  specialDiscountAmount: 5000,
  inventoryEnabled: false,
  stockQuantity: null,
  bundleEligible: true,
};
test("special discount reduces each unit before bundle discount, with per-delivery caps", () => {
  assert.equal(sellingPrice(product), 25000);
  assert.deepEqual(
    calculateDeliveryAmounts(
      [{ productId: "a", quantity: 2 }],
      [product],
      3000,
    ),
    { subtotal: 50000, discount: 3000, total: 47000 },
  );
  assert.equal(
    calculateDeliveryAmounts([{ productId: "a", quantity: 1 }], [product], 3000)
      .total,
    25000,
  );
  assert.deepEqual(
    calculateDeliveryAmounts(
      [{ productId: "a", quantity: 2 }],
      [{ ...product, specialDiscountAmount: 29000 }],
      3000,
    ),
    { subtotal: 2000, discount: 2000, total: 0 },
  );
  assert.equal(
    sellingPrice({ ...product, specialDiscountEnabled: false }),
    30000,
  );
  assert.equal(sellingPrice({ ...product, category: "experience" }), 30000);
  assert.throws(() =>
    sellingPrice({ ...product, specialDiscountAmount: 30001 }),
  );
});
test("admin rejects invalid discount amounts and discounts on experience products", () => {
  const base = {
    id: null,
    category: "product",
    fruit_type: "감귤",
    weight_grams: 3000,
    description: "테스트",
    price: 30000,
    is_active: true,
    is_deleted: false,
    inventory_enabled: false,
    stock_quantity: null,
    sort_order: 0,
    bundle_eligible: true,
    special_discount_enabled: true,
    special_discount_amount: 5000,
  };
  assert.equal(productSchema.safeParse(base).success, true);
  for (const amount of [-1, 0, 30001, 1.5])
    assert.equal(
      productSchema.safeParse({ ...base, special_discount_amount: amount })
        .success,
      false,
    );
  assert.equal(
    productSchema.safeParse({
      ...base,
      category: "experience",
      fruit_type: null,
      weight_grams: null,
      bundle_eligible: false,
    }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      ...base,
      special_discount_enabled: false,
      special_discount_amount: 0,
    }).success,
    true,
  );
});
