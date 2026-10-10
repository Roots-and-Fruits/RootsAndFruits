import { z } from "zod";

export const trackingFileLimit = 2 * 1024 * 1024;
export const trackingRowLimit = 1000;
export const trackingKey = /^[1-9][0-9]{0,15}-[1-9][0-9]{0,2}$/;
export type TrackingInputRow = {
  row: number;
  key: string;
  number: string;
  error?: string;
  skipped?: boolean;
};
export type TrackingMatch = {
  id: string;
  key: string;
  recipient: string;
  checkout_status: string;
  status: "waiting" | "exported" | "shipped";
  processing_date: string;
  version: number;
  tracking_numbers: string[];
};
export type TrackingGroup = TrackingMatch & {
  rows: number[];
  numbers: string[];
  incomplete: boolean;
};
export type TrackingPreview = {
  groups: TrackingGroup[];
  excluded: TrackingInputRow[];
  duplicateCount: number;
  skippedCount: number;
  rowCount: number;
  serverTime: string;
};
export type TrackingSaved = Pick<
  TrackingMatch,
  "id" | "status" | "processing_date" | "tracking_numbers"
>;
export type TrackingMode = "add" | "replace" | "skip";

export const trackingSaveSchema = z
  .object({
    requestId: z.string().uuid(),
    changes: z
      .array(
        z.object({
          id: z.string().uuid(),
          key: z.string().regex(trackingKey),
          version: z.number().int().nonnegative(),
          mode: z.enum(["add", "replace"]),
          numbers: z
            .array(z.string().regex(/^[0-9]{1,40}$/))
            .min(1)
            .max(trackingRowLimit),
        }),
      )
      .min(1)
      .max(trackingRowLimit),
  })
  .refine(
    (v) =>
      v.changes.reduce((n, g) => n + g.numbers.length, 0) <= trackingRowLimit,
    "한 번에 1,000개 송장까지 저장할 수 있습니다.",
  );

export function groupTrackingRows(
  rows: TrackingInputRow[],
  matches: TrackingMatch[],
): TrackingPreview {
  const lookup = new Map(matches.map((m) => [m.key, m]));
  const groups = new Map<string, TrackingGroup>();
  const excluded: TrackingInputRow[] = [];
  let duplicateCount = 0;
  let skippedCount = 0;
  for (const row of rows) {
    if (row.skipped) {
      skippedCount++;
      continue;
    }
    const match = lookup.get(row.key);
    const error =
      row.error ||
      (!match
        ? "배송 식별자에 해당하는 주문이 없습니다."
        : match.checkout_status !== "paid"
          ? "결제 완료 주문이 아닙니다."
          : match.status === "waiting"
            ? "엑셀 출력 전 배송지입니다."
            : "");
    if (error) {
      excluded.push({ ...row, error });
      continue;
    }
    const group = groups.get(row.key) ?? {
      ...match!,
      rows: [],
      numbers: [],
      incomplete: false,
    };
    group.rows.push(row.row);
    if (group.numbers.includes(row.number)) duplicateCount++;
    else group.numbers.push(row.number);
    groups.set(row.key, group);
  }
  for (const group of groups.values()) {
    group.numbers.sort();
    group.incomplete = excluded.some((r) => r.key === group.key);
  }
  return {
    groups: [...groups.values()],
    excluded,
    duplicateCount,
    skippedCount,
    rowCount: rows.length,
    serverTime: new Date().toISOString(),
  };
}
