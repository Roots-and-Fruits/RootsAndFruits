import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { readTrackingWorkbook } from "../../src/features/admin/tracking-excel";
import {
  groupTrackingRows,
  trackingFileLimit,
  type TrackingMatch,
} from "../../src/features/admin/tracking";

async function workbook(edit: (s: ExcelJS.Worksheet) => void) {
  const w = new ExcelJS.Workbook(),
    s = w.addWorksheet("Sheet0");
  s.getCell("G1").value = "운송장번호";
  s.getCell("AO1").value = "고객메세지";
  edit(s);
  return Buffer.from(await w.xlsx.writeBuffer());
}
test("tracking workbook uses G/AO, preserves zeros and rejects ambiguous cells per row", async () => {
  const buffer = await workbook((s) => {
    for (let r = 2; r <= 10; r++) s.getCell(`AO${r}`).value = "123-1";
    s.getCell("G2").value = "0012-3456-7890";
    s.getCell("G3").value = 123;
    s.getCell("G3").numFmt = "000000000000";
    s.getCell("G4").value = { formula: "1+1", result: 2 };
    s.getCell("G5").value = 10000000000000000;
    s.getCell("G6").value = "123";
    s.getCell("AO6").value = "123";
    s.getCell("G7").value = "123";
    s.getCell("AO7").value = "";
    s.getCell("G8").value = "abc";
    s.getCell("G10").value = new Date("2026-10-05");
  });
  const rows = await readTrackingWorkbook(buffer, "test.xlsx");
  assert.equal(rows.length, 9);
  assert.equal(rows[0].number, "001234567890");
  assert.equal(rows[1].number, "000000000123");
  assert.ok(rows.slice(2).every((r) => r.error));
  assert.equal(rows[0].key, "123-1");
});
test("tracking workbook rejects wrong headers, empty/oversized data and invalid formats", async () => {
  await assert.rejects(
    readTrackingWorkbook(Buffer.alloc(0), "data.xls"),
    /xlsx/,
  );
  await assert.rejects(
    readTrackingWorkbook(Buffer.alloc(trackingFileLimit + 1), "data.xlsx"),
    /2MB/,
  );
  await assert.rejects(
    readTrackingWorkbook(Buffer.from("invalid"), "data.xlsx"),
    /올바른/,
  );
  await assert.rejects(
    readTrackingWorkbook(await workbook(() => {}), "data.xlsx"),
    /없는/,
  );
  await assert.rejects(
    readTrackingWorkbook(
      await workbook((s) => {
        s.getCell("AO1").value = "다른 열";
      }),
      "data.xlsx",
    ),
    /AO열/,
  );
  await assert.rejects(
    readTrackingWorkbook(
      await workbook((s) => {
        for (let r = 2; r <= 1002; r++) {
          s.getCell(`G${r}`).value = "1234";
          s.getCell(`AO${r}`).value = "1-1";
        }
      }),
      "data.xlsx",
    ),
    /1,000행/,
  );
});
test("tracking groups multiple numbers, deduplicates and excludes invalid/unpaid/unexported rows", () => {
  const match = {
    id: "a",
    key: "123-1",
    recipient: "테스트",
    checkout_status: "paid",
    status: "exported",
    version: 0,
    tracking_numbers: [],
  } as unknown as TrackingMatch;
  const result = groupTrackingRows(
    [
      { row: 2, key: "123-1", number: "01" },
      { row: 3, key: "123-1", number: "02" },
      { row: 4, key: "123-1", number: "01" },
      { row: 5, key: "123-2", number: "03" },
      { row: 6, key: "124-1", number: "04" },
      { row: 7, key: "125-1", number: "05" },
      { row: 8, key: "999-1", number: "06" },
      { row: 9, key: "123-1", number: "", error: "송장 없음" },
    ],
    [
      match,
      { ...match, id: "b", key: "123-2", status: "shipped" },
      { ...match, key: "124-1", checkout_status: "cancelled" },
      { ...match, key: "125-1", status: "waiting" },
    ],
  );
  assert.equal(result.groups.length, 2);
  assert.deepEqual(result.groups[0].numbers, ["01", "02"]);
  assert.equal(result.groups[0].incomplete, true);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.excluded.length, 4);
});
