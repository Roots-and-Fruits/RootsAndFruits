// Read-only connection check: never sends a message or changes notification settings.
import {
  aligoConfig,
  loadAligoTemplates,
} from "../src/features/notifications/aligo";
import {
  NotificationError,
  notificationErrorText,
} from "../src/features/notifications/provider";
import { createAligoTransport } from "../src/features/notifications/aligo-transport";

async function main() {
  // Reading templates does not require enabling Alimtalk dispatch.
  const config = aligoConfig({ ...process.env, ALIGO_ENABLED: "true" });
  if (!config) throw new NotificationError("NOTIFICATION_NOT_CONFIGURED");
  const transport = createAligoTransport(config.proxyUrl);
  console.log(
    `연결 경로: ${config.proxyUrl ? "Fixie 고정 IP" : "로컬 직접 연결 (Vercel에서는 FIXIE_URL 필요)"}`,
  );
  const templates = await loadAligoTemplates(config, transport.request).finally(
    () => transport.close(),
  );
  const approval: Record<string, string> = {
    APR: "승인",
    REQ: "검수 중",
    REG: "등록",
    REJ: "반려",
  };
  const lifecycle: Record<string, string> = {
    A: "정상",
    R: "첫 발송 전",
    S: "사용 중단",
  };
  for (const [event, template] of Object.entries(templates)) {
    console.log(
      `${event === "received" ? "주문접수" : "상품발송"}: ${template.templtCode} / ${approval[template.inspStatus]} / ${lifecycle[template.status]}`,
    );
    console.log(
      `강조 타이틀: ${template.templtTitle || "없음"} / 버튼: ${(template.buttons ?? []).map((b) => `${b.name}(${b.linkType})`).join(", ") || "없음"}`,
    );
    console.log(
      `본문 변수: ${[...template.templtContent.matchAll(/#\{([^{}]+)\}/g)]
        .map((m) => m[1])
        .filter((value, index, all) => all.indexOf(value) === index)
        .join(", ")}`,
    );
  }
  console.log(
    "알리고 템플릿 조회 완료. 실제 발송·DB 변경은 수행하지 않았습니다.",
  );
}
main().catch((error) => {
  console.error(
    notificationErrorText(
      error instanceof NotificationError
        ? error.code
        : "ALIGO_TEMPLATE_CONNECTION_FAILED",
    ),
  );
  process.exitCode = 1;
});
