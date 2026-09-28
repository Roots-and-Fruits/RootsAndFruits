import { test } from "node:test";
import assert from "node:assert/strict";
import { fromDateOnly, toDateOnly } from "../../src/lib/date-only";

test("calendar dates retain their day in Korean and overseas browser time zones", () => {
  const original = process.env.TZ;
  try {
    for (const zone of [
      "Asia/Seoul",
      "UTC",
      "America/Los_Angeles",
      "Pacific/Kiritimati",
    ]) {
      process.env.TZ = zone;
      for (const date of [
        "2028-02-29",
        "2026-03-08",
        "2026-11-01",
        "2026-12-31",
        "2027-01-01",
      ]) {
        const parsed = fromDateOnly(date)!;
        assert.equal(toDateOnly(parsed), date, zone);
        assert.equal(parsed.getDate(), Number(date.slice(-2)));
      }
    }
    for (const invalid of [
      "",
      "2026-02-29",
      "2026-13-01",
      "2026-01-32",
      "2026-1-01",
    ]) {
      assert.equal(fromDateOnly(invalid), undefined);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
