import { test, expect } from "@playwright/test";
import {
  emptyOrderDraft,
  draftStorageKey,
} from "../../src/features/orders/draft-storage";

const promptTitle = "로그인하고 더 편하게 주문하세요";

test.beforeAll(async ({ browser }) => {
  const staff = await browser.newContext({ baseURL: "http://127.0.0.1:3110" });
  try {
    const headers = { Origin: "http://127.0.0.1:3110" };
    const login = await staff.request.post("/api/admin/login", {
      headers,
      data: { username: "owner", password: "test-password-123" },
    });
    expect(login.status()).toBe(200);
    const created = await staff.request.post("/api/admin/products", {
      headers,
      data: {
        id: null,
        category: "experience",
        fruit_type: null,
        weight_grams: null,
        description: "로그인 안내 검증용 체험 상품",
        price: 7000,
        is_active: true,
        is_deleted: false,
        inventory_enabled: false,
        stock_quantity: null,
        bundle_eligible: false,
        sort_order: 0,
      },
    });
    expect(created.status(), await created.text()).toBe(200);
  } finally {
    await staff.close();
  }
});

for (const category of ["product", "experience"] as const) {
  test(`${category} guest prompt keeps draft private, closes safely and continues through draft choice`, async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    const key = draftStorageKey(category, false);
    const draft = emptyOrderDraft();
    draft.sender.name = "아직 접수하지 않은 작성자";
    await page.evaluate(
      ({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)),
      { key, draft },
    );
    const enter = () =>
      page.locator(`a[href="/order/start/${category}"]`).click();
    await enter();
    const prompt = page.getByRole("dialog", { name: promptTitle });
    await expect(prompt).toBeVisible();
    await expect(
      prompt.getByRole("button", { name: "카카오 로그인", exact: true }),
    ).toBeFocused();
    await expect(page.getByLabel("보내는 분 이름")).toHaveCount(0);
    await expect(prompt).not.toContainText(draft.sender.name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${category}-login-prompt.png`),
      fullPage: true,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
      JSON.stringify(draft),
    );
    await enter();
    await prompt.getByRole("button", { name: "비회원으로 계속하기" }).click();
    const draftPrompt = page.getByRole("dialog", {
      name: "작성 중인 주문이 있어요",
    });
    await expect(draftPrompt).toBeVisible();
    await draftPrompt.getByRole("button", { name: "이어 작성하기" }).click();
    await expect(page).toHaveURL(new RegExp(`/${category}$`));
    await expect(page.getByLabel("보내는 분 이름")).toHaveValue(
      draft.sender.name,
      { timeout: 20000 }, // The isolated dev server compiles member preferences on first use.
    );
    await page.reload();
    await expect(page.getByRole("dialog", { name: promptTitle })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("보내는 분 이름")).toHaveValue(
      draft.sender.name,
    );
    // Returning to the home CTA prompts again, then "start over" still works.
    await page.getByRole("link", { name: "나무와열매 홈" }).click();
    await enter();
    await prompt.getByRole("button", { name: "비회원으로 계속하기" }).click();
    await draftPrompt
      .getByRole("button", { name: "처음부터", exact: true })
      .click();
    await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  });

  test(`${category} prompt starts Kakao login directly and returns to the selected order`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(`a[href="/order/start/${category}"]`).click();
    const loginRequest = page.waitForRequest(
      (r) => r.url().endsWith("/api/auth/kakao") && r.method() === "POST",
    );
    await page
      .getByRole("dialog", { name: promptTitle })
      .getByRole("button", { name: "카카오 로그인", exact: true })
      .click();
    expect((await loginRequest).postDataJSON()).toEqual({
      next: `/${category}`,
    });
    await expect(page).toHaveURL(new RegExp(`/${category}$`));
    await expect(page.getByLabel("보내는 분 이름")).toBeVisible();
    expect(
      (await (await page.request.get("/api/auth/session")).json()).account.kind,
    ).toBe("kakao");
    await page.getByRole("link", { name: "나무와열매 홈" }).click();
    await page.locator(`a[href="/order/start/${category}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/${category}$`));
    await expect(page.getByRole("dialog", { name: promptTitle })).toHaveCount(
      0,
    );
  });
}

test("staff session still prompts for customer login for both order categories", async ({
  page,
}) => {
  const response = await page.request.post("/api/admin/login", {
    headers: { Origin: "http://127.0.0.1:3110" },
    data: { username: "owner", password: "test-password-123" },
  });
  expect(response.status()).toBe(200);
  expect(
    (await (await page.request.get("/api/auth/session")).json()).account.kind,
  ).toBe("staff");
  for (const category of ["product", "experience"]) {
    await page.goto("/");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "로그인", exact: true }),
    ).toBeVisible();
    await page.locator(`a[href="/order/start/${category}"]`).click();
    const prompt = page.getByRole("dialog", { name: promptTitle });
    await expect(prompt).toBeVisible();
    await expect(page.getByLabel("보내는 분 이름")).toHaveCount(0);
    await prompt.getByRole("button", { name: "비회원으로 계속하기" }).click();
    await expect(page).toHaveURL(new RegExp(`/${category}$`));
    await expect(page.getByLabel("보내는 분 이름")).toBeVisible();
  }
  // Choosing guest checkout must not discard the separate admin session.
  expect(
    (await (await page.request.get("/api/auth/session")).json()).account.kind,
  ).toBe("staff");
});

test("tablet login bypasses the guest prompt for both order categories", async ({
  page,
}) => {
  const response = await page.request.post("/api/auth/tablet-login", {
    headers: { Origin: "http://127.0.0.1:3110" },
    data: { username: "tablet-01", password: "test-password-123" },
  });
  expect(response.status()).toBe(200);
  for (const category of ["product", "experience"]) {
    await page.goto("/");
    await page.locator(`a[href="/order/start/${category}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/${category}$`));
    await expect(page.getByLabel("보내는 분 이름")).toBeVisible();
    await expect(page.getByRole("dialog", { name: promptTitle })).toHaveCount(
      0,
    );
  }
});

test("session and OAuth errors keep input intact and offer retry or guest continuation", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (r) =>
    r.fulfill({ status: 503, json: { error: "로그인 확인 테스트 오류" } }),
  );
  await page.goto("/order/start/product");
  const errorPrompt = page.getByRole("dialog", {
    name: "로그인 상태를 확인해주세요",
    exact: true,
  });
  await expect(errorPrompt).toContainText("로그인 확인 테스트 오류");
  await expect(
    errorPrompt.getByRole("button", { name: "비회원으로 계속하기" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("보내는 분 이름")).toHaveCount(0);
  await page.unroute("**/api/auth/session");
  await errorPrompt.getByRole("button", { name: "다시 확인" }).click();
  const prompt = page.getByRole("dialog", { name: promptTitle });
  await expect(prompt).toBeVisible();
  await page.route("**/api/auth/kakao", (r) =>
    r.fulfill({ status: 503, json: { error: "카카오 연결 테스트 오류" } }),
  );
  await prompt
    .getByRole("button", { name: "카카오 로그인", exact: true })
    .click();
  await expect(prompt.getByRole("alert")).toContainText(
    "카카오 연결 테스트 오류",
  );
  await prompt.getByRole("button", { name: "비회원으로 계속하기" }).click();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
});
