import { z } from "zod";

// Legacy source: useOrderPostDataValidation.ts. Keep the 11-digit phone rule.
export const phoneSchema = z
  .string()
  .transform((value) => value.replace(/[^0-9]/g, ""))
  .refine(
    (value) => /^\d{11}$/.test(value),
    "휴대폰 번호 11자리를 입력해주세요.",
  );

export const senderSchema = z.object({
  name: z.string().trim().min(1, "보내는 분의 이름을 입력해주세요."),
  phone: phoneSchema,
  privacyConsent: z
    .boolean()
    .refine(Boolean, "개인정보 수집 및 이용에 동의해주세요."),
  marketingConsent: z.boolean(),
});

export const recipientSchema = z.object({
  sameAsSender: z.boolean().optional(),
  name: z.string().trim().min(1, "받는 분의 이름을 입력해주세요."),
  phone: phoneSchema,
  postalCode: z
    .string()
    .trim()
    .min(1, "주소 검색으로 우편번호를 입력해주세요."),
  address: z.string().trim().min(1, "받는 분의 주소를 입력해주세요."),
  addressDetail: z.string().trim().min(1, "상세주소를 입력해주세요."),
});

export type Sender = z.infer<typeof senderSchema>;
export type Recipient = z.infer<typeof recipientSchema>;
export type OrderLine = { productId: string; quantity: number };
export type DeliveryDraft = {
  recipient: Recipient;
  items: OrderLine[];
  deliveryMode: "regular" | "scheduled";
  requestedDate: string;
};

export const emptySender: Sender = {
  name: "",
  phone: "",
  privacyConsent: false,
  marketingConsent: false,
};
export const emptyRecipient: Recipient = {
  name: "",
  phone: "",
  postalCode: "",
  address: "",
  addressDetail: "",
};

export function createEmptyDelivery(): DeliveryDraft {
  return {
    recipient: { ...emptyRecipient },
    items: [],
    deliveryMode: "regular",
    requestedDate: "",
  };
}
