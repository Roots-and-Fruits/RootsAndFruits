import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeExport,
  kilograms,
  type ExportSummarySource,
} from "../../src/features/admin/export-summary";
const item = (
  id: string,
  label: string,
  weight: number | null,
  quantity: number,
) => ({ product_id: id, label, weight_grams: weight, quantity });
test("export summary preserves distinct products, grades, weights and historical snapshots", () => {
  const sources: ExportSummarySource[] = [
    {
      category: "product",
      items: [
        item("a", "감귤 3kg · 로얄과S/M", 3000, 4),
        item("b", "감귤 3kg · 중과L", 3000, 2),
        item("c", "감귤 3kg · 로얄과S", 3000, 1),
        item("d", "감귤 5kg · 로얄과S/M", 5000, 2),
      ],
    },
    {
      category: "product",
      items: [
        item("a", "감귤 3kg · 로얄과S/M", 3000, 2),
        item("a", "감귤 3kg · 이전 설명", 3000, 1),
        item("other", "감귤 3kg · 로얄과S/M", 3000, 1),
        item("a", "감귤 2.5kg · 로얄과S/M", 2500, 3),
      ],
    },
  ];
  const result = summarizeExport(sources);
  assert.equal(result.deliveryCount, 2);
  assert.equal(result.products.length, 7);
  assert.equal(
    result.products.find(
      (p) => p.label === "감귤 3kg · 로얄과S/M" && p.quantity === 6,
    )?.totalGrams,
    18000,
  );
  assert.equal(result.totalGrams, 50500);
  assert.equal(kilograms(result.totalGrams), "50.5kg");
  assert.equal(kilograms(1234), "1.234kg");
});
test("unweighed and legacy experience products count quantities without inventing kg", () => {
  const result = summarizeExport([
    {
      category: "experience",
      items: [
        item("e", "체험", null, 2),
        item("old", "과거 3kg · 체험", 3000, 3),
      ],
    },
    { category: "product", items: [item("unknown", "중량 미상", null, 1)] },
  ]);
  assert.equal(result.totalGrams, 0);
  assert.equal(result.unweighedQuantity, 6);
  assert.ok(result.products.every((p) => p.totalGrams === null));
  assert.deepEqual(summarizeExport([]), {
    deliveryCount: 0,
    totalGrams: 0,
    unweighedQuantity: 0,
    products: [],
  });
});
