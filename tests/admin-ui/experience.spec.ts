import { test, expect } from "@playwright/test";
import type { AdminProduct } from "../../src/features/admin/schema";

test("experience form, flat sorting, customer selection, order and category conversion", async ({
  page,
}, testInfo) => {
  const description = `체험 택배 ${testInfo.project.name}`;
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/namu-admin\/counter/, { timeout: 20000 });
  await page.goto("/namu-admin/products");
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await page.getByLabel("과일 종류", { exact: true }).fill("전환 전 과일");
  await page.getByRole("checkbox", { name: "재고 관리", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "묶음 배송 할인 대상", exact: true })
    .check();
  await page
    .getByRole("combobox", { name: "상품 구분", exact: true })
    .selectOption("experience");
  for (const label of [
    "과일 종류",
    "중량 (kg)",
    "재고 관리",
    "묶음 배송 할인 대상",
  ]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByLabel(/재고 수량 변경/)).toHaveCount(0);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByText("상품 내용을 입력해주세요.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("상품 내용", { exact: true }).fill(description);
  await page.getByLabel("가격 (원)", { exact: true }).fill("10000");
  await page.screenshot({
    path: testInfo.outputPath("experience-form.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByText("상품을 저장했습니다.", { exact: true }),
  ).toBeVisible();
  const card = page.locator("article").filter({ hasText: description });
  await expect(card).toContainText("10,000원");
  await expect(card).not.toContainText(/kg|재고|할인/);
  const saved = await page.evaluate(async (description) => {
    const rows: AdminProduct[] = await (
      await fetch("/api/admin/products")
    ).json();
    return rows.find((p) => p.description === description)!;
  }, description);
  expect(saved).toMatchObject({
    category: "experience",
    fruit_type: null,
    weight_grams: null,
    inventory_enabled: false,
    bundle_eligible: false,
  });
  const secondDescription = `${description} 큰 상자`;
  const secondStatus = await page.evaluate(
    async ({ saved, secondDescription }) => {
      const post = (data: unknown) =>
        fetch("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      const invalid = await post({ ...saved, inventory_enabled: true });
      const valid = await post({
        ...saved,
        id: null,
        description: secondDescription,
      });
      return [invalid.status, valid.status];
    },
    { saved, secondDescription },
  );
  expect(secondStatus).toEqual([400, 200]);
  await page.reload();
  await page.getByRole("button", { name: "체험 상품", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /그룹 순서 이동/ }),
  ).toHaveCount(0);
  const firstHandle = page.getByRole("button", {
    name: `${description} 순서 이동`,
    exact: true,
  });
  const secondHandle = page.getByRole("button", {
    name: `${secondDescription} 순서 이동`,
    exact: true,
  });
  await firstHandle.focus();
  await page.keyboard.press("Space", { delay: 75 });
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(
      async () =>
        (await firstHandle.boundingBox())!.y >
        (await secondHandle.boundingBox())!.y,
    )
    .toBe(true);
  await page.keyboard.press("Space", { delay: 75 });
  await page.getByRole("button", { name: "순서 저장", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "순서 저장", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "체험 상품", exact: true }).click();
  expect((await firstHandle.boundingBox())!.y).toBeGreaterThan(
    (await secondHandle.boundingBox())!.y,
  );
  await page.screenshot({
    path: testInfo.outputPath("experience-list.png"),
    fullPage: true,
  });

  await page.route("https://t1.daumcdn.net/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.daum = { Postcode: class { constructor(options) { this.options = options; } open() { this.options.oncomplete({ zonecode: '12345', address: '테스트 도로명 주소', addressType: 'R', bname: '', buildingName: '' }); } } };`,
    }),
  );
  await page.goto("/experience");
  await page.getByLabel("보내는 분 이름", { exact: true }).fill("체험 고객");
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
  await page.getByLabel("상세주소", { exact: true }).fill("가상 상세");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator("main")).not.toContainText(/kg|묶음 할인|품절/);
  await page
    .getByRole("button", { name: `${description} 수량 늘리기`, exact: true })
    .click({ clickCount: 2 });
  await expect(
    page.getByLabel(`${description} 수량`, { exact: true }),
  ).toHaveText("2");
  await page.screenshot({
    path: testInfo.outputPath("experience-customer.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "배송지 1 주문 요약" }),
  ).toContainText("20,000원");
  await expect(page.locator("main")).not.toContainText(/kg|묶음 할인/);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/orders") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "주문 접수", exact: true }).click();
  const result = await (await response).json();
  expect(result.total).toBe(20000);
  await expect(page).toHaveURL(/order-complete/);
  const snapshot = await page.evaluate(async (number) => {
    const { orders } = await (
      await fetch(`/api/admin/orders?number=${number}`)
    ).json();
    return orders[0].deliveries[0].order_items[0];
  }, result.orderNumber);
  expect(snapshot).toMatchObject({
    label: description,
    weight_grams: null,
    quantity: 2,
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
  await expect(page.getByLabel("상품 내용", { exact: true })).toHaveValue(
    description,
  );
  await page
    .getByRole("combobox", { name: "상품 구분", exact: true })
    .selectOption("product");
  await page
    .getByLabel("과일 종류", { exact: true })
    .fill(`전환 과일 ${testInfo.project.name}`);
  await page.getByLabel("중량 (kg)", { exact: true }).fill("2.5");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByText("상품을 저장했습니다.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: `전환 과일 ${testInfo.project.name} 2.5kg`,
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
