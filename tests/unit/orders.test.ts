import assert from "node:assert/strict";
import { test } from "node:test";
import { previewProducts } from "../../src/features/catalog/preview-data";
import { isSoldOut } from "../../src/features/catalog/types";
import {
  addDays,
  calculateSubtotal,
  calculateTotal,
  dateInSeoul,
  isAllowedScheduledDate,
  processingDate,
} from "../../src/features/orders/calculations";
import {
  createEmptyDelivery,
  senderSchema,
  phoneSchema,
} from "../../src/features/orders/schema";

test("two delivery orders retain separate items and one combined total without shipping fees", () => {
  const first = createEmptyDelivery();
  first.items = [{ productId: "preview-citrus-3", quantity: 2 }];
  const second = createEmptyDelivery();
  second.items = [
    { productId: "preview-citrus-3", quantity: 1 },
    { productId: "preview-hallabong-3", quantity: 1 },
  ];
  assert.equal(calculateSubtotal(first.items, previewProducts), 60000);
  assert.equal(calculateTotal([first, second], previewProducts), 135000);
});
test("new delivery drafts share neither recipient nor quantity state", () => {
  const first = createEmptyDelivery();
  const second = createEmptyDelivery();
  first.recipient.name = "첫 수령인";
  first.items.push({ productId: "preview-citrus-3", quantity: 1 });
  assert.equal(second.recipient.name, "");
  assert.deepEqual(second.items, []);
});
test("inventory disabled products remain selectable regardless of stored stock", () => {
  assert.equal(
    isSoldOut({
      ...previewProducts[0],
      inventoryEnabled: false,
      stockQuantity: 0,
    }),
    false,
  );
  assert.equal(
    isSoldOut({
      ...previewProducts[0],
      inventoryEnabled: true,
      stockQuantity: -2,
    }),
    true,
  );
});
test("subtotal does not reject selected products when inventory becomes negative", () => {
  const products = [
    { ...previewProducts[0], inventoryEnabled: true, stockQuantity: -1 },
  ];
  assert.equal(
    calculateSubtotal([{ productId: products[0].id, quantity: 2 }], products),
    60000,
  );
});
test("missing products and invalid quantities are not silently priced at zero", () => {
  assert.throws(() =>
    calculateSubtotal([{ productId: "missing", quantity: 1 }], previewProducts),
  );
  assert.throws(() =>
    calculateSubtotal(
      [{ productId: previewProducts[0].id, quantity: -1 }],
      previewProducts,
    ),
  );
});
test("phone requires 11 digits and privacy consent remains required", () => {
  const valid = {
    name: "홍길동",
    phone: "01012345678",
    privacyConsent: true,
    marketingConsent: false,
  };
  assert.equal(senderSchema.safeParse(valid).success, true);
  for (const phone of [
    "010-1234234-5678 ",
    "0101234567812345678",
    "0101234567a",
    "010123456789",
  ]) {
    assert.equal(senderSchema.safeParse({ ...valid, phone }).success, false);
  }
  assert.equal(
    senderSchema.safeParse({ ...valid, phone: "123" }).success,
    false,
  );
  assert.equal(
    senderSchema.safeParse({ ...valid, privacyConsent: false }).success,
    false,
  );
});
test("phone normalization accepts text replacement formatting without truncating digits", () => {
  for (const phone of [
    "01012345678",
    "010-1234-5678 ",
    " 010 1234 5678\t",
    "010-1234-5678\u00a0",
    "010-1234-5678\u202f",
    "010-1234-5678 문자",
  ]) {
    assert.equal(phoneSchema.parse(phone), "01012345678");
  }
  for (const phone of [
    "",
    " - ",
    "문자",
    "010-1234-567",
    "0101234567812345678",
    "010-1234234-5678 ",
  ]) {
    assert.equal(phoneSchema.safeParse(phone).success, false);
  }
});
test("Korean calendar dates remain stable across UTC midnight and month boundaries", () => {
  assert.equal(dateInSeoul(new Date("2026-09-19T15:30:00Z")), "2026-09-20");
  assert.equal(addDays("2026-12-31", 2), "2027-01-02");
  assert.equal(processingDate("2027-01-01"), "2026-12-31");
});
test("legacy scheduled delivery excludes Sundays but default delivery does not gain that restriction", () => {
  assert.equal(isAllowedScheduledDate("2026-09-27", "2026-09-20", 14), false);
  assert.equal(isAllowedScheduledDate("2026-09-23", "2026-09-20", 14), true);
  assert.equal(isAllowedScheduledDate("2026-09-22", "2026-09-20", 14), false);
  assert.equal(isAllowedScheduledDate("2026-10-05", "2026-09-20", 14), false);
  assert.equal(isAllowedScheduledDate("2026-09-31", "2026-09-20", 14), false);
  assert.equal(addDays("2026-09-25", 2), "2026-09-27");
});
