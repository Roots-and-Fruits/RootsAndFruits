import { z } from "zod";
import { phoneSchema } from "@/features/orders/schema";

export const savedSenderSchema = z
  .object({
    name: z.string().trim().min(1, "이름을 입력해주세요.").max(80),
    phone: phoneSchema,
  })
  .strict();
export const savedAddressSchema = savedSenderSchema
  .extend({
    label: z.string().trim().min(1, "배송지 이름을 입력해주세요.").max(80),
    postalCode: z.string().trim().min(1, "주소를 검색해주세요.").max(20),
    address: z.string().trim().min(1, "주소를 검색해주세요.").max(500),
    addressDetail: z
      .string()
      .trim()
      .min(1, "상세주소를 입력해주세요.")
      .max(500),
    isDefault: z.boolean(),
  })
  .strict();
export type SavedSender = z.infer<typeof savedSenderSchema>;
export type SavedAddress = z.infer<typeof savedAddressSchema> & { id: string };
export type Preferences = {
  sender: SavedSender | null;
  addresses: SavedAddress[];
};
export type CustomerOrder = {
  id: string;
  order_number: number;
  category: "product" | "experience";
  created_at: string;
  status: "pending" | "paid" | "cancelled";
  sender: SavedSender;
  subtotal: number;
  discount: number;
  total: number;
  deliveries: {
    id: string;
    position: number;
    status: "waiting" | "exported" | "shipped";
    processing_date: string;
    subtotal: number;
    discount: number;
    total: number;
    recipient: Omit<SavedAddress, "id" | "label" | "isDefault">;
    tracking_numbers: string[];
    order_items: {
      label: string;
      weight_grams: number | null;
      quantity: number;
      unit_price: number;
    }[];
  }[];
};
export type CustomerOrders = {
  orders: CustomerOrder[];
  nextCursor: string | null;
};
