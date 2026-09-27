"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { AdminButton as Button } from "./admin-button";
import type { AdminProduct } from "./schema";
import { formatWon } from "@/features/orders/calculations";

type Group = { fruit: string; products: AdminProduct[] };
export function groupProducts(products: AdminProduct[]): Group[] {
  const groups = new Map<string, AdminProduct[]>();
  for (const p of products)
    groups.set(p.fruit_type, [...(groups.get(p.fruit_type) ?? []), p]);
  return [...groups].map(([fruit, products]) => ({ fruit, products }));
}
function SortableItem({
  id,
  label,
  disabled,
  children,
  group = false,
}: {
  id: string;
  label: string;
  disabled: boolean;
  group?: boolean;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      disabled={disabled}
      className="flex size-11 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30 cursor-grab active:cursor-grabbing lg:size-9"
    >
      <GripVertical className="size-5" aria-hidden="true" />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`${isDragging ? "shadow-lg ring-2 ring-primary" : ""} ${group ? "rounded-xl border bg-card" : "border-b bg-card last:border-b-0"}`}
    >
      {group ? (
        <>
          {/* Group handle does not intercept item drag gestures. */}
          <div className="flex items-center gap-2 rounded-t-xl border-b bg-secondary/50 px-3 py-2">
            {handle}
            <h2 className="font-semibold">{id}</h2>
          </div>
          {children}
        </>
      ) : (
        <article className="flex min-w-0 items-center gap-2 px-2 py-3 lg:px-3 lg:py-2">
          {handle}
          {children}
        </article>
      )}
    </div>
  );
}

function ReorderArea({
  ids,
  onMove,
  children,
}: {
  ids: string[];
  onMove: (from: number, to: number) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  function end({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id)),
      to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onMove(from, to);
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={end}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "스페이스 키로 이동을 시작하고 방향키로 위치를 선택한 뒤 스페이스 키로 놓으세요. 취소하려면 Escape 키를 누르세요.",
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function ProductSortList({
  products,
  disabled,
  onDirtyChange,
  onSave,
  onReload,
  onEdit,
}: {
  products: AdminProduct[];
  disabled: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (ids: string[]) => Promise<void>;
  onReload: () => Promise<void>;
  onEdit: (product: AdminProduct) => void;
}) {
  const initial = groupProducts(products);
  const [groups, setGroups] = useState(initial);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ids = groups.flatMap((g) => g.products.map((p) => p.id!));
  const dirty =
    JSON.stringify(ids) !==
    JSON.stringify(initial.flatMap((g) => g.products.map((p) => p.id!)));
  function change(next: Group[]) {
    setGroups(next);
    onDirtyChange(
      JSON.stringify(next.flatMap((g) => g.products.map((p) => p.id!))) !==
        JSON.stringify(initial.flatMap((g) => g.products.map((p) => p.id!))),
    );
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <div className="space-y-4">
      <div className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="text-sm">
          <p>손잡이를 드래그해 과일 그룹과 그룹 안 상품 순서를 바꿔주세요.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {dirty
              ? "변경한 순서가 아직 저장되지 않았습니다. 저장하거나 취소한 뒤 상품을 편집해주세요."
              : "순서 저장 후 고객 상품 목록에 반영됩니다. 판매 중지 상품도 정렬할 수 있습니다."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={!dirty || busy || disabled}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onSave(ids);
                onDirtyChange(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "저장 중…" : "순서 저장"}
          </Button>
          <Button
            variant="outline"
            disabled={!dirty || busy || disabled}
            onClick={() => {
              change(initial);
              setError("");
            }}
          >
            순서 취소
          </Button>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-destructive p-4 text-sm text-destructive"
        >
          <p>{error}</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onReload();
                setGroups(initial);
                setError("");
                onDirtyChange(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            변경 취소하고 목록 새로고침
          </Button>
        </div>
      )}
      <ReorderArea
        ids={groups.map((g) => g.fruit)}
        onMove={(from, to) => change(arrayMove(groups, from, to))}
      >
        <div className="space-y-4">
          {groups.map((g, gi) => (
            <SortableItem
              key={g.fruit}
              id={g.fruit}
              label={`${g.fruit} 그룹 순서 이동`}
              disabled={disabled || busy}
              group
            >
              <ReorderArea
                ids={g.products.map((p) => p.id!)}
                onMove={(from, to) =>
                  change(
                    groups.map((old, i) =>
                      i === gi
                        ? {
                            ...old,
                            products: arrayMove(old.products, from, to),
                          }
                        : old,
                    ),
                  )
                }
              >
                {g.products.map((p) => (
                  <SortableItem
                    key={p.id}
                    id={p.id!}
                    label={`${p.fruit_type} ${p.weight_grams / 1000}kg ${p.description} 순서 이동`}
                    disabled={disabled || busy}
                  >
                    <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-x-4 gap-y-2 text-sm lg:grid-cols-[minmax(0,1fr)_7rem_5rem_8rem_7rem]">
                      <div className="col-span-2 min-w-0 lg:col-span-1">
                        <h3 className="break-words font-semibold">
                          {p.fruit_type} {p.weight_grams / 1000}kg
                        </h3>
                        <p className="mt-1 break-words text-muted-foreground">
                          {p.description}
                        </p>
                      </div>
                      <p className="font-medium tabular-nums">
                        {formatWon(p.price)}
                      </p>
                      <p
                        className={
                          p.is_active ? "text-primary" : "text-muted-foreground"
                        }
                      >
                        {p.is_active ? "판매 중" : "판매 중지"}
                      </p>
                      <p
                        className={
                          (p.stock_quantity ?? 0) < 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }
                      >
                        {p.inventory_enabled
                          ? `재고 ${p.stock_quantity ?? 0}개${(p.stock_quantity ?? 0) < 0 ? " · 초과 판매" : ""}`
                          : "재고 관리 안 함"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.bundle_eligible ? "묶음 할인 대상" : "할인 비대상"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={dirty || busy || disabled}
                      onClick={() => onEdit(p)}
                    >
                      수정
                    </Button>
                  </SortableItem>
                ))}
              </ReorderArea>
            </SortableItem>
          ))}
        </div>
      </ReorderArea>
      {!groups.length && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          등록된 상품이 없습니다.
        </p>
      )}
    </div>
  );
}
