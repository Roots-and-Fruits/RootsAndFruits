import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function kakaoLogin(page: Page) {
  // This regression covers account handoff, not the external OAuth provider.
  const session = await (
    await page.request.get("http://127.0.0.1:3111/__test/auth-session?user=2")
  ).json();
  await page.context().addCookies([
    {
      name: "sb-127-auth-token",
      value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
      url: "http://127.0.0.1:3110",
    },
    {
      name: "rf-customer-session",
      value: "1",
      url: "http://127.0.0.1:3110",
      httpOnly: true,
    },
    {
      name: "rf-customer-epoch",
      value: randomUUID(),
      url: "http://127.0.0.1:3110",
    },
  ]);
  await page.goto("/product");
  await expect(page).toHaveURL(/\/product$/);
  await expect(
    page.getByRole("link", { name: "마이페이지", exact: true }),
  ).toBeVisible();
}

async function adminLogin(page: Page) {
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/namu-admin\/counter$/, { timeout: 30000 });
}

test("admin logout after Kakao restores guest entry without a stale customer session", async ({
  page,
  context,
}) => {
  await kakaoLogin(page);
  await page.getByLabel("보내는 분 이름").fill("정리할 회원 입력");
  const admin = await context.newPage();
  await adminLogin(admin);
  await admin.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(admin).toHaveURL(/\/namu-admin\/login$/);
  const response = await page.request.get("/api/auth/session");
  expect(response.status()).toBe(200);
  expect((await response.json()).account).toBeNull();
  expect(
    (await context.cookies()).filter(
      (cookie) =>
        cookie.name === "rf-customer-session" ||
        /^sb-.+-auth-token(?:[.-].*)?$/.test(cookie.name),
    ),
  ).toHaveLength(0);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "로그인", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await page.getByLabel("보내는 분 이름").fill("비회원 새 주문");
  await page.getByLabel("휴대폰 번호", { exact: true }).fill("01000000000");
  await page.locator("#privacyConsent").check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByLabel("받는 분 이름")).toBeVisible();
});

test("successful admin login clears customer drafts in both open order tabs", async ({
  page,
  context,
}) => {
  await kakaoLogin(page);
  await page.getByLabel("보내는 분 이름").fill("개인 일반 초안");
  const otherTab = await context.newPage();
  await otherTab.goto("/product");
  await otherTab.getByLabel("보내는 분 이름").fill("개인 일반 초안");
  const admin = await context.newPage();
  await adminLogin(admin);
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await expect(otherTab.getByLabel("보내는 분 이름")).toHaveValue("");
  await page.reload();
  await otherTab.reload();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await expect(otherTab.getByLabel("보내는 분 이름")).toHaveValue("");
  expect((await page.request.get("/api/account/preferences")).status()).toBe(
    403,
  );
});
