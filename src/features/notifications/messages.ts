import { z } from "zod";
import { savedItemLabel } from "@/features/admin/schema";

export type NotificationJob = {
  id: string;
  event: "received" | "shipped";
  phone: string;
  payload: unknown;
  attempts: number;
  // Historical records may still name a retired service; only Aligo can send.
  provider?: string | null;
  test_mode?: boolean;
  recipient_role?: "sender" | "recipient";
};

const number = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const received = z.object({
  orderNumber: number,
  total: number,
  deliveryCount: number,
});
const shipped = z.object({
  orderNumber: number,
  position: number,
  recipientName: z.string().min(1),
});

const items = z
  .array(
    z.object({
      label: z.string().min(1),
      weightGrams: z.number().int().positive().nullable(),
      quantity: z.number().int().positive(),
    }),
  )
  .min(1);
const category = z.enum(["product", "experience"]);
const delivery = z.object({
  position: z.number().int().positive(),
  recipientName: z.string().min(1),
  address: z.string().min(1),
  addressDetail: z.string(),
  items,
});
const line = (value: string) => value.replace(/[\r\n\t]/g, " ").trim();
function itemText(
  value: z.infer<typeof items>,
  kind: z.infer<typeof category>,
) {
  return value
    .map(
      (item) =>
        `${line(savedItemLabel({ label: item.label, weight_grams: item.weightGrams }, kind))} × ${item.quantity}`,
    )
    .join(", ");
}

export function aligoVariables(job: NotificationJob): Record<string, string> {
  if (job.event === "received") {
    const value = received
      .extend({ category, deliveries: z.array(delivery).min(1) })
      .parse(job.payload);
    if (value.deliveries.length !== value.deliveryCount)
      throw new Error("INVALID_PAYLOAD");
    return {
      주문번호: String(value.orderNumber),
      배송지수: String(value.deliveryCount),
      주문금액: value.total.toLocaleString("ko-KR"),
      배송지정보: [...value.deliveries]
        .sort((a, b) => a.position - b.position)
        .map(
          (d) =>
            `${d.position}. ${line(d.recipientName)}님\n주소: ${[line(d.address), line(d.addressDetail)].filter(Boolean).join(" ")}\n상품: ${itemText(d.items, value.category)}`,
        )
        .join("\n\n"),
    };
  }
  const value = shipped
    .extend({ category, senderName: z.string().min(1), items })
    .parse(job.payload);
  return {
    보내는분: line(value.senderName),
    받는분: line(value.recipientName),
    발송상품: itemText(value.items, value.category),
  };
}
