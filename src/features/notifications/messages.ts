import { z } from "zod";

export type NotificationJob = {
  id: string;
  event: "received" | "shipped";
  phone: string;
  payload: unknown;
  attempts: number;
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

export function notificationText(job: NotificationJob): string {
  if (job.event === "received") {
    const value = received.parse(job.payload);
    return `[나무와열매] 주문 접수 안내\n주문번호: ${value.orderNumber}번\n배송지: ${value.deliveryCount}곳\n결제금액: ${value.total.toLocaleString("ko-KR")}원\n카운터에 주문번호를 알려주시고 결제해주세요.`;
  }
  const value = shipped.parse(job.payload);
  const name = value.recipientName.replace(/[\r\n\t]/g, " ").slice(0, 60);
  return `[나무와열매] 발송 안내\n주문번호: ${value.orderNumber}번\n배송지 ${value.position}: ${name}님\n상품이 발송되었습니다. 감사합니다.`;
}
