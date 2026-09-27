export type CatalogCategory = "product" | "experience";

export type Product = {
  id: string;
  category: CatalogCategory;
  fruitType: string;
  weightGrams: number;
  description: string;
  price: number;
  inventoryEnabled: boolean;
  stockQuantity: number | null;
  bundleEligible?: boolean;
  unavailableReason?: string;
};

export const categoryContent = {
  product: {
    label: "상품 구매",
    eyebrow: "FROM OUR FARM",
    title: "농장의 좋은 과일을,\n소중한 사람에게.",
    description:
      "마음에 드는 과일을 골라 보내주세요. 여러 곳으로 보내도 결제는 한 번이면 돼요.",
    shortDescription: "농장에서 준비한 과일을 골라 보내요.",
  },
  experience: {
    label: "체험 과일 보내기",
    eyebrow: "PICKED BY YOU",
    title: "직접 고른 즐거움을,\n집에서도 그대로.",
    description:
      "오늘 체험한 과일을 보내주세요. 받는 분마다 상품과 수량을 따로 선택할 수 있어요.",
    shortDescription: "오늘 체험한 과일을 집으로 보내요.",
  },
} satisfies Record<
  CatalogCategory,
  {
    label: string;
    eyebrow: string;
    title: string;
    description: string;
    shortDescription: string;
  }
>;

export function isCatalogCategory(value: string): value is CatalogCategory {
  return value === "product" || value === "experience";
}

export function productLabel(product: Product): string {
  return `${product.fruitType} ${product.weightGrams / 1000}kg · ${product.description}`;
}

export function isSoldOut(product: Product): boolean {
  return (
    product.inventoryEnabled &&
    product.stockQuantity !== null &&
    product.stockQuantity <= 0
  );
}
