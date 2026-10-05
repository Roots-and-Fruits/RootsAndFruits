import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/namu-admin/login");
  const response = await page.request.post("/api/admin/login", {
    headers: { Origin: "http://127.0.0.1:3110" },
    data: { username: "owner", password: "test-password-123" },
  });
  expect(response.status()).toBe(200);
}
async function order(page: Page) {
  const response = await page.request.post("/api/orders", {
    headers: { Origin: "http://127.0.0.1:3110" },
    data: {
      requestId: randomUUID(),
      order: {
        category: "product",
        sender: {
          name: "성능 확인",
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
              address: "테스트 전용",
              addressDetail: "발송 금지",
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
  expect(response.status()).toBe(200);
  return (await response.json()).orderNumber as number;
}
function gate() {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { ready, release };
}

test("order rows do not wait for a slow or failed product filter; retry and search work", async ({
  page,
}) => {
  await login(page);
  const number = await order(page);
  const products = gate();
  let fail = true;
  let requests = 0;
  await page.route("**/api/admin/products", async (route) => {
    requests++;
    await products.ready;
    if (fail)
      await route.fulfill({
        status: 500,
        json: { error: "상품 조회 테스트 오류" },
      });
    else await route.continue();
  });
  try {
    await page.goto("/namu-admin/orders");
    const row = page.getByRole("button", {
      name: `${number}번 성능 확인 주문 상세`,
    });
    await expect(row).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "상품", exact: true }),
    ).toBeDisabled();
    products.release();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "상품 조회 테스트 오류",
    );
    await expect(row).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "상품 목록 다시 불러오기" }).click();
    await expect(
      page.getByRole("combobox", { name: "상품", exact: true }),
    ).toBeEnabled();
    const beforeSearch = requests;
    await page.getByLabel("주문번호", { exact: true }).fill(String(number));
    await page.getByRole("button", { name: "검색", exact: true }).click();
    await expect(row).toBeVisible();
    await expect(page.getByText("주문을 불러오는 중…")).toHaveCount(0);
    expect(requests).toBe(beforeSearch);
  } finally {
    products.release();
  }
});

test("counter loads catalog only when reopening a reorder and supports retry or back", async ({
  page,
}) => {
  await login(page);
  const number = await order(page);
  let productRequests = 0;
  let fail = true;
  await page.route("**/api/admin/products", async (route) => {
    productRequests++;
    if (fail)
      await route.fulfill({
        status: 500,
        json: { error: "재접수 상품 테스트 오류" },
      });
    else await route.continue();
  });
  await page.goto("/namu-admin/counter");
  const row = page.getByRole("button", {
    name: `${number}번 성능 확인 주문 상세`,
  });
  await expect(row).toBeVisible();
  expect(productRequests).toBe(0);
  await row.click();
  await page.getByRole("button", { name: "주문 재접수", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "재접수 상품 테스트 오류",
  );
  await expect(
    page.getByRole("button", { name: "새 주문으로 접수" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "목록으로 돌아가기" }).click();
  await row.click();
  await page.getByRole("button", { name: "주문 재접수", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "재접수 상품 테스트 오류",
  );
  fail = false;
  await page.getByRole("button", { name: "상품·설정 다시 불러오기" }).click();
  await expect(page.getByLabel("보내는 분 이름", { exact: true })).toHaveValue(
    "성능 확인",
  );
  await expect(
    page.getByRole("button", { name: "새 주문으로 접수" }),
  ).toBeVisible();
});

test("navigation keeps the menu mounted and gives feedback while the route is pending", async ({
  page,
}, testInfo) => {
  await login(page);
  await page.goto("/namu-admin/counter");
  await expect(page.getByText("주문을 불러오는 중…")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "관리자 메뉴" })
    .evaluate((node) => node.setAttribute("data-persist-check", "same"));
  const navigation = gate();
  await page.route("**/namu-admin/orders?*", async (route) => {
    await navigation.ready;
    await route.continue();
  });
  try {
    const link = page.getByRole("link", { name: "주문 관리", exact: true });
    await link.click();
    await expect(link.locator("svg")).toHaveClass(/opacity-100/);
    await expect(
      page.getByRole("navigation", { name: "관리자 메뉴" }),
    ).toBeVisible();
    navigation.release();
    await expect(page).toHaveURL(/\/namu-admin\/orders$/);
    await expect(page.getByText("주문을 불러오는 중…")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "관리자 메뉴" }),
    ).toHaveAttribute("data-persist-check", "same");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("admin-after-navigation.png"),
      fullPage: true,
    });
  } finally {
    navigation.release();
  }
});

test("asymmetric proxy verification saves an Auth request while APIs still check the live user", async ({
  page,
  context,
}) => {
  const fixture = await (
    await page.request.get("http://127.0.0.1:3111/__test/auth-session")
  ).json();
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: `base64-${Buffer.from(JSON.stringify(fixture)).toString("base64url")}`,
      url: "http://127.0.0.1:3110",
    },
  ]);
  const reads = async () =>
    (
      await (
        await page.request.get("http://127.0.0.1:3111/__test/auth-reads", {
          headers: { Authorization: `Bearer ${fixture.access_token}` },
        })
      ).json()
    ).count;
  const before = await reads();
  expect((await page.request.get("/api/admin/products")).status()).toBe(200);
  expect((await reads()) - before).toBe(1);
});

for (const mode of ["expired", "legacy", "revoked", "role-removed"] as const) {
  test(`admin ${mode} session retains refresh and authorization behavior`, async ({
    page,
    context,
  }) => {
    const fixture = await (
      await page.request.get(
        `http://127.0.0.1:3111/__test/auth-session?mode=${mode}`,
      )
    ).json();
    await context.addCookies([
      {
        name: "sb-127-auth-token",
        value: `base64-${Buffer.from(JSON.stringify(fixture)).toString("base64url")}`,
        url: "http://127.0.0.1:3110",
      },
    ]);
    const allowed = mode === "expired" || mode === "legacy";
    expect((await page.request.get("/api/admin/orders")).status()).toBe(
      allowed ? 200 : 401,
    );
    if (mode === "expired") {
      const cookie = (await context.cookies()).find(
        (c) => c.name === "sb-127-auth-token",
      )!;
      const renewed = JSON.parse(
        Buffer.from(cookie.value.slice(7), "base64url").toString(),
      );
      expect(renewed.expires_at).toBeGreaterThan(Date.now() / 1000);
      expect(renewed.access_token).not.toBe(fixture.access_token);
    }
    await page.goto("/namu-admin/orders");
    await expect(page).toHaveURL(
      allowed ? /\/namu-admin\/orders$/ : /\/namu-admin\/login$/,
    );
    if (!allowed) {
      expect(
        (
          await page.request.post("/api/admin/settings", {
            data: {},
            headers: { Origin: "http://127.0.0.1:3110" },
          })
        ).status(),
      ).toBe(401);
      await expect(
        page.getByRole("button", { name: /주문 상세$/ }),
      ).toHaveCount(0);
    }
  });
}
