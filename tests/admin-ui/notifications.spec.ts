import { test, expect } from "@playwright/test";

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
  const rows = ["accepted", "failed", "unknown", "pending"].map(
    (status, index) => ({
      id: `20000000-0000-4000-8000-00000000000${index}`,
      event: index ? "shipped" : "received",
      phone: "01012345678",
      status,
      attempts: 1,
      payload: index
        ? { orderNumber: 123, position: index, recipientName: "테스트 수령인" }
        : { orderNumber: 123, deliveryCount: 3, total: 47000 },
      provider_id: index === 0 ? "G-test-group" : null,
      error_code: status === "unknown" ? "NETWORK_OR_RESPONSE_ERROR" : null,
      created_at: "2026-10-03T01:00:00Z",
      updated_at: "2026-10-03T01:00:00Z",
    }),
  );
  // UI-only fixture: never enable or invoke a real SMS provider.
  await page.route("**/api/admin/notifications?*", (route) =>
    route.fulfill({
      json: { ready: true, enabled: true, count: rows.length, rows },
    }),
  );
  await page.route("**/api/admin/notifications/retry", (route) => {
    expect(route.request().postDataJSON()).toEqual({ id: rows[1].id });
    rows[1].status = "pending";
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/namu-admin/notifications");
  await expect(
    page.getByText("솔라피 접수 완료", { exact: true }),
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
    401,
  );
  await page.goto("/namu-admin/notifications");
  await expect(page).toHaveURL(/namu-admin\/login/);
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/namu-admin\/counter/, { timeout: 20000 });
  await page.getByRole("link", { name: "문자 내역", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "문자 내역", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("자동 문자 꺼짐", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "문자 켜기" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "대기 문자 보내기" }),
  ).toBeDisabled();
  await expect(page.getByText("문자 발송 내역이 없습니다.")).toBeVisible();
  const configure = await page.evaluate(async () => {
    const response = await fetch("/api/admin/notifications/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(configure.status).toBe(400);
  expect(configure.body.error).toContain("솔라피");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
