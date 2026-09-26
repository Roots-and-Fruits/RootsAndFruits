import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // External postcode service is deliberately excluded from deterministic UI tests.
  await page.route("https://t1.daumcdn.net/**", (route) => route.abort());
});

async function sender(page: Page) {
  await page.getByLabel("보내는 분 이름").fill("보내는사람");
  await page.getByLabel("휴대폰 번호", { exact: true }).fill("01012345678");
  await page
    .getByRole("checkbox", {
      name: "[필수] 개인정보 수집 및 이용 동의",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
}
async function recipient(page: Page, name: string) {
  await page.getByLabel("받는 분 이름").fill(name);
  await page.getByLabel("받는 분 휴대폰 번호").fill("01098765432");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page
    .getByRole("button", { name: "미리보기용 가상 주소 채우기" })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
}

test("home and order entry have no horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /좋은 과일에,\s*보내는 마음을 담아\./ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
  });
  await page.goto("/preview/product");
  await expect(
    page.getByRole("heading", { name: "보내는 분을 알려주세요." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("sender.png"),
    fullPage: true,
  });
});

test("multiple recipients select independently; review calculates a combined total", async ({
  page,
}, testInfo) => {
  await page.goto("/preview/product");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByText("보내는 분의 이름을 입력해주세요.", { exact: true }),
  ).toBeVisible();
  await sender(page);
  await recipient(page, "우리집");
  await expect(
    page.getByRole("button", { name: "다음", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "감귤 3kg · 선물용 · 대과 수량 늘리기",
      exact: true,
    })
    .click();
  await expect(page.getByText("품절", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다른 배송지 추가" }).click();
  await expect(page.getByLabel("받는 분 이름")).toHaveValue("");
  await recipient(page, "부모님집");
  await expect(
    page.getByRole("button", { name: "다음", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("감귤 3kg · 선물용 · 대과 수량", { exact: true }),
  ).toHaveText("0");
  await page
    .getByRole("button", {
      name: "한라봉 3kg · 선물용 수량 늘리기",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "배송지 1 주문 요약" }),
  ).toContainText("우리집");
  await expect(
    page.getByRole("region", { name: "배송지 2 주문 요약" }),
  ).toContainText("부모님집");
  await expect(
    page.getByText("75,000원", { exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "미리보기 · 실제 접수 불가" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("review.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "배송지 2 수정", exact: true })
    .click();
  const firstEdit = page.getByRole("region", {
    name: "배송지 1 수정",
    exact: true,
  });
  const secondEdit = page.getByRole("region", {
    name: "배송지 2 수정",
    exact: true,
  });
  await secondEdit
    .getByLabel("받는 분 이름", { exact: true })
    .fill("수정한 부모님집");
  await firstEdit
    .getByLabel("상세주소", { exact: true })
    .fill("변경한 상세주소");
  await page
    .getByLabel("보내는 분 이름", { exact: true })
    .fill("수정한 보내는사람");
  await expect(
    page.getByRole("button", { name: "다음", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath("edit.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "수정 완료", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "배송지 2 주문 요약" }),
  ).toContainText("수정한 부모님집");
  await expect(
    page.getByRole("region", { name: "배송지 1 주문 요약" }),
  ).toContainText("변경한 상세주소");
  await expect(
    page.getByText("수정한 보내는사람", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("75,000원", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "처음부터", exact: true }).click();
  await page.getByRole("button", { name: "입력 초기화", exact: true }).click();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
});

test("experience skips delivery date selection and draft has no automatic reset", async ({
  page,
}) => {
  await page.goto("/preview/experience");
  await sender(page);
  await recipient(page, "체험수령인");
  await page
    .getByRole("button", {
      name: "체험 감귤 3kg · 체험 과일 택배 수량 늘리기",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "보내는 마음, 한 번 더 확인해요." }),
  ).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(10 * 60 * 1000);
  await expect(
    page.getByRole("region", { name: "배송지 1 주문 요약" }),
  ).toContainText("체험수령인");
});

test("unconfigured public catalog never uses preview products; admin has no bypass", async ({
  page,
}) => {
  await page.goto("/product");
  await expect(
    page.getByRole("heading", { name: "주문 서비스를 준비하고 있어요." }),
  ).toBeVisible();
  await expect(page.getByText("30,000원", { exact: true })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(
    page.getByRole("heading", { name: "관리자 로그인" }),
  ).toBeVisible();
});

async function firstReview(page: Page, category = "product") {
  await page.goto(`/preview/${category}`);
  await sender(page);
  await recipient(page, "우리집");
  await page
    .getByRole("button", {
      name:
        category === "product"
          ? "감귤 3kg · 선물용 · 대과 수량 늘리기"
          : "체험 감귤 3kg · 체험 과일 택배 수량 늘리기",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  if (category === "product")
    await page.getByRole("button", { name: "다음", exact: true }).click();
}

test("phone submit normalization, explicit consent, locked contact and postcode keyboard search", async ({
  page,
}, testInfo) => {
  await page.route("https://t1.daumcdn.net/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.daum = { Postcode: class { constructor(options) { this.options = options; } open() { this.options.oncomplete({ zonecode: '12345', address: '테스트 도로명 주소', addressType: 'R', bname: '', buildingName: '' }); } } };`,
    }),
  );
  await page.goto("/preview/product");
  const all = page.getByRole("checkbox", {
    name: "전체 동의 (선택 포함)",
    exact: true,
  });
  const required = page.getByRole("checkbox", {
    name: "[필수] 개인정보 수집 및 이용 동의",
    exact: true,
  });
  const optional = page.getByRole("checkbox", {
    name: "[선택] 마케팅 활용 동의",
    exact: true,
  });
  await expect(all).not.toBeChecked();
  await expect(required).not.toBeChecked();
  await expect(optional).not.toBeChecked();
  await all.check();
  await expect(required).toBeChecked();
  await expect(optional).toBeChecked();
  await all.uncheck();
  await expect(required).not.toBeChecked();
  await expect(optional).not.toBeChecked();
  await all.check();
  await optional.uncheck();
  await expect(all).toHaveAttribute("aria-checked", "mixed");
  await page.getByLabel("보내는 분 이름").fill("보내는사람");
  const phone = page.getByLabel("휴대폰 번호", { exact: true });
  await phone.fill(" 010-12 34-5678 abc한글 \t");
  await expect(phone).toHaveValue(" 010-12 34-5678 abc한글 \t");
  await phone.blur();
  await expect(phone).toHaveValue(" 010-12 34-5678 abc한글 \t");
  await expect(phone).toHaveAttribute("inputmode", "numeric");
  if (testInfo.project.name === "mobile") {
    await expect(
      page.getByRole("progressbar", { name: "주문 진행 단계" }),
    ).toHaveAttribute("aria-valuenow", "1");
    await expect(
      page.getByRole("list", { name: "주문 진행 단계" }),
    ).toHaveCount(0);
  } else {
    const circle = page
      .getByRole("list", { name: "주문 진행 단계" })
      .locator("li > span")
      .first();
    expect((await circle.boundingBox())!.width).toBe(44);
  }
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("checkbox", { name: "보내는 사람과 같아요" }).check();
  await expect(page.getByLabel("받는 분 이름")).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("받는 분 휴대폰 번호")).toHaveValue(
    "01012345678",
  );
  await expect(page.getByText(/직접 수정하려면 위 선택을 해제/)).toBeVisible();
  const lockedBackground = await page
    .getByText(/직접 수정하려면 위 선택을 해제/)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect(page.getByLabel("받는 분 이름")).toHaveCSS(
    "background-color",
    lockedBackground,
  );
  await expect(page.getByLabel("받는 분 휴대폰 번호")).toHaveCSS(
    "background-color",
    lockedBackground,
  );
  await page.screenshot({
    path: testInfo.outputPath("locked-recipient.png"),
    fullPage: true,
  });
  await page.getByRole("checkbox", { name: "보내는 사람과 같아요" }).uncheck();
  await expect(page.getByLabel("받는 분 이름")).toBeEditable();
  await page.getByLabel("받는 분 휴대폰 번호").fill("010 98-76a5432");
  await expect(page.getByLabel("받는 분 휴대폰 번호")).toHaveValue(
    "010 98-76a5432",
  );
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const postcode = page.getByRole("button", {
    name: "우편번호 · 주소 검색",
    exact: true,
  });
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(page.getByLabel("받는 분 휴대폰 번호")).toHaveValue(
    "01098765432",
  );
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await postcode.click();
  await expect(postcode).toHaveValue("12345");
  await expect(page.getByLabel("주소", { exact: true })).toHaveValue(
    "테스트 도로명 주소",
  );
  await expect(page.getByLabel("상세주소", { exact: true })).toBeFocused();
  for (const key of ["Enter", "Space"]) {
    await postcode.focus();
    await postcode.press(key);
    await expect(page.getByLabel("상세주소", { exact: true })).toBeFocused();
  }
});

for (const category of ["product", "experience"]) {
  test(`${category}: back from added delivery returns to review and preserves unfinished input`, async ({
    page,
  }) => {
    await firstReview(page, category);
    await page.getByRole("button", { name: "다른 배송지 추가" }).click();
    await page.getByLabel("받는 분 이름").fill("작성중 수령인");
    await page.getByRole("button", { name: "이전", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "보내는 마음, 한 번 더 확인해요." }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "배송지 1 주문 요약" }),
    ).toContainText("우리집");
    await expect(
      page.getByRole("region", { name: "배송지 2 주문 요약" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "배송지 추가 이어쓰기" }).click();
    await expect(page.getByLabel("받는 분 이름")).toHaveValue("작성중 수령인");
    await page.getByLabel("받는 분 휴대폰 번호").fill("01011112222");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page
      .getByRole("button", { name: "미리보기용 가상 주소 채우기" })
      .click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "다음", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", {
        name:
          category === "product"
            ? "한라봉 3kg · 선물용 수량 늘리기"
            : "체험 감귤 3kg · 체험 과일 택배 수량 늘리기",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    if (category === "product")
      await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "배송지 2 주문 요약" }),
    ).toContainText("작성중 수령인");
    await page
      .getByRole("button", { name: "배송지 2 수정", exact: true })
      .click();
    if (category === "experience")
      await expect(page.getByLabel("희망 배송일")).toHaveCount(0);
    await page
      .getByRole("region", { name: "배송지 2 수정", exact: true })
      .getByLabel("받는 분 이름", { exact: true })
      .fill("추가 배송지 수정");
    await page.getByRole("button", { name: "수정 완료", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "배송지 2 주문 요약" }),
    ).toContainText("추가 배송지 수정");
  });
}

test("edit validates all fields, updates products and dates, and cancellation discards changes", async ({
  page,
}) => {
  await firstReview(page);
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByLabel("보내는 분 이름").fill("취소할 변경");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByText("취소할 변경", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "배송지 1 수정", exact: true })
    .click();
  await page.getByLabel("받는 분 이름", { exact: true }).fill("");
  await page
    .getByRole("button", {
      name: "감귤 3kg · 선물용 · 대과 수량 줄이기",
      exact: true,
    })
    .click();
  await page.getByRole("radio", { name: /예약 배송/ }).check();
  await page.getByRole("button", { name: "수정 완료", exact: true }).click();
  await expect(
    page.getByText("받는 분의 이름을 입력해주세요.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("이 배송지에 보낼 상품을 하나 이상 선택해주세요.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "선택 가능한 기간의 날짜를 입력해주세요. 일요일은 선택할 수 없어요.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByLabel("받는 분 이름", { exact: true }).fill("변경한 수령인");
  await page.getByLabel("받는 분 휴대폰 번호").fill(" 010-5555-6666 문자");
  await page.getByLabel("휴대폰 번호", { exact: true }).fill("010-2222-3333 ");
  await page
    .getByRole("button", {
      name: "한라봉 3kg · 선물용 수량 늘리기",
      exact: true,
    })
    .click();
  const dateInput = page.getByLabel("희망 배송일");
  const min = (await dateInput.getAttribute("min"))!;
  const allowedDate = new Date(`${min}T12:00:00Z`);
  if (allowedDate.getUTCDay() === 0)
    allowedDate.setUTCDate(allowedDate.getUTCDate() + 1);
  const selectedDate = allowedDate.toISOString().slice(0, 10);
  await dateInput.fill(selectedDate);
  await expect(page.getByLabel("받는 분 휴대폰 번호")).toHaveValue(
    " 010-5555-6666 문자",
  );
  await expect(page.getByLabel("휴대폰 번호", { exact: true })).toHaveValue(
    "010-2222-3333 ",
  );
  await page.getByRole("button", { name: "수정 완료", exact: true }).click();
  const review = page.getByRole("region", { name: "배송지 1 주문 요약" });
  await expect(review).toContainText("변경한 수령인");
  await expect(review).toContainText("01055556666");
  await expect(page.getByText("01022223333", { exact: true })).toBeVisible();
  await expect(review).toContainText(selectedDate);
  await expect(review).toContainText("45,000원");
});

test("replacement input stays intact through validation and is normalized only on successful next", async ({
  page,
}) => {
  await page.goto("/preview/product");
  const phone = page.getByLabel("휴대폰 번호", { exact: true });
  await phone.fill("010");
  // Simulates replacement input, not Apple's native text replacement engine.
  await phone.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.setRangeText("010-1234-5678 ", 0, 3, "end");
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
        data: "010-1234-5678 ",
      }),
    );
  });
  await expect(phone).toHaveValue("010-1234-5678 ");
  expect(
    await phone.evaluate(
      (element) => (element as HTMLInputElement).selectionStart,
    ),
  ).toBe(14);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByText("보내는 분의 이름을 입력해주세요.", { exact: true }),
  ).toBeVisible();
  await expect(phone).toHaveValue("010-1234-5678 ");
  await page.getByLabel("보내는 분 이름").fill("대치 테스트");
  await page
    .getByRole("checkbox", {
      name: "[필수] 개인정보 수집 및 이용 동의",
      exact: true,
    })
    .check();
  await phone.fill("0101234567812345678");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByText("휴대폰 번호 11자리를 입력해주세요.", { exact: true }),
  ).toBeVisible();
  await expect(phone).toHaveValue("0101234567812345678");
  await phone.fill("010-1234-5678 ");
  await phone.blur();
  await expect(phone).toHaveValue("010-1234-5678 ");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(phone).toHaveValue("01012345678");
});

async function expectFixedActions(page: Page) {
  const bar = page.getByRole("region", { name: "주문 진행 버튼" });
  await expect(bar).toHaveCount(1);
  await expect(bar).toHaveCSS("position", "fixed");
  await expect
    .poll(async () =>
      bar.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const viewport = window.visualViewport;
        return (
          Math.abs(
            bounds.bottom -
              ((viewport?.height ?? innerHeight) + (viewport?.offsetTop ?? 0)),
          ) < 2 && bounds.top >= 0
        );
      }),
    )
    .toBe(true);
  for (const button of await bar.getByRole("button").all())
    await expect(button).toBeInViewport({ ratio: 1 });
}

test("order actions stay visible through scrolling, steps, review, edit and dialogs", async ({
  page,
}, testInfo) => {
  await page.goto("/preview/product");
  await expectFixedActions(page);
  await page.screenshot({
    path: testInfo.outputPath("compact-sender-viewport.png"),
  });
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expectFixedActions(page);
  const footerLink = page
    .getByRole("contentinfo")
    .getByRole("link", { name: "관리자", exact: true });
  expect(
    (await footerLink.boundingBox())!.y +
      (await footerLink.boundingBox())!.height,
  ).toBeLessThan((await page.locator("[data-order-actions]").boundingBox())!.y);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sender(page);
  await expectFixedActions(page);
  await page.getByRole("button", { name: "처음부터", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "계속 작성", exact: true }).click();
  await recipient(page, "고정 버튼 테스트");
  await expectFixedActions(page);
  await expect(
    page.getByRole("button", { name: "다음", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "감귤 3kg · 선물용 · 대과 수량 늘리기",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expectFixedActions(page);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expectFixedActions(page);
  await expect(
    page.getByRole("button", { name: "미리보기 · 실제 접수 불가" }),
  ).toBeInViewport({ ratio: 1 });
  await page
    .getByRole("button", { name: "배송지 1 수정", exact: true })
    .click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectFixedActions(page);
  await page.screenshot({
    path: testInfo.outputPath("fixed-edit-viewport.png"),
  });
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expectFixedActions(page);
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expectFixedActions(page);
});

test("short phone screen shows contact fields immediately and keeps actions on resize", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/preview/product");
  await expect(
    page.getByRole("progressbar", { name: "주문 진행 단계" }),
  ).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(page.getByLabel("보내는 분 이름")).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel("휴대폰 번호", { exact: true })).toBeInViewport({
    ratio: 1,
  });
  expect(
    (await page.getByLabel("휴대폰 번호", { exact: true }).boundingBox())!.y +
      56,
  ).toBeLessThan((await page.locator("[data-order-actions]").boundingBox())!.y);
  await expectFixedActions(page);
  await page.screenshot({
    path: testInfo.outputPath("short-phone-viewport.png"),
  });
  await page.setViewportSize({ width: 640, height: 360 });
  await expectFixedActions(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/preview/experience");
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(
    page.getByRole("progressbar", { name: "주문 진행 단계" }),
  ).toHaveAttribute("aria-valuemax", "4");
  await expectFixedActions(page);
});

test("visual viewport keyboard resize lifts actions and keeps the focused field clear", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Tests viewport geometry handling; native iOS/Android keyboards need device QA.
    const viewport = new EventTarget();
    Object.assign(viewport, { height: innerHeight, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
  });
  await page.goto("/preview/product");
  const phone = page.getByLabel("휴대폰 번호", { exact: true });
  await phone.focus();
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: innerHeight - 300 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expectFixedActions(page);
  await expect
    .poll(async () => {
      const input = (await phone.boundingBox())!;
      const bar = (await page.locator("[data-order-actions]").boundingBox())!;
      return input.y >= 0 && input.y + input.height < bar.y;
    })
    .toBe(true);
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: innerHeight });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expectFixedActions(page);
});

test("development HMR connects and consent controls respond at the configured host", async ({
  page,
}) => {
  let hmrFrames = 0;
  const socketErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/_next/hmr")) return;
    socket.on("framereceived", () => {
      hmrFrames += 1;
    });
    socket.on("socketerror", (error) => socketErrors.push(error));
  });
  await page.goto("/preview/product");
  await expect.poll(() => hmrFrames).toBeGreaterThan(0);
  const all = page.getByRole("checkbox", {
    name: "전체 동의 (선택 포함)",
    exact: true,
  });
  await all.check();
  await expect(
    page.getByRole("checkbox", {
      name: "[선택] 마케팅 활용 동의",
      exact: true,
    }),
  ).toBeChecked();
  await all.uncheck();
  await sender(page);
  await expect(
    page.getByRole("heading", { name: "누구에게 보내시나요?" }),
  ).toBeVisible();
  expect(socketErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("draft restores raw input, consent, address and same-as-sender across refresh and navigation", async ({
  page,
}) => {
  await page.goto("/preview/product");
  await page.getByLabel("보내는 분 이름").fill("임시 입력");
  await page.getByLabel("휴대폰 번호", { exact: true }).fill("010-1234-5678 ");
  await page
    .getByRole("checkbox", { name: "전체 동의 (선택 포함)", exact: true })
    .check();
  await page.reload();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("임시 입력");
  await expect(page.getByLabel("휴대폰 번호", { exact: true })).toHaveValue(
    "010-1234-5678 ",
  );
  await expect(
    page.getByRole("checkbox", { name: "전체 동의 (선택 포함)", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("checkbox", { name: "보내는 사람과 같아요" }).check();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "보내는 사람과 같아요" }),
  ).toBeChecked();
  await expect(page.getByLabel("받는 분 이름")).toHaveValue("임시 입력");
  await expect(page.getByLabel("받는 분 이름")).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page
    .getByRole("button", { name: "미리보기용 가상 주소 채우기" })
    .click();
  await page
    .getByLabel("상세주소", { exact: true })
    .fill("아직 작성 중인 주소");
  await page.reload();
  await expect(page.getByLabel("상세주소", { exact: true })).toHaveValue(
    "아직 작성 중인 주소",
  );
  await page.getByRole("link", { name: "나무와열매 홈" }).click();
  await page.goto("/preview/experience");
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await page.goto("/preview/product");
  await expect(page.getByLabel("상세주소", { exact: true })).toHaveValue(
    "아직 작성 중인 주소",
  );
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page
    .getByRole("button", {
      name: "감귤 3kg · 선물용 · 대과 수량 늘리기",
      exact: true,
    })
    .click();
  await page.reload();
  await expect(
    page.getByLabel("감귤 3kg · 선물용 · 대과 수량", { exact: true }),
  ).toHaveText("1");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("radio", { name: /예약 배송/ }).check();
  const date = (await page.getByLabel("희망 배송일").getAttribute("min"))!;
  await page.getByLabel("희망 배송일").fill(date);
  await page.reload();
  await expect(page.getByRole("radio", { name: /예약 배송/ })).toBeChecked();
  await expect(page.getByLabel("희망 배송일")).toHaveValue(date);
});

test("draft restores unfinished additional delivery and edit; cancel and reset remove changes", async ({
  page,
  context,
}) => {
  await firstReview(page);
  await page.getByRole("button", { name: "다른 배송지 추가" }).click();
  await page.getByLabel("받는 분 이름").fill("미완성 배송지");
  await page.reload();
  await expect(page.getByLabel("받는 분 이름")).toHaveValue("미완성 배송지");
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "배송지 추가 이어쓰기" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "배송지 1 수정", exact: true })
    .click();
  await page.getByLabel("받는 분 이름").fill("새로고침 후 수정 중");
  await page.getByLabel("휴대폰 번호", { exact: true }).fill("010-2222-");
  await page.reload();
  await expect(page.getByLabel("받는 분 이름")).toHaveValue(
    "새로고침 후 수정 중",
  );
  await expect(page.getByLabel("휴대폰 번호", { exact: true })).toHaveValue(
    "010-2222-",
  );
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "배송지 1 주문 요약" }),
  ).toContainText("우리집");
  await expect(
    page.getByText("새로고침 후 수정 중", { exact: true }),
  ).toHaveCount(0);
  const other = await context.newPage();
  await other.goto("/preview/product");
  await expect(
    other.getByRole("region", { name: "배송지 1 주문 요약" }),
  ).toBeVisible();
  await page.evaluate(() => localStorage.setItem("unrelated-login", "keep"));
  await page.getByRole("button", { name: "처음부터", exact: true }).click();
  await page.getByRole("button", { name: "입력 초기화", exact: true }).click();
  await expect(other.getByLabel("보내는 분 이름")).toHaveValue("");
  await page.reload();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("roots-and-fruits:order-draft:v1:preview:product"),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-login")),
  ).toBe("keep");
  await other.close();
});

test("order guide is an accessible in-place dialog and pull-to-refresh CSS is scoped to orders", async ({
  page,
}, testInfo) => {
  await page.goto("/preview/product");
  await page.getByLabel("보내는 분 이름").fill("안내 중 보존");
  const trigger = page.getByRole("button", { name: "주문 안내", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "주문 안내" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/preview\/product$/);
  await page.screenshot({
    path: testInfo.outputPath("order-guide-dialog.png"),
  });
  await dialog.getByRole("button", { name: "계속 작성하기" }).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("안내 중 보존");
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("html")).toHaveCSS("overscroll-behavior-y", "none");
  await expect(page.locator("body")).toHaveCSS("overscroll-behavior-y", "none");
  await page.goto("/");
  await expect(page.locator("html")).toHaveCSS("overscroll-behavior-y", "auto");
  await page.getByRole("link", { name: "주문 안내", exact: true }).click();
  await expect(page).toHaveURL(/\/guide$/);
});

test("unavailable or malformed draft storage does not break order input", async ({
  page,
}) => {
  await page.goto("/preview/product");
  await page.evaluate(() =>
    localStorage.setItem(
      "roots-and-fruits:order-draft:v1:preview:product",
      '{"version":1,"step":"nope"}',
    ),
  );
  await page.reload();
  await expect(
    page.getByText(/임시 저장 내용을 불러오지 못했어요/),
  ).toBeVisible();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Blocked", "QuotaExceededError");
    };
  });
  await page.reload();
  await sender(page);
  await expect(
    page.getByRole("heading", { name: "누구에게 보내시나요?" }),
  ).toBeVisible();
  await expect(
    page.getByText(/이 브라우저에서는 임시 저장을 할 수 없어요/),
  ).toBeVisible();
});

test("draft with an unavailable catalog item is preserved and can be explicitly reset", async ({
  page,
}) => {
  await firstReview(page);
  await page.evaluate(() => {
    const key = "roots-and-fruits:order-draft:v1:preview:product";
    const draft = JSON.parse(localStorage.getItem(key)!);
    draft.deliveries[0].items[0].productId = "removed-product";
    localStorage.setItem(key, JSON.stringify(draft));
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "저장된 주문을 확인할 수 없어요." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("roots-and-fruits:order-draft:v1:preview:product"),
    ),
  ).toContain("removed-product");
  await page.getByRole("button", { name: "처음부터", exact: true }).click();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("button", { name: "처음부터", exact: true }).click();
  await page.getByRole("button", { name: "입력 초기화", exact: true }).click();
  await expect(page.getByLabel("보내는 분 이름")).toHaveValue("");
});
