import { test, expect } from "@playwright/test";

test("fruit notice saves once per fruit, appears beside customer heading, and can be cleared", async ({
  page,
}, testInfo) => {
  const headers = { Origin: "http://127.0.0.1:3110" };
  const denied = await page.request.post("/api/admin/fruit-notices", {
    headers,
    data: { fruit_type: "감귤", notice: "권한 없음" },
  });
  expect(denied.status()).toBe(401);
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/namu-admin\/counter/, { timeout: 20000 });
  await page.goto("/namu-admin/products");
  await page.getByRole("button", { name: "감귤 안내사항 수정" }).click();
  const input = () =>
    page.getByRole("textbox", { name: "감귤 안내사항", exact: true });
  const form = () => page.getByRole("form", { name: "감귤 안내사항 편집" });
  const note =
    "수령 후 서늘한 곳에 보관해주세요.\n껍질에 작은 흠집이 있어도 맛에는 영향이 없습니다.";
  await input().fill(note);
  await form().getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "감귤 안내사항 수정" }).click();
  await expect(input()).toHaveValue(note);
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator("main").getByText(note, { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("fruit-notice-admin.png"),
    fullPage: true,
  });
  await page.route("https://t1.daumcdn.net/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.daum = { Postcode: class { constructor(options) { this.options = options; } open() { this.options.oncomplete({ zonecode: '12345', address: '테스트 도로명 주소', addressType: 'R', bname: '', buildingName: '' }); } } };`,
    }),
  );
  await page.goto("/product");
  await page.getByLabel("보내는 분 이름", { exact: true }).fill("안내 확인");
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
  const group = page.getByRole("region", { name: "감귤", exact: true });
  await expect(group.getByText(note)).toBeVisible();
  await expect(group.getByText(note)).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "한라봉", exact: true }),
  ).not.toContainText(note);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("fruit-notice-customer.png"),
    fullPage: true,
  });
  await page.goto("/namu-admin/products");
  await page.getByRole("button", { name: "감귤 안내사항 수정" }).click();
  await input().fill("");
  await form().getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/product");
  await expect(
    page.getByRole("heading", { name: "감귤", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(note)).toHaveCount(0);
});
