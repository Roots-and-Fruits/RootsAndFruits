import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import type { Checkout } from "../../src/features/admin/schema";
import { addDays } from "../../src/features/orders/calculations";

async function seed(request: APIRequestContext, count = 120) {
  const response = await request.post(
    "http://127.0.0.1:3111/__test/shipping-fixture",
    { data: { count } },
  );
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as {
    today: string;
    orders: Checkout[];
    count: number;
    batch: string;
  };
}
async function login(page: Page) {
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/namu-admin\/counter/, { timeout: 20000 });
  await page.goto("/namu-admin/shipping");
  await expect(
    page.getByText("발송 목록 조회 중", { exact: true }),
  ).toHaveCount(0);
}
const list = (page: Page) =>
  page.getByRole("region", { name: "배송지별 발송 목록" });
const row = (page: Page, recipient: string) =>
  list(page)
    .getByRole("article")
    .filter({ has: page.getByText(new RegExp(`번 · ${recipient}$`)) });
async function post(page: Page, path: string, data: unknown) {
  return page.request.post(`/api/admin/${path}`, {
    data,
    headers: { Origin: "http://127.0.0.1:3110" },
  });
}

test("shipping loads every active delivery, selects by date and confirms mixed/future work", async ({
  page,
  request,
}, info) => {
  const fixture = await seed(request);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/admin/")) requests.push(r.url());
  });
  await login(page);
  const articles = list(page).getByRole("article");
  await expect(articles).toHaveCount(122);
  await expect(page.getByLabel("주문번호", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "다음", exact: true }),
  ).toHaveCount(0);
  await expect(list(page)).not.toContainText("발송수령인123");
  await expect(list(page)).not.toContainText("발송된 다른 배송지");
  const dates = await list(page)
    .locator("time")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("datetime")));
  expect(dates).toEqual([...dates].sort().reverse());
  expect(
    requests.some(
      (url) => url.includes("/products") || url.includes("/exports"),
    ),
  ).toBe(false);
  await row(page, "발송수령인1")
    .getByRole("button", { name: "상세", exact: true })
    .click();
  const detail = page.getByRole("dialog");
  await expect(detail).toContainText("발송된 다른 배송지");
  await expect(
    detail.getByRole("button", { name: "주문 취소", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "출력 대기 전체 선택", exact: true })
    .click();
  await expect(list(page).getByRole("checkbox", { checked: true })).toHaveCount(
    90,
  );
  const future = row(page, "발송수령인3").getByRole("checkbox");
  await expect(future).not.toBeChecked();
  await future.click();
  await expect(page.getByRole("dialog")).toContainText(
    addDays(fixture.today, 3),
  );
  await page.getByRole("button", { name: "돌아가기", exact: true }).click();
  await expect(future).not.toBeChecked();
  await future.click();
  await page.getByRole("button", { name: "확인 후 선택", exact: true }).click();
  await expect(list(page).getByRole("checkbox", { checked: true })).toHaveCount(
    91,
  );
  await row(page, "발송수령인124").getByRole("checkbox").click();
  await expect(page.getByRole("dialog")).toContainText("기존 선택을 해제");
  await page.getByRole("button", { name: "확인 후 선택", exact: true }).click();
  await expect(list(page).getByRole("checkbox", { checked: true })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("button", { name: "선택 엑셀 출력", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "발송 대기 전체 선택", exact: true })
    .click();
  await expect(list(page).getByRole("checkbox", { checked: true })).toHaveCount(
    2,
  );
  await expect(
    page.getByText(/내일\(.*출발 예정이 아닌 배송지 1건/),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("shipping-worklist.png") });
  await page
    .getByRole("button", { name: "선택 발송 완료", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "출발 예정이 아닌 배송지 1건",
  );
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(articles).toHaveCount(120);
  await page.getByRole("button", { name: "출력 이력", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "엑셀 출력 이력" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "묶음 발송 완료", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "재다운로드", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("shipping-history.png") });
});

test("future export requires acknowledgement, failed export retries once and stale actions stay safe", async ({
  page,
  request,
}) => {
  const fixture = await seed(request, 8);
  await login(page);
  const futureOrder = fixture.orders.find(
    (c) => c.deliveries[0].recipient.name === "발송수령인3",
  )!;
  const futureId = futureOrder.deliveries[0].id;
  const rejected = await post(page, "exports", {
    requestId: randomUUID(),
    ids: [futureId],
  });
  expect(rejected.status()).toBe(400);
  expect((await rejected.json()).error).toContain("개별 선택");
  await row(page, "발송수령인3").getByRole("checkbox").click();
  await page.getByRole("button", { name: "확인 후 선택", exact: true }).click();
  const calls: {
    requestId: string;
    ids: string[];
    confirmedFutureIds: string[];
  }[] = [];
  await page.route("**/api/admin/exports", async (route) => {
    calls.push(route.request().postDataJSON());
    if (calls.length === 1)
      await route.fulfill({ status: 503, json: { error: "테스트 일시 오류" } });
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "선택 엑셀 출력", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "테스트 일시 오류",
  );
  await expect(row(page, "발송수령인3").getByRole("checkbox")).toBeChecked();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "선택 엑셀 출력", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(
    /^택배송장_\d{8}_\d{6}\.xlsx$/,
  );
  await expect(row(page, "발송수령인3")).toContainText("출력됨 · 발송 대기");
  expect(calls[0].requestId).toBe(calls[1].requestId);
  expect(calls[1].confirmedFutureIds).toContain(futureId);
  const retry = await post(page, "exports", {
    requestId: calls[1].requestId,
    ids: [futureId],
  });
  expect(retry.ok()).toBe(true);
  const first = await page.request.get(
    `/api/admin/exports/${calls[1].requestId}`,
  );
  const second = await page.request.get(
    `/api/admin/exports/${calls[1].requestId}`,
  );
  expect(await first.body()).toEqual(await second.body());
  await expect(row(page, "발송수령인3").locator("time")).toHaveAttribute(
    "datetime",
    addDays(fixture.today, 3),
  );
  await page.unroute("**/api/admin/exports");
  const stale = fixture.orders.find(
    (c) => c.deliveries[0].recipient.name === "발송수령인2",
  )!.deliveries[0].id;
  await row(page, "발송수령인2").getByRole("checkbox").click();
  expect(
    (
      await post(page, "exports", { requestId: randomUUID(), ids: [stale] })
    ).ok(),
  ).toBe(true);
  await page
    .getByRole("button", { name: "선택 엑셀 출력", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "출력 대상 상태",
  );
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(row(page, "발송수령인2")).toContainText("출력됨 · 발송 대기");
});

test("incomplete worklist is an error with retry, not a partial or empty success", async ({
  page,
  request,
}) => {
  await seed(request, 8);
  let fail = true;
  await page.route("**/api/admin/shipping", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      response,
      json: fail ? { ...data, count: data.count + 1 } : data,
    });
  });
  await login(page);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "모두 불러오지 못했습니다",
  );
  await expect(page.getByText("발송할 배송지가 없습니다.")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "출력 대기 전체 선택", exact: true }),
  ).toBeDisabled();
  fail = false;
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(list(page).getByRole("article")).toHaveCount(10);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});
