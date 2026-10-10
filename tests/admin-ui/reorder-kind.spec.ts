import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { Checkout } from "../../src/features/admin/schema";

const headers = { Origin: "http://127.0.0.1:3110" };
const orderInput = {
  category: "product",
  sender: {
    name: "재접수 구분 고객",
    phone: "01000000000",
    privacyConsent: true,
    marketingConsent: false,
  },
  deliveries: [1, 2].map((n) => ({
    recipient: {
      name: `가상 수령인${n}`,
      phone: "01000000000",
      postalCode: "00000",
      address: "가상 주소",
      addressDetail: "발송 금지",
    },
    items: [{ productId: "10000000-0000-4000-8000-000000000002", quantity: n }],
    deliveryMode: "regular",
    requestedDate: "",
  })),
};
async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, headers });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function login(page: Page) {
  await page.goto("/namu-admin/login");
  await post(page, "/api/admin/login", {
    username: "owner",
    password: "test-password-123",
  });
}
async function readOrder(page: Page, number: number): Promise<Checkout> {
  return (
    await (await page.request.get(`/api/admin/orders?number=${number}`)).json()
  ).orders[0];
}
async function createOrder(page: Page) {
  const result = await post(page, "/api/orders", {
    requestId: randomUUID(),
    order: orderInput,
  });
  return readOrder(page, result.orderNumber);
}
async function openChoice(page: Page, order: Checkout) {
  await page.goto("/namu-admin/orders");
  await page
    .getByLabel("주문번호", { exact: true })
    .fill(String(order.order_number));
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page
    .getByRole("button", {
      name: `${order.order_number}번 재접수 구분 고객 주문 상세`,
    })
    .click();
  await page.getByRole("button", { name: "주문 재접수", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "재접수 구분 선택" }),
  ).toBeVisible();
}
async function submit(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/reorder") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "새 주문으로 접수", exact: true })
    .click();
  const result = await response;
  expect(result.status(), await result.text()).toBe(200);
  return result.json();
}

test("reorder choice records correction/repeat in list, detail and receipt without changing originals", async ({
  page,
}, info) => {
  await login(page);
  for (const [button, kind, label] of [
    ["주문 수정", "correction", "수정"],
    ["재주문", "repeat", "재주문"],
  ] as const) {
    const original = await createOrder(page);
    await openChoice(page, original);
    const choice = page.getByRole("dialog", { name: "재접수 구분 선택" });
    await choice.screenshot({ path: info.outputPath(`choice-${kind}.png`) });
    expect(
      await choice.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await choice.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(
      page.getByRole("dialog", {
        name: `${original.order_number}번 주문`,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "주문 재접수", exact: true })
      .click();
    await page.getByRole("button", { name: button, exact: true }).click();
    if (kind === "correction")
      await page.getByRole("button", { name: "원본 유지하고 수정" }).click();
    await expect(
      page.getByRole("heading", {
        name: `${original.order_number}번 주문 · ${label}`,
      }),
    ).toBeVisible();
    await page
      .getByLabel("받는 분 이름", { exact: true })
      .first()
      .fill("구분 확인 수령인");
    const result = await submit(page);
    const created = await readOrder(page, result.orderNumber);
    expect(created.reorder_kind).toBe(kind);
    expect(created.original_id).toBe(original.id);
    expect(created.deliveries).toHaveLength(2);
    expect(await readOrder(page, original.order_number)).toEqual(original);
    await page
      .getByLabel("주문번호", { exact: true })
      .fill(String(result.orderNumber));
    await page.getByRole("button", { name: "검색", exact: true }).click();
    const row = page.getByRole("button", {
      name: `${result.orderNumber}번 재접수 구분 고객 주문 상세`,
    });
    await expect(row).toContainText(`${label} 원본 ${original.order_number}번`);
    await row.click();
    await expect(page.getByRole("dialog")).toContainText(
      `${label} 원본 ${original.order_number}번`,
    );
    await page.goto(`/namu-admin/print/${created.id}`);
    await expect(page.getByRole("article")).toContainText(
      `${label} 원본 ${original.order_number}번`,
    );
  }
});

test("correction can explicitly cancel pending/paid originals and cancellation survives editor exit", async ({
  page,
}, info) => {
  await login(page);
  for (const paid of [false, true]) {
    const original = await createOrder(page);
    if (paid)
      await post(page, `/api/admin/orders/${original.id}/pay`, {
        paymentMethod: "card",
      });
    await openChoice(page, original);
    await page.getByRole("button", { name: "주문 수정", exact: true }).click();
    const warning = page.getByRole("dialog", { name: "원본 주문 취소 안내" });
    await expect(warning).toContainText("접수를 중단해도 원본 취소는 유지");
    await warning.screenshot({ path: info.outputPath(`cancel-${paid}.png`) });
    expect(
      await warning.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.route(
      `**/api/admin/orders/${original.id}/cancel`,
      (route) =>
        route.fulfill({
          status: 503,
          json: { error: "취소 연결 테스트 오류" },
        }),
      { times: 1 },
    );
    await warning.getByRole("button", { name: "원본 취소 후 수정" }).click();
    await expect(warning.getByRole("alert")).toContainText(
      "취소 연결 테스트 오류",
    );
    expect((await readOrder(page, original.order_number)).status).toBe(
      paid ? "paid" : "pending",
    );
    await warning.getByRole("button", { name: "원본 취소 후 수정" }).click();
    await expect(
      page.getByRole("heading", {
        name: `${original.order_number}번 주문 · 수정`,
      }),
    ).toBeVisible();
    const cancelled = await readOrder(page, original.order_number);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.payment_method).toBe(paid ? "card" : null);
    await expect(
      page.getByText("원본 주문은 취소 상태입니다.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "취소", exact: true }).click();
    expect((await readOrder(page, original.order_number)).status).toBe(
      "cancelled",
    );
    await openChoice(page, cancelled);
    await page.getByRole("button", { name: "주문 수정", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: `${original.order_number}번 주문 · 수정`,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "원본 주문 취소 안내" }),
    ).toHaveCount(0);
    const result = await submit(page);
    expect((await readOrder(page, result.orderNumber)).reorder_kind).toBe(
      "correction",
    );
  }
});

test("correction respects export cancellation limits including a stale detail", async ({
  page,
}, info) => {
  await login(page);
  const original = await createOrder(page);
  await post(page, `/api/admin/orders/${original.id}/pay`, {
    paymentMethod: "cash",
  });
  await openChoice(page, original);
  await page.getByRole("button", { name: "주문 수정", exact: true }).click();
  await post(page, "/api/admin/exports", {
    requestId: randomUUID(),
    ids: [original.deliveries[0].id],
  });
  const warning = page.getByRole("dialog", { name: "원본 주문 취소 안내" });
  await warning.getByRole("button", { name: "원본 취소 후 수정" }).click();
  await expect(warning.getByRole("alert")).toContainText("취소할 수 없습니다");
  expect((await readOrder(page, original.order_number)).status).toBe("paid");
  await openChoice(page, original);
  const choice = page.getByRole("dialog", { name: "재접수 구분 선택" });
  await expect(choice).toContainText("재주문만 가능합니다");
  await expect(
    choice.getByRole("button", { name: "주문 수정", exact: true }),
  ).toHaveCount(0);
  await choice.screenshot({ path: info.outputPath("repeat-only.png") });
  await post(page, "/api/admin/ship", { ids: [original.deliveries[0].id] });
  await openChoice(page, original);
  await expect(
    choice.getByRole("button", { name: "주문 수정", exact: true }),
  ).toHaveCount(0);
  await choice.getByRole("button", { name: "재주문", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: `${original.order_number}번 주문 · 재주문`,
    }),
  ).toBeVisible();
});

test("unanswered typed and legacy reorders keep their request and kind without cancelling the original", async ({
  page,
}) => {
  await login(page);
  for (const typed of [true, false]) {
    const original = await createOrder(page);
    const pending = {
      requestId: randomUUID(),
      order: orderInput,
      ...(typed ? { reorderKind: "repeat" } : {}),
    };
    // A completed request whose response never reached the browser.
    const committed = await post(
      page,
      `/api/admin/orders/${original.id}/reorder`,
      pending,
    );
    await page.evaluate(
      ({ id, pending }) =>
        localStorage.setItem(
          `roots-and-fruits:submission:admin:${id}`,
          JSON.stringify(pending),
        ),
      { id: original.id, pending },
    );
    await openChoice(page, original);
    await page.getByRole("button", { name: "주문 수정", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: `${original.order_number}번 주문 · ${typed ? "재주문" : "재접수"}`,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "원본 주문 취소 안내" }),
    ).toHaveCount(0);
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/reorder") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "보낸 재접수 요청의 결과 확인" })
      .click();
    const recovered = await response;
    expect(recovered.request().postDataJSON()).toEqual(pending);
    expect((await recovered.json()).orderNumber).toBe(committed.orderNumber);
    expect((await readOrder(page, committed.orderNumber)).reorder_kind).toBe(
      typed ? "repeat" : null,
    );
    expect(await readOrder(page, original.order_number)).toEqual(original);
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            localStorage.getItem(`roots-and-fruits:submission:admin:${id}`),
          original.id,
        ),
      )
      .toBeNull();
  }
});
