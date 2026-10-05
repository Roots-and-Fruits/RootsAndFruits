import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import type { Checkout } from "../../src/features/admin/schema";

async function file(rows: [string, string][]) {
  const w = new ExcelJS.Workbook(),
    s = w.addWorksheet("Sheet0");
  s.getCell("G1").value = "운송장번호";
  s.getCell("AO1").value = "고객메세지";
  rows.forEach(([key, number], i) => {
    s.getCell(`G${i + 2}`).value = number;
    s.getCell(`AO${i + 2}`).value = key;
  });
  return {
    name: "송장내역.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await w.xlsx.writeBuffer()),
  };
}
async function login(page: Page) {
  await page.goto("/namu-admin/login");
  await page.getByLabel("아이디", { exact: true }).fill("owner");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/namu-admin\/counter/, { timeout: 20000 });
  await page.goto("/namu-admin/shipping");
  await expect(
    page.getByRole("button", { name: "송장번호 업로드", exact: true }),
  ).toBeEnabled();
}
async function upload(page: Page, rows: [string, string][]) {
  await page
    .getByRole("button", { name: "송장번호 업로드", exact: true })
    .click();
  await page.getByLabel("송장 내역 엑셀").setInputFiles(await file(rows));
  await page.getByRole("button", { name: "파일 확인", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "매핑",
  );
}
const origin = { Origin: "http://127.0.0.1:3110" };
test("tracking upload previews errors, retries saved requests, replaces numbers and optionally ships", async ({
  page,
  request,
}, info) => {
  const fixture = await request.post(
    "http://127.0.0.1:3111/__test/shipping-fixture",
    { data: { count: 2 } },
  );
  expect(fixture.ok()).toBe(true);
  const { orders } = (await fixture.json()) as { orders: Checkout[] };
  const target = orders.find(
    (c) => c.deliveries[0].recipient.name === "발송수령인6",
  )!;
  const second = orders.find(
    (c) => c.deliveries[0].recipient.name === "발송수령인7",
  )!;
  const key = `${target.order_number}-1`,
    otherKey = `${second.order_number}-1`;
  await login(page);
  await upload(page, [
    [key, "001234567890"],
    [key, "001234567891"],
    [key, "001234567890"],
    [otherKey, "009999999999"],
    ["", "008888888888"],
    ["999999-1", "007777777777"],
  ]);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("매핑 2곳 · 제외 2행 · 중복 송장 1행");
  await expect(dialog).toContainText("배송 식별자가 없습니다.");
  await expect(dialog).toContainText("배송 식별자에 해당하는 주문이 없습니다.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("tracking-preview.png") });
  const calls: { requestId: string }[] = [];
  await page.route("**/api/admin/tracking/save", async (route) => {
    calls.push(route.request().postDataJSON());
    if (calls.length === 1) {
      const response = await route.fetch();
      expect(response.ok(), await response.text()).toBe(true);
      await route.fulfill({ status: 503, json: { error: "테스트 응답 유실" } });
    } else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "정상 건 저장 (2곳)", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("테스트 응답 유실");
  await dialog
    .getByRole("button", { name: "정상 건 저장 (2곳)", exact: true })
    .click();
  await expect(dialog).toContainText(
    "매핑된 배송 건들을 발송 완료 처리할까요?",
  );
  expect(calls[0].requestId).toBe(calls[1].requestId);
  await expect(dialog).toContainText("송장 3개");
  await expect(dialog).toContainText("출발 예정이 아닌 배송지 1건");
  await page.screenshot({ path: info.outputPath("tracking-saved.png") });
  await dialog
    .getByRole("button", { name: "번호만 저장", exact: true })
    .click();
  const list = page.getByRole("region", { name: "배송지별 발송 목록" });
  await expect(list).toContainText("001234567890, 001234567891");
  await page.unroute("**/api/admin/tracking/save");
  // Replacing one shipment and skipping another must only ship the saved target.
  await upload(page, [
    [key, "000000000001"],
    [otherKey, "000000000002"],
  ]);
  await expect(
    dialog.getByRole("button", { name: "정상 건 저장 (0곳)", exact: true }),
  ).toBeDisabled();
  await page.getByLabel(`${key} 처리 방법`).selectOption("replace");
  await page.getByLabel(`${otherKey} 처리 방법`).selectOption("skip");
  await expect(dialog).toContainText(
    "삭제될 기존 번호: 001234567890, 001234567891",
  );
  await page.screenshot({ path: info.outputPath("tracking-replace.png") });
  await dialog
    .getByRole("button", { name: "정상 건 저장 (1곳)", exact: true })
    .click();
  await expect(dialog).toContainText("발송 대기 1곳");
  let shipCalls = 0;
  await page.route("**/api/admin/ship", async (route) => {
    shipCalls++;
    if (shipCalls === 1)
      await route.fulfill({ status: 503, json: { error: "테스트 발송 실패" } });
    else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "발송 완료 처리", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "송장번호는 저장되었습니다.",
  );
  await dialog
    .getByRole("button", { name: "발송 완료 처리", exact: true })
    .click();
  await expect(dialog).toContainText("발송 완료 처리가 끝났습니다.");
  await dialog
    .getByRole("button", { name: "닫기", exact: true })
    .first()
    .click();
  await expect(list).not.toContainText("발송수령인6");
  await expect(list).toContainText("발송수령인7");
  await upload(page, [[key, "000000000001"]]);
  await dialog
    .getByRole("button", { name: "정상 건 저장 (1곳)", exact: true })
    .click();
  await expect(dialog).toContainText("이미 발송 완료 상태");
  await expect(
    dialog.getByRole("button", { name: "발송 완료 처리", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "닫기", exact: true })
    .first()
    .click();
  await page.goto("/namu-admin/orders");
  const orderRow = page
    .getByRole("region", { name: "주문 관리 목록" })
    .getByRole("listitem")
    .filter({ hasText: `${target.order_number}번` });
  // API confirms shipped orders keep numbers even when absent from the worklist.
  const orderResult = await page.request.get(`/api/admin/orders/${target.id}`);
  expect(
    (await orderResult.json()).orders[0].deliveries[0].tracking_numbers,
  ).toEqual(["000000000001"]);
  const detailButton = orderRow.getByRole("button", { name: /주문 상세$/ });
  await detailButton.click();
  await expect(page.getByRole("dialog")).toContainText(
    "송장번호: 000000000001",
  );
});

test("tracking API enforces authentication, workbook headers, status and concurrent changes", async ({
  page,
  request,
}) => {
  const buffer = (await file([["1-1", "000123456789"]])).buffer;
  const anonymous = await request.post("/api/admin/tracking/preview", {
    headers: origin,
    multipart: {
      file: {
        name: "test.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer,
      },
    },
  });
  expect(anonymous.status()).toBe(401);
  const fixture = await request.post(
    "http://127.0.0.1:3111/__test/shipping-fixture",
    { data: { count: 2 } },
  );
  const { orders } = (await fixture.json()) as { orders: Checkout[] };
  const target = orders.find((c) => c.deliveries[0].status === "exported")!;
  const waiting = orders.find((c) => c.deliveries[0].status === "waiting")!;
  const key = `${target.order_number}-1`;
  await login(page);
  await upload(page, [
    [key, "000123456789"],
    [`${waiting.order_number}-1`, "999123456789"],
  ]);
  await expect(page.getByRole("dialog")).toContainText("엑셀 출력 전 배송지");
  const otherSave = await page.request.post("/api/admin/tracking/save", {
    headers: origin,
    data: {
      requestId: crypto.randomUUID(),
      changes: [
        {
          id: target.deliveries[0].id,
          key,
          version: 0,
          numbers: ["000000000009"],
          mode: "add",
        },
      ],
    },
  });
  expect(otherSave.ok(), await otherSave.text()).toBe(true);
  await page
    .getByRole("button", { name: "정상 건 저장 (1곳)", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "다른 관리자가",
  );
  await page
    .getByRole("button", { name: "파일 다시 확인", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "기존 번호: 000000000009",
  );
  await page.getByLabel(`${key} 처리 방법`).selectOption("add");
  await page
    .getByRole("button", { name: "정상 건 저장 (1곳)", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("송장 2개");
  await page.getByRole("button", { name: "번호만 저장", exact: true }).click();
  const noOrigin = await page.request.post("/api/admin/tracking/save", {
    data: {},
  });
  expect(noOrigin.status()).toBe(403);
  const invalid = new ExcelJS.Workbook();
  invalid.addWorksheet("wrong").getCell("A1").value = "잘못된 양식";
  const wrong = await page.request.post("/api/admin/tracking/preview", {
    headers: origin,
    multipart: {
      file: {
        name: "bad.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(await invalid.xlsx.writeBuffer()),
      },
    },
  });
  expect(wrong.status()).toBe(400);
  expect((await wrong.json()).error).toContain("AO열");
  // Closing after a lost save response must also refresh possibly committed numbers.
  await upload(page, [[key, "000000000007"]]);
  await page.getByLabel(`${key} 처리 방법`).selectOption("add");
  await page.route("**/api/admin/tracking/save", async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.fulfill({ status: 503, json: { error: "저장 응답 유실" } });
  });
  await page
    .getByRole("button", { name: "정상 건 저장 (1곳)", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "저장 응답 유실",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "배송지별 발송 목록" }),
  ).toContainText("000000000007");
});
