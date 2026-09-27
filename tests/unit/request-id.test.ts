import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createRequestId } from "../../src/lib/request-id";

test("request IDs work with native crypto and HTTP-compatible getRandomValues", () => {
  assert.equal(z.string().uuid().safeParse(createRequestId()).success, true);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  const nativeCrypto = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: nativeCrypto.getRandomValues.bind(nativeCrypto),
      },
    });
    const ids = Array.from({ length: 1000 }, () => createRequestId());
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) {
      assert.equal(z.string().uuid().safeParse(id).success, true);
      assert.match(
        id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });
    assert.throws(() => createRequestId(), /요청 번호를 생성할 수 없어요/);
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
});
