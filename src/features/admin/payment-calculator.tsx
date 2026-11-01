"use client";

import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatWon } from "@/features/orders/calculations";
import { AdminButton as Button } from "./admin-button";
import { AdminInput as Input } from "./admin-fields";
import { adminRequest } from "./client";
import { summarizeOrderItems, summarizePayment } from "./order-summary";
import type { Checkout } from "./schema";

export function PaymentCalculator({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Calculator aria-hidden="true" />
          결제금액 합산
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-5 sm:max-w-5xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl">결제금액 합산</DialogTitle>
          <DialogDescription>
            결제 대기 주문을 선택해 POS에 입력할 상품과 금액을 확인하세요. 기존
            할인만 유지하며 추가 묶음할인은 적용하지 않습니다.
          </DialogDescription>
        </DialogHeader>
        {open && <CalculatorBody />}
      </DialogContent>
    </Dialog>
  );
}

function CalculatorBody() {
  const [number, setNumber] = useState("");
  const [query, setQuery] = useState({ number: "", page: 0, revision: 0 });
  const [result, setResult] = useState<{
    orders: Checkout[];
    count: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Checkout[]>([]);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const params = new URLSearchParams({
      status: "pending",
      number: query.number,
      page: String(query.page),
    });
    adminRequest<{ orders: Checkout[]; count: number }>(
      `orders?${params}`,
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (live) {
          setResult(data);
          // Reconcile any selected orders returned by a newer search.
          setSelected((previous) =>
            previous.flatMap((order) => {
              const latest = data.orders.find(
                (candidate) => candidate.id === order.id,
              );
              return latest
                ? latest.status === "pending"
                  ? [latest]
                  : []
                : [order];
            }),
          );
        }
      })
      .catch((cause: Error) => {
        if (live) setError(cause.message);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [query]);
  const search = (nextNumber: string, page = 0) => {
    setError("");
    setResult(null);
    setQuery((previous) => ({
      number: nextNumber,
      page,
      revision: previous.revision + 1,
    }));
  };
  const summary = summarizePayment(selected);
  const remove = (id: string) =>
    setSelected((previous) => previous.filter((order) => order.id !== id));
  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-2">
      <section className="min-w-0 space-y-3" aria-label="합산할 주문 선택">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            search(number.trim());
          }}
        >
          <label className="min-w-0 flex-1 space-y-1">
            <span>주문번호</span>
            <Input
              inputMode="numeric"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
            />
          </label>
          <Button type="submit">검색</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setNumber("");
              search("");
            }}
          >
            초기화
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">
          결제 대기 · 최신 접수순 · 검색 후에도 선택 유지
        </p>
        {error ? (
          <div role="alert" className="space-y-2 text-destructive">
            <p>{error}</p>
            <Button
              variant="outline"
              onClick={() => search(query.number, query.page)}
            >
              다시 불러오기
            </Button>
          </div>
        ) : !result ? (
          <p role="status">주문을 불러오는 중…</p>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto rounded-xl border md:max-h-[48dvh]">
              {result.orders
                .filter((order) => order.status === "pending")
                .map((order) => {
                  const checked = selected.some(
                    (candidate) => candidate.id === order.id,
                  );
                  return (
                    <label
                      key={order.id}
                      className="flex cursor-pointer items-start gap-3 border-b p-3 last:border-b-0 hover:bg-muted/50"
                    >
                      <input
                        className="mt-1 size-5 shrink-0 accent-primary"
                        type="checkbox"
                        aria-label={`${order.order_number}번 ${order.sender.name} 선택`}
                        checked={checked}
                        onChange={() =>
                          checked
                            ? remove(order.id)
                            : setSelected((previous) => [...previous, order])
                        }
                      />
                      <span className="min-w-0 flex-1 space-y-1 break-words">
                        <span className="block text-base font-semibold">
                          {order.order_number}번 · {order.sender.name}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {summarizeOrderItems(order)
                            .map((item) => `${item.label} × ${item.quantity}개`)
                            .join(" · ")}
                        </span>
                        <span className="block text-lg font-semibold">
                          {formatWon(order.total)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              {!result.orders.length && (
                <p className="p-4">결제 대기 주문이 없습니다.</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={query.page === 0}
                onClick={() => search(query.number, query.page - 1)}
              >
                이전
              </Button>
              <span className="text-sm">
                {query.page + 1} / {Math.max(1, Math.ceil(result.count / 30))} ·{" "}
                {result.count}건
              </span>
              <Button
                variant="outline"
                disabled={(query.page + 1) * 30 >= result.count}
                onClick={() => search(query.number, query.page + 1)}
              >
                다음
              </Button>
            </div>
          </>
        )}
      </section>
      <section className="min-w-0 space-y-4" aria-label="선택 주문 합산 결과">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">
            선택한 주문 {summary.count}건
          </h3>
          <Button
            variant="ghost"
            disabled={!selected.length}
            onClick={() => setSelected([])}
          >
            선택 해제
          </Button>
        </div>
        {!selected.length ? (
          <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
            합산할 주문을 선택해주세요.
          </p>
        ) : (
          <>
            <ul className="max-h-36 overflow-y-auto divide-y rounded-xl border px-3">
              {selected.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="min-w-0 break-words">
                    {order.order_number}번 · {order.sender.name}
                    <span className="block font-semibold">
                      {formatWon(order.total)}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    aria-label={`${order.order_number}번 선택 해제`}
                    onClick={() => remove(order.id)}
                  >
                    해제
                  </Button>
                </li>
              ))}
            </ul>
            <div>
              <h3 className="mb-2 font-semibold">상품별 합계</h3>
              <ul className="divide-y rounded-xl border px-3">
                {summary.items.map((item) => (
                  <li
                    key={item.key}
                    className="flex flex-wrap justify-between gap-2 py-3"
                  >
                    <div className="min-w-0 flex-1 break-words">
                      <p className="font-semibold">{item.label}</p>
                      <p className="text-muted-foreground">
                        {formatWon(item.unitPrice)} × {item.quantity}개
                      </p>
                    </div>
                    <strong>{formatWon(item.amount)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        <div
          className="space-y-2 rounded-xl bg-secondary p-4"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="flex flex-wrap justify-between gap-2">
            <span>상품 금액 합계</span>
            <span>{formatWon(summary.subtotal)}</span>
          </p>
          <p className="flex flex-wrap justify-between gap-2">
            <span>기존 할인 합계</span>
            <span>−{formatWon(summary.discount)}</span>
          </p>
          <p className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-3">
            <span className="font-semibold">합산 결제금액</span>
            <strong className="text-3xl tabular-nums">
              {formatWon(summary.total)}
            </strong>
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          조회한 주문 금액의 단순 합산입니다. POS 결제 후 각 주문에서 결제
          완료를 기록해주세요.
        </p>
      </section>
    </div>
  );
}
