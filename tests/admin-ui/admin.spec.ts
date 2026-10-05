import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
// Mobile also exercises the API availability of HTTP LAN tablet/phone access.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") {
    await page.addInitScript(() => {
      Object.defineProperty(window.crypto, "randomUUID", {
        value: undefined,
        configurable: true,
      });
    });
  }
});
async function login(page: import("@playwright/test").Page) {
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/namu-admin\/counter/);
}
test("admin entry is direct-only and old admin routes are unavailable", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.locator('a[href^="/namu-admin"], a[href^="/admin"]'),
  ).toHaveCount(0);
  for (const path of ["/admin", "/admin/login", "/admin/orders"]) {
    expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(404);
  }
  await page.goto("/namu-admin");
  await expect(page).toHaveURL(/\/namu-admin\/login$/);
  await expect(
    page.getByRole("heading", { name: "관리자 로그인" }),
  ).toBeVisible();
});
test("admin boundaries, product settings and real order lifecycle against isolated DB", async ({
  page,
  request,
}, testInfo) => {
  await page.goto("/namu-admin/products");
  await expect(page).toHaveURL(/\/namu-admin\/login/);
  expect((await request.get("/api/admin/products")).status()).toBe(401);
  await login(page);
  await page.getByRole("link", { name: "상품·재고", exact: true }).click();
  await expect(page).toHaveURL(/\/namu-admin\/products$/);
  await expect(
    page.getByRole("heading", { name: "상품·재고", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("감귤 3kg", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "판매 중", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("중량 (kg)", { exact: true })).toHaveValue("3");
  await page.getByLabel("중량 (kg)", { exact: true }).fill("2.5");
  await expect(page.getByLabel(/재고 수량 변경/)).toHaveCount(0);
  await page.getByRole("checkbox", { name: "재고 관리", exact: true }).check();
  await page.getByLabel(/재고 수량 변경/).fill("-2");
  await page
    .getByLabel("과일 종류", { exact: true })
    .fill(`테스트${testInfo.project.name}`);
  await page.getByLabel("상품 내용", { exact: true }).fill("브라우저 등록");
  await page.getByLabel("가격 (원)", { exact: true }).fill("12000");
  await page.getByText("묶음 배송 할인 대상", { exact: true }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("상품을 저장했습니다.")).toBeVisible();
  const productCard = page
    .locator("article")
    .filter({ hasText: `테스트${testInfo.project.name} 2.5kg` });
  await expect(productCard).toContainText("판매 중");
  await expect(productCard).toContainText("재고 -2개 · 초과 판매");
  await expect(
    productCard.getByText("재고 -2개 · 초과 판매", { exact: true }),
  ).toHaveClass(/text-destructive/);
  await productCard.getByRole("button", { name: "수정", exact: true }).click();
  await expect(page.getByLabel("중량 (kg)", { exact: true })).toHaveValue(
    "2.5",
  );
  await page.getByLabel(/재고 수량 변경/).fill("99");
  await page
    .getByRole("checkbox", { name: "재고 관리", exact: true })
    .uncheck();
  await expect(page.getByLabel(/재고 수량 변경/)).toHaveCount(0);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(productCard).toContainText("재고 관리 안 함");
  await expect(
    productCard.getByText("재고 관리 안 함", { exact: true }),
  ).not.toHaveClass(/text-destructive/);
  await page.reload();
  await expect(
    productCard.getByText("재고 관리 안 함", { exact: true }),
  ).not.toHaveClass(/text-destructive/);
  await productCard.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("checkbox", { name: "재고 관리", exact: true }).check();
  await expect(page.getByLabel(/재고 수량 변경/)).toHaveAccessibleName(
    /현재 -2개/,
  );
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    productCard.getByText("재고 -2개 · 초과 판매", { exact: true }),
  ).toHaveClass(/text-destructive/);
  await productCard.getByRole("button", { name: "수정", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("admin-product-form.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("link", { name: "설정", exact: true }).click();
  await expect(page).toHaveURL(/\/namu-admin\/settings$/);
  await expect(
    page.getByRole("heading", { name: "설정", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("대상 상품 2개당 묶음 할인 (원)", { exact: true }),
  ).toHaveValue("3000");
  await page.screenshot({
    path: testInfo.outputPath("admin-settings.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(
    page.getByText("설정을 저장했습니다.", { exact: false }),
  ).toBeVisible();
  const order = {
    category: "product",
    sender: {
      name: `고객${testInfo.project.name}`,
      phone: "01012345678",
      privacyConsent: true,
      marketingConsent: false,
    },
    deliveries: [
      {
        recipient: {
          name: "받는분",
          phone: "01012345678",
          postalCode: "00000",
          address: "가상 테스트",
          addressDetail: "상세",
        },
        items: [
          { productId: "10000000-0000-4000-8000-000000000001", quantity: 3 },
        ],
        deliveryMode: "regular",
        requestedDate: "",
      },
    ],
  };
  const result = await page.evaluate(
    async ({ order, requestId }) => {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, order }),
      });
      return { status: response.status, data: await response.json() };
    },
    { order, requestId: randomUUID() },
  );
  expect(result.status).toBe(200);
  expect(result.data.total).toBe(87000);
  await page.getByRole("link", { name: "카운터", exact: true }).click();
  await expect(page).toHaveURL(/\/namu-admin\/counter$/);
  await expect(
    page.getByRole("heading", { name: "카운터", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("주문번호", { exact: true })
    .fill(String(result.data.orderNumber));
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "카운터 주문 목록" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("admin-counter-list.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: new RegExp(`^${result.data.orderNumber}번 고객`),
    })
    .click();
  await expect(page.getByText("결제금액 87,000원")).toBeVisible();
  const originalNote = "현금영수증 요청 · 도착 전 연락";
  await page
    .getByLabel("배송지 1 운영 메모", { exact: true })
    .fill(originalNote);
  await page.getByRole("button", { name: "메모 저장", exact: true }).click();
  const originalRow = page.getByRole("button", {
    name: new RegExp(`^${result.data.orderNumber}번 고객`),
  });
  await expect(originalRow).toContainText(
    `배송지 1 · 받는분 메모: ${originalNote}`,
  );
  await expect(originalRow).not.toContainText("재접수");
  await originalRow.click();
  await page.getByRole("button", { name: "결제 완료", exact: true }).click();
  await page.getByRole("radio", { name: "카드", exact: true }).check();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByText("결제 완료를 기록했습니다.")).toBeVisible();
  await page.getByRole("link", { name: "발송 관리", exact: true }).click();
  await expect(page).toHaveURL(/\/namu-admin\/shipping$/);
  await expect(
    page.getByRole("heading", { name: "발송 관리", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("주문번호", { exact: true })
    .fill(String(result.data.orderNumber));
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "상세", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText(`${result.data.orderNumber}번 · 받는분`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "배송지별 발송 목록" }),
  ).toContainText(originalNote);
  await page.getByRole("button", { name: "출력 대기 전체 선택" }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "선택 엑셀 출력", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  await expect(
    page.getByText("엑셀을 생성했습니다.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "발송 대기 전체 선택" }).click();
  await page
    .getByRole("button", { name: "선택 발송 완료", exact: true })
    .click();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(
    page.getByText("발송 완료 처리했습니다.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("admin-shipping.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .locator("article")
    .filter({ hasText: `${result.data.orderNumber}번 · 받는분` })
    .getByRole("button", { name: "상세", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "주문 취소", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "주문 재접수", exact: true }).click();
  const addDelivery = page.getByRole("button", {
    name: "배송지 추가",
    exact: true,
  });
  await expect(addDelivery).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const addBounds = await addDelivery.boundingBox();
  const footerBounds = await page
    .getByRole("region", { name: "주문 진행 버튼" })
    .boundingBox();
  expect(addBounds!.y + addBounds!.height).toBeLessThan(footerBounds!.y);
  await page.screenshot({
    path: testInfo.outputPath("admin-reorder-bottom.png"),
  });
  await addDelivery.click();
  const secondDelivery = page.getByRole("region", {
    name: "배송지 2 수정",
    exact: true,
  });
  await expect(secondDelivery).toBeVisible();
  await secondDelivery.getByRole("button", { name: "이 배송지 제거" }).click();
  await expect(secondDelivery).toHaveCount(0);
  await page.getByLabel("받는 분 이름", { exact: true }).fill("재접수 수령인");
  await page.getByRole("radio", { name: /예약 배송/ }).check();
  await page.getByLabel("희망 배송일", { exact: true }).click();
  const calendar = page.getByRole("dialog", { name: "희망 배송일 선택" });
  const availableDay = calendar
    .getByRole("button", { name: /^\d{4}-\d{2}-\d{2}/ })
    .and(calendar.locator("button:enabled"))
    .first();
  const requestedDate = (await availableDay.getAttribute("aria-label"))!.slice(
    0,
    10,
  );
  await availableDay.click();
  await expect(calendar).toHaveCount(0);
  const reorderedResponse = page.waitForResponse(
    (r) => r.url().includes("/reorder") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "새 주문으로 접수", exact: true })
    .click();
  const response = await reorderedResponse;
  expect(
    response.request().postDataJSON().order.deliveries[0].requestedDate,
  ).toBe(requestedDate);
  const reordered = await response.json();
  await expect(
    page.getByText(
      `${reordered.orderNumber}번으로 재접수했습니다. 원본은 그대로 유지됩니다.`,
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "카운터", exact: true }).click();
  await expect(page).toHaveURL(/\/namu-admin\/counter$/);
  await expect(
    page.getByRole("heading", { name: "카운터", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("주문번호", { exact: true })
    .fill(String(reordered.orderNumber));
  await page.getByRole("button", { name: "검색", exact: true }).click();
  const reorderedRow = page.getByRole("button", {
    name: new RegExp(`^${reordered.orderNumber}번 고객`),
  });
  const reorderNotice = `재접수 · 원본 ${result.data.orderNumber}번`;
  await expect(reorderedRow).toContainText(reorderNotice);
  await reorderedRow.click();
  await expect(
    page.getByLabel("배송지 1 운영 메모", { exact: true }),
  ).toHaveValue("");
  await expect(page.getByRole("dialog")).toContainText(reorderNotice);
  const reorderNote = "주소 변경 확인 · " + "긴메모".repeat(30);
  await page
    .getByLabel("배송지 1 운영 메모", { exact: true })
    .fill(reorderNote);
  await page.getByRole("button", { name: "메모 저장", exact: true }).click();
  await expect(reorderedRow).toContainText(reorderNotice);
  await expect(reorderedRow).toContainText(reorderNote);
  await page.screenshot({
    path: testInfo.outputPath("counter-reorder-note.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "발송 관리", exact: true }).click();
  await page
    .getByLabel("주문번호", { exact: true })
    .fill(String(reordered.orderNumber));
  await page.getByRole("button", { name: "검색", exact: true }).click();
  const shippingRow = page
    .getByRole("region", { name: "배송지별 발송 목록" })
    .getByRole("article")
    .filter({
      hasText: new RegExp(`^${reordered.orderNumber}번 · 재접수 수령인`),
    });
  await expect(shippingRow).toContainText(reorderNotice);
  await expect(shippingRow).toContainText(reorderNote);
  await shippingRow.getByRole("button", { name: "상세", exact: true }).click();
  await expect(
    page.getByLabel("배송지 1 운영 메모", { exact: true }),
  ).toHaveValue(reorderNote);
  await page.getByRole("button", { name: "주문 취소", exact: true }).click();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(
    page.getByText("주문을 취소하고 차감 재고를 반환했습니다."),
  ).toBeVisible();
  await page.getByRole("link", { name: "주문 관리", exact: true }).click();
  const list = page.getByRole("region", { name: "주문 관리 목록" });
  await expect(list.getByRole("button").first()).toHaveAccessibleName(
    new RegExp(`^${reordered.orderNumber}번`),
  );
  await expect(list.getByRole("button").first()).toContainText(reorderNotice);
  await expect(list.getByRole("button").first()).toContainText(reorderNote);
  await expect(
    list.getByRole("button", {
      name: new RegExp(`^${result.data.orderNumber}번 고객`),
    }),
  ).toContainText(originalNote);
  const listRows = list.getByRole("listitem");
  expect(await listRows.count()).toBeGreaterThanOrEqual(2);
  const firstRow = await listRows.nth(0).boundingBox();
  const secondRow = await listRows.nth(1).boundingBox();
  expect(secondRow!.y).toBeGreaterThanOrEqual(firstRow!.y + firstRow!.height);
  expect(secondRow!.x).toBe(firstRow!.x);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("admin-orders-list.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/namu-admin\/login/);
});

test("customer submission retry after lost response retains one number and clears draft", async ({
  page,
}) => {
  await page.goto("/product");
  const order = {
    category: "product",
    sender: {
      name: "비회원 테스트",
      phone: "01012345678",
      privacyConsent: true,
      marketingConsent: false,
    },
    deliveries: [
      {
        recipient: {
          name: "첫째",
          phone: "01012345678",
          postalCode: "00000",
          address: "가상 주소",
          addressDetail: "상세",
        },
        items: [
          { productId: "10000000-0000-4000-8000-000000000001", quantity: 2 },
        ],
        deliveryMode: "regular",
        requestedDate: "",
      },
      {
        recipient: {
          name: "둘째",
          phone: "01012345678",
          postalCode: "00000",
          address: "가상 주소2",
          addressDetail: "상세",
        },
        items: [
          { productId: "10000000-0000-4000-8000-000000000002", quantity: 1 },
        ],
        deliveryMode: "regular",
        requestedDate: "",
      },
    ],
  };
  await page.evaluate(
    (order) =>
      localStorage.setItem(
        "roots-and-fruits:order-draft:v1:live:product",
        JSON.stringify({
          version: 1,
          sender: order.sender,
          deliveries: order.deliveries,
          activeIndex: 0,
          step: "review",
          editSection: "sender",
          pendingDelivery: null,
          editDraft: null,
        }),
      ),
    order,
  );
  await page.reload();
  await expect(
    page.getByText("97,000원", { exact: true }).last(),
  ).toBeVisible();
  let firstNumber = 0;
  let firstId = "";
  let calls = 0;
  await page.route("**/api/orders", async (route) => {
    calls++;
    const id = route.request().postDataJSON().requestId;
    if (calls === 1) {
      firstId = id;
      const response = await route.fetch();
      const data = await response.json();
      firstNumber = data.orderNumber;
      await route.abort("failed");
    } else if (calls === 2) {
      expect(id).toBe(firstId);
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: "로그인이 만료되었어요. 다시 로그인해주세요.",
        }),
      });
    } else {
      expect(id).toBe(firstId);
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "주문 접수", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "접수 결과를 확인해주세요." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "나무와열매 홈" }).click();
  await page.locator('a[href="/order/start/product"]').click();
  await expect(
    page.getByRole("heading", { name: "접수 결과를 확인해주세요." }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "작성 중인 주문이 있어요" }),
  ).toHaveCount(0);
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "주문 접수", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "로그인이 만료",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("roots-and-fruits:submission:product"),
    ),
  ).toContain(firstId);
  await page.getByRole("button", { name: "주문 접수", exact: true }).click();
  await expect(page).toHaveURL(/order-complete/);
  await expect(
    page.getByText(`${firstNumber}번`, { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(3);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("roots-and-fruits:order-draft:v1:live:product"),
    ),
  ).toBeNull();
  await page.getByRole("button", { name: "다음 주문 시작" }).click();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await page.unroute("**/api/orders");
  await page.evaluate(
    (order) =>
      localStorage.setItem(
        "roots-and-fruits:order-draft:v1:live:product",
        JSON.stringify({
          version: 1,
          sender: order.sender,
          deliveries: order.deliveries,
          activeIndex: 0,
          step: "review",
          editSection: "sender",
          pendingDelivery: null,
          editDraft: null,
        }),
      ),
    order,
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "주문 접수", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Storage blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Storage blocked");
    };
    Storage.prototype.removeItem = () => {
      throw new Error("Storage blocked");
    };
  });
  await page.getByRole("button", { name: "주문 접수", exact: true }).click();
  await expect(page).toHaveURL(/order-complete/);
  await expect(
    page.getByRole("heading", { name: "주문이 접수되었어요." }),
  ).toBeVisible();
  await expect(
    page.getByText("브라우저 저장소를 사용할 수 없어요.", { exact: false }),
  ).toBeVisible();
});

test("drag product and fruit group order, cancel and persist by category", async ({
  page,
}, testInfo) => {
  await login(page);
  const fruit = `정렬${testInfo.project.name}`;
  // Unique fruit groups keep this test separate from lifecycle fixtures.
  for (const [fruit_type, weight_grams] of [
    [fruit, 3000],
    [fruit, 5000],
    [`${fruit}새그룹`, 3000],
  ] as const) {
    const status = await page.evaluate(
      async ({ fruit_type, weight_grams }) =>
        (
          await fetch("/api/admin/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: null,
              category: "product",
              fruit_type,
              weight_grams,
              description: "정렬 테스트",
              price: 10000,
              is_active: true,
              is_deleted: false,
              inventory_enabled: false,
              stock_quantity: null,
              sort_order: 0,
              bundle_eligible: false,
            }),
          })
        ).status,
      { fruit_type, weight_grams },
    );
    expect(status).toBe(200);
  }
  await page.goto("/namu-admin/products");
  await page.getByRole("button", { name: "일반 상품", exact: true }).click();
  const handles = () =>
    page.getByRole("button", {
      name: new RegExp(`^${fruit} [35]kg 정렬 테스트 순서 이동$`),
    });
  await expect(handles()).toHaveCount(2);
  await expect(handles().first()).toHaveAccessibleName(
    `${fruit} 3kg 정렬 테스트 순서 이동`,
  );
  const first = page.getByRole("button", {
    name: `${fruit} 3kg 정렬 테스트 순서 이동`,
    exact: true,
  });
  const second = page.getByRole("button", {
    name: `${fruit} 5kg 정렬 테스트 순서 이동`,
    exact: true,
  });
  await first.scrollIntoViewIfNeeded();
  const a = await first.boundingBox(),
    b = await second.boundingBox();
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  if (testInfo.project.name === "mobile") {
    const touch = await page.context().newCDPSession(page);
    const x = a!.x + a!.width / 2,
      y = a!.y + a!.height / 2,
      targetY = b!.y + b!.height / 2;
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 15; step++)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + ((targetY - y) * step) / 15 }],
      });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
  } else {
    await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
    await page.mouse.down();
    await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, {
      steps: 15,
    });
    await page.mouse.up();
  }
  await expect(handles().first()).toHaveAccessibleName(
    `${fruit} 5kg 정렬 테스트 순서 이동`,
  );
  await page
    .getByRole("button", { name: "순서 취소", exact: true })
    .click({ trial: true });
  await page.getByRole("button", { name: "순서 취소", exact: true }).click();
  await expect(handles().first()).toHaveAccessibleName(
    `${fruit} 3kg 정렬 테스트 순서 이동`,
  );
  // Handles support keyboard dragging without additional movement buttons.
  await first.focus();
  await page.keyboard.press("Space", { delay: 75 });
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(
      async () =>
        (await first.boundingBox())!.y > (await second.boundingBox())!.y,
    )
    .toBe(true);
  await page.keyboard.press("Space", { delay: 75 });
  await expect(handles().first()).toHaveAccessibleName(
    `${fruit} 5kg 정렬 테스트 순서 이동`,
  );
  await page.getByRole("button", { name: "순서 저장", exact: true }).click();
  await expect(
    page.getByText("상품 순서를 저장했습니다.", { exact: true }),
  ).toBeVisible();
  const group = page.getByRole("button", {
    name: `${fruit} 그룹 순서 이동`,
    exact: true,
  });
  await group.focus();
  await page.keyboard.press("Space", { delay: 75 });
  await expect(group).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(
      async () =>
        (await group.boundingBox())!.y >
        (await page
          .getByRole("button", {
            name: `${fruit}새그룹 그룹 순서 이동`,
            exact: true,
          })
          .boundingBox())!.y,
    )
    .toBe(true);
  await page.keyboard.press("Space", { delay: 75 });
  await expect(
    page.getByRole("button", { name: "순서 저장", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "순서 저장", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "순서 저장", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "일반 상품", exact: true }).click();
  await expect(handles().first()).toHaveAccessibleName(
    `${fruit} 5kg 정렬 테스트 순서 이동`,
  );
  const sorted = await page.evaluate(async (fruit) => {
    const rows = await (await fetch("/api/admin/products")).json();
    return rows
      .filter(
        (p: { category: string; fruit_type: string }) =>
          p.category === "product" && p.fruit_type.startsWith(fruit),
      )
      .map((p: { fruit_type: string; weight_grams: number }) => [
        p.fruit_type,
        p.weight_grams,
      ]);
  }, fruit);
  expect(sorted).toEqual([
    [`${fruit}새그룹`, 3000],
    [fruit, 5000],
    [fruit, 3000],
  ]);
  await page.getByRole("button", { name: "일반 상품", exact: true }).click();
  await expect(page.getByText("감귤 3kg", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("product-sort-list.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
