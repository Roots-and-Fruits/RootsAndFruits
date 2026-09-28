import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerReturnPath,
  requestOrigin,
} from "../../src/features/auth/redirect";
test("OAuth return paths cannot redirect to other sites or admin routes", () => {
  for (const path of [
    undefined,
    null,
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/%2f%2fexample.com",
    "/namu-admin",
    "/api/admin/products",
    ["/product"],
  ])
    assert.equal(customerReturnPath(path), "/");
  for (const path of ["/", "/product", "/experience"])
    assert.equal(customerReturnPath(path), path);
});

test("OAuth callback keeps the public host and HTTPS behind the Next proxy", () => {
  assert.equal(
    requestOrigin(
      new Request("http://localhost:3000/api/auth/kakao", {
        headers: { host: "192.168.0.10:3000" },
      }),
    ),
    "http://192.168.0.10:3000",
  );
  assert.equal(
    requestOrigin(
      new Request("http://localhost:3000/auth/callback", {
        headers: { host: "farm.example", "x-forwarded-proto": "https" },
      }),
    ),
    "https://farm.example",
  );
  assert.throws(() =>
    requestOrigin(
      new Request("http://localhost", {
        headers: { host: "farm.example@evil.example" },
      }),
    ),
  );
});
