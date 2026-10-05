import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminTimingLabel,
  createAdminTiming,
} from "../../src/lib/admin-timing";

test("disabled diagnostics preserve results and emit no logs or headers", async (t) => {
  const log = t.mock.method(console, "info", () => {});
  const timing = createAdminTiming("api.orders", false);
  const value = { secret: "must not be logged" };
  assert.equal(await timing.measure("db_orders", async () => value), value);
  const response = Response.json(value);
  timing.finish(response);
  assert.equal(log.mock.callCount(), 0);
  assert.equal(response.headers.has("server-timing"), false);
  assert.equal(response.headers.has("x-admin-timing-id"), false);
});

test("timings preserve thrown errors and log only durations, not task data", async (t) => {
  const log = t.mock.method(console, "info", () => {});
  const timing = createAdminTiming("api.orders", true);
  const failure = new Error("PRIVATE_ERROR_CONTENT");
  assert.deepEqual(
    await timing.measure("auth_user", async () => ({ token: "PRIVATE_TOKEN" })),
    { token: "PRIVATE_TOKEN" },
  );
  await assert.rejects(
    timing.measure("db_orders", async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
  const response = Response.json(
    { error: "PRIVATE_RESPONSE" },
    { status: 500 },
  );
  timing.finish(response);
  timing.finish(response);
  assert.equal(log.mock.callCount(), 1);
  const record = JSON.parse(log.mock.calls[0].arguments[1]);
  assert.equal(record.status, 500);
  assert.equal(record.steps.length, 2);
  assert.ok(record.steps.every((step: { ms: number }) => step.ms >= 0));
  assert.ok(!JSON.stringify(record).includes("PRIVATE_"));
  assert.match(response.headers.get("server-timing")!, /auth_user;dur=/);
  assert.equal(await response.text(), '{"error":"PRIVATE_RESPONSE"}');
});

test("diagnostic labels never retain searches or identifiers", () => {
  for (const value of [
    "orders?sender=PRIVATE_NAME",
    "PRIVATE_ID",
    "login",
    "",
  ]) {
    assert.equal(adminTimingLabel(value), "other");
  }
  assert.equal(adminTimingLabel("orders"), "orders");
});
