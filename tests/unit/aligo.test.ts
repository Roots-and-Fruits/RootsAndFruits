import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aligoConfig,
  aligoProvider,
  createAligoTemplateCache,
  loadAligoTemplates,
  prepareAligo,
  type AligoConfig,
  type AligoTemplate,
} from "../../src/features/notifications/aligo";
import { notificationConfig } from "../../src/features/notifications/config";
import { dispatchNotifications } from "../../src/features/notifications/dispatch";
import {
  aligoVariables,
  type NotificationJob,
} from "../../src/features/notifications/messages";

const config: AligoConfig = {
  apiKey: "fake-aligo-key",
  userId: "fake-user",
  senderKey: "fake-channel",
  from: "01011112222",
  orderTemplate: "UM_0746",
  shippingTemplate: "UM_0737",
  testMode: true,
};
const received: AligoTemplate = {
  templtCode: "UM_0746",
  templtName: "주문접수",
  templateEmType: "TEXT",
  templtTitle: "주문 접수가 완료되었습니다.",
  templtSubtitle: "나무와열매",
  templtContent:
    "■ 주문번호: #{주문번호}번\r\n■ 배송지: #{배송지수}곳\r\n■ 주문금액: #{주문금액}원\r\n\r\n[받는 분 / 배송주소]\r\n#{배송지정보}\r\n\r\n카운터에 주문번호를 알려주시고 결제해 주세요.\r\n\r\n상품 발송 시 별도로 안내드리겠습니다.\r\n감사합니다.",
  status: "A",
  inspStatus: "APR",
  buttons: [
    {
      ordering: "1",
      name: "채널 추가",
      linkType: "AC",
      linkTypeName: "채널 추가",
    },
  ],
};
const shipped: AligoTemplate = {
  ...received,
  templtCode: "UM_0737",
  templtName: "상품발송",
  templtTitle: "상품이 발송되었습니다.",
  templtContent:
    "#{보내는분}님이 #{받는분}님께 보내시는 상품이 발송되었습니다.\n\n■ 보내는 분: #{보내는분}님\n■ 받는 분: #{받는분}님\n■ 발송상품: #{발송상품}\n\n실제 도착일은 택배사 배송 상황에 따라 달라질 수 있습니다.\n\n감사합니다.",
};
const item = { label: "택배 1kg · 체험귤", weightGrams: 1000, quantity: 2 };
const receivedJob: NotificationJob = {
  id: "notice-1",
  event: "received",
  phone: "01033334444",
  attempts: 1,
  provider: "aligo",
  test_mode: true,
  payload: {
    orderNumber: 123,
    category: "experience",
    total: 14000,
    deliveryCount: 2,
    deliveries: [
      {
        position: 2,
        recipientName: "둘째",
        address: "가상 주소2",
        addressDetail: "102호",
        items: [{ ...item, quantity: 1 }],
      },
      {
        position: 1,
        recipientName: "첫째",
        address: "가상 주소1",
        addressDetail: "101호",
        items: [item],
      },
    ],
  },
};
const shippedJob: NotificationJob = {
  ...receivedJob,
  event: "shipped",
  payload: {
    orderNumber: 123,
    position: 1,
    senderName: "보내는분",
    recipientName: "받는분",
    category: "experience",
    items: [item],
  },
};

test("Aligo config requires its own gate, defaults to test mode and ignores retired SMS configuration", () => {
  const env = {
    NODE_ENV: "test" as const,
    ALIGO_ENABLED: "true",
    ALIGO_API_KEY: config.apiKey,
    ALIGO_USER_ID: config.userId,
    ALIGO_SENDER_KEY: config.senderKey,
    ALIGO_SENDER_NUMBER: "010-1111-2222",
  };
  assert.deepEqual(aligoConfig(env), config);
  assert.equal(aligoConfig({ ...env, ALIGO_ENABLED: "false" }), null);
  assert.equal(notificationConfig({ ...env, ALIGO_USER_ID: "" }).ready, false);
  assert.equal(
    notificationConfig({ ...env, ALIGO_TEST_MODE: "typo" }).ready,
    false,
  );
  assert.equal(
    notificationConfig({
      ...env,
      ALIGO_ENABLED: undefined,
      SMS_ENABLED: "true",
      NOTIFICATION_PROVIDER: "solapi",
      SOLAPI_API_KEY: "retired-key",
    }).ready,
    false,
  );
  assert.equal(
    aligoConfig({ ...env, ALIGO_TEST_MODE: "false" })!.testMode,
    false,
  );
  assert.equal(aligoConfig({ ...env, VERCEL: "1" }), null);
  assert.equal(aligoConfig({ ...env, FIXIE_URL: "bad-secret-url" }), null);
  assert.equal(
    aligoConfig({
      ...env,
      VERCEL: "1",
      FIXIE_URL: "http://user:pass@proxy.example:80",
    })?.proxyUrl,
    "http://user:pass@proxy.example:80",
  );
});

test("registered templates keep wording/newlines/buttons, substitute snapshots, and exclude phone numbers", () => {
  const prepared = prepareAligo(receivedJob, received);
  assert.match(prepared.text, /123번\r\n■ 배송지: 2곳\r\n■ 주문금액: 14,000원/);
  assert.match(
    prepared.text,
    /1\. 첫째님\n주소: 가상 주소1 101호\n상품: 체험귤 × 2\n\n2\. 둘째님/,
  );
  assert.doesNotMatch(prepared.text, /택배 1kg|01033334444|#\{/);
  assert.equal(prepared.emphasisTitle, received.templtTitle);
  assert.deepEqual(prepared.buttons, [
    { name: "채널 추가", linkType: "AC", linkTypeName: "채널 추가" },
  ]);
  const shipping = prepareAligo(shippedJob, shipped);
  assert.match(
    shipping.text,
    /^보내는분님이 받는분님께 보내시는 상품이 발송되었습니다./,
  );
  assert.match(shipping.text, /발송상품: 체험귤 × 2/);
  assert.deepEqual(
    aligoVariables({
      ...shippedJob,
      payload: { ...(shippedJob.payload as object), category: "product" },
    }).발송상품,
    "택배 1kg · 체험귤 × 2",
  );
  assert.throws(
    () =>
      prepareAligo(receivedJob, {
        ...received,
        templtContent: "#{알수없는변수}",
      }),
    /VARIABLE_UNKNOWN/,
  );
  assert.throws(
    () =>
      prepareAligo(receivedJob, {
        ...received,
        templtContent: "가".repeat(1001),
      }),
    /MESSAGE_TOO_LONG/,
  );
  assert.throws(
    () =>
      prepareAligo(receivedJob, { ...received, templtTitle: "가".repeat(29) }),
    /TITLE_INVALID/,
  );
  assert.throws(() =>
    prepareAligo(
      {
        ...receivedJob,
        payload: { orderNumber: 1, total: 1, deliveryCount: 1 },
      },
      received,
    ),
  );
});

test("template lookup uses authenticated POST without sending and live mode requires approval", async () => {
  let calls = 0;
  const request: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://kakaoapi.aligo.in/akv10/template/list/");
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get("apikey"), config.apiKey);
    assert.equal(body.get("senderkey"), config.senderKey);
    assert.equal(init?.redirect, "error");
    assert.equal(body.has("tpl_code"), false);
    return Response.json({
      code: 0,
      list: [received, shipped].map((template) => ({
        ...template,
        inspStatus: "REQ",
      })),
    });
  };
  assert.equal(
    (await loadAligoTemplates(config, request)).received.inspStatus,
    "REQ",
  );
  assert.equal(calls, 1);
  await assert.rejects(
    loadAligoTemplates({ ...config, testMode: false }, request),
    /NOT_APPROVED/,
  );
  await assert.rejects(
    loadAligoTemplates(config, async () =>
      Response.json({ code: -101, message: config.apiKey }),
    ),
    /ALIGO_TEMPLATE_-101/,
  );
  await assert.rejects(
    loadAligoTemplates(config, async () => {
      throw new Error(config.apiKey);
    }),
    /ALIGO_TEMPLATE_CONNECTION_FAILED/,
  );
});

test("live template lookup accepts approved first-send templates and blocks suspended or unapproved templates", async () => {
  for (const status of ["A", "R", "S"] as const) {
    for (const inspStatus of ["APR", "REG", "REQ", "REJ"] as const) {
      const request: typeof fetch = async () =>
        Response.json({
          code: 0,
          list: [received, shipped].map((t) => ({ ...t, status, inspStatus })),
        });
      const result = loadAligoTemplates(
        { ...config, testMode: false },
        request,
      );
      if (inspStatus === "APR" && status !== "S") {
        assert.equal((await result).received.status, status);
      } else {
        await assert.rejects(result, /NOT_APPROVED/);
      }
    }
  }
});

test("template cache coalesces requests, expires, refreshes explicitly and isolates configuration", async () => {
  let calls = 0,
    now = 0,
    fail = false;
  const cached = createAligoTemplateCache(() => now);
  const request: typeof fetch = async () => {
    calls++;
    if (fail) throw new Error("private proxy password");
    return Response.json({ code: 0, list: [received, shipped] });
  };
  await Promise.all([cached(config, request), cached(config, request)]);
  await cached(config, request);
  assert.equal(calls, 1);
  now = 300_000;
  await cached(config, request);
  assert.equal(calls, 2);
  await cached(config, request, true);
  assert.equal(calls, 3);
  await cached({ ...config, testMode: false }, request);
  await cached(
    { ...config, proxyUrl: "http://user:pass@proxy.example" },
    request,
  );
  assert.equal(calls, 5);
  fail = true;
  await assert.rejects(cached(config, request, true), /CONNECTION_FAILED/);
  fail = false;
  await cached(config, request);
  assert.equal(calls, 7);
  // Failed forced refresh must not leave an older successful response available.
  fail = true;
  await assert.rejects(cached(config, request, true));
  await assert.rejects(cached(config, request));
  assert.equal(calls, 9);
});

test("old recipient jobs are skipped without rendering, snapshotting or sending", async () => {
  const finished: unknown[] = [];
  await dispatchNotifications(
    {
      claim: async () => [{ ...shippedJob, recipient_role: "recipient" }],
      prepare: async () => {
        throw new Error("Must not prepare");
      },
      finish: async (_job, result) => {
        finished.push(result);
      },
    },
    {
      name: "aligo",
      testMode: true,
      prepare: () => {
        throw new Error("Must not render");
      },
      send: async () => {
        throw new Error("Must not send");
      },
    },
    0,
  );
  assert.deepEqual(finished, [
    { status: "skipped", errorCode: "RECIPIENT_DISABLED" },
  ]);
});

test("Aligo sends exactly one form request, no SMS fallback, and separates test from real acceptance", async () => {
  for (const testMode of [true, false]) {
    let calls = 0;
    const provider = aligoProvider(
      { ...config, testMode },
      { received, shipped },
      async (url, init) => {
        calls++;
        assert.equal(url, "https://kakaoapi.aligo.in/akv10/alimtalk/send/");
        const body = new URLSearchParams(String(init?.body));
        assert.equal(body.get("testMode"), testMode ? "Y" : "N");
        assert.equal(body.get("failover"), "N");
        assert.equal(body.get("receiver_1"), shippedJob.phone);
        assert.equal(body.get("tpl_code"), "UM_0737");
        assert.equal(body.get("emtitle_1"), shipped.templtTitle);
        assert.equal(body.get("message_1"), provider.prepare(shippedJob).text);
        assert.equal(
          JSON.parse(body.get("button_1")!).button[0].linkType,
          "AC",
        );
        assert.equal(body.has("fmessage_1"), false);
        return Response.json({
          code: 0,
          info: { mid: "123456789", scnt: 1, fcnt: 0 },
        });
      },
    );
    assert.deepEqual(
      await provider.send(
        shippedJob.phone,
        provider.prepare(shippedJob),
        shippedJob.id,
      ),
      {
        status: testMode ? "tested" : "accepted",
        providerCode: "0",
        providerId: "123456789",
      },
    );
    assert.equal(calls, 1);
  }
});

test("Aligo rejections are retryable but uncertain responses/timeouts never retry or expose raw errors", async () => {
  for (const [response, status] of [
    [
      () =>
        Response.json({
          code: -99,
          message: `${config.apiKey} ${shippedJob.phone}`,
        }),
      "failed",
    ],
    [
      () => Response.json({ code: 0, info: { mid: "55", scnt: 0, fcnt: 1 } }),
      "failed",
    ],
    [() => Response.json({ code: 0 }), "unknown"],
    [() => new Response("private", { status: 503 }), "unknown"],
    [() => new Response("private", { status: 403 }), "failed"],
    [
      () => {
        throw new Error(config.apiKey);
      },
      "unknown",
    ],
  ] as const) {
    let calls = 0;
    const provider = aligoProvider(
      { ...config, testMode: false },
      { received, shipped },
      async () => {
        calls++;
        return response();
      },
    );
    const result = await provider.send(
      shippedJob.phone,
      provider.prepare(shippedJob),
      shippedJob.id,
    );
    assert.equal(result.status, status);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(result).includes(config.apiKey), false);
    assert.equal(JSON.stringify(result).includes(shippedJob.phone), false);
  }
});

test("dispatch persists exact prepared content before send and does not send on snapshot/provider mismatch", async () => {
  const steps: string[] = [];
  const provider = aligoProvider(config, { received, shipped }, async () => {
    steps.push("send");
    return Response.json({ code: 0 });
  });
  const store = {
    claim: async () => [receivedJob],
    prepare: async (
      _job: NotificationJob,
      message: ReturnType<typeof prepareAligo>,
    ) => {
      assert.match(message.text, /가상 주소1/);
      steps.push("snapshot");
      return true;
    },
    finish: async (_job: NotificationJob, result: { status: string }) => {
      steps.push(result.status);
    },
  };
  await dispatchNotifications(store, provider, 0);
  assert.deepEqual(steps, ["snapshot", "send", "tested"]);
  steps.length = 0;
  await dispatchNotifications(
    { ...store, prepare: async () => false },
    provider,
    0,
  );
  assert.deepEqual(steps, []);
  await assert.rejects(
    dispatchNotifications(
      { ...store, claim: async () => [{ ...receivedJob, provider: "solapi" }] },
      provider,
      0,
    ),
  );
  await assert.rejects(
    dispatchNotifications(
      {
        ...store,
        prepare: async () => {
          throw new Error("DB down");
        },
      },
      provider,
      0,
    ),
  );
  assert.deepEqual(steps, []);
});
