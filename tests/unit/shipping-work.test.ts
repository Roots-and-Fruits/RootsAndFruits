import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, dateInSeoul } from "../../src/features/orders/calculations";
import {
  shippingRows,
  canBulkExport,
  departureWarning,
} from "../../src/features/admin/shipping-work";
import type { Checkout, Shipment } from "../../src/features/admin/schema";

const delivery = (
  date: string,
  status: Shipment["status"] = "waiting",
  position = 1,
) => ({ processing_date: date, status, position }) as Shipment;
const order = (
  status: Checkout["status"],
  number: number,
  deliveries: Shipment[],
) => ({ status, order_number: number, deliveries }) as Checkout;

test("shipping queue filters per delivery and sorts by departure descending, then order and position ascending", () => {
  const rows = shippingRows([
    order("paid", 9, [
      delivery("2026-10-06", "exported", 2),
      delivery("2026-10-06", "waiting", 1),
      delivery("2026-10-03", "shipped"),
    ]),
    order("paid", 10, [delivery("2026-10-04")]),
    order("paid", 8, [delivery("2026-10-06")]),
    order("cancelled", 1, [delivery("2026-10-01")]),
    order("pending", 2, [delivery("2026-10-01")]),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.checkout.order_number, r.delivery.position]),
    [
      [8, 1],
      [9, 1],
      [9, 2],
      [10, 1],
    ],
  );
});
test("bulk export includes backlog, today and tomorrow, including matured reservations", () => {
  for (const date of ["2026-10-03", "2026-10-05", "2026-10-06"])
    assert.equal(
      canBulkExport(
        { ...delivery(date), delivery_mode: "scheduled" },
        "2026-10-05",
      ),
      true,
    );
  assert.equal(canBulkExport(delivery("2026-10-07"), "2026-10-05"), false);
  assert.equal(
    canBulkExport(delivery("2026-10-05", "exported"), "2026-10-05"),
    false,
  );
});
test("shipping warning includes every non-tomorrow date, not just future departures", () => {
  const warning = departureWarning(
    ["2026-10-03", "2026-10-05", "2026-10-06", "2026-10-08", "2026-10-08"],
    "2026-10-05",
  );
  assert.match(warning, /배송지 4건/);
  assert.match(warning, /2026-10-08 2건/);
  assert.match(warning, /2026-10-03 1건/);
  assert.equal(departureWarning(["2026-10-06"], "2026-10-05"), "");
});
test("Seoul midnight and year boundary advance bulk eligibility", () => {
  const before = dateInSeoul(new Date("2026-12-31T14:59:59Z"));
  const after = dateInSeoul(new Date("2026-12-31T15:00:00Z"));
  assert.equal(before, "2026-12-31");
  assert.equal(addDays(after, 1), "2027-01-02");
  assert.equal(canBulkExport(delivery("2027-01-02"), before), false);
  assert.equal(canBulkExport(delivery("2027-01-02"), after), true);
});
