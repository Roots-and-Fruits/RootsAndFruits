"use client";
import { useEffect, useState } from "react";
import { adminRequest } from "./client";
import { AdminButton as Button } from "./admin-button";
import { ConfirmAction } from "./confirm-action";
import {
  notificationText,
  type NotificationJob,
} from "@/features/notifications/messages";

type Row = NotificationJob & {
  status: string;
  provider_id: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
};
type Data = { enabled: boolean; ready: boolean; rows: Row[]; count: number };
const labels: Record<string, string> = {
  pending: "발송 대기",
  sending: "처리 중",
  accepted: "솔라피 접수 완료",
  failed: "접수 실패",
  unknown: "결과 확인 필요",
  skipped: "발송 제외",
};
function message(row: Row) {
  try {
    return notificationText(row);
  } catch {
    return "문자 내용을 확인할 수 없습니다.";
  }
}
function status(row: Row) {
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
        주문 접수와 배송지별 발송 완료 안내를 보내는 분에게 전송합니다. 솔라피
        접수 완료는 휴대폰 도착 확인과 다르며, 최종 수신 결과는 솔라피 발송
        내역에서 확인해주세요.
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
            <strong>자동 문자 {data.enabled ? "켜짐" : "꺼짐"}</strong>
            {!data.ready && (
              <span className="text-sm text-muted-foreground">
                솔라피 연결 설정이 필요합니다.
              </span>
            )}
            <ConfirmAction
              label={data.enabled ? "문자 끄기" : "문자 켜기"}
              disabled={busy || (!data.enabled && !data.ready)}
              description={
                data.enabled
                  ? "새 주문 안내와 발송 대기 문자를 중지합니다. 이미 전송 중인 문자는 취소되지 않습니다."
                  : "지금부터 새로 접수하거나 발송 완료 처리하는 주문에 유료 문자를 보냅니다. 과거 접수·발송 건에는 소급 발송하지 않습니다."
              }
              onConfirm={() =>
                void act(
                  "configure",
                  { enabled: !data.enabled },
                  "문자 설정을 저장했습니다.",
                )
              }
            />
            <Button
              variant="outline"
              disabled={busy || !data.ready || !data.enabled}
              onClick={() =>
                void act(
                  "process",
                  {},
                  "대기 문자 처리를 마쳤습니다. 남은 대기 건은 다시 처리할 수 있습니다.",
                )
              }
            >
              대기 문자 보내기
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setRevision((v) => v + 1)}
            >
              새로고침
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            결과 확인 필요 건은 중복 발송을 막기 위해 자동 재전송하지 않습니다.
            솔라피에서 수신번호·시각으로 확인해주세요.
          </p>
          <div className="space-y-3">
            {data.rows.length === 0 && (
              <p className="rounded-xl border p-5">
                문자 발송 내역이 없습니다.
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
                  보내는 분:{" "}
                  {row.phone.replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3")}
                </p>
                <p className="whitespace-pre-line text-sm">{message(row)}</p>
                {row.provider_id && (
                  <p className="mt-2 break-all text-xs text-muted-foreground">
                    솔라피 조회 번호: {row.provider_id}
                  </p>
                )}
                {row.error_code && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    처리 코드: {row.error_code}
                  </p>
                )}
                {row.status === "failed" && (
                  <div className="mt-3">
                    <ConfirmAction
                      label="재시도"
                      disabled={busy || !data.enabled || !data.ready}
                      description="실패 원인을 해결한 뒤 다시 발송해주세요. 정상 접수되면 문자 요금이 부과됩니다."
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
