import { test, expect } from "@playwright/test";

test("special discount saves, highlights customer prices, stacks with bundle discounts and can be disabled", async ({
  page,
}, info) => {
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/namu-admin\/counter/, { timeout: 20000 });
  await page.goto("/namu-admin/products");
  const card = page.locator("article").filter({ hasText: "테스트 상품" });
  await card.getByRole("button", { name: "수정", exact: true }).click();
  const editor = card.locator("xpath=..").locator("form");
  await expect(editor).toBeVisible();
  const rowBounds = await card.boundingBox();
  const editorBounds = await editor.boundingBox();
  expect(editorBounds!.y).toBeGreaterThanOrEqual(rowBounds!.y + rowBounds!.height);
  await page.getByRole("checkbox", { name: "특별할인", exact: true }).check();
  await page.getByLabel("1개당 특별할인액 (원)", { exact: true }).fill("5000");
  await expect(
    page.getByText("할인 판매가: 25,000원", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("special-discount-admin.png"),
  });
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(card).toContainText("25,000원");
  await page.reload();
  await expect(card).not.toContainText("특별할인");
  await expect(card.locator("del")).toContainText("30,000원");
  await page.route("https://t1.daumcdn.net/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.daum = { Postcode: class { constructor(options) { this.options = options; } open() { this.options.oncomplete({ zonecode: '12345', address: '테스트 도로명 주소', addressType: 'R', bname: '', buildingName: '' }); } } };`,
    }),
  );
  await page.goto("/product");
  await page
    .getByLabel("보내는 분 이름", { exact: true })
    .fill("특별할인 확인");
  await page.getByLabel("휴대폰 번호", { exact: true }).fill("01012345678");
  await page
    .getByRole("checkbox", {
      name: "[필수] 개인정보 수집 및 이용 동의",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("checkbox", { name: "보내는 사람과 같아요" }).check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "주소 검색", exact: true }).click();
  await page.getByLabel("상세주소", { exact: true }).fill("상세");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const product = page.getByRole("article", {
    name: "감귤 3kg · 테스트 상품",
    exact: true,
  });
  await expect(product).toContainText("특별할인 · 5,000원 할인");
  await expect(product.locator("del")).toContainText("30,000원");
  await expect(product).toContainText("25,000원");
  await product
    .getByRole("button", { name: /수량 늘리기/ })
    .click({ clickCount: 2 });
  await expect(
    page.locator("strong").filter({ hasText: /^47,000원$/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("special-discount-customer.png"),
  });
  await page.goto("/namu-admin/products");
  await card.getByRole("button", { name: "수정", exact: true }).click();
  await expect(
    page.getByLabel("1개당 특별할인액 (원)", { exact: true }),
  ).toHaveValue("5000");
  await page.getByRole("checkbox", { name: "특별할인", exact: true }).uncheck();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(card).not.toContainText("특별할인");
  await expect(card).toContainText("30,000원");
  await page.goto("/product");
  await expect(product).not.toContainText("특별할인");
  await expect(
    page.locator("strong").filter({ hasText: /^57,000원$/ }),
  ).toBeVisible();
});
