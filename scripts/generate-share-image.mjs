import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Run manually after changing this design or the brand logo.
// The generated PNG is committed, so deployment needs no browser or local fonts.
const logo = await readFile(new URL("../public/brand/logo.svg", import.meta.url));
const output = fileURLToPath(
  new URL("../public/brand/share-card.png", import.meta.url),
);
const browser = await chromium.launch({
  channel:
    process.env.PLAYWRIGHT_CHANNEL ||
    (process.platform === "darwin" ? "chrome" : undefined),
});

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html>
    <html lang="ko"><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif; }
      main { width: 1200px; height: 630px; overflow: hidden; position: relative;
        display: flex; align-items: center; padding: 64px 72px;
        background: #f8f7f2; color: #234b38; border-top: 12px solid #234b38; }
      .copy { position: relative; z-index: 1; }
      .eyebrow { margin: 0 0 24px; font-size: 21px; font-weight: 600; letter-spacing: 5px; }
      h1 { margin: 0; font-size: 88px; line-height: 1.1; letter-spacing: -6px; font-weight: 800; }
      .description { margin: 28px 0 34px; font-size: 30px; line-height: 1.5;
        letter-spacing: -1px; color: #52664f; }
      .choices { display: flex; gap: 12px; }
      .choice { padding: 14px 23px 12px; border-radius: 16px; font-size: 23px; font-weight: 700; }
      .shop { background: #ffead6; color: #a64b16; }
      .experience { background: #e4ecd9; color: #234b38; }
      .mark { position: absolute; right: 64px; top: 124px; width: 360px; height: 360px;
        border-radius: 50%; background: #fff2df; display: grid; place-items: center; }
      .mark img { width: 310px; height: 310px; }
      .dot { position: absolute; border-radius: 50%; background: #e5ecdf; }
      .dot.one { width: 130px; height: 130px; right: -34px; top: -30px; }
      .dot.two { width: 50px; height: 50px; right: 70px; bottom: 56px; background: #efc996; }
    </style></head><body><main>
      <div class="dot one"></div><div class="dot two"></div>
      <section class="copy">
        <p class="eyebrow">TREE &amp; BERRY FARM</p>
        <h1>나무와열매</h1>
        <p class="description">산지에서 갓 수확한 신선함 그대로,<br>소중한 사람에게 전해요.</p>
        <div class="choices"><span class="choice shop">상품 구매</span><span class="choice experience">체험 과일 보내기</span></div>
      </section>
      <div class="mark"><img alt="귤 캐릭터" src="data:image/svg+xml;base64,${logo.toString("base64")}"></div>
    </main></body></html>`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  await page.screenshot({ path: output });
  console.log(`Created ${output} (1200×630)`);
} finally {
  await browser.close();
}
