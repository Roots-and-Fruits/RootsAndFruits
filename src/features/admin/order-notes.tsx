import type { Checkout, Shipment } from "./schema";

export function ReorderNotice({ order }: { order: Checkout }) {
  if (!order.original_id) return null;
  return (
    <span className="inline-flex w-fit align-middle whitespace-nowrap rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      재접수{order.original_number ? ` · 원본 ${order.original_number}번` : ""}
    </span>
  );
}

export function OrderNotes({
  order,
  delivery,
}: {
  order: Checkout;
  delivery?: Shipment;
}) {
  const notes = (delivery ? [delivery] : [...order.deliveries])
    .filter((item) => item.note.trim())
    .sort((a, b) => a.position - b.position);
  if (!order.original_id && !notes.length) return null;
  return (
    <span className="block text-xs leading-5 text-muted-foreground">
      {order.original_id && (
        <span className="mr-2">
          <ReorderNotice order={order} />
        </span>
      )}
      {notes.map((item) => (
        <span
          key={item.id}
          className="mr-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
        >
          <span className="font-medium">
            {delivery
              ? "메모"
              : `배송지 ${item.position} · ${item.recipient.name} 메모`}
            :{" "}
          </span>
          <span className="font-semibold text-foreground">{item.note}</span>
        </span>
      ))}
    </span>
  );
}
