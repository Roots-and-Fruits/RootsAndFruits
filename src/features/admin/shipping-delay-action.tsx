"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminButton as Button } from "./admin-button";
import { adminRequest } from "./client";
import { createRequestId } from "@/lib/request-id";

type Recipient = {
  phone: string;
  names: string[];
  latestId: string | null;
  historyCount: number;
  history: {
    id: string;
    createdAt: string;
    status: string;
    testMode: boolean;
  }[];
};
type Preview = {
  testMode: boolean;
  recipients: Recipient[];
  deliveryCount: number;
  recipientCount: number;
};
type Pending = {
  requestId: string;
  ids: string[];
  expected: { phone: string; latestId: string | null }[];
};
const storageKey = "roots-and-fruits:shipping-delay-request";
const labels: Record<string, string> = {
  pending: "발송 대기",
  sending: "처리 중",
  accepted: "알림톡 접수 완료",
  tested: "테스트 완료 · 미발송",
  failed: "접수 실패",
  unknown: "결과 확인 필요",
  skipped: "발송 제외",
};

export function ShippingDelayAction({
  ids,
  disabled,
  onBusyChange,
}: {
  ids: string[];
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [testMode, setTestMode] = useState<boolean | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) setPending(JSON.parse(saved));
      } catch {
        setError("이전 요청 정보를 읽지 못했습니다. 알림 내역을 확인해주세요.");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function working(value: boolean) {
    setBusy(value);
    onBusyChange(value);
  }
  async function start() {
    setOpen(true);
    setError("");
    setChecked(false);
    setCounts(null);
    setTestMode(null);
    setPreview(null);
    if (pending) return;
    working(true);
    try {
      const result = await adminRequest<Preview>("shipping-delay/preview", {
        ids,
      });
      setPreview(result);
      setTestMode(result.testMode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      working(false);
    }
  }
  async function send() {
    let queuedSuccessfully = false;
    working(true);
    setError("");
    try {
      const request = pending ?? {
        requestId: createRequestId(),
        ids: [...ids].sort(),
        expected: preview!.recipients.map(({ phone, latestId }) => ({
          phone,
          latestId,
        })),
      };
      // Persist before queueing: a lost response must reuse the same request id.
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      const queued = await adminRequest<{ count: number; testMode: boolean }>(
        "shipping-delay/queue",
        request,
      );
      queuedSuccessfully = true;
      setTestMode(queued.testMode);
      for (let turn = 0; turn < 10; turn++) {
        const result = await adminRequest<{
          counts: Record<string, number>;
          testMode: boolean;
        }>("shipping-delay/process", { requestId: request.requestId });
        setCounts(result.counts);
        setTestMode(result.testMode);
        if (!(result.counts.pending || result.counts.sending)) {
          sessionStorage.removeItem(storageKey);
          setPending(null);
          setPreview(null);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setError(
        "아직 처리 중인 알림이 있습니다. ‘이전 요청 계속 처리’를 눌러 이어서 확인해주세요.",
      );
    } catch (e) {
      if (!queuedSuccessfully && (e as { status?: number }).status === 400) {
        sessionStorage.removeItem(storageKey);
        setPending(null);
        setPreview(null);
      }
      setError((e as Error).message);
    } finally {
      working(false);
    }
  }
  const hasHistory = preview?.recipients.some((r) => r.historyCount > 0);
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled || ids.length === 0}
        onClick={start}
      >
        배송 지연 알림
      </Button>
      {pending && !open && (
        <Button variant="outline" disabled={disabled} onClick={start}>
          이전 지연 알림 요청 확인
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
          showCloseButton={!busy}
        >
          <DialogTitle>배송 지연 알림</DialogTitle>
          <DialogDescription>
            기상악화 등으로 수확과 발송이 늦어지는 안내를 보내는 분에게
            보냅니다. 같은 전화번호에는 이번 요청에서 한 번만 발송합니다.
          </DialogDescription>
          {busy && (
            <p role="status">
              {preview || pending
                ? "알림 처리 중… 화면을 닫지 말아주세요."
                : "수신 대상과 이전 이력 확인 중…"}
            </p>
          )}
          {preview && (
            <>
              <p className="font-semibold">
                배송지 {preview.deliveryCount}건 · 수신 번호{" "}
                {preview.recipientCount}개
              </p>
              <ul className="max-h-72 space-y-3 overflow-y-auto rounded-lg border p-3 text-sm">
                {preview.recipients.map((r) => (
                  <li key={r.phone}>
                    <p className="font-medium">
                      {r.names.join(", ")} ·{" "}
                      {r.phone.replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3")}
                    </p>
                    <p className="text-muted-foreground">
                      이전 지연 알림 {r.historyCount}건
                      {r.historyCount > 5 && " · 최근 5건 표시"}
                    </p>
                    {r.history.map((h) => (
                      <p key={h.id} className="text-xs">
                        {new Date(h.createdAt).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                        })}{" "}
                        · {labels[h.status] ?? h.status}
                        {h.testMode && " · 테스트"}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
              {hasHistory && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    disabled={busy}
                    onCheckedChange={(v) => setChecked(v === true)}
                  />
                  이전 지연 알림 이력을 확인했으며 다시 발송합니다. 처리 중·결과
                  확인 필요 건은 이미 발송되었을 수 있습니다.
                </label>
              )}
            </>
          )}
          {pending && !preview && (
            <p className="text-sm">
              이전 요청의 결과를 확인하거나 남은 알림을 계속 처리합니다. 새 발송
              요청을 만들지 않습니다.
            </p>
          )}
          {testMode !== null && (
            <p className="font-medium">
              {testMode
                ? "테스트 모드 · 고객에게 실제 발송하지 않음"
                : "실발송 모드"}
            </p>
          )}
          {counts && (
            <p role="status" className="text-sm">
              {Object.entries(counts)
                .map(
                  ([status, count]) => `${labels[status] ?? status} ${count}건`,
                )
                .join(" · ")}
              <br />
              실제 수신 여부는 알리고 발송 내역에서 확인해주세요.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              닫기
            </Button>
            {(preview || pending) && (
              <Button
                disabled={busy || (!!hasHistory && !checked && !pending)}
                onClick={send}
              >
                {pending ? "이전 요청 계속 처리" : "지연 알림 발송"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
