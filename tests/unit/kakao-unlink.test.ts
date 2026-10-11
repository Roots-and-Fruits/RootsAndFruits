import { test } from "node:test";
import assert from "node:assert/strict";
import { unlinkKakao } from "../../src/features/account/kakao-unlink";

test("Kakao unlink uses the verified provider ID and accepts an already unlinked retry", async () => {
  let calls = 0;
  const transport: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://kapi.kakao.com/v1/user/unlink");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "KakaoAK fictional-key",
    );
    assert.equal(String(init?.body), "target_id_type=user_id&target_id=123456");
    assert.equal(init?.redirect, "error");
    return calls === 1
      ? Response.json({ id: 123456 })
      : Response.json({ code: -101 }, { status: 400 });
  };
  await unlinkKakao("123456", "fictional-key", transport);
  await unlinkKakao("123456", "fictional-key", transport);
  assert.equal(calls, 2);
});
test("Kakao unlink rejects mismatched IDs, missing settings, invalid responses and transport failure", async () => {
  for (const response of [
    Response.json({ id: 1 }),
    Response.json({}),
    new Response("bad JSON"),
    Response.json({ code: -401 }, { status: 401 }),
    Response.json({ code: -101 }, { status: 500 }),
    Response.json({ id: Number.MAX_SAFE_INTEGER + 1 }),
  ])
    await assert.rejects(
      unlinkKakao("123456", "fictional-key", async () => response),
    );
  let called = false;
  const transport: typeof fetch = async () => {
    called = true;
    throw new Error("secret transport details");
  };
  await assert.rejects(unlinkKakao("abc", "key", transport));
  await assert.rejects(unlinkKakao("123456", "", transport));
  assert.equal(called, false);
  await assert.rejects(
    unlinkKakao("123456", "key", transport),
    (e: Error) => !e.message.includes("secret"),
  );
});
