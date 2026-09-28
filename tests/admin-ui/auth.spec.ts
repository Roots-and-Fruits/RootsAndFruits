import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
const fixtureOrder = {
  category: "product",
  sender: {
    name: "회원 입력 발송인",
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
        addressDetail: "발송 금지",
      },
      items: [
        { productId: "10000000-0000-4000-8000-000000000002", quantity: 2 },
      ],
      deliveryMode: "regular",
      requestedDate: "",
    },
  ],
};
async function post(page: Page, path: string, body: unknown) {
  return page.evaluate(
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
}
for (const kind of ["tablet", "kakao"] as const) {
  test(`${kind} login links orders and cannot access admin`, async ({
    page,
    browser,
  }, testInfo) => {
    if (kind === "tablet") {
      await page.goto("/tablet-login?next=/product");
      await page.getByLabel("태블릿 아이디", { exact: true }).fill("owner");
      await page
        .getByLabel("비밀번호", { exact: true })
        .fill("test-password-123");
      await page
        .getByRole("button", { name: "태블릿 로그인", exact: true })
        .click();
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "아이디 또는 비밀번호",
      );
      await page.getByLabel("태블릿 아이디", { exact: true }).fill("tablet-01");
      await page
        .getByRole("button", { name: "태블릿 로그인", exact: true })
        .click();
    } else {
      await page.goto("/login?next=/product");
      await expect(page.getByLabel("비밀번호", { exact: true })).toHaveCount(0);
      await expect(page.locator('a[href^="/tablet-login"]')).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "카카오 로그인", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("kakao-login.png"),
        fullPage: true,
      });
      const authorizeRequest = page.waitForRequest((request) =>
        new URL(request.url()).pathname === "/auth/v1/authorize",
      );
      await page
        .getByRole("button", { name: "카카오 로그인", exact: true })
        .click();
      const authorizeUrl = new URL((await authorizeRequest).url());
      expect(authorizeUrl.searchParams.get("scope")).toBe("profile_nickname");
      expect(authorizeUrl.searchParams.has("scopes")).toBe(false);
    }
    await expect(page).toHaveURL("http://127.0.0.1:3110/product");
    const session = await (await page.request.get("/api/auth/session")).json();
    expect(session.account.kind).toBe(kind);
    await page.reload();
    expect(
      (await (await page.request.get("/api/auth/session")).json()).account.id,
    ).toBe(session.account.id);
    expect((await page.request.get("/api/admin/orders")).status()).toBe(401);
    await page.goto("/namu-admin/orders");
    await expect(page).toHaveURL(/\/namu-admin\/login$/);
    await page.goto("/product");
    const request = {
      requestId: randomUUID(),
      order: fixtureOrder,
      p_member: randomUUID(),
    };
    const [first, retry] = await Promise.all([
      post(page, "/api/orders", request),
      post(page, "/api/orders", request),
    ]);
    expect(first.status).toBe(200);
    expect(retry.data).toEqual(first.data);
    const admin = await browser.newContext();
    try {
      const staffPage = await admin.newPage();
      await staffPage.goto("/namu-admin/login");
      expect(
        (
          await post(staffPage, "/api/admin/login", {
            username: "owner",
            password: "test-password-123",
          })
        ).status,
      ).toBe(200);
      const saved = await (
        await staffPage.request.get(
          `/api/admin/orders?number=${first.data.orderNumber}`,
        )
      ).json();
      expect(saved.orders).toHaveLength(1);
      expect(saved.orders[0].member_id).toBe(session.account.id);
      expect(saved.orders[0].order_source).toBe(kind);
      expect(saved.orders[0].sender.name).toBe("회원 입력 발송인");
    } finally {
      await admin.close();
    }
    await page.goto("/login");
    await expect(page.getByRole("status")).toContainText("로그인되어 있어요");
    await page.getByRole("button", { name: "로그아웃", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "카카오 로그인", exact: true }),
    ).toBeVisible();
    expect((await post(page, "/api/orders", request)).status).toBe(401);
  });
}
test("OAuth errors, expired sessions and cross-site login requests fail safely", async ({
  page,
  context,
}) => {
  await page.goto("/auth/callback?code=invalid&next=https://example.com");
  await expect(page).toHaveURL(/\/login\?error=kakao&next=%2F$/);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "카카오 로그인을 완료하지 못했어요",
  );
  const csrf = await page.request.post("/api/auth/tablet-login", {
    data: { username: "tablet-01", password: "test-password-123" },
    headers: { Origin: "https://example.com" },
  });
  expect(csrf.status()).toBe(403);
  await context.addCookies([
    {
      name: "rf-customer-session",
      value: "1",
      url: "http://127.0.0.1:3110",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const result = await post(page, "/api/orders", {
    requestId: randomUUID(),
    order: fixtureOrder,
  });
  expect(result.status).toBe(401);
  expect(result.data.error).toContain("로그인이 만료");
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "로그인 상태 초기화" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "로그인 상태 초기화" }).click();
  await expect(
    page.getByRole("button", { name: "카카오 로그인", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/auth/session")).json()).account,
  ).toBeNull();
});
