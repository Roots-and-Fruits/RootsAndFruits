"use client";
import { adminProductLabel } from "./schema";
import { createRequestId } from "@/lib/request-id";
import { useEffect, useState } from "react";
import { AdminButton as Button } from "./admin-button";
import { AdminInput as Input, AdminSelect } from "./admin-fields";
import { CheckoutList, ShippingList } from "./order-lists";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { adminRequest } from "./client";
import {
  stateLabel,
  type Checkout,
  type AdminProduct,
  type ExportBatch,
} from "./schema";
import { ConfirmAction } from "./confirm-action";
import { OrderDetail } from "./order-detail";
import { ReorderEditor } from "./reorder-editor";
const filterLabels = [
  ["number", "주문번호"],
  ["sender", "보내는 분"],
  ["recipient", "받는 분"],
  ["date", "접수 날짜"],
  ["processing", "출발 날짜"],
] as const;
export function OrdersAdmin({ section }: { section: string }) {
  const [orders, setOrders] = useState<Checkout[]>([]),
    [count, setCount] = useState(0),
    [products, setProducts] = useState<AdminProduct[]>([]),
    [batches, setBatches] = useState<ExportBatch[]>([]),
    [batchCount, setBatchCount] = useState(0),
    [batchPage, setBatchPage] = useState(0),
    [page, setPage] = useState(0),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [applied, setApplied] = useState<Record<string, string>>({}),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<Checkout | null>(null),
    [reorder, setReorder] = useState<Checkout | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    const query = new URLSearchParams({ ...applied, page: String(page) });
    Promise.all([
      adminRequest<{ orders: Checkout[]; count: number }>(`orders?${query}`),
      adminRequest<AdminProduct[]>("products"),
    ])
      .then(([data, catalog]) => {
        if (live) {
          setOrders(data.orders);
          setCount(data.count);
          setProducts(catalog);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [page, applied, revision]);
  useEffect(() => {
    if (section !== "shipping") return;
    let live = true;
    adminRequest<{ batches: ExportBatch[]; count: number }>(
      `exports?page=${batchPage}`,
    )
      .then((data) => {
        if (live) {
          setBatches(data.batches);
          setBatchCount(data.count);
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [section, revision, batchPage]);
  const reload = () => {
    setLoading(true);
    setRevision((v) => v + 1);
    setSelected([]);
    setDetail(null);
  };
  async function act(path: string, body: unknown, message: string) {
    setBusy(true);
    setError("");
    try {
      await adminRequest(path, body);
      setNotice(message);
      reload();
      return null;
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      return message;
    } finally {
      setBusy(false);
    }
  }
  async function exportSelected() {
    setBusy(true);
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
      });
      sessionStorage.removeItem(key);
      Object.assign(document.createElement("a"), {
        href: `/api/admin/exports/${result.id}`,
      }).click();
      setNotice("엑셀을 생성했습니다. 출력 이력에서 다시 받을 수 있습니다.");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (reorder)
    return (
      <ReorderEditor
        original={reorder}
        products={products}
        onClose={() => setReorder(null)}
        onDone={(number) => {
          setReorder(null);
          setNotice(
            `${number}번으로 재접수했습니다. 원본은 그대로 유지됩니다.`,
          );
          reload();
        }}
      />
    );
  const rows = (loading ? [] : orders).flatMap((c) =>
    c.deliveries
      .filter(
        (d) =>
          (!applied.recipient ||
            d.recipient.name.includes(applied.recipient)) &&
          (!applied.processing || d.processing_date === applied.processing) &&
          (!applied.shipping || d.status === applied.shipping) &&
          (!applied.product ||
            d.order_items.some((i) => i.product_id === applied.product)),
      )
      .map((d) => ({ checkout: c, delivery: d })),
  );
  return (
    <div className="space-y-6 lg:space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive p-4 text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-secondary p-4">
          {notice}
        </p>
      )}
      <form
        className={`grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:gap-x-5 lg:gap-y-3 ${section === "counter" ? "lg:grid-cols-[16rem_auto]" : "lg:grid-cols-4"}`}
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setApplied({ ...filters });
          setSelected([]);
          setLoading(true);
          setRevision((v) => v + 1);
        }}
      >
        {(section === "counter" ? filterLabels.slice(0, 1) : filterLabels).map(
          ([key, label]) => (
            <label
              key={key}
              className="flex min-w-0 flex-col gap-2 text-sm lg:gap-1.5"
            >
              <span>{label}</span>
              <Input
                type={key === "date" || key === "processing" ? "date" : "text"}
                value={filters[key] || ""}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              />
            </label>
          ),
        )}
        {section !== "counter" && (
          <>
            <label className="flex min-w-0 flex-col gap-2 text-sm lg:gap-1.5">
              결제 상태
              <AdminSelect
                value={filters.status || ""}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
              >
                <option value="">전체</option>
                {(["pending", "paid", "cancelled"] as const).map((s) => (
                  <option key={s} value={s}>
                    {stateLabel[s]}
                  </option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex min-w-0 flex-col gap-2 text-sm lg:gap-1.5">
              발송 상태
              <AdminSelect
                value={filters.shipping || ""}
                onChange={(e) =>
                  setFilters({ ...filters, shipping: e.target.value })
                }
              >
                <option value="">전체</option>
                {(["waiting", "exported", "shipped"] as const).map((s) => (
                  <option key={s} value={s}>
                    {stateLabel[s]}
                  </option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex min-w-0 flex-col gap-2 text-sm lg:gap-1.5">
              상품
              <AdminSelect
                value={filters.product || ""}
                onChange={(e) =>
                  setFilters({ ...filters, product: e.target.value })
                }
              >
                <option value="">전체</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id!}>
                    {adminProductLabel(p)}
                  </option>
                ))}
              </AdminSelect>
            </label>
          </>
        )}
        <div
          className={`flex flex-wrap items-end gap-2 ${section === "counter" ? "" : "sm:col-span-2 lg:col-span-4 lg:justify-end lg:border-t lg:pt-3"}`}
        >
          <Button>검색</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFilters({});
              setApplied({});
              setPage(0);
              setSelected([]);
            }}
          >
            초기화
          </Button>
          <Button type="button" variant="ghost" onClick={reload}>
            새로고침
          </Button>
        </div>
      </form>
      <p className="text-xs text-muted-foreground">
        최신 접수순 · 주문번호 내림차순
        {section === "shipping" ? " · 배송지별 표시" : ""}
      </p>
      {loading && <p role="status">주문을 불러오는 중…</p>}
      {section === "shipping" ? (
        <>
          <p className="text-sm text-muted-foreground">
            결제 완료 주문만 출력할 수 있어요. 선택은 현재 목록에서 처리합니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setSelected(
                  rows
                    .filter(
                      (r) =>
                        r.checkout.status === "paid" &&
                        r.delivery.status === "waiting",
                    )
                    .map((r) => r.delivery.id),
                )
              }
            >
              출력 대기 전체 선택
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setSelected(
                  rows
                    .filter(
                      (r) =>
                        r.checkout.status === "paid" &&
                        r.delivery.status === "exported",
                    )
                    .map((r) => r.delivery.id),
                )
              }
            >
              발송 대기 전체 선택
            </Button>
            <Button variant="ghost" onClick={() => setSelected([])}>
              선택 해제
            </Button>
            <Button
              disabled={loading || busy || selected.length === 0}
              onClick={exportSelected}
            >
              선택 엑셀 출력
            </Button>
            <ConfirmAction
              label="선택 발송 완료"
              description="선택한 배송주문을 실제 발송했는지 확인해주세요. 엑셀 출력된 주문만 처리됩니다."
              disabled={loading || busy || selected.length === 0}
              onConfirm={() =>
                act("ship", { ids: selected }, "발송 완료 처리했습니다.")
              }
            />
          </div>
          <ShippingList
            rows={rows}
            selected={selected}
            onSelect={(id, checked) =>
              setSelected((old) =>
                checked ? [...old, id] : old.filter((value) => value !== id),
              )
            }
            onOpen={setDetail}
          />
        </>
      ) : (
        <CheckoutList
          orders={loading ? [] : orders}
          counter={section === "counter"}
          onOpen={setDetail}
        />
      )}
      {!loading && !orders.length && <p>검색 결과가 없습니다.</p>}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          disabled={page === 0}
          onClick={() => {
            setPage(page - 1);
            setSelected([]);
          }}
        >
          이전
        </Button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(count / 30))} · 주문 {count}건
        </span>
        <Button
          variant="outline"
          disabled={(page + 1) * 30 >= count}
          onClick={() => {
            setPage(page + 1);
            setSelected([]);
          }}
        >
          다음
        </Button>
      </div>
      {section === "shipping" && (
        <section className="space-y-4 border-t pt-8">
          <h2 className="text-xl font-semibold">엑셀 출력 이력</h2>
          {batches.map((b) => (
            <article
              key={b.id}
              className="flex flex-col items-start gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="break-all">{b.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(b.created_at).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}{" "}
                  · {b.export_members.length}건 · {b.created_by}
                </p>
                <details className="mt-2 text-sm">
                  <summary>포함 주문 확인</summary>
                  <ul>
                    {b.export_members.map((m) => (
                      <li key={m.delivery_id}>
                        {m.deliveries?.checkouts.order_number}번 ·{" "}
                        {m.deliveries?.recipient.name} ·{" "}
                        {m.deliveries
                          ? stateLabel[m.deliveries.status]
                          : m.delivery_id}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
              <a
                className="text-primary underline"
                href={`/api/admin/exports/${b.id}`}
              >
                재다운로드
              </a>
              <ConfirmAction
                label="묶음 발송 완료"
                description="이 출력 묶음의 모든 배송주문을 발송 완료 처리합니다. 이미 완료된 건은 중복 처리하지 않습니다."
                disabled={busy}
                onConfirm={() =>
                  act(
                    "ship",
                    { ids: b.export_members.map((m) => m.delivery_id) },
                    "묶음 발송 완료 처리했습니다.",
                  )
                }
              />
            </article>
          ))}
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={!batchPage}
              onClick={() => setBatchPage(batchPage - 1)}
            >
              이전 출력 이력
            </Button>
            <Button
              variant="outline"
              disabled={(batchPage + 1) * 30 >= batchCount}
              onClick={() => setBatchPage(batchPage + 1)}
            >
              다음 출력 이력
            </Button>
          </div>
        </section>
      )}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.order_number}번 주문</DialogTitle>
            <DialogDescription>
              POS에서 실제 결제한 뒤 결제 완료를 기록해주세요.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <OrderDetail
              order={detail}
              canPrint={section === "counter" || section === "orders"}
              busy={busy}
              onPay={(paymentMethod) =>
                act(
                  `orders/${detail.id}/pay`,
                  { paymentMethod },
                  "결제 완료를 기록했습니다.",
                )
              }
              onAction={(action) =>
                act(
                  `orders/${detail.id}/${action}`,
                  {},
                  "주문을 취소하고 차감 재고를 반환했습니다.",
                )
              }
              onReorder={() => {
                setReorder(detail);
                setDetail(null);
              }}
              onNote={(id, note) =>
                act(`notes/${id}`, { note }, "메모를 저장했습니다.")
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
