import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

test("payment selection, validation, retry and persistence", async ({
  page,
}, testInfo) => {
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/namu-admin\/counter/, { timeout: 20000 });

  for (const [method, label] of [
    ["card", "카드"],
    ["cash", "현금"],
    ["transfer", "입금"],
    ["other", "기타"],
  ]) {
    const result = await page.evaluate(
      async ({ requestId, name }) => {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId,
            order: {
              category: "product",
              sender: {
                name,
                phone: "01012345678",
                privacyConsent: true,
                marketingConsent: false,
              },
              deliveries: [
                {
                  recipient: {
                    name: "수령인",
                    phone: "01012345678",
                    postalCode: "00000",
                    address: "가상 주소",
                    addressDetail: "상세",
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
          }),
        });
        return { status: response.status, data: await response.json() };
      },
      { requestId: randomUUID(), name: `결제${testInfo.project.name}${label}` },
    );
    expect(result.status).toBe(200);
    const number = result.data.orderNumber;
    await page.getByLabel("주문번호", { exact: true }).fill(String(number));
    await page.getByRole("button", { name: "검색", exact: true }).click();
    const row = page.getByRole("button", {
      name: new RegExp(`^${number}번 .* 주문 상세$`),
    });
    await row.click();
    await page.getByRole("button", { name: "결제 완료", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "결제 완료", exact: true });
    await expect(dialog.getByRole("radio")).toHaveCount(4);
    await expect(dialog.locator("input:checked")).toHaveCount(0);
    await dialog.getByRole("button", { name: "확인", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "결제 방식을 선택해주세요.",
    );
    if (method === "card") {
      // Arrow navigation selects just one native radio.
      await dialog.getByRole("radio", { name: "카드", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        dialog.getByRole("radio", { name: "현금", exact: true }),
      ).toBeChecked();
      await dialog
        .getByRole("button", { name: "돌아가기", exact: true })
        .click();
      await page
        .getByRole("button", { name: "결제 완료", exact: true })
        .click();
      await expect(dialog.locator("input:checked")).toHaveCount(0);
    }
    await dialog.getByRole("radio", { name: label, exact: true }).check();
    await expect(dialog.locator("input:checked")).toHaveCount(1);
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    if (method === "other") {
      // The response is lost after the database commits. Retrying remains safe.
      await page.route(
        "**/api/admin/orders/*/pay",
        async (route) => {
          await route.fetch();
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: "테스트: 응답을 받지 못했습니다. 다시 시도해주세요.",
            }),
          });
        },
        { times: 1 },
      );
      await dialog.getByRole("button", { name: "확인", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText(
        "응답을 받지 못했습니다",
      );
      await expect(
        dialog.getByRole("radio", { name: "기타", exact: true }),
      ).toBeChecked();
      // Retry with another method still cannot overwrite the recorded method.
      await dialog.getByRole("radio", { name: "카드", exact: true }).check();
    }
    if (method === "card") {
      await page.screenshot({
        path: testInfo.outputPath("payment-selection.png"),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await dialog.getByRole("button", { name: "확인", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText(label);
    await page.reload();
    await page.getByLabel("주문번호", { exact: true }).fill(String(number));
    await page.getByRole("button", { name: "검색", exact: true }).click();
    await expect(row).toContainText(label);
    const saved = await page.evaluate(
      async (number) =>
        (await (await fetch(`/api/admin/orders?number=${number}`)).json())
          .orders[0],
      number,
    );
    expect(saved.payment_method).toBe(method);
    for (const body of [
      {},
      { paymentMethod: "invalid" },
      { paymentMethod: null },
    ]) {
      const status = await page.evaluate(
        async ({ id, body }) =>
          (
            await fetch(`/api/admin/orders/${id}/pay`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
          ).status,
        { id: saved.id, body },
      );
      expect(status).toBe(400);
    }
    await row.click();
    const detail = page.getByRole("dialog", {
      name: `${number}번 주문`,
      exact: true,
    });
    await expect(detail).toContainText(`결제 완료 · ${label}`);
    await expect(
      detail.getByRole("button", { name: "결제 완료", exact: true }),
    ).toHaveCount(0);
    await detail.getByRole("button", { name: "닫기", exact: true }).click();
  }
});
