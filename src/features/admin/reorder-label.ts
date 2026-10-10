import type { Checkout, ReorderKind } from "./schema";

export const reorderKindLabels: Record<ReorderKind, string> = {
  correction: "수정",
  repeat: "재주문",
};

export function reorderOriginLabel(
  order: Pick<Checkout, "original_id" | "original_number" | "reorder_kind">,
) {
  if (!order.original_id) return null;
  const label = order.reorder_kind
    ? reorderKindLabels[order.reorder_kind]
    : "재접수";
  return order.original_number
    ? `${label}${order.reorder_kind ? " " : " · "}원본 ${order.original_number}번`
    : label;
}
