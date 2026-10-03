import ExcelJS from "exceljs";
import {
  savedItemLabel,
  type Checkout,
  type Settings,
  type Shipment,
} from "./schema";
export const shippingHeaders = [
  "주문번호",
  "보내는사람(지정)",
  "전화번호1(지정)",
  "전화번호2(지정)",
  "우편번호(지정)",
  "주소(지정)",
  "받는사람",
  "전화번호1",
  "전화번호2",
  "우편번호",
  "주소",
  "상품명1",
  "상품상세1",
  "수량(A타입)",
  "배송메시지",
  "운임구분",
  "운임",
  "운송장번호",
];
export async function shippingWorkbook(
  rows: { checkout: Checkout; delivery: Shipment }[],
  settings: Pick<Settings, "postal_code" | "address">,
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(shippingHeaders);
  for (const { checkout: c, delivery: d } of rows) {
    // Plain string values stay text, including values starting with '='. Never create formula cells.
    sheet.addRow([
      "",
      c.sender.name,
      c.sender.phone,
      "",
      settings.postal_code,
      settings.address,
      d.recipient.name,
      d.recipient.phone,
      "",
      d.recipient.postalCode,
      `${d.recipient.address} ${d.recipient.addressDetail}`,
      d.order_items
        .map((i) => `${savedItemLabel(i, c.category)} ${i.quantity}EA`)
        .join(", "),
      "",
      d.order_items.reduce((s, i) => s + i.quantity, 0),
      "",
      "",
      "",
      "",
    ]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
