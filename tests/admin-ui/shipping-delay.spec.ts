import { test, expect } from "@playwright/test";

test("delay notice deduplicates mixed selections, resumes lost responses, reviews history and permits intentional resend", async ({
  page,
  request,
}, info) => {
  test.skip(
    process.env.ADMIN_UI_DELAY_TEST !== "true",
    "Uses isolated fake Aligo transport only",
  );
  const seed = await request.post(
    "http://127.0.0.1:3111/__test/shipping-fixture",
    { data: { count: 6 } },
  );
  expect(seed.ok()).toBe(true);
  await request.post("http://127.0.0.1:3111/__test/delay-enable");
  const denied = await page.request.post("/api/admin/shipping-delay/preview", {
    headers: { Origin: "http://127.0.0.1:3110" },
    data: { ids: [crypto.randomUUID()] },
  });
  expect(denied.status()).toBe(401);
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/namu-admin\/counter/, { timeout: 20000 });
  await page.goto("/namu-admin/shipping");
  const action = () =>
    page.getByRole("button", { name: "배송 지연 알림", exact: true });
  await expect(action()).toBeDisabled();
  const list = page.getByRole("region", { name: "배송지별 발송 목록" });
  const select = (name: string) =>
    list
      .getByRole("article")
      .filter({ has: page.getByText(new RegExp(`번 · ${name}$`)) })
      .getByRole("checkbox")
      .check();
  await select("발송수령인1");
  await select("발송수령인10");
  await expect(action()).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "선택 엑셀 출력", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "선택 발송 완료", exact: true }),
  ).toBeDisabled();
  await action().click();
  const dialog = () =>
    page.getByRole("dialog", { name: "배송 지연 알림", exact: true });
  await expect(dialog()).toContainText("배송지 2건 · 수신 번호 1개");
  await expect(dialog()).toContainText("이전 지연 알림 0건");
  await expect(dialog()).toContainText("테스트 모드");
  const requests: string[] = [];
  await page.route("**/api/admin/shipping-delay/queue", async (route) => {
    requests.push(route.request().postDataJSON().requestId);
    const response = await route.fetch();
    if (requests.length === 1) {
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await dialog()
    .getByRole("button", { name: "지연 알림 발송", exact: true })
    .click();
  await expect(dialog().getByRole("alert")).toBeVisible();
  await dialog().getByRole("button", { name: "이전 요청 계속 처리" }).click();
  await expect(dialog()).toContainText("테스트 완료 · 미발송 1건", {
    timeout: 20000,
  });
  expect(requests.length).toBe(2);
  expect(requests[0]).toBe(requests[1]);
  await dialog().getByRole("button", { name: "닫기", exact: true }).first().click();
  await action().click();
  await expect(dialog()).toContainText("이전 지연 알림 1건");
  await expect(
    dialog().getByRole("button", { name: "지연 알림 발송", exact: true }),
  ).toBeDisabled();
  await dialog().getByRole("checkbox").check();
  await page.screenshot({
    path: info.outputPath("delay-history-confirmation.png"),
    fullPage: true,
  });
  await dialog()
    .getByRole("button", { name: "지연 알림 발송", exact: true })
    .click();
  await expect(dialog()).toContainText("테스트 완료 · 미발송 1건", {
    timeout: 20000,
  });
  expect(requests[2]).not.toBe(requests[0]);
  const rows = await page.evaluate(
    async () =>
      (await (await fetch("/api/admin/notifications?page=0")).json()).rows,
  );
  expect(
    rows.filter((r: { event: string }) => r.event === "delayed"),
  ).toHaveLength(2);
  for (const row of rows.filter(
    (r: { event: string }) => r.event === "delayed",
  )) {
    expect(row.phone).toBe("01012345678");
    expect(row.prepared_message.templateCode).toBe("UM_6360");
    expect(row.status).toBe("tested");
  }
});
