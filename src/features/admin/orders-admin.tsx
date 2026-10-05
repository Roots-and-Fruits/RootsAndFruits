"use client";
import { adminProductLabel } from "./schema";
import { useEffect, useState } from "react";
import { AdminButton as Button } from "./admin-button";
import { AdminInput as Input, AdminSelect } from "./admin-fields";
import { CheckoutList } from "./order-lists";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { adminRequest } from "./client";
import { stateLabel, type Checkout, type AdminProduct } from "./schema";
import { ShippingWorkspace } from "./shipping-workspace";
import { shippingRows } from "./shipping-work";
import { OrderDetail } from "./order-detail";
import { ReorderEditor } from "./reorder-editor";
import { markAdminReady } from "./timing-client";
import { CounterRefreshButton } from "./counter-refresh-button";
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
    [products, setProducts] = useState<AdminProduct[] | null>(null),
    [catalogError, setCatalogError] = useState(""),
    [catalogRevision, setCatalogRevision] = useState(0),
    [serverTime, setServerTime] = useState(""),
    [page, setPage] = useState(0),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [applied, setApplied] = useState<Record<string, string>>({}),
    [revision, setRevision] = useState(0),
    [detail, setDetail] = useState<Checkout | null>(null),
    [reorder, setReorder] = useState<Checkout | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [listError, setListError] = useState(""),
    [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    if (!loading && !error && !listError)
      markAdminReady(section, "orders_committed");
  }, [loading, error, listError, section]);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const query = new URLSearchParams({ ...applied, page: String(page) });
    adminRequest<{ orders: Checkout[]; count: number; serverTime?: string }>(
      section === "shipping" ? "shipping" : `orders?${query}`,
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (live) {
          if (
            section === "shipping" &&
            shippingRows(data.orders).length !== data.count
          )
            throw new Error(
              "발송 목록을 모두 불러오지 못했습니다. 새로고침해주세요.",
            );
          setServerTime(data.serverTime ?? "");
          setLoadFailed(false);
          setListError("");
          setOrders(data.orders);
          setCount(data.count);
          setLoading(false);
          setRefreshing(false);
        }
      })
      .catch((e) => {
        if (live) {
          if (section === "counter") setListError(e.message);
          else setError(e.message);
          setLoadFailed(true);
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [section, page, applied, revision]);
  useEffect(() => {
    // The counter displays order snapshots; only filter menus need the catalog.
    if (section !== "orders") return;
    let live = true;
    const controller = new AbortController();
    adminRequest<AdminProduct[]>("products", undefined, controller.signal)
      .then((catalog) => {
        if (live) {
          setProducts(catalog);
          setCatalogError("");
        }
      })
      .catch((e) => live && setCatalogError(e.message));
    return () => {
      live = false;
      controller.abort();
    };
  }, [section, catalogRevision]);
  const reload = () => {
    setError("");
    setLoading(true);
    setRevision((v) => v + 1);
    setDetail(null);
    setCatalogRevision((v) => v + 1);
  };
  const refreshCounter = () => {
    if (loading || refreshing || busy || detail || reorder || document.hidden)
      return;
    setRefreshing(true);
    setRevision((v) => v + 1);
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
  if (reorder)
    return (
      <ReorderEditor
        original={reorder}
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
      {listError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive p-4 text-destructive"
        >
          주문 목록을 갱신하지 못했습니다.{" "}
          {orders.length > 0 && "이전 목록을 표시하고 있습니다. "}
          {listError} 자동으로 다시 시도하며 새로고침 버튼으로도 재시도할 수
          있습니다.
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-secondary p-4">
          {notice}
        </p>
      )}
      {section !== "shipping" && (
        <form
          className={`grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:gap-x-5 lg:gap-y-3 ${section === "counter" ? "lg:grid-cols-[16rem_auto]" : "lg:grid-cols-4"}`}
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            setPage(0);
            setApplied({ ...filters });
            setLoading(true);
            setRevision((v) => v + 1);
          }}
        >
          {(section === "counter"
            ? filterLabels.slice(0, 1)
            : filterLabels
          ).map(([key, label]) => (
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
          ))}
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
                  disabled={products === null}
                  onChange={(e) =>
                    setFilters({ ...filters, product: e.target.value })
                  }
                >
                  <option value="">
                    {products === null
                      ? catalogError
                        ? "상품 목록 조회 실패"
                        : "상품 목록 불러오는 중…"
                      : "전체"}
                  </option>
                  {(products ?? []).map((p) => (
                    <option key={p.id} value={p.id!}>
                      {adminProductLabel(p)}
                    </option>
                  ))}
                </AdminSelect>
                {catalogError && (
                  <span role="alert" className="text-xs text-destructive">
                    상품 검색 목록: {catalogError}
                  </span>
                )}
              </label>
              {catalogError && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCatalogRevision((v) => v + 1)}
                >
                  상품 목록 다시 불러오기
                </Button>
              )}
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
                setLoading(true);
                setFilters({});
                setApplied({});
                setPage(0);
              }}
            >
              초기화
            </Button>
            {section === "counter" ? (
              <CounterRefreshButton
                paused={!!detail || !!reorder || busy}
                refreshing={loading || refreshing}
                onRefresh={refreshCounter}
              />
            ) : (
              <Button type="button" variant="ghost" onClick={reload}>
                새로고침
              </Button>
            )}
          </div>
        </form>
      )}
      {section !== "shipping" && (
        <p className="text-xs text-muted-foreground">
          최신 접수순 · 주문번호 내림차순
        </p>
      )}
      {loading && <p role="status">주문을 불러오는 중…</p>}
      {section === "shipping" ? (
        <ShippingWorkspace
          key={revision}
          rows={loading || loadFailed ? [] : shippingRows(orders)}
          serverTime={serverTime}
          loading={loading}
          failed={loadFailed}
          busy={busy}
          onOpen={setDetail}
          onReload={reload}
          onExported={() => {
            setNotice(
              "엑셀을 생성했습니다. 출력 이력에서 다시 받을 수 있습니다.",
            );
            reload();
          }}
          onShip={(ids) => act("ship", { ids }, "발송 완료 처리했습니다.")}
        />
      ) : (
        <>
          <CheckoutList
            orders={loading ? [] : orders}
            counter={section === "counter"}
            onOpen={setDetail}
          />
          {!loading && !loadFailed && !orders.length && (
            <p>검색 결과가 없습니다.</p>
          )}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              disabled={page === 0}
              onClick={() => {
                setLoading(true);
                setPage(page - 1);
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
                setLoading(true);
                setPage(page + 1);
              }}
            >
              다음
            </Button>
          </div>
        </>
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
