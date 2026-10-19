import { savedItemLabel, type SavedItem } from "./schema";

export type ExportSummarySource = {
  category: "product" | "experience";
  items: Pick<
    SavedItem,
    "product_id" | "label" | "weight_grams" | "quantity"
  >[];
};
export type ExportSummary = {
  deliveryCount: number;
  totalGrams: number;
  unweighedQuantity: number;
  products: {
    key: string;
    label: string;
    unitGrams: number | null;
    quantity: number;
    totalGrams: number | null;
  }[];
};

// Use immutable order snapshots, never the current product catalog or discounted quantity.
export function summarizeExport(sources: ExportSummarySource[]): ExportSummary {
  const groups = new Map<string, ExportSummary["products"][number]>();
  let totalGrams = 0;
  let unweighedQuantity = 0;
  for (const source of sources) {
    for (const item of source.items) {
      const label = savedItemLabel(item, source.category);
      const unitGrams =
        source.category === "experience" ? null : item.weight_grams;
      const key = JSON.stringify([
        source.category,
        item.product_id,
        label,
        unitGrams,
      ]);
      const group = groups.get(key) ?? {
        key,
        label,
        unitGrams,
        quantity: 0,
        totalGrams: unitGrams === null ? null : 0,
      };
      group.quantity += item.quantity;
      if (unitGrams === null) unweighedQuantity += item.quantity;
      else {
        const grams = unitGrams * item.quantity;
        group.totalGrams! += grams;
        totalGrams += grams;
      }
      groups.set(key, group);
    }
  }
  return {
    deliveryCount: sources.length,
    totalGrams,
    unweighedQuantity,
    products: [...groups.values()].sort(
      (a, b) =>
        a.label.localeCompare(b.label, "ko") ||
        (a.unitGrams ?? 0) - (b.unitGrams ?? 0) ||
        a.key.localeCompare(b.key),
    ),
  };
}

export function kilograms(grams: number) {
  return `${(grams / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}kg`;
}
