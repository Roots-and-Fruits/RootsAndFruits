import { expect, test, type Page } from "@playwright/test";
import {
  emptyOrderDraft,
  draftStorageKey,
} from "../../src/features/orders/draft-storage";

const dialogName = "작성 중인 주문이 있어요";
test.beforeEach(async ({ page }) => {
  await page.route("https://t1.daumcdn.net/**", (route) => route.abort());
});
async function home(page: Page) {
  await page.getByRole("link", { name: "나무와열매 홈" }).click();
  await expect(page).toHaveURL(/\/$/);
}
async function enter(page: Page, category = "product") {
  await page.locator(`a[href="/order/start/${category}?preview=1"]`).click();
}

for (const category of ["product", "experience"]) {
  test(`${category} home entry prompts on saved input, resumes and cancels without disclosure`, async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await enter(page, category);
    await expect(page).toHaveURL(new RegExp(`/preview/${category}$`));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByLabel("보내는 분 이름").fill("이전 작성자");
    await page
      .getByLabel("휴대폰 번호", { exact: true })
      .fill("010-1234-5678 ");
    await page
      .getByRole("checkbox", { name: "전체 동의 (선택 포함)", exact: true })
      .check();
    const key = draftStorageKey(category, true);
    const saved = await page.evaluate((key) => localStorage.getItem(key), key);
    await home(page);
    await enter(page, category);
    const dialog = page.getByRole("dialog", { name: dialogName });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel("보내는 분 이름")).toBeHidden();
    await expect(dialog).not.toContainText("이전 작성자");
    await expect(
      dialog.getByRole("button", { name: "이어 작성하기" }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("resume-choice.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
      saved,
    );
    await enter(page, category);
    await dialog.getByRole("button", { name: "이어 작성하기" }).click();
    await expect(page.getByLabel("보내는 분 이름")).toHaveValue("이전 작성자");
    await expect(page.getByLabel("휴대폰 번호", { exact: true })).toHaveValue(
      "010-1234-5678 ",
    );
    await expect(
      page.getByRole("checkbox", {
        name: "전체 동의 (선택 포함)",
        exact: true,
      }),
    ).toBeChecked();
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("보내는 분 이름")).toHaveValue("이전 작성자");
  });
}

test("start over clears full draft across tabs, history and reload while keeping other storage", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const draft = emptyOrderDraft();
  draft.sender = {
    name: "삭제할 이름",
    phone: "01012345678",
    privacyConsent: true,
    marketingConsent: true,
  };
  draft.deliveries[0].recipient.addressDetail = "남아선 안 되는 주소";
  draft.pendingDelivery = structuredClone(draft.deliveries[0]);
  draft.editDraft = { sender: draft.sender, deliveries: draft.deliveries };
  draft.step = "edit";
  const key = draftStorageKey("product", true);
  const otherKeys = [
    draftStorageKey("experience", true),
    draftStorageKey("product", false),
    "unrelated-login",
  ];
  await page.evaluate(
    ({ key, draft, otherKeys }) => {
      localStorage.setItem(key, JSON.stringify(draft));
      otherKeys.forEach((key) => localStorage.setItem(key, "keep"));
    },
    { key, draft, otherKeys },
  );
  const second = await context.newPage();
  await second.goto("/preview/product");
  await expect(second.getByLabel("보내는 분 이름")).toHaveValue("삭제할 이름");
  await page.goto("/preview/product");
  await home(page);
  await enter(page);
  await page
    .getByRole("dialog", { name: dialogName })
    .getByRole("button", { name: "처음부터", exact: true })
    .click();
  for (const current of [page, second]) {
    await expect(current.getByLabel("보내는 분 이름")).toHaveValue("");
    await expect(
      current.getByRole("checkbox", {
        name: "[필수] 개인정보 수집 및 이용 동의",
        exact: true,
      }),
    ).not.toBeChecked();
    await expect(
      current.getByRole("checkbox", {
        name: "전체 동의 (선택 포함)",
        exact: true,
      }),
    ).not.toBeChecked();
  }
  const storage = await page.evaluate(
    ({ key, otherKeys }) => ({
      draft: localStorage.getItem(key),
      others: otherKeys.map((key) => localStorage.getItem(key)),
    }),
    { key, otherKeys },
  );
  expect(
    storage.draft === null ||
      storage.draft === JSON.stringify(emptyOrderDraft()),
  ).toBe(true);
  expect(storage.others).toEqual(["keep", "keep", "keep"]);
  await page.reload();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/preview\/product$/);
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await home(page);
  await enter(page);
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await second.close();
});

test("home choice restores an unfinished added address at the same step", async ({
  page,
}) => {
  await page.goto("/");
  const draft = emptyOrderDraft();
  draft.sender.name = "작성자";
  draft.step = "address";
  draft.deliveries.push(structuredClone(draft.deliveries[0]));
  draft.activeIndex = 1;
  draft.deliveries[1].recipient.addressDetail = "입력 중 주소";
  await page.evaluate(
    (draft) =>
      localStorage.setItem(
        "roots-and-fruits:order-draft:v1:preview:product",
        JSON.stringify(draft),
      ),
    draft,
  );
  await enter(page);
  await page.getByRole("button", { name: "이어 작성하기" }).click();
  await expect(page.getByLabel("상세주소", { exact: true })).toHaveValue(
    "입력 중 주소",
  );
});

test("empty stored draft skips choice; malformed storage requires a choice and failed deletion stays put", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const key = draftStorageKey("product", true);
  const empty = emptyOrderDraft();
  empty.deliveries[0].recipient.sameAsSender = false;
  await page.evaluate(
    ({ key, empty }) => localStorage.setItem(key, JSON.stringify(empty)),
    { key, empty },
  );
  await enter(page);
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await home(page);
  await page.evaluate((key) => localStorage.setItem(key, "{broken"), key);
  // The entry URL also works when opened directly in another tab.
  const second = await context.newPage();
  await second.goto("/order/start/product?preview=1");
  const dialog = second.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible();
  await second.evaluate(() => {
    Storage.prototype.removeItem = () => {
      throw new Error("blocked");
    };
  });
  await dialog.getByRole("button", { name: "처음부터", exact: true }).click();
  await expect(
    dialog.getByText(/임시 저장 내용을 지우지 못했어요/),
  ).toBeVisible();
  expect(await second.evaluate((key) => localStorage.getItem(key), key)).toBe(
    "{broken",
  );
  await expect(second.getByLabel("보내는 분 이름")).toHaveCount(0);
  await second.reload();
  await dialog.getByRole("button", { name: "처음부터", exact: true }).click();
  await expect(second.getByLabel("보내는 분 이름")).toHaveValue("");
  await second.close();
});
