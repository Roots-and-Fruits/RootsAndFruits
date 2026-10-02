import { z } from "zod";
import { recipientSchema, senderSchema } from "@/features/orders/schema";
export const paymentMethodSchema = z.enum(
  ["card", "cash", "transfer", "other"],
  {
    errorMap: () => ({ message: "결제 방식을 선택해주세요." }),
  },
);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  card: "카드",
  cash: "현금",
  transfer: "입금",
  other: "기타",
};
export const paymentSchema = z.object({ paymentMethod: paymentMethodSchema });
export const checkoutSchema = z.object({
  category: z.enum(["product", "experience"]),
  sender: senderSchema,
  deliveries: z
    .array(
      z.object({
        recipient: recipientSchema,
        items: z
          .array(
            z.object({
              productId: z.string().uuid(),
              quantity: z.number().int().min(1).max(100000),
            }),
          )
          .min(1)
          .max(200)
          .refine(
            (items) =>
              new Set(items.map((i) => i.productId)).size === items.length,
            "상품 항목이 중복되었습니다.",
          ),
        deliveryMode: z.enum(["regular", "scheduled"]),
        requestedDate: z.string(),
      }),
    )
    .min(1)
    .max(100),
});
export const submitSchema = z.object({
  requestId: z.string().uuid(),
  order: checkoutSchema,
});
export const productFieldsSchema = z.object({
  id: z.string().uuid().nullable(),
  category: z.enum(["product", "experience"]),
  fruit_type: z.string().trim().min(1).max(80).nullable(),
  weight_grams: z.number().int().positive().max(1000000).nullable(),
  description: z.string().trim().max(500),
  price: z.number().int().min(0).max(100000000),
  is_active: z.boolean(),
  is_deleted: z.boolean(),
  inventory_enabled: z.boolean(),
  stock_quantity: z.number().int().min(-10000000).max(10000000).nullable(),
  sort_order: z.number().int().min(0).max(1000000),
  bundle_eligible: z.boolean(),
});
export const productSchema = productFieldsSchema.superRefine((product, ctx) => {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if (product.category === "product") {
    if (!product.fruit_type) issue("fruit_type", "과일 종류를 입력해주세요.");
    if (product.weight_grams === null)
      issue("weight_grams", "중량을 입력해주세요.");
  } else {
    if (!product.description) issue("description", "상품 내용을 입력해주세요.");
    if (product.fruit_type !== null)
      issue("fruit_type", "체험상품은 과일 종류를 사용하지 않습니다.");
    if (product.weight_grams !== null)
      issue("weight_grams", "체험상품은 중량을 사용하지 않습니다.");
    if (product.inventory_enabled)
      issue("inventory_enabled", "체험상품은 재고를 관리하지 않습니다.");
    if (product.bundle_eligible)
      issue("bundle_eligible", "체험상품은 묶음 할인을 적용하지 않습니다.");
  }
});
export type AdminProduct = z.infer<typeof productSchema>;
export function adminProductLabel(product: AdminProduct): string {
  return product.category === "experience"
    ? product.description
    : `${product.fruit_type} ${product.weight_grams! / 1000}kg · ${product.description}`;
}
export const settingsSchema = z.object({
  max_days: z.number().int().min(3).max(365),
  bundle_discount: z.number().int().min(0).max(100000000),
  postal_code: z.string().trim().max(20),
  address: z.string().trim().max(500),
});
export type Settings = z.infer<typeof settingsSchema>;
export type SavedItem = {
  id: string;
  product_id: string;
  label: string;
  weight_grams: number | null;
  quantity: number;
  unit_price: number;
  bundle_eligible: boolean;
};
export type Shipment = {
  id: string;
  position: number;
  recipient: z.infer<typeof recipientSchema>;
  delivery_mode: "regular" | "scheduled";
  requested_date: string;
  processing_date: string;
  subtotal: number;
  discount: number;
  total: number;
  status: "waiting" | "exported" | "shipped";
  note: string;
  order_items: SavedItem[];
};
export type Checkout = {
  member_id?: string | null;
  order_source?: "guest" | "kakao" | "tablet";
  id: string;
  order_number: number;
  category: "product" | "experience";
  sender: z.infer<typeof senderSchema>;
  subtotal: number;
  discount: number;
  total: number;
  status: "pending" | "paid" | "cancelled";
  payment_method: PaymentMethod | null;
  original_id: string | null;
  original_number?: number | null;
  created_at: string;
  deliveries: Shipment[];
};
export type ExportBatch = {
  id: string;
  created_at: string;
  filename: string;
  created_by: string;
  export_members: {
    delivery_id: string;
    deliveries?: {
      recipient: { name: string };
      status: Shipment["status"];
      checkouts: { order_number: number };
    };
  }[];
};
export const stateLabel = {
  pending: "결제 대기",
  paid: "결제 완료",
  cancelled: "취소",
  waiting: "출력 대기",
  exported: "출력됨 · 발송 대기",
  shipped: "발송 완료",
};
