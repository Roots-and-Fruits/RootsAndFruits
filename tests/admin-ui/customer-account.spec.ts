import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { Checkout } from "../../src/features/admin/schema";
import { emptyOrderDraft } from "../../src/features/orders/draft-storage";
const origin = { Origin: "http://127.0.0.1:3110" };
const base = "http://127.0.0.1:3110";
const draftKey = "roots-and-fruits:order-draft:v1:live:product";
const orderInput = {
  category: "product",
  sender: {
    name: "회원 주문 발송인",
    phone: "01000000000",
    privacyConsent: true,
    marketingConsent: false,
  },
  deliveries: [1, 2].map((n) => ({
    recipient: {
      name: `회원 수령인${n}`,
      phone: "01000000000",
      postalCode: "00000",
      address: "주문 당시 주소",
      addressDetail: "테스트 전용",
    },
    items: [{ productId: "10000000-0000-4000-8000-000000000002", quantity: n }],
    deliveryMode: "regular",
    requestedDate: "",
  })),
};
async function fixtureLogin(page: Page, user = 2) {
  const fixture = await (
    await page.request.get(
      `http://127.0.0.1:3111/__test/auth-session?user=${user}`,
    )
  ).json();
  await page.context().addCookies([
    {
      name: "sb-127-auth-token",
      value: `base64-${Buffer.from(JSON.stringify(fixture)).toString("base64url")}`,
      url: base,
    },
    { name: "rf-customer-epoch", value: randomUUID(), url: base },
  ]);
}
async function send(page: Page, path: string, data: unknown, method = "POST") {
  const response = await page.request.fetch(path, {
    method,
    headers: origin,
    data,
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function preferences(page: Page) {
  return (await page.request.get("/api/account/preferences")).json();
}
async function clearAddresses(page: Page) {
  for (const address of (await preferences(page)).addresses)
    await send(
      page,
      `/api/account/addresses/${address.id}`,
      undefined,
      "DELETE",
    );
}
async function addressSearch(page: Page) {
  // Only the postcode provider is replaced; forms, APIs and DB are real isolated app code.
  await page.addInitScript(() => {
    (window as unknown as { daum: unknown }).daum = {
      Postcode: class {
        options: { oncomplete: (value: unknown) => void };
        constructor(options: { oncomplete: (value: unknown) => void }) {
          this.options = options;
        }
        open() {
          this.options.oncomplete({
            zonecode: "12345",
            address: "가상 도로 123",
            addressType: "R",
            bname: "",
            buildingName: "",
          });
        }
      },
    };
  });
  await page.route("https://t1.daumcdn.net/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
}

test("customer sender and address book save explicitly, fill orders and preserve order-specific edits", async ({
  page,
}, info) => {
  await fixtureLogin(page);
  await clearAddresses(page);
  await addressSearch(page);
  await page.goto("/account/sender");
  await page.getByLabel("보내는 분 이름").fill("저장한 기본 발송인");
  await page.getByLabel("휴대폰 번호").fill("01012345678");
  await page.getByRole("button", { name: "기본 보내는 분 저장" }).click();
  await expect(page.getByRole("status")).toContainText("기본 보내는 분을 저장");
  await page
    .getByRole("navigation", { name: "마이페이지 메뉴" })
    .getByRole("link", { name: "주소록", exact: true })
    .click();
  await page.getByRole("button", { name: "배송지 추가" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("배송지 이름").fill("부모님 댁");
  await dialog.getByLabel("받는 분 이름").fill("저장한 수령인");
  await dialog.getByLabel("휴대폰 번호").fill("01033334444");
  await dialog.getByRole("button", { name: "주소 검색", exact: true }).click();
  await dialog.getByLabel("상세주소").fill("101동 1001호");
  await dialog.getByRole("checkbox", { name: "기본 배송지로 지정" }).check();
  await dialog.screenshot({ path: info.outputPath("address-editor.png") });
  await dialog
    .getByRole("button", { name: "배송지 저장", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("main")).toContainText("부모님 댁");
  expect((await preferences(page)).addresses).toHaveLength(1);
  await page.screenshot({
    path: info.outputPath("address-book.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/product");
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue(
    "저장한 기본 발송인",
  );
  await expect(
    page.getByRole("checkbox", {
      name: "[필수] 개인정보 수집 및 이용 동의",
      exact: true,
    }),
  ).not.toBeChecked();
  await page.getByLabel("보내는 분 이름").fill("이번 주문만 발송인");
  await page.reload();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue(
    "이번 주문만 발송인",
  );
  await page
    .getByRole("checkbox", {
      name: "[필수] 개인정보 수집 및 이용 동의",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "주소록에서 선택" }).click();
  await dialog.getByRole("button", { name: /부모님 댁/ }).click();
  await expect(page.getByLabel("받는 분 이름")).toHaveValue("저장한 수령인");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByLabel("상세주소")).toHaveValue("101동 1001호");
  await page.getByLabel("상세주소").fill("이번 주문용 상세주소");
  expect((await preferences(page)).addresses[0].addressDetail).toBe(
    "101동 1001호",
  );
  expect((await preferences(page)).sender.name).toBe("저장한 기본 발송인");
  await page.getByRole("button", { name: "이 배송지 주소록에 저장" }).click();
  await dialog.getByLabel("배송지 이름").fill("다른 배송지");
  await dialog
    .getByRole("button", { name: "배송지 저장", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect((await preferences(page)).addresses).toHaveLength(2);
  await page.goto("/account/addresses");
  const card = page.locator("article").filter({ hasText: "다른 배송지" });
  await card.getByRole("button", { name: "수정", exact: true }).click();
  await dialog.getByLabel("상세주소").fill("주소록 수정됨");
  await dialog
    .getByRole("button", { name: "배송지 저장", exact: true })
    .click();
  await expect(card).toContainText("주소록 수정됨");
  await card.getByRole("button", { name: "삭제", exact: true }).click();
  await dialog
    .getByRole("button", { name: "배송지 삭제", exact: true })
    .click();
  await expect(card).toHaveCount(0);
});

test("customer order history shows snapshots, multiple tracking links and cancellation but not staff reorders", async ({
  page,
  browser,
}, info) => {
  await fixtureLogin(page);
  const created = await send(page, "/api/orders", {
    requestId: randomUUID(),
    order: orderInput,
  });
  const cancelled = await send(page, "/api/orders", {
    requestId: randomUUID(),
    order: orderInput,
  });
  const adminContext = await browser.newContext();
  try {
    const admin = await adminContext.newPage();
    await fixtureLogin(admin, 0);
    const find = async (number: number): Promise<Checkout> =>
      (
        await (
          await admin.request.get(`/api/admin/orders?number=${number}`)
        ).json()
      ).orders[0];
    const original = await find(created.orderNumber),
      cancelledOrder = await find(cancelled.orderNumber);
    await send(admin, `/api/admin/orders/${original.id}/pay`, {
      paymentMethod: "card",
    });
    await send(admin, "/api/admin/exports", {
      requestId: randomUUID(),
      ids: original.deliveries.map((d) => d.id),
    });
    await send(admin, "/api/admin/tracking/save", {
      requestId: randomUUID(),
      changes: original.deliveries.map((d, i) => ({
        id: d.id,
        key: `${original.order_number}-${d.position}`,
        version: 0,
        mode: "add",
        numbers: i ? ["265112726034"] : ["001234567890", "001234567891"],
      })),
    });
    await send(admin, "/api/admin/ship", { ids: [original.deliveries[0].id] });
    await send(admin, `/api/admin/notes/${original.deliveries[0].id}`, {
      note: "관리자 전용 비밀 메모",
    });
    await send(admin, `/api/admin/orders/${cancelledOrder.id}/cancel`, {});
    const repeat = await send(
      admin,
      `/api/admin/orders/${cancelledOrder.id}/reorder`,
      { requestId: randomUUID(), order: orderInput, reorderKind: "repeat" },
    );
    const repeatOrder = await find(repeat.orderNumber);
    expect(
      (
        await page.request.get(`/api/account/orders/${repeatOrder.id}`)
      ).status(),
    ).toBe(404);
    await page.goto("/account/orders");
    await expect(page.locator("main")).toContainText("2곳 중 1곳 발송");
    await expect(
      page
        .getByRole("link", {
          name: "001234567890 롯데택배 배송조회 (새 창)",
          exact: true,
        })
        .first(),
    ).toHaveAttribute(
      "href",
      "https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=001234567890",
    );
    const cancelledCard = page
      .locator("article")
      .filter({
        has: page.getByRole("link", {
          name: `주문 ${cancelled.orderNumber}번`,
          exact: true,
        }),
      });
    await expect(cancelledCard).toContainText("취소");
    await expect(
      page.getByRole("link", {
        name: `주문 ${repeat.orderNumber}번`,
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: `주문 ${created.orderNumber}번`, exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: `주문 ${created.orderNumber}번`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("main")).toContainText("주문 당시 주소");
    await expect(page.locator("main")).not.toContainText(
      "관리자 전용 비밀 메모",
    );
    await expect(
      page.getByRole("link", { name: /롯데택배 배송조회/ }),
    ).toHaveCount(3);
    await expect(page.locator("main")).not.toContainText("배송 완료");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("customer-order.png"),
      fullPage: true,
    });
  } finally {
    await adminContext.close();
  }
});

test("customer API denies other members, tablets and guests; rejects forged owner and cross-site writes", async ({
  page,
  browser,
}) => {
  await fixtureLogin(page);
  const id = randomUUID();
  const address = {
    name: "내 수령인",
    phone: "01000000000",
    label: "내 주소",
    postalCode: "00000",
    address: "가상 주소",
    addressDetail: "상세",
    isDefault: false,
  };
  await send(page, `/api/account/addresses/${id}`, address, "PUT");
  const result = await send(page, "/api/orders", {
    requestId: randomUUID(),
    order: orderInput,
  });
  const own = (
    await (await page.request.get("/api/account/orders")).json()
  ).orders.find(
    (o: { order_number: number }) => o.order_number === result.orderNumber,
  );
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    expect((await other.request.get("/api/account/preferences")).status()).toBe(
      401,
    );
    await fixtureLogin(other, 1);
    expect((await other.request.get("/api/account/preferences")).status()).toBe(
      403,
    );
    await fixtureLogin(other, 3);
    expect(
      (await preferences(other)).addresses.some(
        (x: { id: string }) => x.id === id,
      ),
    ).toBe(false);
    expect(
      (await other.request.get(`/api/account/orders/${own.id}`)).status(),
    ).toBe(404);
    expect(
      (
        await other.request.put(`/api/account/addresses/${id}`, {
          headers: origin,
          data: address,
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await other.request.put("/api/account/sender", {
          headers: origin,
          data: {
            name: "위조",
            phone: "01000000000",
            member_id: "00000000-0000-4000-8000-000000000003",
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await other.request.put("/api/account/sender", {
          headers: { Origin: "https://example.com" },
          data: { name: "위조", phone: "01000000000" },
        })
      ).status(),
    ).toBe(403);
    const response = await other.request.get(`/api/account/orders/${own.id}`);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  } finally {
    await otherContext.close();
  }
});

test("successful login/logout clear drafts, pending requests and receipts across tabs and history; failed login preserves input", async ({
  page,
  context,
}) => {
  await page.goto("/product");
  await page.getByLabel("보내는 분 이름").fill("로그인 전 입력");
  await page.goto("/auth/callback?error=access_denied&next=/product");
  await page.goto("/product");
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("로그인 전 입력");
  await page.evaluate((key) => {
    localStorage.setItem(
      "roots-and-fruits:order-draft:v1:live:experience",
      localStorage.getItem(key)!,
    );
    localStorage.setItem(
      "roots-and-fruits:submission:experience",
      JSON.stringify({
        requestId: "fake-unknown",
        order: { sender: { name: "지워질 개인정보" } },
      }),
    );
    sessionStorage.setItem(
      "roots-and-fruits:receipt",
      JSON.stringify({ orderNumber: 999, total: 10, category: "product" }),
    );
  }, draftKey);
  await page.goto("/login?next=/account/orders");
  await page
    .getByRole("button", { name: "카카오 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account\/orders$/);
  await expect(page.locator("aside[role=alert]")).toContainText(
    "접수 여부를 확인",
  );
  const storage = await page.evaluate(() => ({
    keys: Object.keys(localStorage).filter(
      (k) =>
        k.includes("order-draft") ||
        k.startsWith("roots-and-fruits:submission:"),
    ),
    receipt: sessionStorage.getItem("roots-and-fruits:receipt"),
  }));
  expect(storage.keys).toEqual([]);
  expect(storage.receipt).toBeNull();
  await page.getByRole("button", { name: "확인했어요" }).click();
  await page.goto("/product");
  await page.getByLabel("보내는 분 이름").fill("로그아웃 전 입력");
  const otherTab = await context.newPage();
  await otherTab.goto("/product");
  await expect(otherTab.getByLabel("보내는 분 이름")).toHaveValue(
    "로그아웃 전 입력",
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(otherTab.getByLabel("보내는 분 이름")).toHaveValue("");
  await otherTab.reload();
  await expect(otherTab.getByLabel("보내는 분 이름")).toHaveValue("");
  await page.goBack();
  await page.goto("/product");
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await otherTab.close();
});

test("late order response cannot repopulate receipt or pending data after logout", async ({
  page,
  context,
}) => {
  await fixtureLogin(page);
  await page.goto("/product");
  await expect(page.getByLabel("보내는 분 이름")).toBeVisible();
  await page.evaluate(
    (order) =>
      localStorage.setItem(
        "roots-and-fruits:submission:product",
        JSON.stringify({ requestId: crypto.randomUUID(), order }),
      ),
    orderInput,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "접수 결과를 확인해주세요." }),
  ).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let sent!: () => void;
  const received = new Promise<void>((resolve) => {
    sent = resolve;
  });
  await page.route("**/api/orders", async (route) => {
    sent();
    await gate;
    await route.fulfill({ json: { orderNumber: 888, total: 10000 } });
  });
  try {
    await page.getByRole("button", { name: "주문 접수", exact: true }).click();
    await received;
    const other = await context.newPage();
    await other.goto("/login");
    await other.getByRole("button", { name: "로그아웃", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "보내는 분을 알려주세요." }),
    ).toBeVisible();
    release();
    await expect
      .poll(async () =>
        page.evaluate(() => sessionStorage.getItem("roots-and-fruits:receipt")),
      )
      .toBeNull();
    expect(
      await page.evaluate(() =>
        localStorage.getItem("roots-and-fruits:submission:product"),
      ),
    ).toBeNull();
    await expect(page).not.toHaveURL(/order-complete/);
    await other.close();
  } finally {
    release();
  }
});

test("address save inside order edit stays in the editor and a slow profile reload cannot overwrite inputs", async ({
  page,
}) => {
  await fixtureLogin(page);
  await clearAddresses(page);
  await page.goto("/product");
  await expect(page.getByLabel("보내는 분 이름")).toBeVisible();
  const draft = {
    ...emptyOrderDraft(),
    sender: orderInput.sender,
    deliveries: orderInput.deliveries,
    step: "edit",
  };
  await page.evaluate(
    ({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)),
    { key: draftKey, draft },
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "주문 정보를 수정해주세요." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "이 배송지 주소록에 저장" })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "주소록에 저장" });
  await dialog.getByLabel("배송지 이름").fill("통합 수정에서 저장");
  await dialog
    .getByRole("button", { name: "배송지 저장", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "주문 정보를 수정해주세요." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "주소록에서 선택" }).last().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /통합 수정에서 저장/ })
    .click();
  await expect(page.getByLabel("받는 분 이름").last()).toHaveValue(
    "회원 수령인1",
  );
  await page.getByRole("button", { name: "수정 완료", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "보내는 마음, 한 번 더 확인해요." }),
  ).toBeVisible();
  let fail = true;
  await page.route("**/api/account/preferences", async (route) => {
    if (fail)
      await route.fulfill({ status: 503, json: { error: "테스트 일시 오류" } });
    else await route.continue();
  });
  await page.evaluate((key) => localStorage.removeItem(key), draftKey);
  await page.reload();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await page.getByLabel("보내는 분 이름").fill("직접 입력 유지");
  fail = false;
  await page.getByRole("button", { name: "회원 정보 다시 불러오기" }).click();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("직접 입력 유지");
});
