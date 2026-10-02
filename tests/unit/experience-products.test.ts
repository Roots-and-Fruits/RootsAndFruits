import assert from "node:assert/strict";
import { test } from "node:test";
import {
  productSchema,
  adminProductLabel,
} from "../../src/features/admin/schema";
import {
  productLabel,
  isSoldOut,
  type Product,
} from "../../src/features/catalog/types";
import { calculateDeliveryAmounts } from "../../src/features/orders/calculations";

const experience = {
  id: null,
  category: "experience",
  description: "체험 택배",
  price: 10000,
  is_active: true,
  fruit_type: null,
  weight_grams: null,
  inventory_enabled: false,
  stock_quantity: null,
  bundle_eligible: false,
  is_deleted: false,
  sort_order: 0,
};
test("experience API validation rejects hidden product fields and requires a description", () => {
  const parsed = productSchema.parse(experience);
  assert.equal(adminProductLabel(parsed), "체험 택배");
  for (const invalid of [
    { fruit_type: "감귤" },
    { weight_grams: 3000 },
    { inventory_enabled: true },
    { bundle_eligible: true },
    { description: " " },
    { category: "product" },
  ]) {
    assert.equal(
      productSchema.safeParse({ ...experience, ...invalid }).success,
      false,
    );
  }
  assert.equal(
    productSchema.safeParse({
      ...experience,
      category: "product",
      fruit_type: "감귤",
      weight_grams: 2500,
    }).success,
    true,
  );
});
test("experience calculations ignore legacy discount and stock flags, but block unavailable reorder products", () => {
  const product: Product = {
    id: "experience",
    category: "experience",
    description: "체험 택배",
    price: 10000,
    fruitType: null,
    weightGrams: null,
    inventoryEnabled: true,
    stockQuantity: 0,
    bundleEligible: true,
  };
  assert.equal(productLabel(product), "체험 택배");
  assert.equal(isSoldOut(product), false);
  assert.equal(
    isSoldOut({ ...product, unavailableReason: "판매 중지 · 교체 필요" }),
    true,
  );
  assert.deepEqual(
    calculateDeliveryAmounts(
      [{ productId: product.id, quantity: 3 }],
      [product],
      5000,
    ),
    { subtotal: 30000, discount: 0, total: 30000 },
  );
});
