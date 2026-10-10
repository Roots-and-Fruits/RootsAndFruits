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

function deliveryIdentifier(
  values: (string | null)[],
): Pick<TrackingInputRow, "key" | "error" | "skipped"> {
  // Only an explicit prefix at the start identifies one of our deliveries.
  // A valid AJ identifier wins; AO is a fallback, never a guess by recipient.
  const tagged = values.filter(
    (value): value is string => value?.startsWith("주문번호") ?? false,
  );
  for (const value of tagged) {
    const match = /^주문번호\s*:\s*(.+)$/.exec(value);
    if (match && trackingKey.test(match[1])) return { key: match[1] };
  }
  if (tagged.length)
    return {
      key: tagged[0].slice(0, 80),
      error: "배송 식별자는 주문번호:79-1 형식이어야 합니다.",
    };
  if (values.some((value) => value === null))
    return { key: "", error: "배송 식별자가 텍스트가 아닙니다." };
  if (values.some((value) => value)) return { key: "", skipped: true };
  return { key: "", error: "배송 식별자가 없습니다." };
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
      (cellString(s.getCell("AJ1")) === "특기사항" ||
        cellString(s.getCell("AO1")) === "고객메세지"),
  );
  if (sheets.length !== 1)
    throw new Error(
      "1행 G열 ‘운송장번호’와 AJ열 ‘특기사항’ 또는 AO열 ‘고객메세지’가 있는 시트가 하나여야 합니다.",
    );
  const sheet = sheets[0];
  // Ignore a column entirely if its header does not identify the expected field.
  const identifierColumns = [
    ...(cellString(sheet.getCell("AJ1")) === "특기사항" ? [36] : []),
    ...(cellString(sheet.getCell("AO1")) === "고객메세지" ? [41] : []),
  ];
  const rows: TrackingInputRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rows.length >= trackingRowLimit)
      throw new Error("한 번에 데이터 1,000행까지 업로드할 수 있습니다.");
    const identifier = deliveryIdentifier(
      identifierColumns.map((column) => cellString(row.getCell(column))),
    );
    if (identifier.skipped) {
      rows.push({ row: rowNumber, key: "", number: "", skipped: true });
      return;
    }
    const raw = cellString(row.getCell(7));
    const number = raw?.replace(/[\s-]/g, "") ?? "";
    const error =
      identifier.error ||
      (raw === null
        ? "송장번호의 셀 형식 또는 숫자 정밀도를 확인해주세요."
        : !number
          ? "송장번호가 없습니다."
          : !/^[0-9]{1,40}$/.test(number)
            ? "송장번호 형식을 확인해주세요."
            : undefined);
    rows.push({
      row: rowNumber,
      key: identifier.key,
      number: number.slice(0, 80),
      error,
    });
  });
  if (!rows.length) throw new Error("송장 데이터가 없는 파일입니다.");
  return rows;
}
