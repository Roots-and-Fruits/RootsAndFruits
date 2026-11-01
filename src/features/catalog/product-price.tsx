import { BadgePercent } from "lucide-react";
import { formatWon } from "@/features/orders/calculations";

export function ProductPrice({
  price,
  discount = 0,
  emphasize = true,
}: {
  price: number;
  discount?: number;
  emphasize?: boolean;
}) {
  if (!discount)
    return <span className="text-sm tabular-nums">{formatWon(price)}</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {emphasize && (
        <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-red-600 px-1.5 py-1 text-xs font-bold text-white shadow-sm">
          <BadgePercent className="size-4 shrink-0" aria-hidden="true" />
          <span>특별할인 · {formatWon(discount)} 할인</span>
        </span>
      )}
      <del className="text-sm text-muted-foreground">
        <span className="sr-only">정상가 </span>
        {formatWon(price)}
      </del>
      <span
        className={
          emphasize
            ? "text-lg font-extrabold tabular-nums text-red-600"
            : "text-sm font-medium tabular-nums text-red-600"
        }
      >
        <span className="sr-only">할인 판매가 </span>
        {formatWon(price - discount)}
      </span>
    </span>
  );
}
