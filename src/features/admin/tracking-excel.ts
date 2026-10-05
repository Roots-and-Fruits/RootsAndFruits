import ExcelJS from "exceljs";
import {
  trackingFileLimit,
  trackingKey,
  trackingRowLimit,
  type TrackingInputRow,
} from "./tracking";

function cellString(cell: ExcelJS.Cell): string | null {
  if (cell.value === null) return "";
  if (typeof cell.value === "string") return cell.value.trim();
  if (
    typeof cell.value === "number" &&
    Number.isSafeInteger(cell.value) &&
    cell.value >= 0
  ) {
    const text = String(cell.value);
    // Preserve a numeric cell's explicit leading-zero format, when present.
    return /^0{1,40}$/.test(cell.numFmt ?? "")
      ? text.padStart(cell.numFmt.length, "0")
      : text;
  }
  // Formula/cached results, dates, errors and imprecise numbers cannot be identifiers.
  return null;
}

// Bound expansion before ExcelJS inflates an untrusted archive.
function checkArchive(data: Buffer) {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > data.length)
    throw new Error("올바른 .xlsx 파일이 아닙니다.");
  const count = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16),
    expanded = 0;
  if (count > 2000) throw new Error("엑셀 파일의 내부 항목이 너무 많습니다.");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > data.length || data.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("엑셀 파일 구조를 확인해주세요.");
    expanded += data.readUInt32LE(offset + 24);
    if (expanded > 20 * 1024 * 1024)
      throw new Error("엑셀 압축 해제 크기가 너무 큽니다.");
    offset +=
      46 +
      data.readUInt16LE(offset + 28) +
      data.readUInt16LE(offset + 30) +
      data.readUInt16LE(offset + 32);
  }
}

export async function readTrackingWorkbook(
  data: Buffer,
  filename: string,
): Promise<TrackingInputRow[]> {
  if (!/\.xlsx$/i.test(filename))
    throw new Error(".xlsx 형식의 송장 내역 파일을 선택해주세요.");
  if (data.length > trackingFileLimit)
    throw new Error("파일은 2MB까지 업로드할 수 있습니다.");
  checkArchive(data);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data as unknown as ExcelJS.Buffer);
  } catch {
    throw new Error(
      "엑셀 파일을 읽지 못했습니다. 택배사에서 내려받은 원본 파일을 확인해주세요.",
    );
  }
  const sheets = workbook.worksheets.filter(
    (s) =>
      cellString(s.getCell("G1")) === "운송장번호" &&
      cellString(s.getCell("AO1")) === "고객메세지",
  );
  if (sheets.length !== 1)
    throw new Error(
      "1행 G열 ‘운송장번호’, AO열 ‘고객메세지’가 있는 시트가 하나여야 합니다.",
    );
  const rows: TrackingInputRow[] = [];
  sheets[0].eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rows.length >= trackingRowLimit)
      throw new Error("한 번에 데이터 1,000행까지 업로드할 수 있습니다.");
    const key = cellString(row.getCell(41));
    const raw = cellString(row.getCell(7));
    const number = raw?.replace(/[\s-]/g, "") ?? "";
    const error =
      key === null
        ? "배송 식별자가 텍스트가 아닙니다."
        : !key
          ? "배송 식별자가 없습니다."
          : !trackingKey.test(key)
            ? "배송 식별자는 주문번호-배송지순번 형식이어야 합니다."
            : raw === null
              ? "송장번호의 셀 형식 또는 숫자 정밀도를 확인해주세요."
              : !number
                ? "송장번호가 없습니다."
                : !/^[0-9]{1,40}$/.test(number)
                  ? "송장번호 형식을 확인해주세요."
                  : undefined;
    rows.push({
      row: rowNumber,
      key: (key ?? "").slice(0, 80),
      number: number.slice(0, 80),
      error,
    });
  });
  if (!rows.length) throw new Error("송장 데이터가 없는 파일입니다.");
  return rows;
}
