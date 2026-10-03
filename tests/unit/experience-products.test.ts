import assert from "node:assert/strict";
import { test } from "node:test";
import {
  productSchema,
  adminProductLabel,
  savedItemLabel,
} from "../../src/features/admin/schema";
import { checkProductSave, HttpError } from "../../src/features/admin/http";
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
test("experience labels remove only the legacy snapshot prefix and retain the ordered description", () => {
  for (const [item, expected] of [
    [{ label: "택배 1kg · 체험귤", weight_grams: 1000 }, "체험귤"],
    [
      { label: "택배 2.5kg · 체험귤 · 큰 상자", weight_grams: 2500 },
      "체험귤 · 큰 상자",
    ],
    [{ label: "택배 1kg · 체험귤", weight_grams: null }, "택배 1kg · 체험귤"],
    [{ label: "택배 1kg · 체험귤", weight_grams: 3000 }, "택배 1kg · 체험귤"],
    [{ label: "택배 1kg · ", weight_grams: 1000 }, "택배 1kg · "],
    [{ label: "체험귤", weight_grams: null }, "체험귤"],
  ] as const) {
    assert.equal(savedItemLabel(item, "experience"), expected);
    assert.equal(savedItemLabel(item, "product"), item.label);
  }
});
test("experience save explains a missing DB migration without exposing the failing row", () => {
  for (const column of ["fruit_type", "weight_grams"]) {
    const error = {
      code: "23502",
      message: `null value in column "${column}" of relation "products" violates not-null constraint`,
    };
    assert.throws(
      () => checkProductSave(error, "experience"),
      (e) =>
        e instanceof HttpError &&
        e.status === 503 &&
        e.message ===
          "체험상품 DB 업데이트가 필요합니다. 업데이트 적용 후 다시 저장해주세요.",
    );
    assert.throws(
      () => checkProductSave(error, "product"),
      (e) =>
        e instanceof HttpError &&
        e.status === 400 &&
        !e.message.includes(column),
    );
  }
  assert.doesNotThrow(() => checkProductSave(null, "experience"));
  assert.throws(
    () =>
      checkProductSave(
        { code: "23514", message: "check constraint" },
        "experience",
      ),
    (e) => e instanceof HttpError && e.status === 400,
  );
});
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
