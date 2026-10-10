"use client";
import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AdminButton as Button } from "./admin-button";
import { AdminInput, AdminSelect } from "./admin-fields";
import { adminRequest } from "./client";
import { createRequestId } from "@/lib/request-id";
import { departureWarning } from "./shipping-work";
import {
  trackingFileLimit,
  type TrackingMode,
  type TrackingPreview,
  type TrackingSaved,
} from "./tracking";

export function TrackingUpload({
  disabled,
  today,
  onReload,
}: {
  disabled: boolean;
  today: string;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TrackingPreview | null>(null);
  const [modes, setModes] = useState<Record<string, TrackingMode | "">>({});
  const [saved, setSaved] = useState<TrackingSaved[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shipped, setShipped] = useState(false);
  const [saveRequest, setSaveRequest] = useState<{
    requestId: string;
    changes: unknown[];
  } | null>(null);
  const changed = useRef(false);

  function close() {
    if (busy) return;
    setOpen(false);
    if (changed.current) onReload();
  }
  async function inspect() {
    if (!file) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setSaveRequest(null);
    try {
      if (!/\.xlsx$/i.test(file.name))
        throw new Error(".xlsx 파일을 선택해주세요.");
      if (file.size > trackingFileLimit)
        throw new Error("파일은 2MB까지 업로드할 수 있습니다.");
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/admin/tracking/preview", {
        method: "POST",
        body,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "송장 내역을 확인하지 못했습니다.");
      const result = data as TrackingPreview;
      setPreview(result);
      setModes(
        Object.fromEntries(
          result.groups.map((g) => [
            g.id,
            !g.tracking_numbers.length ||
            JSON.stringify([...g.tracking_numbers].sort()) ===
              JSON.stringify(g.numbers)
              ? "add"
              : "",
          ]),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!preview) return;
    setBusy(true);
    setError("");
    const attempt = saveRequest ?? {
      requestId: createRequestId(),
      changes: preview.groups
        .filter((g) => modes[g.id] && modes[g.id] !== "skip")
        .map((g) => ({
          id: g.id,
          key: g.key,
          version: g.version,
          numbers: g.numbers,
          mode: modes[g.id],
        })),
    };
    setSaveRequest(attempt);
    try {
      // Keep the exact request on failure: replacing numbers must be safely retryable.
      // Even a lost response may have committed; refresh the list when closing.
      changed.current = true;
      const result = await adminRequest<TrackingSaved[]>(
        "tracking/save",
        attempt,
      );
      setSaved(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function ship() {
    setBusy(true);
    setError("");
    try {
      await adminRequest("ship", {
        ids: saved!.filter((g) => g.status === "exported").map((g) => g.id),
      });
      changed.current = true;
      setShipped(true);
    } catch (e) {
      setError(
        `송장번호는 저장되었습니다. 발송 처리 실패: ${(e as Error).message}`,
      );
    } finally {
      setBusy(false);
    }
  }
  const pending = saved?.filter((g) => g.status === "exported") ?? [];
  const unresolved = preview?.groups.some((g) => !modes[g.id]);
  const selectedCount =
    preview?.groups.filter((g) => modes[g.id] && modes[g.id] !== "skip")
      .length ?? 0;
  const warning = departureWarning(
    pending.map((g) => g.processing_date),
    today,
  );
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => {
          setFile(null);
          setPreview(null);
          setSaved(null);
          setError("");
          setShipped(false);
          setSaveRequest(null);
          changed.current = false;
          setOpen(true);
        }}
      >
        송장번호 업로드
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>
              {saved ? "송장번호 저장 완료" : "송장번호 업로드"}
            </DialogTitle>
            <DialogDescription>
              {saved
                ? "송장번호 저장과 발송 완료 처리는 별개입니다."
                : "택배사에서 내려받은 .xlsx 파일을 선택해주세요. 최대 2MB · 데이터 1,000행"}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!saved ? (
            <>
              <p className="text-sm text-muted-foreground">
                AJ열 특기사항에서 ‘주문번호:79-1’ 형식을 먼저 찾고, 없으면 AO열
                고객메세지를 확인합니다. 일반 요청사항은 건너뜁니다.
              </p>
              <label className="space-y-2 text-sm font-semibold">
                송장 내역 엑셀
                <AdminInput
                  type="file"
                  accept=".xlsx"
                  disabled={busy}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setPreview(null);
                    setError("");
                    setSaveRequest(null);
                  }}
                />
              </label>
              <Button
                variant="outline"
                disabled={!file || busy}
                onClick={inspect}
              >
                {busy
                  ? "처리 중…"
                  : preview || saveRequest
                    ? "파일 다시 확인"
                    : "파일 확인"}
              </Button>
              {preview && (
                <>
                  <p className="text-sm font-semibold" role="status">
                    전체 {preview.rowCount}행 · 매핑 {preview.groups.length}곳 ·
                    제외 {preview.excluded.length}행 · 중복 송장{" "}
                    {preview.duplicateCount}행
                    {preview.skippedCount > 0 &&
                      ` · 주문번호 표기 없음 ${preview.skippedCount}행 건너뜀`}
                  </p>
                  <div className="space-y-3">
                    {preview.groups.map((g) => (
                      <section
                        key={g.id}
                        aria-label={`배송 ${g.key}`}
                        className="min-w-0 space-y-2 rounded-lg border p-3 text-sm"
                      >
                        <p className="font-semibold">
                          {g.key} · {g.recipient} ·{" "}
                          {g.status === "shipped" ? "발송 완료" : "발송 대기"}
                        </p>
                        <p className="break-words text-xs text-muted-foreground">
                          엑셀 {g.rows.join(", ")}행
                        </p>
                        <p className="break-all">
                          기존 번호: {g.tracking_numbers.join(", ") || "없음"}
                        </p>
                        <p className="break-all">
                          업로드 번호: {g.numbers.join(", ")}
                        </p>
                        {!!g.tracking_numbers.length && (
                          <label className="block space-y-1">
                            처리 방법
                            <AdminSelect
                              aria-label={`${g.key} 처리 방법`}
                              value={modes[g.id] ?? ""}
                              disabled={busy || !!saveRequest}
                              onChange={(e) =>
                                setModes((old) => ({
                                  ...old,
                                  [g.id]: e.target.value as TrackingMode,
                                }))
                              }
                            >
                              <option value="" disabled>
                                추가 또는 교체를 선택해주세요
                              </option>
                              <option value="add">기존 번호에 추가</option>
                              <option value="replace" disabled={g.incomplete}>
                                기존 번호 전체 교체
                              </option>
                              <option value="skip">이번에는 제외</option>
                            </AdminSelect>
                          </label>
                        )}
                        {g.incomplete && (
                          <p className="text-amber-800">
                            같은 배송지에 오류 행이 있어 전체 교체할 수
                            없습니다. 정상 번호 추가는 가능합니다.
                          </p>
                        )}
                        {modes[g.id] === "replace" && (
                          <p className="break-all font-semibold text-destructive">
                            삭제될 기존 번호:{" "}
                            {g.tracking_numbers
                              .filter((n) => !g.numbers.includes(n))
                              .join(", ") || "없음"}
                          </p>
                        )}
                        {modes[g.id] === "skip" && <p>저장에서 제외됩니다.</p>}
                      </section>
                    ))}
                  </div>
                  {!!preview.excluded.length && (
                    <section
                      className="space-y-2 rounded-lg bg-secondary p-3 text-sm"
                      aria-label="제외된 행"
                    >
                      <p className="font-semibold">
                        제외된 행 — 아래 행은 저장하지 않습니다.
                      </p>
                      {preview.excluded.map((r) => (
                        <p key={r.row} className="break-all">
                          {r.row}행 · {r.key || "식별자 없음"} ·{" "}
                          {r.number || "송장 없음"} · {r.error}
                        </p>
                      ))}
                    </section>
                  )}
                </>
              )}
              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={close}>
                  닫기
                </Button>
                <Button
                  disabled={busy || !selectedCount || unresolved}
                  onClick={save}
                >
                  {busy ? "처리 중…" : `정상 건 저장 (${selectedCount}곳)`}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p role="status">
                배송지 {saved.length}곳 · 송장{" "}
                {saved.reduce((n, g) => n + g.tracking_numbers.length, 0)}개가
                저장되어 있습니다.
              </p>
              {shipped ? (
                <p className="font-semibold">
                  매핑된 배송 건의 발송 완료 처리가 끝났습니다.
                </p>
              ) : pending.length ? (
                <>
                  <p className="font-semibold">
                    매핑된 배송 건들을 발송 완료 처리할까요?
                  </p>
                  <p className="text-sm">
                    발송 대기 {pending.length}곳을 처리합니다. 알림톡 발송 설정이
                    켜져 있으면 기존 발송 안내가 전송됩니다.
                  </p>
                  {warning && (
                    <p className="text-sm font-semibold text-amber-800">
                      {warning}
                    </p>
                  )}
                </>
              ) : (
                <p>
                  매핑된 배송지는 이미 발송 완료 상태입니다. 발송 안내는 다시
                  보내지 않습니다.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={close}>
                  {!shipped && pending.length ? "번호만 저장" : "닫기"}
                </Button>
                {!shipped && pending.length > 0 && (
                  <Button disabled={busy} onClick={ship}>
                    {busy ? "처리 중…" : "발송 완료 처리"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
