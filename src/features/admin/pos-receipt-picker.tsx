"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { adminRequest } from "./client";

type Info = { date: string; number: number | null };
export function PosReceiptPicker({
  order,
  onClose,
}: {
  order: { id: string; order_number: number };
  onClose: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<{
    number: number;
    orders: number[];
  } | null>(null);
  useEffect(() => {
    let live = true;
    adminRequest<Info>(`pos-receipt/${order.id}`)
      .then((data) => {
        if (live) setInfo(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [order.id]);
  async function save(number: number, allowDuplicate = false) {
    if (!info || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await adminRequest<{
        saved: boolean;
        duplicates?: number[];
      }>(`pos-receipt/${order.id}`, {
        number,
        expected: info.number,
        allowDuplicate,
      });
      if (result.saved) onClose();
      else setConflict({ number, orders: result.duplicates ?? [] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        className="flex h-[calc(100dvh-2rem)] max-h-[900px] flex-col gap-3 overflow-y-auto p-4 sm:max-w-3xl sm:p-7"
      >
        <DialogHeader>
          <DialogTitle className="pr-8 text-xl sm:text-2xl">
            {order.order_number}번 주문 · POS 영수증번호
          </DialogTitle>
          <DialogDescription className="text-base">
            결제는 완료되었어요. POS 영수증에 적힌 번호를 선택해주세요. 나중에
            입력해도 돼요.
          </DialogDescription>
        </DialogHeader>
        {info && (
          <p className="text-base">
            결제일 {info.date} · 현재 번호{" "}
            <strong>{info.number ?? "미입력"}</strong>
          </p>
        )}
        {error && (
          <p role="alert" className="text-base text-destructive">
            {error}
          </p>
        )}
        {!info && !error && <p role="status">영수증 정보를 불러오는 중…</p>}
        {conflict ? (
          <div className="flex flex-1 flex-col justify-center gap-5 rounded-xl bg-secondary p-6">
            <h3 className="text-2xl font-bold">
              {conflict.number}번이 이미 사용 중이에요.
            </h3>
            <p className="text-lg">
              같은 결제일의 주문 {conflict.orders.join(", ")}번에 입력된
              번호예요. 같은 번호로 저장할까요?
            </p>
            <Button
              disabled={busy}
              className="min-h-14 text-lg"
              onClick={() => void save(conflict.number, true)}
            >
              같은 번호로 저장
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              className="min-h-14 text-lg"
              onClick={() => setConflict(null)}
            >
              다른 번호 선택
            </Button>
          </div>
        ) : (
          <>
            <div className="grid min-h-[280px] flex-1 grid-cols-5 grid-rows-5 gap-2 sm:gap-3">
              {Array.from({ length: 25 }, (_, i) => page * 25 + i + 1).map(
                (number) => (
                  <Button
                    key={number}
                    disabled={!info || busy}
                    variant={info?.number === number ? "default" : "outline"}
                    className="h-full min-h-12 text-xl font-bold sm:text-3xl"
                    aria-label={`영수증번호 ${number}`}
                    onClick={() => void save(number)}
                  >
                    {number}
                  </Button>
                ),
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                className="min-h-12 text-base"
                disabled={page === 0 || busy}
                onClick={() => setPage(page - 1)}
              >
                이전 25개
              </Button>
              <strong aria-live="polite">
                {page * 25 + 1}~{page * 25 + 25}
              </strong>
              <Button
                variant="outline"
                className="min-h-12 text-base"
                disabled={busy || page >= 85899344}
                onClick={() => setPage(page + 1)}
              >
                다음 25개
              </Button>
            </div>
          </>
        )}
        <Button
          variant="secondary"
          className="min-h-14 w-full text-lg"
          disabled={busy}
          onClick={onClose}
        >
          {busy ? "저장 중…" : "건너뛰기 · 닫기"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function PosReceiptSummary({ id }: { id: string }) {
  const [text, setText] = useState("영수증번호 확인 중…");
  useEffect(() => {
    let live = true;
    adminRequest<Info>(`pos-receipt/${id}`)
      .then((info) => {
        if (live)
          setText(
            `POS 영수증번호: ${info.number ?? "미입력"} · 결제일 ${info.date}`,
          );
      })
      .catch(() => {
        if (live)
          setText(
            "영수증번호를 불러오지 못했습니다. 번호 입력창에서 다시 확인해주세요.",
          );
      });
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <p className="rounded-xl bg-secondary p-4 text-base" role="status">
      {text}
    </p>
  );
}
