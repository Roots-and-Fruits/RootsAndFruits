import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  solapiProvider,
  smsConfig,
} from "../../src/features/notifications/solapi";
import {
  notificationText,
  type NotificationJob,
} from "../../src/features/notifications/messages";
import { dispatchNotifications } from "../../src/features/notifications/dispatch";

const config = {
  apiKey: "test-key",
  apiSecret: "test-secret",
  from: "01011112222",
};
const job: NotificationJob = {
  id: "test-event",
  event: "received",
  phone: "01033334444",
  attempts: 1,
  payload: { orderNumber: 12, total: 47000, deliveryCount: 2 },
};

test("SMS credentials stay disabled until explicitly configured", () => {
  const env = {
    NODE_ENV: "test" as const,
    SOLAPI_API_KEY: config.apiKey,
    SOLAPI_API_SECRET: config.apiSecret,
    SOLAPI_SENDER_NUMBER: "010-1111-2222",
  };
  assert.equal(smsConfig(env), null);
  assert.deepEqual(smsConfig({ ...env, SMS_ENABLED: "true" }), config);
  assert.equal(
    smsConfig({ ...env, SMS_ENABLED: "true", SOLAPI_API_SECRET: "" }),
    null,
  );
});

test("SOLAPI request signs date and salt, preserves sender and does not claim handset delivery", async () => {
  const provider = solapiProvider(config, async (url, init) => {
    assert.equal(url, "https://api.solapi.com/messages/v4/send-many/detail");
    const auth = new Headers(init?.headers).get("authorization")!;
    const fields = Object.fromEntries(
      auth
        .replace("HMAC-SHA256 ", "")
        .split(", ")
        .map((v) => v.split("=")),
    );
    assert.equal(
      fields.signature,
      createHmac("sha256", config.apiSecret)
        .update(fields.date + fields.salt)
        .digest("hex"),
    );
    assert.equal(auth.includes(config.apiSecret), false);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.messages[0], {
      to: job.phone,
      from: config.from,
      text: notificationText(job),
      customFields: { notificationId: job.id },
    });
    return Response.json({
      failedMessageList: [],
      groupInfo: { groupId: "G-test", count: { registeredSuccess: 1 } },
    });
  });
  assert.deepEqual(
    await provider.send(job.phone, notificationText(job), job.id),
    { status: "accepted", providerId: "G-test" },
  );
});

test("provider rejects are retryable; timeouts, malformed replies and 5xx are never blindly retried", async () => {
  for (const [response, expected] of [
    [
      () =>
        Response.json({
          failedMessageList: [{ statusCode: "3059" }],
          groupInfo: { groupId: "G-test", count: { registeredSuccess: 0 } },
        }),
      "failed",
    ],
    [() => new Response("private error", { status: 401 }), "failed"],
    [() => new Response("private error", { status: 503 }), "unknown"],
    [() => Response.json({}), "unknown"],
    [
      () => {
        throw new Error("secret phone 01033334444");
      },
      "unknown",
    ],
  ] as const) {
    let calls = 0;
    const provider = solapiProvider(config, async () => {
      calls++;
      return response();
    });
    const result = await provider.send(job.phone, "text", job.id);
    assert.equal(result.status, expected);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(result).includes(job.phone), false);
  }
  const provider = solapiProvider(config, async () => {
    throw new Error("must not call");
  });
  assert.equal(
    (await provider.send("not-phone", "text", job.id)).errorCode,
    "INVALID_PHONE",
  );
});

test("receipt and per-delivery texts distinguish reception, payment and shipment", () => {
  const text = notificationText(job);
  assert.match(text, /47,000원/);
  assert.match(text, /2곳/);
  assert.match(text, /결제해주세요/);
  const shipped = notificationText({
    ...job,
    event: "shipped",
    payload: { orderNumber: 12, position: 2, recipientName: "받는분" },
  });
  assert.match(shipped, /배송지 2: 받는분님/);
  assert.match(shipped, /발송되었습니다/);
  assert.doesNotMatch(shipped, /배송이 완료|송장번호/);
});

test("dispatcher sends only claimed jobs to sender, persists outcomes and leaves uncertain jobs alone", async () => {
  const sent: string[] = [],
    finished: unknown[] = [];
  await dispatchNotifications(
    {
      async claim() {
        return [job, { ...job, id: "bad", payload: {} }];
      },
      async finish(row, result) {
        finished.push([row.id, result.status]);
      },
    },
    {
      async send(to) {
        sent.push(to);
        return { status: "unknown", errorCode: "TIMEOUT" };
      },
    },
    0,
  );
  assert.deepEqual(sent, [job.phone]);
  assert.deepEqual(
    finished.sort(),
    [
      ["bad", "failed"],
      [job.id, "unknown"],
    ].sort(),
  );
});
