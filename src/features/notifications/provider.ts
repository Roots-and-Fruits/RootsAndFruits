import type { NotificationJob } from "./messages";

export type ProviderName = "aligo";
export function providerLabel(provider: string | null | undefined) {
  return provider === "aligo" ? "알리고 알림톡" : "이전 문자 이력";
}
export function notificationErrorText(code: string) {
  const messages: Record<string, string> = {
    NOTIFICATION_NOT_CONFIGURED:
      "서버의 알리고 키·발신번호·ALIGO_ENABLED 설정과 Fixie 사용 시 FIXIE_URL을 확인해주세요.",
    PROVIDER_RETIRED: "이전 문자 서비스가 종료되어 발송 대상에서 제외했습니다.",
    ALIGO_PROXY_INVALID:
      "FIXIE_URL에 Fixie의 HTTP/HTTPS 프록시 주소를 입력해주세요.",
    ALIGO_CONNECTION_FAILED:
      "알리고 연결에 실패했습니다. Fixie 연결·사용 한도와 알리고 허용 IP를 확인해주세요.",
    RECIPIENT_DISABLED:
      "보내는 분에게만 안내하도록 변경되어 받는 분 대상 알림은 제외했습니다.",
    ALIGO_TEMPLATE_NOT_APPROVED:
      "알리고 템플릿이 검수 승인되고 사용 중단 상태가 아니어야 실발송할 수 있습니다.",
    ALIGO_TEMPLATE_NOT_FOUND:
      "설정한 템플릿을 찾지 못했습니다. 템플릿 코드와 발신프로필을 확인해주세요.",
    ALIGO_TEMPLATE_CONNECTION_FAILED:
      "알리고 템플릿을 조회하지 못했습니다. 연결·허용 IP 설정을 확인해주세요.",
    ALIGO_TEMPLATE_VARIABLE_UNKNOWN:
      "템플릿에 연결되지 않은 변수가 있습니다. 등록 문구를 확인해주세요.",
    ALIGO_TEMPLATE_VARIABLE_INVALID: "템플릿 변수 값을 확인해주세요.",
    ALIGO_MESSAGE_TOO_LONG:
      "알림톡 본문이 1,000자를 초과했습니다. 내용을 임의로 잘라 보내지 않았습니다.",
    ALIGO_TITLE_INVALID: "알림톡 강조 타이틀은 1~28자여야 합니다.",
    INVALID_PAYLOAD:
      "알림에 필요한 주문 정보가 부족합니다. 기존 발송 건인지 확인해주세요.",
    INVALID_PHONE: "알림을 받을 휴대폰 번호를 확인해주세요.",
  };
  return messages[code] ?? `알림 연결·처리 결과를 확인해주세요. (${code})`;
}
export type SendResult = {
  status: "accepted" | "tested" | "failed" | "unknown" | "skipped";
  providerId?: string;
  providerCode?: string;
  errorCode?: string;
};
export type PreparedNotification = {
  text: string;
  subject: string;
  templateCode?: string;
  emphasisTitle?: string;
  buttons?: Record<string, string>[];
};
export interface NotificationProvider {
  name: ProviderName;
  testMode: boolean;
  prepare(job: NotificationJob): PreparedNotification;
  send(
    to: string,
    message: PreparedNotification,
    reference: string,
  ): Promise<SendResult>;
}

// Persist only controlled codes, never a raw provider response or credentials.
export class NotificationError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
