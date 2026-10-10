import { Fragment } from "react";
import { cn } from "@/lib/utils";

export function TrackingNumbers({
  numbers,
  label = "송장번호",
  className,
  linked = false,
}: {
  numbers?: string[];
  label?: string;
  className?: string;
  linked?: boolean;
}) {
  if (!numbers?.length) return null;
  return (
    <span
      className={cn(
        "block break-all text-sm font-semibold tabular-nums",
        className,
      )}
    >
      {label && `${label}: `}
      {linked
        ? numbers.map((number, index) => (
            <Fragment key={number}>
              {index > 0 && ", "}
              <a
                href={`https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${encodeURIComponent(number)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${number} 롯데택배 배송조회 (새 창)`}
                className="rounded-sm text-primary underline underline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {number}
              </a>
            </Fragment>
          ))
        : numbers.join(", ")}
    </span>
  );
}
