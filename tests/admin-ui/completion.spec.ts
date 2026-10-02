import { test, expect } from "@playwright/test";

test("completion bank details, countdown, manual navigation and receipt cleanup", async ({
  page,
}, testInfo) => {
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  await page.goto("/");
  for (const category of ["product", "experience"]) {
    await page.evaluate(
      (category) =>
        sessionStorage.setItem(
          "roots-and-fruits:receipt",
          JSON.stringify({ orderNumber: 123, total: 15000, category }),
        ),
      category,
    );
    await page.goto("/order-complete");
    await expect(page.getByText("123번", { exact: true })).toBeVisible();
    const bank = page.getByRole("region", { name: "계좌송금 안내" });
    await expect(bank).toContainText("농협");
    await expect(bank).toContainText("2180-2180-2180-9");
    await expect(bank).toContainText("제주체험종장");
    await expect(page.getByRole("timer")).toContainText("60초");
    if (category === "product") {
      await page.screenshot({
        path: testInfo.outputPath("order-complete-bank.png"),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.clock.fastForward(59000);
    await expect(page).toHaveURL(/\/order-complete$/);
    await expect(page.getByRole("timer")).toContainText("1초");
    await page.clock.fastForward(1000);
    await expect(page).toHaveURL("/");
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("roots-and-fruits:receipt"),
      ),
    ).toBeNull();
  }
  await page.goto("/order-complete");
  await expect(page.getByRole("timer")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "계좌송금 안내" })).toHaveCount(
    0,
  );
  await page.clock.fastForward(65000);
  await expect(page).toHaveURL(/\/order-complete$/);

  await page.evaluate(() =>
    sessionStorage.setItem(
      "roots-and-fruits:receipt",
      JSON.stringify({
        orderNumber: 124,
        total: 20000,
        category: "experience",
      }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "다음 주문 시작" }).click();
  await expect(page).toHaveURL(/\/experience$/);
  await page.clock.fastForward(65000);
  await expect(page).toHaveURL(/\/experience$/);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("roots-and-fruits:receipt"),
    ),
  ).toBeNull();

  await page.evaluate(() =>
    sessionStorage.setItem(
      "roots-and-fruits:receipt",
      JSON.stringify({ orderNumber: 125, total: 20000, category: "product" }),
    ),
  );
  await page.goto("/order-complete");
  await page.getByRole("link", { name: "시작 화면", exact: true }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: /상품 구매/ }).click();
  await expect(page).toHaveURL(/\/product$/);
  await page.clock.fastForward(65000);
  await expect(page).toHaveURL(/\/product$/);
});
