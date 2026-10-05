import { test, expect, type Page } from "@playwright/test";
import type { AdminProduct, Checkout } from "../../src/features/admin/schema";

async function login(page: Page) {
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/namu-admin\/counter/, { timeout: 20000 });
}

test("legacy experience fields do not silently block editing and failed saves retain input", async ({
  page,
}, testInfo) => {
  await login(page);
  const description = `이전 체험귤 ${testInfo.project.name}`;
  const created = await page.evaluate(async (description) => {
    const response = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: null,
        category: "experience",
        description,
        price: 10000,
        fruit_type: null,
        weight_grams: null,
        inventory_enabled: false,
        bundle_eligible: false,
        stock_quantity: null,
        is_active: true,
        is_deleted: false,
        sort_order: 0,
      }),
    });
    return response.status;
  }, description);
  expect(created).toBe(200);
  // Reproduce the response from the unmigrated catalog while saving against real SQL.
  await page.route("**/api/admin/products", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const rows: AdminProduct[] = await response.json();
    await route.fulfill({
      response,
      json: rows.map((row) =>
        row.description === description
          ? {
              ...row,
              fruit_type: "택배",
              weight_grams: 1000,
              inventory_enabled: true,
              bundle_eligible: true,
            }
          : row,
      ),
    });
  });
  await page.goto("/namu-admin/products");
  await page.getByRole("button", { name: "체험 상품", exact: true }).click();
  await page
    .locator("article")
    .filter({
      has: page.getByRole("heading", { name: description, exact: true }),
    })
    .getByRole("button", { name: "수정", exact: true })
    .click();
  await expect(page.getByLabel("과일 종류", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("중량 (kg)", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("상품 내용", { exact: true })
    .fill(`${description} 수정`);
  await page.getByLabel("가격 (원)", { exact: true }).fill("12000");
  await page.route(
    "**/api/admin/products",
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 503,
        json: {
          error:
            "체험상품 DB 업데이트가 필요합니다. 업데이트 적용 후 다시 저장해주세요.",
        },
      });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "체험상품 DB 업데이트가 필요합니다." }),
  ).toBeVisible();
  await expect(page.getByLabel("상품 내용", { exact: true })).toHaveValue(
    `${description} 수정`,
  );
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/products") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const savedResponse = await response;
  expect(savedResponse.status()).toBe(200);
  expect(savedResponse.request().postDataJSON()).toMatchObject({
    fruit_type: null,
    weight_grams: null,
    inventory_enabled: false,
    bundle_eligible: false,
    description: `${description} 수정`,
    price: 12000,
  });
  await expect(
    page.getByText("상품을 저장했습니다.", { exact: true }),
  ).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await page.getByRole("button", { name: "체험 상품", exact: true }).click();
  await expect(
    page.locator("article").filter({ hasText: `${description} 수정` }),
  ).toContainText("12,000원");
});

test("legacy experience descriptions appear consistently in counter, orders and shipping", async ({
  page,
}, testInfo) => {
  await login(page);
  const order: Checkout = {
    id: "20000000-0000-4000-8000-000000000001",
    order_number: 999,
    category: "experience",
    sender: {
      name: "체험 고객",
      phone: "01012345678",
      privacyConsent: true,
      marketingConsent: false,
    },
    subtotal: 10000,
    discount: 0,
    total: 10000,
    status: "paid",
    payment_method: "card",
    original_id: null,
    created_at: "2026-10-03T00:00:00Z",
    deliveries: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        position: 1,
        recipient: {
          name: "받는 분",
          phone: "01012345678",
          postalCode: "00000",
          address: "가상 주소",
          addressDetail: "상세",
        },
        delivery_mode: "regular",
        requested_date: "2026-10-05",
        processing_date: "2026-10-04",
        subtotal: 10000,
        discount: 0,
        total: 10000,
        status: "waiting",
        note: "",
        order_items: [
          {
            id: "item",
            product_id: "product",
            label: "택배 1kg · 체험귤",
            weight_grams: 1000,
            quantity: 1,
            unit_price: 10000,
            bundle_eligible: false,
          },
        ],
      },
    ],
  };
  await page.route("**/api/admin/orders?*", (route) =>
    route.fulfill({ json: { orders: [order], count: 1 } }),
  );
  for (const section of ["counter", "orders", "shipping"]) {
    await page.goto(`/namu-admin/${section}`);
    if (section === "shipping") {
      const list = page.getByRole("region", { name: "배송지별 발송 목록" });
      await expect(list).toContainText("체험귤 × 1");
      await expect(list).not.toContainText("택배 1kg");
      await list.getByRole("button", { name: "상세", exact: true }).click();
    } else {
      await page
        .getByRole("button", { name: "999번 체험 고객 주문 상세", exact: true })
        .click();
    }
    const dialog = page.getByRole("dialog", {
      name: "999번 주문",
      exact: true,
    });
    await expect(dialog).toContainText("체험귤 × 1");
    await expect(dialog).not.toContainText("택배 1kg");
    await expect(dialog).toContainText("10,000원");
    if (section === "counter")
      await page.screenshot({
        path: testInfo.outputPath("experience-detail.png"),
        fullPage: true,
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  }
});
