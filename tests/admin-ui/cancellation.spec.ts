import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import type { Checkout } from "../../src/features/admin/schema";

async function login(page: Page) {
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/namu-admin\/counter/, { timeout: 20000 });
}

async function createOrder(page: Page, name: string) {
  const result = await page.evaluate(
    async ({ requestId, name }) => {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          order: {
            category: "product",
            sender: {
              name,
              phone: "01012345678",
              privacyConsent: true,
              marketingConsent: false,
            },
            deliveries: [1, 2].map((index) => ({
              recipient: {
                name: `수령인${index}`,
                phone: "01012345678",
                postalCode: "00000",
                address: "가상 주소",
                addressDetail: "상세",
              },
              items: [
                {
                  productId: "10000000-0000-4000-8000-000000000002",
                  quantity: 1,
                },
              ],
              deliveryMode: "regular",
              requestedDate: "",
            })),
          },
        }),
      });
      return { status: response.status, data: await response.json() };
    },
    { requestId: randomUUID(), name },
  );
  expect(result.status).toBe(200);
  return result.data.orderNumber as number;
}

async function readOrder(
  page: Page,
  number: number,
): Promise<Checkout & { cancelled_at: string | null }> {
  return page.evaluate(
    async (number) =>
      (await (await fetch(`/api/admin/orders?number=${number}`)).json())
        .orders[0],
    number,
  );
}

async function post(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(`/api/admin/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    },
    { path, body },
  );
}

async function openOrder(page: Page, number: number) {
  await page.goto("/namu-admin/counter");
  await page.getByLabel("주문번호", { exact: true }).fill(String(number));
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(`^${number}번 .* 주문 상세$`) })
    .click();
}

test("paid order cancellation preserves payment history and safely retries a lost response", async ({
  page,
}, testInfo) => {
  await login(page);
  const number = await createOrder(page, `취소${testInfo.project.name}`);
  await openOrder(page, number);
  await page.getByRole("button", { name: "결제 완료", exact: true }).click();
  const payment = page.getByRole("dialog", { name: "결제 완료", exact: true });
  await expect(payment).toContainText("엑셀 출력 전에만 가능합니다.");
  await payment.getByRole("radio", { name: "카드", exact: true }).check();
  await payment.getByRole("button", { name: "확인", exact: true }).click();
  await expect(payment).toBeHidden();
  const before = await readOrder(page, number);
  expect(before.status).toBe("paid");
  await openOrder(page, number);
  await page.getByRole("button", { name: "주문 취소", exact: true }).click();
  const cancel = page.getByRole("dialog", { name: "주문 취소", exact: true });
  await cancel.getByRole("button", { name: "돌아가기", exact: true }).click();
  expect((await readOrder(page, number)).status).toBe("paid");
  await page.getByRole("button", { name: "주문 취소", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("cancel-paid-order.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.route(
    `**/api/admin/orders/${before.id}/cancel`,
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.fulfill({
        status: 503,
        json: { error: "응답 확인에 실패했습니다. 다시 시도해주세요." },
      });
    },
    { times: 1 },
  );
  await cancel.getByRole("button", { name: "확인", exact: true }).click();
  await expect(cancel.getByRole("alert")).toContainText("응답 확인에 실패");
  const first = await readOrder(page, number);
  expect(first.status).toBe("cancelled");
  await cancel.getByRole("button", { name: "확인", exact: true }).click();
  await expect(cancel).toBeHidden();
  const after = await readOrder(page, number);
  expect(after).toEqual(first);
  expect(after).toMatchObject({
    payment_method: "card",
    paid_at: before.paid_at,
    total: before.total,
    deliveries: before.deliveries,
  });
  await openOrder(page, number);
  const detail = page.getByRole("dialog", {
    name: `${number}번 주문`,
    exact: true,
  });
  await expect(detail).toContainText("취소 전 결제 방식: 카드");
  await expect(
    detail.getByRole("button", { name: "주문 취소", exact: true }),
  ).toHaveCount(0);
  await expect(
    detail.getByRole("button", { name: "결제 완료", exact: true }),
  ).toHaveCount(0);
  await expect(detail).toContainText("발송 제외");
  await page.goto("/namu-admin/shipping");
  await expect(page.getByText("출발 예정일 내림차순 · 전체 배송지 표시")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "배송지별 발송 목록" })
      .getByRole("article")
      .filter({ hasText: new RegExp(`^${number}번 ·`) }),
  ).toHaveCount(0);
});

test("exporting one shipment blocks whole-order cancellation even from an already-open dialog", async ({
  page,
}, testInfo) => {
  await login(page);
  const number = await createOrder(page, `출력잠금${testInfo.project.name}`);
  const order = await readOrder(page, number);
  expect(
    (await post(page, `orders/${order.id}/pay`, { paymentMethod: "cash" }))
      .status,
  ).toBe(200);
  await openOrder(page, number);
  await page.getByRole("button", { name: "주문 취소", exact: true }).click();
  const cancel = page.getByRole("dialog", { name: "주문 취소", exact: true });
  // Another administrator exports while this screen still shows the old waiting state.
  expect(
    (
      await post(page, "exports", {
        requestId: randomUUID(),
        ids: [order.deliveries[0].id],
      })
    ).status,
  ).toBe(200);
  await cancel.getByRole("button", { name: "확인", exact: true }).click();
  await expect(cancel.getByRole("alert")).toHaveText(
    "엑셀 출력된 배송지가 있어 주문을 취소할 수 없습니다.",
  );
  expect((await readOrder(page, number)).status).toBe("paid");
  await cancel.getByRole("button", { name: "돌아가기", exact: true }).click();
  await openOrder(page, number);
  const detail = page.getByRole("dialog", {
    name: `${number}번 주문`,
    exact: true,
  });
  await expect(
    detail.getByRole("button", { name: "주문 취소", exact: true }),
  ).toHaveCount(0);
  await expect(detail).toContainText(
    "엑셀 출력된 배송지가 있어 주문을 취소할 수 없습니다.",
  );
  expect((await post(page, `orders/${order.id}/cancel`, {})).status).toBe(400);
  await page.screenshot({
    path: testInfo.outputPath("cancel-blocked-after-export.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
