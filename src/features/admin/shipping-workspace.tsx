"use client";
import { useEffect, useState } from "react";
import { addDays, dateInSeoul } from "@/features/orders/calculations";
import { createRequestId } from "@/lib/request-id";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AdminButton as Button } from "./admin-button";
import { adminRequest } from "./client";
import { ConfirmAction } from "./confirm-action";
import { ExportHistory } from "./export-history";
import { ShippingList } from "./order-lists";
import type { Checkout } from "./schema";
import {
  canBulkExport,
  departureWarning,
  shippingRequestLimit,
  type ShippingRow,
} from "./shipping-work";

export function ShippingWorkspace({
  rows,
  serverTime,
  loading,
  failed,
  busy,
  onOpen,
  onReload,
  onExported,
  onShip,
}: {
  rows: ShippingRow[];
  serverTime: string;
  loading: boolean;
  failed: boolean;
  busy: boolean;
  onOpen: (order: Checkout) => void;
  onReload: () => void;
  onExported: () => void;
  onShip: (ids: string[]) => Promise<string | null>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmedFutureIds, setConfirmedFutureIds] = useState<string[]>([]);
  const [pending, setPending] = useState<{
    row: ShippingRow;
    replace: boolean;
    future: boolean;
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [today, setToday] = useState(() => dateInSeoul());
  useEffect(() => {
    if (!serverTime) return;
    const base = new Date(serverTime).getTime();
    const start = performance.now();
    const update = () =>
      setToday(dateInSeoul(new Date(base + performance.now() - start)));
    update();
    const timer = setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [serverTime]);
  const disabled = loading || failed || busy || working;
  const chosen = rows.filter((r) => selected.includes(r.delivery.id));
  const selectedStatus = chosen[0]?.delivery.status;
  const overLimit = chosen.length > shippingRequestLimit;
  const tomorrow = addDays(today, 1);
  const eligible = rows.filter((r) => canBulkExport(r.delivery, today));
  const waiting = rows.filter((r) => r.delivery.status === "waiting");
  const exported = rows.filter((r) => r.delivery.status === "exported");
  const warning =
    selectedStatus === "exported"
      ? departureWarning(
          chosen.map((r) => r.delivery.processing_date),
          today,
        )
      : "";

  function choose(id: string, checked: boolean) {
    if (disabled) return;
    if (!checked) {
      setSelected((old) => old.filter((value) => value !== id));
      setConfirmedFutureIds((old) => old.filter((value) => value !== id));
      return;
    }
    const row = rows.find((r) => r.delivery.id === id);
    if (!row) return;
    const replace = !!selectedStatus && row.delivery.status !== selectedStatus;
    const future =
      row.delivery.status === "waiting" &&
      row.delivery.processing_date > tomorrow;
    if (replace || future) setPending({ row, replace, future });
    else setSelected((old) => [...new Set([...old, id])]);
  }
  function bulk(items: ShippingRow[]) {
    setSelected(items.map((r) => r.delivery.id));
    setConfirmedFutureIds([]);
    setError("");
  }
  async function exportSelected() {
    setWorking(true);
    setError("");
    try {
      const key = "roots-and-fruits:export-request";
      let requestId = createRequestId();
      const previous = sessionStorage.getItem(key);
      if (previous) {
        const old = JSON.parse(previous);
        if (JSON.stringify([...selected].sort()) === JSON.stringify(old.ids))
          requestId = old.requestId;
      }
      sessionStorage.setItem(
        key,
        JSON.stringify({ requestId, ids: [...selected].sort() }),
      );
      const result = await adminRequest<{ id: string }>("exports", {
        ids: selected,
        requestId,
        confirmedFutureIds,
      });
      sessionStorage.removeItem(key);
      Object.assign(document.createElement("a"), {
        href: `/api/admin/exports/${result.id}`,
      }).click();
      onExported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 text-sm">
          <p className="font-semibold">
            {loading
              ? "발송 목록 조회 중"
              : failed
                ? "발송 목록 조회 실패"
                : `배송지 ${rows.length}건 · 출력 대기 ${waiting.length}건 · 발송 대기 ${exported.length}건`}
          </p>
          <p className="text-muted-foreground">
            출발 예정일 내림차순 · 전체 배송지 표시
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => setHistoryOpen(true)}
          >
            출력 이력
          </Button>
          <Button
            variant="outline"
            disabled={loading || busy || working}
            onClick={onReload}
          >
            새로고침
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        출력 전체 선택: 내일({tomorrow})까지 출발 예정인 {eligible.length}건.
        이후 출발 건은 개별 확인 후 선택할 수 있습니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={disabled || !eligible.length}
          onClick={() => bulk(eligible)}
        >
          출력 대기 전체 선택
        </Button>
        <Button
          variant="outline"
          disabled={disabled || !exported.length}
          onClick={() => bulk(exported)}
        >
          발송 대기 전체 선택
        </Button>
        <Button
          variant="ghost"
          disabled={disabled || !selected.length}
          onClick={() => bulk([])}
        >
          선택 해제
        </Button>
        <Button
          disabled={disabled || selectedStatus !== "waiting" || overLimit}
          onClick={exportSelected}
        >
          선택 엑셀 출력
        </Button>
        <ConfirmAction
          label="선택 발송 완료"
          disabled={disabled || selectedStatus !== "exported" || overLimit}
          description={`선택한 배송지 ${chosen.length}건을 실제 발송했는지 확인해주세요. ${warning}`}
          onConfirm={() => onShip(selected)}
        />
      </div>
      {!!chosen.length && (
        <p role="status" className="text-sm font-semibold">
          {selectedStatus === "waiting" ? "출력 대기" : "발송 대기"} 배송지{" "}
          {chosen.length}건 선택
        </p>
      )}
      {warning && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-950">
          {warning}
        </p>
      )}
      {overLimit && (
        <p role="alert" className="text-sm text-destructive">
          한 번에 최대 {shippingRequestLimit}건을 처리할 수 있습니다. 일부
          선택을 해제한 뒤 나누어 처리해주세요.
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <ShippingList
        rows={rows}
        selected={selected}
        onSelect={choose}
        onOpen={onOpen}
        disabled={disabled}
        today={today}
      />
      {!loading && !failed && !rows.length && <p>발송할 배송지가 없습니다.</p>}
      <ExportHistory
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        busy={disabled}
        today={today}
        onShip={onShip}
      />
      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.future
                ? "예정일보다 먼저 출력할까요?"
                : "선택할 작업을 변경할까요?"}
            </DialogTitle>
            <DialogDescription>
              {pending?.future &&
                `${pending.row.checkout.order_number}번 · ${pending.row.delivery.recipient.name}: ${pending.row.delivery.processing_date} 출발 예정입니다. 내일(${tomorrow}) 이후 출발 건을 미리 출력합니다. 출발 예정일은 변경되지 않습니다. `}
              {pending?.replace &&
                "출력 대기와 발송 대기는 함께 처리할 수 없습니다. 기존 선택을 해제하고 이 배송지를 선택합니다."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              돌아가기
            </Button>
            <Button
              onClick={() => {
                if (!pending) return;
                const { row, replace, future } = pending;
                setSelected((old) => [
                  ...new Set([...(replace ? [] : old), row.delivery.id]),
                ]);
                setConfirmedFutureIds((old) => [
                  ...(replace ? [] : old),
                  ...(future ? [row.delivery.id] : []),
                ]);
                setPending(null);
              }}
            >
              확인 후 선택
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
