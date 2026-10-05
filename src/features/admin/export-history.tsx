"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AdminButton as Button } from "./admin-button";
import { adminRequest } from "./client";
import { ConfirmAction } from "./confirm-action";
import { stateLabel, type ExportBatch } from "./schema";
import { departureWarning, shippingRequestLimit } from "./shipping-work";

export function ExportHistory({
  open,
  onOpenChange,
  busy,
  today,
  onShip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  today: string;
  onShip: (ids: string[]) => Promise<string | null>;
}) {
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{
    batches: ExportBatch[];
    count: number;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    adminRequest<{ batches: ExportBatch[]; count: number }>(
      `exports?page=${page}`,
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [open, page, revision]);
  function changePage(next: number) {
    setData(null);
    setError("");
    setPage(next);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setData(null);
        setError("");
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>엑셀 출력 이력</DialogTitle>
          <DialogDescription>
            생성된 엑셀 파일을 다시 받거나 미발송 건을 묶음으로 처리합니다.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div role="alert" className="space-y-2 text-destructive">
            <p>{error}</p>
            <Button
              variant="outline"
              onClick={() => {
                setError("");
                setRevision((v) => v + 1);
              }}
            >
              다시 불러오기
            </Button>
          </div>
        ) : !data ? (
          <p role="status">출력 이력을 불러오는 중…</p>
        ) : (
          <>
            {!data.batches.length && <p>출력 이력이 없습니다.</p>}
            {data.batches.map((batch) => {
              const remaining = batch.export_members.filter(
                (m) => m.deliveries?.status === "exported",
              );
              const warning = departureWarning(
                remaining.map((m) => m.deliveries!.processing_date),
                today,
              );
              return (
                <article
                  key={batch.id}
                  className="space-y-3 rounded-xl border p-4"
                >
                  <p className="break-all font-medium">{batch.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(batch.created_at).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}{" "}
                    · 배송지 {batch.export_members.length}건 · 발송 대기{" "}
                    {remaining.length}건 · {batch.created_by}
                  </p>
                  <details className="text-sm">
                    <summary>포함 주문 확인</summary>
                    <ul className="mt-2 space-y-1">
                      {batch.export_members.map((m) => (
                        <li key={m.delivery_id}>
                          {m.deliveries?.checkouts.order_number}번 ·{" "}
                          {m.deliveries?.recipient.name} · 출발{" "}
                          {m.deliveries?.processing_date} ·{" "}
                          {m.deliveries
                            ? stateLabel[m.deliveries.status]
                            : m.delivery_id}
                        </li>
                      ))}
                    </ul>
                  </details>
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      className="text-primary underline"
                      href={`/api/admin/exports/${batch.id}`}
                    >
                      재다운로드
                    </a>
                    <ConfirmAction
                      label="묶음 발송 완료"
                      disabled={
                        busy ||
                        !remaining.length ||
                        remaining.length > shippingRequestLimit
                      }
                      description={`이 묶음의 미발송 배송지 ${remaining.length}건을 실제 발송했는지 확인해주세요. ${warning}`}
                      onConfirm={() =>
                        onShip(remaining.map((m) => m.delivery_id))
                      }
                    />
                  </div>
                </article>
              );
            })}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={busy || page === 0}
                onClick={() => changePage(page - 1)}
              >
                이전 출력 이력
              </Button>
              <span className="text-sm">
                {page + 1} / {Math.max(1, Math.ceil(data.count / 30))}
              </span>
              <Button
                variant="outline"
                disabled={busy || (page + 1) * 30 >= data.count}
                onClick={() => changePage(page + 1)}
              >
                다음 출력 이력
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
