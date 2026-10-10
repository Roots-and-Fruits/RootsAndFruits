"use client";
import { useEffect, useState } from "react";
import { adminRequest } from "./client";
import { AdminButton as Button } from "./admin-button";
import { ConfirmAction } from "./confirm-action";
import type { NotificationJob } from "@/features/notifications/messages";
import {
  notificationErrorText,
  providerLabel,
  type PreparedNotification,
  type ProviderName,
} from "@/features/notifications/provider";

type Row = NotificationJob & {
  status: string;
  provider_id: string | null;
  error_code: string | null;
  provider_code: string | null;
  prepared_message: PreparedNotification | null;
  created_at: string;
  updated_at: string;
};
type Data = {
  enabled: boolean;
  ready: boolean;
  rows: Row[];
  count: number;
  provider: ProviderName;
  testMode: boolean;
  activeProvider: string;
  activeTestMode: boolean;
};
const labels: Record<string, string> = {
  pending: "발송 대기",
  sending: "처리 중",
  tested: "테스트 완료 · 미발송",
  failed: "접수 실패",
  unknown: "결과 확인 필요",
  skipped: "발송 제외",
};
function message(row: Row) {
  if (row.prepared_message) return row.prepared_message.text;
  if (row.provider === "aligo")
    return "등록 템플릿으로 발송할 주문 안내입니다. 발송 준비 후 본문이 표시됩니다.";
  return "이전 문자 발송 이력입니다. 저장된 본문이 없습니다.";
}
function status(row: Row) {
  if (row.status === "accepted")
    return row.provider === "aligo"
      ? "알리고 접수 완료"
      : "이전 문자 접수 완료";
  if (
    row.status === "sending" &&
    Date.now() - Date.parse(row.updated_at) > 300000
  )
    return "결과 확인 필요";
  return labels[row.status] ?? row.status;
}
export function NotificationsAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<{
    templates: {
      code: string;
      title: string;
      approval: string;
      status: string;
    }[];
  } | null>(null);
  const sameConnection =
    data?.activeProvider === data?.provider &&
    data?.activeTestMode === data?.testMode;
  async function checkConnection() {
    setBusy(true);
    setError("");
    setNotice("");
    setConnection(null);
    try {
      const value = await adminRequest<{
        templates: {
          code: string;
          title: string;
          approval: string;
          status: string;
        }[];
      }>("notifications/check", {});
      setConnection(value);
      setNotice(
        "알리고 연결과 등록 템플릿을 확인했습니다. 메시지는 발송하지 않았습니다.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    adminRequest<Data>(`notifications?page=${page}`)
      .then((value) => {
        if (live) {
          setData(value);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [page, revision]);
  async function act(path: string, body: unknown, text: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminRequest(`notifications/${path}`, body);
      setNotice(text);
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        주문 접수와 배송지별 발송 완료 안내는 모두 보내는 분에게만 전송합니다.
        서비스의 접수 완료는 실제 수신 완료와 다릅니다. 최종 수신 결과는 해당
        발송 서비스에서 확인해주세요.
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
            <strong>자동 안내 {data.enabled ? "켜짐" : "꺼짐"}</strong>
            <span className="text-sm">
              {data.activeProvider === "aligo"
                ? "알리고 알림톡"
                : "알리고 연결 적용 필요"}
              {data.activeTestMode && " · 테스트 모드(미발송)"}
            </span>
            {!sameConnection && (
              <span className="text-sm">
                연결 준비: {providerLabel(data.provider)}
                {data.testMode && " · 테스트 모드(미발송)"}
              </span>
            )}
            {!data.ready && (
              <span className="text-sm text-muted-foreground">
                {providerLabel(data.provider)} 서버 연결 설정이 필요합니다.
              </span>
            )}
            <ConfirmAction
              label={data.enabled ? "알림 끄기" : "알림 켜기"}
              disabled={busy || (!data.enabled && !data.ready)}
              description={
                data.enabled
                  ? "새 주문 안내와 발송 대기 알림을 중지합니다. 이미 전송 중인 알림은 취소되지 않습니다."
                  : data.testMode
                    ? "테스트 모드로 새 주문 안내를 처리합니다. 고객에게 발송하지 않으며 테스트 건은 이후 실발송으로 다시 보내지 않습니다."
                    : "지금부터 새로 접수하거나 발송 완료 처리하는 주문에 유료 안내를 보냅니다. 과거 접수·발송 건에는 소급 발송하지 않습니다."
              }
              onConfirm={() =>
                void act(
                  "configure",
                  { enabled: !data.enabled },
                  "알림 설정을 저장했습니다.",
                )
              }
            />
            {data.enabled && !sameConnection && (
              <ConfirmAction
                label="새 연결 적용"
                disabled={busy || !data.ready}
                description={`${providerLabel(data.provider)}${data.testMode ? " 테스트 모드(고객에게 미발송)" : " 실발송 모드"}로 전환합니다. 이전 연결의 대기 건은 제외하며 과거 건을 다시 보내지 않습니다.`}
                onConfirm={() =>
                  void act(
                    "configure",
                    { enabled: true },
                    "새 알림 연결을 적용했습니다.",
                  )
                }
              />
            )}
            <Button
              variant="outline"
              disabled={busy || !data.ready}
              onClick={() => void checkConnection()}
            >
              연결 확인
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setRevision((v) => v + 1)}
            >
              새로고침
            </Button>
          </div>
          {connection && connection.templates.length > 0 && (
            <ul className="space-y-2 rounded-xl border p-4 text-sm">
              {connection.templates.map((t) => (
                <li key={t.code}>
                  {t.code} · {t.title} ·{" "}
                  {(
                    {
                      APR: "승인",
                      REQ: "검수 중",
                      REG: "등록",
                      REJ: "반려",
                    } as Record<string, string>
                  )[t.approval] ?? t.approval}
                  {t.status === "S" && " · 사용 중단"}
                  {t.status === "R" && t.approval === "APR" && " · 첫 발송 전"}
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            결과 확인 필요 건은 중복 발송을 막기 위해 자동 재전송하지 않습니다.
            각 건에 표시된 발송 서비스에서 수신번호·시각·조회 번호로
            확인해주세요.
          </p>
          <div className="space-y-3">
            {data.rows.length === 0 && (
              <p className="rounded-xl border p-5">
                알림 발송 내역이 없습니다.
              </p>
            )}
            {data.rows.map((row) => (
              <article key={row.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong
                    className={
                      row.status === "failed" || row.status === "unknown"
                        ? "text-destructive"
                        : ""
                    }
                  >
                    {status(row)}
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}{" "}
                    · 시도 {row.attempts}회
                  </span>
                </div>
                <p className="my-2 text-sm">
                  {row.recipient_role === "recipient" ? "받는 분" : "보내는 분"}
                  : {row.phone.replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3")}
                </p>
                <p className="mb-2 text-xs text-muted-foreground">
                  {providerLabel(row.provider)}
                  {row.test_mode && " · 테스트(미발송)"}
                  {row.prepared_message?.templateCode &&
                    ` · ${row.prepared_message.templateCode}`}
                </p>
                {row.prepared_message?.emphasisTitle && (
                  <p className="mb-2 font-semibold">
                    {row.prepared_message.emphasisTitle}
                  </p>
                )}
                <p className="whitespace-pre-line text-sm">{message(row)}</p>
                {row.provider_id && (
                  <p className="mt-2 break-all text-xs text-muted-foreground">
                    {row.provider === "aligo"
                      ? "알리고 메시지 ID"
                      : "이전 문자 조회 번호"}
                    : {row.provider_id}
                  </p>
                )}
                {row.error_code && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {notificationErrorText(row.error_code)} · 처리 코드:{" "}
                    {row.error_code}
                  </p>
                )}
                {row.status === "failed" &&
                  row.provider === "aligo" &&
                  row.recipient_role !== "recipient" && (
                    <div className="mt-3">
                      <ConfirmAction
                        label="재시도"
                        disabled={
                          busy ||
                          !data.enabled ||
                          !data.ready ||
                          !sameConnection ||
                          row.provider !== data.activeProvider ||
                          !!row.test_mode !== data.activeTestMode
                        }
                        description={
                          row.test_mode
                            ? "실패 원인을 해결한 뒤 테스트를 다시 요청합니다. 고객에게 발송하지 않습니다."
                            : "실패 원인을 해결한 뒤 다시 발송해주세요. 정상 접수되면 발송 요금이 부과됩니다."
                        }
                        onConfirm={() =>
                          void act(
                            "retry",
                            { id: row.id },
                            "재시도를 요청했습니다. 잠시 후 새로고침해주세요.",
                          )
                        }
                      />
                    </div>
                  )}
              </article>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={busy || page === 0}
              onClick={() => setPage((v) => v - 1)}
            >
              이전
            </Button>
            <span className="text-sm">
              {page + 1}페이지 · 총 {data.count}건
            </span>
            <Button
              variant="outline"
              disabled={busy || (page + 1) * 30 >= data.count}
              onClick={() => setPage((v) => v + 1)}
            >
              다음
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
