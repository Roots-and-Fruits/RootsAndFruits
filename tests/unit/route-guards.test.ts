import { test } from "node:test";
import assert from "node:assert/strict";
import { readBody, checkDb, HttpError } from "../../src/features/admin/http";
test("mutation origin checks use public Host and protocol; ambiguous DB failures remain retryable", async () => {
  const request = (origin: string, protocol = "http") =>
    new Request("http://localhost:3110/api/orders", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3110",
        origin,
        "x-forwarded-proto": protocol,
      },
      body: '{"test":true}',
    });
  assert.deepEqual(await readBody(request("http://127.0.0.1:3110")), {
    test: true,
  });
  await assert.rejects(
    readBody(request("https://other.example")),
    (e: unknown) => e instanceof HttpError && e.status === 403,
  );
  await assert.rejects(
    readBody(request("http://127.0.0.1:3110", "https")),
    (e: unknown) => e instanceof HttpError && e.status === 403,
  );
  await assert.rejects(
    readBody(request("null")),
    (e: unknown) => e instanceof HttpError && e.status === 403,
  );
  assert.throws(
    () => checkDb({ message: "network failure", code: "" }),
    (e: unknown) => e instanceof HttpError && e.status === 503,
  );
  assert.throws(
    () => checkDb({ message: "상품을 확인해주세요.", code: "P0001" }),
    (e: unknown) => e instanceof HttpError && e.status === 400,
  );
});
