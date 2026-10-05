import { test, expect, type Page, type Route } from "@playwright/test";
import type { Checkout } from "../../src/features/admin/schema";

function makeOrder(number: number): Checkout {
  return {
    id: `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    order_number: number,
    category: "experience",
    sender: {
      name: `갱신고객${number}`,
      phone: "01012345678",
      privacyConsent: true,
      marketingConsent: false,
    },
    subtotal: 7000,
    discount: 0,
    total: 7000,
    status: "pending",
    payment_method: null,
    original_id: null,
    created_at: "2026-10-05T00:00:00Z",
    deliveries: [
      {
        id: `30000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
        tracking_numbers: [],
        position: 1,
        recipient: {
          name: "가상수령인",
          phone: "01012345678",
          postalCode: "00000",
          address: "가상 주소",
          addressDetail: "상세",
        },
        delivery_mode: "regular",
        requested_date: "2026-10-07",
        processing_date: "2026-10-06",
        subtotal: 7000,
        discount: 0,
        total: 7000,
        status: "waiting",
        note: "",
        order_items: [
          {
            id: "item",
            product_id: "40000000-0000-4000-8000-000000000001",
            label: "체험귤",
            weight_grams: null,
            quantity: 1,
            unit_price: 7000,
            bundle_eligible: false,
          },
        ],
      },
    ],
  };
}

async function login(page: Page) {
  // Install before timers exist, but keep the clock running during navigation.
  await page.clock.install();
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/namu-admin\/counter/, { timeout: 20000 });
  const refresh = page.getByRole("button", {
    name: "주문 목록 새로고침",
    exact: true,
  });
  await expect(refresh).toBeEnabled();
  // Freeze only after Next's login/navigation has committed its streamed UI.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await refresh.click();
  await expect(refresh).toHaveText(/10초/);
}

async function visibility(page: Page, state: "hidden" | "visible") {
  // Chromium's headless tab activation does not reliably change visibility.
  await page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => state,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => state === "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

test("counter refresh counts down, keeps list/input/page and recovers without overlapping requests", async ({
  page,
}, info) => {
  const orders = Array.from({ length: 65 }, (_, i) => makeOrder(65 - i));
  const calls: URL[] = [],
    held: Route[] = [];
  let hold = false,
    fail = false;
  const response = (route: Route) => {
    const query = new URL(route.request().url()).searchParams;
    const matches = query.get("number")
      ? orders.filter((o) => String(o.order_number) === query.get("number"))
      : orders;
    const offset = Number(query.get("page")) * 30;
    return {
      orders: matches.slice(offset, offset + 30),
      count: matches.length,
    };
  };
  await page.route("**/api/admin/orders?*", async (route) => {
    calls.push(new URL(route.request().url()));
    if (hold) {
      held.push(route);
      return;
    }
    await route.fulfill(
      fail
        ? { status: 503, json: { error: "테스트 연결 실패" } }
        : { json: response(route) },
    );
  });
  await login(page);
  const button = page.getByRole("button", {
    name: "주문 목록 새로고침",
    exact: true,
  });
  const list = page.getByRole("region", { name: "카운터 주문 목록" });
  let baseline = calls.length;
  await page.getByLabel("주문번호", { exact: true }).fill("42");
  await page.clock.fastForward(9000);
  await expect(button).toContainText("1초");
  expect(calls.length).toBe(baseline);
  await page.screenshot({ path: info.outputPath("counter-countdown.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.clock.fastForward(1000);
  await expect(button).toContainText("10초");
  expect(calls.length).toBe(baseline + 1);
  expect(calls.at(-1)!.searchParams.has("number")).toBe(false);
  await expect(page.getByLabel("주문번호", { exact: true })).toHaveValue("42");

  hold = true;
  baseline = calls.length;
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toContainText("새로고침 중");
  await expect(list).toContainText("갱신고객65");
  await page.clock.fastForward(30000);
  expect(calls.length).toBe(baseline + 1);
  orders[0].sender.name = "변경된고객";
  await held
    .shift()!
    .fulfill({ json: { orders: orders.slice(0, 30), count: 65 } });
  hold = false;
  await expect(button).toContainText("10초");
  await expect(list).toContainText("변경된고객");

  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(button).toContainText("10초");
  await page.clock.fastForward(10000);
  await expect(button).toContainText("10초");
  expect(calls.at(-1)!.searchParams.get("number")).toBe("42");
  await expect(list).toContainText("갱신고객42");
  await expect(list).not.toContainText("변경된고객");
  await page.getByRole("button", { name: "초기화", exact: true }).click();
  await expect(button).toContainText("10초");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByText("2 / 3 · 주문 65건", { exact: true }),
  ).toBeVisible();
  await expect(button).toContainText("10초");
  const scroll = await page.evaluate(() => {
    window.scrollTo(0, 450);
    return scrollY;
  });
  await page.clock.fastForward(10000);
  await expect(button).toContainText("10초");
  expect(calls.at(-1)!.searchParams.get("page")).toBe("1");
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await expect(list).toContainText("갱신고객35");

  fail = true;
  await page.clock.fastForward(10000);
  await expect(
    page.getByRole("alert").filter({ hasText: "테스트 연결 실패" }),
  ).toContainText("이전 목록");
  await expect(list).toContainText("갱신고객35");
  await expect(button).toContainText("10초");
  fail = false;
  await button.click();
  await expect(button).toContainText("10초");
  await expect(
    page.getByRole("alert").filter({ hasText: "테스트 연결 실패" }),
  ).toHaveCount(0);

  await page.clock.resume();
  await page.goto("/namu-admin/orders");
  await expect(
    page.getByRole("region", { name: "주문 관리 목록" }),
  ).toContainText("변경된고객");
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  baseline = calls.length;
  await page.clock.fastForward(30000);
  expect(calls.length).toBe(baseline);
  await expect(
    page.getByRole("button", { name: "새로고침", exact: true }),
  ).toBeEnabled();
});

test("counter pauses for detail/payment/reorder and hidden tabs, then reloads on return or payment", async ({
  page,
}) => {
  const order = makeOrder(999);
  let calls = 0;
  await page.route("**/api/admin/orders?*", async (route) => {
    calls++;
    await route.fulfill({ json: { orders: [order], count: 1 } });
  });
  await page.route(`**/api/admin/orders/${order.id}/pay`, async (route) => {
    order.status = "paid";
    order.payment_method = "card";
    await route.fulfill({ json: {} });
  });
  await login(page);
  const button = page.getByRole("button", {
    name: "주문 목록 새로고침",
    exact: true,
  });
  const open = () =>
    page
      .getByRole("button", { name: "999번 갱신고객999 주문 상세", exact: true })
      .click();
  let baseline = calls;
  await open();
  await page.clock.fastForward(30000);
  expect(calls).toBe(baseline);
  await visibility(page, "hidden");
  await visibility(page, "visible");
  await page.clock.fastForward(10000);
  expect(calls).toBe(baseline);
  const detail = page.getByRole("dialog", { name: "999번 주문", exact: true });
  await detail.getByRole("button", { name: "결제 완료", exact: true }).click();
  const payment = page.getByRole("dialog", { name: "결제 완료", exact: true });
  await payment.getByLabel("카드", { exact: true }).check();
  await page.clock.fastForward(30000);
  expect(calls).toBe(baseline);
  await expect(payment.getByLabel("카드", { exact: true })).toBeChecked();
  await payment.getByRole("button", { name: "확인", exact: true }).click();
  await expect(button).toContainText("10초");
  expect(calls).toBe(baseline + 1);
  await expect(
    page.getByRole("region", { name: "카운터 주문 목록" }),
  ).toContainText("결제 완료");

  await open();
  // Hold catalog loading to exercise the entire reorder screen, including its initial load.
  await page.route("**/api/admin/products", (route) =>
    route.fulfill({ status: 503, json: { error: "재접수 테스트" } }),
  );
  await detail
    .getByRole("button", { name: "주문 재접수", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "999번을 새 주문으로 재접수" }),
  ).toBeVisible();
  baseline = calls;
  await page.clock.fastForward(30000);
  expect(calls).toBe(baseline);
  await page.getByRole("button", { name: "목록으로 돌아가기" }).click();
  await expect(button).toContainText("10초");
  await page.clock.fastForward(10000);
  await expect(button).toContainText("10초");
  expect(calls).toBe(baseline + 1);

  baseline = calls;
  await visibility(page, "hidden");
  await expect(button).toContainText("일시정지");
  await page.clock.fastForward(30000);
  expect(calls).toBe(baseline);
  await visibility(page, "visible");
  await expect(button).toContainText("10초");
  expect(calls).toBe(baseline + 1);
});
