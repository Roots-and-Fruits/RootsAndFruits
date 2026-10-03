import { Printer } from "lucide-react";
import { AdminButton } from "./admin-button";
import type { Checkout } from "./schema";

export function ReceiptLink({ order }: { order: Checkout }) {
  return (
    <AdminButton asChild variant="outline">
      <a
        href={`/namu-admin/print/${order.id}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${order.order_number}번 주문서 인쇄 (새 창)`}
      >
        <Printer aria-hidden="true" />
        주문서
      </a>
    </AdminButton>
  );
}
