import { test, expect } from "@playwright/test";

test("POS receipt picker follows payment, pages 25 numbers, skips and confirms duplicates", async ({
  page,
}) => {
  await page.setViewportSize({ width: 775, height: 1150 });
  const order = {
    id: "20000000-0000-4000-8000-000000000099",
    order_number: 99,
    category: "product",
    sender: { name: "영수증테스트", phone: "01012345678" },
    subtotal: 30000,
    discount: 0,
    total: 30000,
    status: "pending",
    payment_method: null as string | null,
    paid_at: null as string | null,
    original_id: null,
    created_at: "2026-10-16T01:00:00Z",
    deliveries: [],
  };
  let number: number | null = null;
  let saves = 0;
  await page.route("**/api/admin/orders?*", (route) =>
    route.fulfill({ json: { orders: [order], count: 1 } }),
  );
  await page.route(`**/api/admin/orders/${order.id}/pay`, (route) => {
    order.status = "paid";
    order.payment_method = "card";
    order.paid_at = "2026-10-16T01:00:00Z";
    return route.fulfill({ json: { ok: true } });
  });
  await page.route(`**/api/admin/pos-receipt/${order.id}`, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { date: "2026-10-16", number } });
    const body = route.request().postDataJSON();
    saves++;
    if (!body.allowDuplicate)
      return route.fulfill({ json: { saved: false, duplicates: [88] } });
    number = body.number;
    return route.fulfill({ json: { saved: true } });
  });
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  const open = () =>
    page
      .getByRole("button", { name: "99번 영수증테스트 주문 상세", exact: true })
      .click();
  await open();
  await page.getByRole("button", { name: "결제 완료", exact: true }).click();
  const payment = page.getByRole("dialog", { name: "결제 완료", exact: true });
  await payment.getByLabel("카드", { exact: true }).check();
  await payment.getByRole("button", { name: "확인", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: "99번 주문 · POS 영수증번호",
    exact: true,
  });
  await expect(
    picker.getByRole("button", { name: "영수증번호 1", exact: true }),
  ).toBeEnabled();
  await expect(
    picker.getByRole("button", { name: /^영수증번호 / }),
  ).toHaveCount(25);
  await picker.getByRole("button", { name: "다음 25개" }).click();
  await expect(
    picker.getByRole("button", { name: "영수증번호 26", exact: true }),
  ).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "영수증번호 50", exact: true }),
  ).toBeVisible();
  await picker.getByRole("button", { name: "건너뛰기 · 닫기" }).click();
  expect(saves).toBe(0);
  expect(order.status).toBe("paid");
  await open();
  await expect(
    page.getByText("POS 영수증번호: 미입력 · 결제일 2026-10-16", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "영수증번호 확인·입력" }).click();
  await picker.getByRole("button", { name: "다음 25개" }).click();
  await picker
    .getByRole("button", { name: "영수증번호 26", exact: true })
    .click();
  await expect(picker.getByText("26번이 이미 사용 중이에요.")).toBeVisible();
  expect(number).toBeNull();
  await picker.getByRole("button", { name: "같은 번호로 저장" }).click();
  await expect(picker).toHaveCount(0);
  expect(number).toBe(26);
  await open();
  await expect(
    page.getByText("POS 영수증번호: 26 · 결제일 2026-10-16", { exact: true }),
  ).toBeVisible();
});
