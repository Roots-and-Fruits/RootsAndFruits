import { test, expect } from "@playwright/test";

test("login stays disabled before hydration and never uses a credential query string", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  try {
    const page = await context.newPage();
    await page.goto("/namu-admin/login");
    await expect(page.getByLabel("아이디", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("비밀번호", { exact: true })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "관리자 로그인", exact: true }),
    ).toBeDisabled();
    await expect(page.locator("form")).toHaveAttribute("method", "post");
    expect(new URL(page.url()).search).toBe("");
  } finally {
    await context.close();
  }
});

test("notification history distinguishes acceptance from uncertain outcomes and offers retry only for rejection", async ({
  page,
}, testInfo) => {
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/namu-admin\/counter/, { timeout: 20000 });
  const rows = ["accepted", "failed", "unknown", "pending", "failed"].map(
    (status, index) => ({
      id: `20000000-0000-4000-8000-00000000000${index}`,
      event: index ? "shipped" : "received",
      phone: "01012345678",
      status,
      attempts: 1,
      provider: index === 0 || index === 4 ? "solapi" : "aligo",
      test_mode: false,
      recipient_role: "sender",
      prepared_message: null,
      provider_code: null,
      payload: index
        ? { orderNumber: 123, position: index, recipientName: "테스트 수령인" }
        : { orderNumber: 123, deliveryCount: 3, total: 47000 },
      provider_id: index === 0 ? "G-test-group" : null,
      error_code: status === "unknown" ? "NETWORK_OR_RESPONSE_ERROR" : null,
      created_at: "2026-10-03T01:00:00Z",
      updated_at: "2026-10-03T01:00:00Z",
    }),
  );
  // UI-only fixture: never enable or invoke a real message provider.
  await page.route("**/api/admin/notifications?*", (route) =>
    route.fulfill({
      json: {
        ready: true,
        enabled: true,
        provider: "aligo",
        testMode: false,
        activeProvider: "aligo",
        activeTestMode: false,
        count: rows.length,
        rows,
      },
    }),
  );
  await page.route("**/api/admin/notifications/retry", (route) => {
    expect(route.request().postDataJSON()).toEqual({ id: rows[1].id });
    rows[1].status = "pending";
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/namu-admin/notifications");
  await expect(
    page.getByText("이전 문자 접수 완료", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("결과 확인 필요", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "재시도", exact: true }),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("notification-history.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "재시도", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("재시도를 요청했습니다");
  await expect(
    page.getByRole("button", { name: "재시도", exact: true }),
  ).toHaveCount(0);
});

test("notification administration requires staff and cannot send without configuration", async ({
  page,
}) => {
  const response = await page.request.get("/api/admin/notifications");
  expect(response.status()).toBe(401);
  expect((await page.request.get("/api/notifications/process")).status()).toBe(
    404,
  );
  await page.goto("/namu-admin/notifications");
  await expect(page).toHaveURL(/namu-admin\/login/);
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/namu-admin\/counter/, { timeout: 20000 });
  await page.getByRole("link", { name: "알림 내역", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "알림 내역", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("자동 안내 꺼짐", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "알림 켜기" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "대기 알림 처리" }),
  ).toHaveCount(0);
  await expect(page.getByText("알림 발송 내역이 없습니다.")).toBeVisible();
  const configure = await page.evaluate(async () => {
    const response = await fetch("/api/admin/notifications/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(configure.status).toBe(400);
  expect(configure.body.error).toContain("ALIGO_ENABLED");
  const removedProcessStatus = await page.evaluate(
    async () =>
      (
        await fetch("/api/admin/notifications/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
  );
  expect(removedProcessStatus).toBe(404);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("Aligo history shows exact snapshots/test results and checks templates before switching", async ({
  page,
}, info) => {
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/namu-admin\/counter/, { timeout: 20000 });
  const rows = ["tested", "accepted", "failed", "unknown"].map(
    (status, index) => ({
      id: `20000000-0000-4000-8000-00000000000${index}`,
      event: "shipped",
      phone: "01012345678",
      provider: "aligo",
      test_mode: index === 0,
      recipient_role: index === 1 ? "recipient" : "sender",
      status,
      attempts: 1,
      payload: {},
      provider_id: index < 2 ? String(1000000 + index) : null,
      provider_code: "0",
      prepared_message: {
        templateCode: "UM_0737",
        emphasisTitle: "상품이 발송되었습니다.",
        subject: "상품발송",
        text: "가상 보내는분님이 가상 받는분님께 보내시는 상품이 발송되었습니다.\n\n■ 발송상품: 체험귤 × 2",
      },
      error_code:
        status === "failed"
          ? "ALIGO_MESSAGE_TOO_LONG"
          : status === "unknown"
            ? "NETWORK_OR_RESPONSE_ERROR"
            : null,
      created_at: "2026-10-06T01:00:00Z",
      updated_at: "2026-10-06T01:00:00Z",
    }),
  );
  let activeProvider = "aligo",
    activeTestMode = false,
    applied = 0;
  await page.route("**/api/admin/notifications?*", (route) =>
    route.fulfill({
      json: {
        ready: true,
        enabled: true,
        provider: "aligo",
        testMode: true,
        activeProvider,
        activeTestMode,
        count: rows.length,
        rows,
      },
    }),
  );
  await page.route("**/api/admin/notifications/check", (route) =>
    route.fulfill({
      json: {
        templates: [
          {
            code: "UM_0746",
            title: "주문 접수가 완료되었습니다.",
            approval: "REQ",
            status: "R",
          },
          {
            code: "UM_0737",
            title: "상품이 발송되었습니다.",
            approval: "APR",
            status: "A",
          },
        ],
      },
    }),
  );
  await page.route("**/api/admin/notifications/configure", (route) => {
    expect(route.request().postDataJSON()).toEqual({ enabled: true });
    applied++;
    activeProvider = "aligo";
    activeTestMode = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/namu-admin/notifications");
  await expect(
    page.getByText("테스트 완료 · 미발송", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("알리고 접수 완료", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/알리고 메시지 ID: 1000001/)).toBeVisible();
  await expect(
    page.getByText("받는 분: 010-1234-5678", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/본문이 1,000자를 초과/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "대기 알림 처리" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "연결 확인", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "메시지는 발송하지 않았습니다",
  );
  await expect(
    page.getByText(/UM_0746 · 주문 접수가 완료되었습니다. · 검수 중/),
  ).toBeVisible();
  expect(applied).toBe(0);
  await page.getByRole("button", { name: "새 연결 적용", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "이전 연결의 대기 건은 제외",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "새 알림 연결을 적용했습니다",
  );
  expect(applied).toBe(1);
  await expect(
    page.getByRole("button", { name: "대기 알림 처리" }),
  ).toHaveCount(0);
  // The old live failure cannot be retried through a test-mode connection.
  await expect(
    page.getByRole("button", { name: "재시도", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("aligo-history.png"),
    fullPage: true,
  });
});
