import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  calculateDeliveryAmounts,
  calculateTotal,
} from "../../src/features/orders/calculations";
import type { Product } from "../../src/features/catalog/types";
import {
  shippingWorkbook,
  shippingHeaders,
} from "../../src/features/admin/excel";
import type { Checkout, Shipment } from "../../src/features/admin/schema";
const a: Product = {
  id: "a",
  category: "product",
  fruitType: "감귤",
  weightGrams: 3000,
  description: "",
  price: 10000,
  inventoryEnabled: false,
  stockQuantity: null,
  bundleEligible: true,
};
const b: Product = { ...a, id: "b", fruitType: "한라봉", price: 20000 };
const c: Product = { ...a, id: "c", bundleEligible: false };
test("discount pairs, mixed products, cap, disabled discount and shipment isolation", () => {
  for (const [quantity, discount] of [
    [1, 0],
    [2, 3000],
    [3, 3000],
    [4, 6000],
  ])
    assert.equal(
      calculateDeliveryAmounts([{ productId: "a", quantity }], [a], 3000)
        .discount,
      discount,
    );
  assert.deepEqual(
    calculateDeliveryAmounts(
      [
        { productId: "a", quantity: 1 },
        { productId: "b", quantity: 1 },
        { productId: "c", quantity: 1 },
      ],
      [a, b, c],
      5000,
    ),
    { subtotal: 40000, discount: 5000, total: 35000 },
  );
  assert.equal(
    calculateDeliveryAmounts(
      [
        { productId: "a", quantity: 2 },
        { productId: "c", quantity: 1 },
      ],
      [a, c],
      100000,
    ).total,
    10000,
  );
  assert.equal(
    calculateDeliveryAmounts([{ productId: "a", quantity: 4 }], [a], 0).total,
    40000,
  );
  const d = {
    recipient: {
      name: "가상",
      phone: "01012345678",
      postalCode: "00000",
      address: "가상",
      addressDetail: "주소",
    },
    items: [{ productId: "a", quantity: 1 }],
    deliveryMode: "regular" as const,
    requestedDate: "",
  };
  assert.equal(calculateTotal([d, d], [a], 3000), 20000);
});
test("Excel preserves old column order, actual units, leading zeros and plain text", async () => {
  const checkout = {
    order_number: 123,
    sender: { name: "=1+1", phone: "01012345678" },
  } as Checkout;
  const delivery = {
    position: 2,
    recipient: {
      name: "수령인",
      phone: "01087654321",
      postalCode: "01234",
      address: "가상",
      addressDetail: "주소",
    },
    order_items: [{ label: "감귤 3kg", quantity: 4 }],
  } as Shipment;
  const buffer = await shippingWorkbook([{ checkout, delivery }], {
    postal_code: "00001",
    address: "사업장",
  });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = book.worksheets[0];
  assert.deepEqual(
    (sheet.getRow(1).values as unknown[]).slice(1),
    shippingHeaders,
  );
  assert.equal(sheet.getCell("N2").value, 4);
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getCell("O2").value, "123-2");
  assert.equal(sheet.getCell("C2").value, "01012345678");
  assert.equal(sheet.getCell("J2").value, "01234");
  assert.equal(sheet.getCell("B2").value, "=1+1");
  assert.equal(sheet.getCell("B2").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("L2").value, "감귤 3kg 4EA");
});
test("Excel uses experience descriptions while retaining general product weights", async () => {
  const checkout = {
    category: "experience",
    sender: { name: "보내는 분", phone: "01012345678" },
  } as Checkout;
  const delivery = {
    recipient: {
      name: "받는 분",
      phone: "01087654321",
      postalCode: "01234",
      address: "가상",
      addressDetail: "주소",
    },
    order_items: [
      { label: "택배 1kg · 체험귤", weight_grams: 1000, quantity: 2 },
    ],
  } as Shipment;
  const buffer = await shippingWorkbook(
    [
      { checkout, delivery },
      { checkout: { ...checkout, category: "product" }, delivery },
    ],
    { postal_code: "00001", address: "사업장" },
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  assert.equal(book.worksheets[0].getCell("L2").value, "체험귤 2EA");
  assert.equal(book.worksheets[0].getCell("L3").value, "택배 1kg · 체험귤 2EA");
  assert.equal(book.worksheets[0].getCell("N2").value, 2);
});
