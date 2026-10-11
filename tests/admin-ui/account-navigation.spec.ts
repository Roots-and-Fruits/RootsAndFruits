import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
const base = "http://127.0.0.1:3110";
const origin = { Origin: base };
async function fixture(page: Page, failDeleteOnce = false) {
  const response = await page.request.post(
    "http://127.0.0.1:3111/__test/customer-deletion-fixture",
    { data: { failDeleteOnce } },
  );
  const session = await response.json();
  await page.context().addCookies([
    {
      name: "sb-127-auth-token",
      value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
      url: base,
    },
    { name: "rf-customer-session", value: "1", url: base, httpOnly: true },
    { name: "rf-customer-epoch", value: randomUUID(), url: base },
  ]);
  return session;
}

test("member header only, account tab, login redirect and logout to a working guest order", async ({
  page,
}, info) => {
  await fixture(page);
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(
    header.getByRole("link", { name: "마이페이지", exact: true }),
  ).toBeVisible();
  await expect(
    header.getByRole("button", { name: "로그아웃", exact: true }),
  ).toBeVisible();
  await expect(
    header.getByRole("link", { name: "로그인", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("contentinfo").getByRole("link")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/account\/orders$/);
  await expect(
    page.getByRole("link", { name: "로그인 관리", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "계정 관리", exact: true }).click();
  await expect(page.getByRole("heading", { name: "계정 관리" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "계정 삭제", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("account-management.png"),
    fullPage: true,
    animations: "disabled",
  });
  await header.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    header.getByRole("link", { name: "로그인", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/auth/session")).json()).account,
  ).toBeNull();
  await page.locator('a[href="/order/start/product"]').click();
  const prompt = page.getByRole("dialog", {
    name: "로그인하고 더 편하게 주문하세요",
  });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "비회원으로 계속하기" }).click();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await expect(
    page.getByText("로그인이 만료되었어요", { exact: false }),
  ).toHaveCount(0);
  const result = await page.request.post("/api/orders", {
    headers: origin,
    data: {
      requestId: randomUUID(),
      order: {
        category: "product",
        sender: {
          name: "로그아웃 후 비회원",
          phone: "01000000000",
          privacyConsent: true,
          marketingConsent: false,
        },
        deliveries: [
          {
            recipient: {
              name: "가상 수령인",
              phone: "01000000000",
              postalCode: "00000",
              address: "가상 주소",
              addressDetail: "테스트",
            },
            items: [
              {
                productId: "10000000-0000-4000-8000-000000000002",
                quantity: 1,
              },
            ],
            deliveryMode: "regular",
            requestedDate: "",
          },
        ],
      },
    },
  });
  expect(result.status(), await result.text()).toBe(200);
});

test("empty stale cookies are guest; expired refresh logout removes cookies and preserves auth errors until explicit logout", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "sb-127-auth-token.1", value: "", url: base },
  ]);
  expect(
    (await (await page.request.get("/api/auth/session")).json()).account,
  ).toBeNull();
  const data = await (
    await page.request.get(
      "http://127.0.0.1:3111/__test/auth-session?user=2&mode=expired",
    )
  ).json();
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: `base64-${Buffer.from(JSON.stringify(data)).toString("base64url")}`,
      url: base,
    },
    { name: "rf-customer-session", value: "1", url: base },
  ]);
  const logout = await page.request.post("/api/auth/logout", {
    headers: origin,
    data: {},
  });
  expect(logout.status()).toBe(200);
  expect(
    (await context.cookies()).filter(
      (c) => c.name.startsWith("sb-") || c.name === "rf-customer-session",
    ),
  ).toEqual([]);
  expect(
    (await (await page.request.get("/api/auth/session")).json()).account,
  ).toBeNull();
  await context.addCookies([
    { name: "rf-customer-session", value: "1", url: base },
  ]);
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
});

test("one shared session check and stable skeleton while opening guest order", async ({
  page,
}, info) => {
  let checks = 0;
  await page.route("**/api/auth/session", async (route) => {
    checks++;
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.goto("/");
  await expect(
    page.getByRole("banner").getByRole("link", { name: "로그인", exact: true }),
  ).toBeVisible();
  await page.locator('a[href="/order/start/product"]').click();
  await expect(
    page.getByRole("dialog", { name: "로그인하고 더 편하게 주문하세요" }),
  ).toBeVisible();
  expect(checks).toBe(1);
  await expect(
    page.getByText(
      /화면을 준비하고 있어요|로그인 상태를 확인하고 있어요|작성 내용을 확인하고 있어요/,
    ),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("order-entry.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("account deletion requires confirmation and retries safely after Auth failure", async ({
  page,
  context,
}, info) => {
  await fixture(page, true);
  const badOrigin = await page.request.delete("/api/account/membership", {
    headers: { Origin: "https://example.test" },
    data: { confirmation: "delete-my-account" },
  });
  expect(badOrigin.status()).toBe(403);
  const badConfirm = await page.request.delete("/api/account/membership", {
    headers: origin,
    data: {},
  });
  expect(badConfirm.status()).toBe(400);
  await page.goto("/account/settings");
  await page.getByRole("button", { name: "계정 삭제", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "계정을 삭제할까요?" });
  const remove = dialog.getByRole("button", { name: "동의하고 계정 삭제" });
  await expect(remove).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await page.screenshot({
    path: info.outputPath("account-delete-confirm.png"),
    fullPage: true,
    animations: "disabled",
  });
  await remove.click();
  await expect(dialog.getByRole("alert")).toContainText(
    "계정 삭제를 완료하지 못했어요",
  );
  await remove.click();
  await expect(page).toHaveURL(/\/account-deleted$/);
  await expect(
    page.getByRole("heading", { name: "회원 탈퇴가 완료되었어요." }),
  ).toBeVisible();
  expect(
    (await context.cookies()).filter(
      (c) => c.name.startsWith("sb-") || c.name === "rf-customer-session",
    ),
  ).toEqual([]);
  expect((await page.request.get("/api/account/orders")).status()).toBe(401);
  await expect(
    page.getByRole("banner").getByRole("link", { name: "로그인", exact: true }),
  ).toBeVisible();
});

test("membership deletion rejects guests, tablets, staff, forged IDs and stale sessions", async ({
  page,
}) => {
  const remove = (extra: object = {}, headers: object = {}) =>
    page.request.delete("/api/account/membership", {
      headers: { ...origin, ...headers },
      data: { confirmation: "delete-my-account", ...extra },
    });
  expect((await remove()).status()).toBe(401);
  for (const user of [0, 1]) {
    const session = await (
      await page.request.get(
        `http://127.0.0.1:3111/__test/auth-session?user=${user}`,
      )
    ).json();
    await page
      .context()
      .addCookies([
        {
          name: "sb-127-auth-token",
          value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
          url: base,
        },
      ]);
    expect((await remove()).status()).toBe(403);
  }
  const me = await fixture(page);
  expect((await remove({ member_id: randomUUID() })).status()).toBe(400);
  expect(
    (await remove({}, { "X-Customer-Epoch": "old-session" })).status(),
  ).toBe(409);
  expect(
    (await (await page.request.get("/api/auth/session")).json()).account.id,
  ).toBe(me.user.id);
});
