import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import type { Checkout } from "../../src/features/admin/schema";

async function post(page: Page, path: string, body: unknown) {
  const result = await page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    },
    { path, body },
  );
  expect(result.status).toBe(200);
  return result.data;
}

async function login(page: Page) {
  await page.goto("/namu-admin/login");
  await post(page, "/api/admin/login", {
    username: "owner",
    password: "test-password-123",
  });
  await page.goto("/namu-admin/counter");
}

async function readOrder(page: Page, id: string): Promise<Checkout> {
  const response = await page.request.get(`/api/admin/orders/${id}`);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  return (await response.json()).orders[0];
}

async function createOrder(
  page: Page,
  category = "product",
  productId?: string,
): Promise<Checkout> {
  const result = await post(page, "/api/orders", {
    requestId: randomUUID(),
    order: {
      category,
      sender: {
        name: "인쇄 확인 고객",
        phone: "01000000000",
        privacyConsent: true,
        marketingConsent: false,
      },
      deliveries: [1, 2].map((index) => ({
        recipient: {
          name: `가상 수령인${index}`,
          phone: "01000000000",
          postalCode: "00000",
          address: "테스트용 긴 주소입니다 ".repeat(6).trim(),
          addressDetail: "출력 검증용 가상 주소",
        },
        items: [
          {
            productId: productId ?? "10000000-0000-4000-8000-000000000002",
            quantity: index,
          },
          ...(index === 1 && category === "product"
            ? [
                {
                  productId: "10000000-0000-4000-8000-000000000001",
                  quantity: 1,
                },
              ]
            : []),
        ],
        deliveryMode: "regular",
        requestedDate: "",
      })),
    },
  });
  const { orders } = await (
    await page.request.get(`/api/admin/orders?number=${result.orderNumber}`)
  ).json();
  return orders[0];
}

async function search(page: Page, section: string, number: number) {
  await page.goto(`/namu-admin/${section}`);
  await page.getByLabel("주문번호", { exact: true }).fill(String(number));
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `${number}번 인쇄 확인 고객 주문 상세` }),
  ).toBeVisible();
}

test("counter lists aggregated items and receipt prints snapshots without exporting or paying", async ({
  page,
}, testInfo) => {
  await login(page);
  const order = await createOrder(page);
  const note =
    '문 앞에 놓아주세요.\n<script>window.receiptInjected = true</script> & "확인"';
  await post(page, `/api/admin/notes/${order.deliveries[0].id}`, { note });
  await search(page, "counter", order.order_number);
  const row = page.getByRole("button", {
    name: `${order.order_number}번 인쇄 확인 고객 주문 상세`,
  });
  await expect(row).toContainText("한라봉 3kg · 테스트 선물 × 3");
  await expect(row).toContainText("감귤 3kg · 테스트 상품 × 1");
  await expect(row).toContainText("144,000원");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("counter-products.png"),
    fullPage: true,
    animations: "disabled",
  });

  // The list is stale, but the print page must fetch the latest saved payment and note.
  await post(page, `/api/admin/orders/${order.id}/pay`, {
    paymentMethod: "card",
  });
  const before = await readOrder(page, order.id);
  const exportsBefore = await (
    await page.request.get("/api/admin/exports")
  ).json();
  await expect(page.getByRole("link", { name: /주문서 인쇄/ })).toHaveCount(0);
  await row.click();
  const printLink = page
    .getByRole("dialog")
    .getByRole("link", { name: `${order.order_number}번 주문서 인쇄 (새 창)` });
  await expect(printLink.locator("svg")).toHaveCount(0);
  const popupPromise = page.waitForEvent("popup");
  await printLink.click();
  const popup = await popupPromise;
  const receipt = popup.getByRole("article", {
    name: `${order.order_number}번 주문서`,
  });
  await expect(receipt).toContainText("결제 방식: 카드");
  await expect(receipt).toContainText("상품 합계150,000원");
  await expect(receipt).toContainText("묶음 할인−6,000원");
  await expect(receipt).toContainText("합계144,000원");
  await expect(receipt).toContainText("가상 수령인1");
  await expect(receipt).toContainText("가상 수령인2");
  await expect(receipt).toContainText(note);
  await expect(receipt.locator("script")).toHaveCount(0);
  // The source dialog may already close when the print tab takes focus.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const width = (await receipt.boundingBox())!.width;
  expect(width).toBeCloseTo((72 * 96) / 25.4, 0);
  const printRequests: string[] = [];
  popup.on("request", (request) => {
    if (request.method() !== "GET") printRequests.push(request.url());
  });
  // Exercise the actual button without opening an OS printer dialog or printing paper.
  await popup.evaluate(() => {
    window.print = () => {
      document.body.dataset.printCalled = "yes";
    };
  });
  await expect(
    popup.getByRole("button", { name: "인쇄", exact: true }).locator("svg"),
  ).toHaveCount(0);
  await popup.getByRole("button", { name: "인쇄", exact: true }).click();
  await expect(popup.locator("body")).toHaveAttribute(
    "data-print-called",
    "yes",
  );
  await popup.emulateMedia({ media: "print" });
  await expect(
    popup.getByRole("heading", { name: "주문서 미리보기" }),
  ).toBeHidden();
  expect(
    await receipt.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await receipt.screenshot({ path: testInfo.outputPath("receipt-print.png") });
  expect(printRequests).toEqual([]);
  expect(await readOrder(page, order.id)).toEqual(before);
  expect(await (await page.request.get("/api/admin/exports")).json()).toEqual(
    exportsBefore,
  );

  await search(page, "orders", order.order_number);
  await expect(
    page.getByRole("link", {
      name: `${order.order_number}번 주문서 인쇄 (새 창)`,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: `${order.order_number}번 인쇄 확인 고객 주문 상세`,
    })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: /주문서 인쇄/ }),
  ).toBeVisible();
  await page.goto("/namu-admin/shipping");
  await expect(page.getByRole("link", { name: /주문서 인쇄/ })).toHaveCount(0);
  await page.getByRole("button", { name: "상세", exact: true }).first().click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: /주문서 인쇄/ }),
  ).toHaveCount(0);

  // Printing a receipt must not count as Excel export: cancellation remains allowed.
  await post(page, `/api/admin/orders/${order.id}/cancel`, {});
  await popup.emulateMedia({ media: "screen" });
  await popup.getByRole("button", { name: "다시 불러오기" }).click();
  await expect(receipt).toContainText("취소된 주문");
  await expect(receipt).toContainText("취소 전 결제 방식: 카드");
  await popup.close();
});

test("experience receipts recover from load failures and hide obsolete weight labels", async ({
  page,
}, testInfo) => {
  await login(page);
  const description = `체험귤 인쇄 ${testInfo.project.name}`;
  await post(page, "/api/admin/products", {
    id: null,
    category: "experience",
    description,
    fruit_type: null,
    weight_grams: null,
    price: 10000,
    is_active: true,
    is_deleted: false,
    inventory_enabled: false,
    stock_quantity: null,
    sort_order: 0,
    bundle_eligible: false,
  });
  const products = await (await page.request.get("/api/admin/products")).json();
  const product = products.find(
    (p: { description: string }) => p.description === description,
  );
  const order = await createOrder(page, "experience", product.id);
  await page.route(`**/api/admin/orders/${order.id}`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: "일시적으로 주문을 불러오지 못했습니다." },
    }),
  );
  await page.goto(`/namu-admin/print/${order.id}`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "일시적으로",
  );
  await expect(
    page.getByRole("button", { name: "인쇄", exact: true }),
  ).toBeDisabled();
  await page.unroute(`**/api/admin/orders/${order.id}`);
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  const receipt = page.getByRole("article");
  await expect(receipt).toContainText(description);
  await expect(receipt).toContainText("결제 대기");
  await expect(receipt).not.toContainText(/kg|묶음 할인|메모:/);
  // Also cover old snapshots; production rows themselves are never rewritten.
  await page.route(`**/api/admin/orders/${order.id}`, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    for (const delivery of data.orders[0].deliveries) {
      for (const item of delivery.order_items) {
        item.label = `택배 1kg · ${description}`;
        item.weight_grams = 1000;
      }
    }
    await route.fulfill({ response, json: data });
  });
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await expect(receipt).toContainText(description);
  await expect(receipt).not.toContainText(/택배 1kg|묶음 할인/);
});

test("receipt route requires staff and missing orders cannot be printed", async ({
  page,
}) => {
  const missing = randomUUID();
  await page.goto(`/namu-admin/print/${missing}`);
  await expect(page).toHaveURL(/\/namu-admin\/login$/);
  expect(
    (await page.request.get(`/api/admin/orders/${missing}`)).status(),
  ).toBe(401);
  await login(page);
  await page.goto(`/namu-admin/print/${missing}`);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "주문을 찾을 수 없습니다.",
  );
  await expect(
    page.getByRole("button", { name: "인쇄", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("article")).toHaveCount(0);
  const invalid = await page.goto("/namu-admin/print/invalid-id");
  expect(invalid?.status()).toBe(404);
});
