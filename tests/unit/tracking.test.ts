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
  s.getCell("AJ1").value = "특기사항";
  s.getCell("AO1").value = "고객메세지";
  edit(s);
  return Buffer.from(await w.xlsx.writeBuffer());
}
test("tracking workbook uses G/AJ, preserves zeros and rejects ambiguous cells per row", async () => {
  const buffer = await workbook((s) => {
    for (let r = 2; r <= 10; r++) s.getCell(`AJ${r}`).value = "주문번호:123-1";
    s.getCell("G2").value = "0012-3456-7890";
    s.getCell("G3").value = 123;
    s.getCell("G3").numFmt = "000000000000";
    s.getCell("G4").value = { formula: "1+1", result: 2 };
    s.getCell("G5").value = 10000000000000000;
    s.getCell("G6").value = "123";
    s.getCell("AJ6").value = "주문번호:123";
    s.getCell("G7").value = "123";
    s.getCell("AJ7").value = "";
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
test("tracking identifiers prefer AJ, fall back to AO and skip other stores without guessing", async () => {
  const messages: [ExcelJS.CellValue, ExcelJS.CellValue][] = [
    ["주문번호:79-1", "주문번호:80-1"],
    ["", "주문번호:79-2"],
    ["문 앞에 놓아주세요", "주문번호:80-1"],
    ["주문번호:잘못된형식", "주문번호:80-2"],
    ["  주문번호 : 81-1  ", ""],
    ["문 앞에 놓아주세요", "부재 시 연락주세요"],
    ["79-1", ""],
    ["", "79-1"],
    ["요청사항 주문번호:79-1", ""],
    ["", ""],
    ["주문번호:79", ""],
    ["주문번호:79-1abc", ""],
    ["주문번호:79-0", ""],
    [{ formula: '"주문번호:79-1"', result: "주문번호:79-1" }, ""],
  ];
  const rows = await readTrackingWorkbook(
    await workbook((s) => {
      messages.forEach(([special, message], index) => {
        s.getCell(`AJ${index + 2}`).value = special;
        s.getCell(`AO${index + 2}`).value = message;
        // Non-order rows must be skipped even if their tracking cell is invalid.
        s.getCell(`G${index + 2}`).value =
          index >= 5 && index <= 8 ? "not a number" : "000123";
      });
    }),
    "mixed.xlsx",
  );
  assert.deepEqual(
    rows.slice(0, 5).map((r) => r.key),
    ["79-1", "79-2", "80-1", "80-2", "81-1"],
  );
  assert.ok(
    rows
      .slice(0, 5)
      .every((r) => !r.error && !r.skipped && r.number === "000123"),
  );
  assert.ok(rows.slice(5, 9).every((r) => r.skipped && !r.key && !r.error));
  assert.match(rows[9].error!, /없습니다/);
  assert.ok(
    rows.slice(10, 13).every((r) => r.error?.includes("주문번호:79-1")),
  );
  assert.match(rows[13].error!, /텍스트/);
  const preview = groupTrackingRows(rows, []);
  assert.equal(preview.skippedCount, 4);
  assert.equal(preview.excluded.length, 10);
  assert.equal(preview.rowCount, 14);
});
test("tracking workbook reads only correctly titled identifier columns", async () => {
  for (const [header, cell] of [
    ["AJ1", "AJ2"],
    ["AO1", "AO2"],
  ]) {
    const rows = await readTrackingWorkbook(
      await workbook((s) => {
        s.getCell(header).value = "다른 열";
        s.getCell(cell).value = "주문번호:999-1";
        s.getCell(cell === "AJ2" ? "AO2" : "AJ2").value = "주문번호:79-1";
        s.getCell("G2").value = "001234";
      }),
      "single-column.xlsx",
    );
    assert.equal(rows[0].key, "79-1");
    assert.equal(rows[0].error, undefined);
  }
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
        s.getCell("AJ1").value = "다른 열";
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
          s.getCell(`AJ${r}`).value = "문 앞에 놓아주세요";
        }
      }),
      "data.xlsx",
    ),
    /1,000행/,
  );
});
test("tracking workbook rejects ambiguous worksheets and wrong tracking headers", async () => {
  const w = new ExcelJS.Workbook();
  for (const name of ["first", "second"]) {
    const s = w.addWorksheet(name);
    s.getCell("G1").value = "운송장번호";
    s.getCell("AJ1").value = "특기사항";
    s.getCell("AJ2").value = "주문번호:79-1";
    s.getCell("G2").value = "00123";
  }
  await assert.rejects(
    readTrackingWorkbook(
      Buffer.from(await w.xlsx.writeBuffer()),
      "ambiguous.xlsx",
    ),
    /시트가 하나/,
  );
  await assert.rejects(
    readTrackingWorkbook(
      await workbook((s) => {
        s.getCell("G1").value = "다른 열";
      }),
      "wrong.xlsx",
    ),
    /G열/,
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
      { row: 10, key: "", number: "", skipped: true },
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
  assert.equal(result.skippedCount, 1);
  assert.equal(result.rowCount, 9);
});
