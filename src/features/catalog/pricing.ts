import type { Product } from "./types";

export function specialDiscount(product: Product): number {
  if (product.category !== "product" || !product.specialDiscountEnabled)
    return 0;
  const amount = product.specialDiscountAmount ?? 0;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > product.price)
    throw new Error("특별할인 금액을 확인해주세요.");
  return amount;
}

export function sellingPrice(product: Product): number {
  return product.price - specialDiscount(product);
}
