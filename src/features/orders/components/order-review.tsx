"use client";

import { OrderActionBar } from "./order-action-bar";
import { SubmitOrder } from "./submit-order";
import type { CatalogCategory } from "@/features/catalog/types";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Product } from "@/features/catalog/types";
import { productLabel } from "@/features/catalog/types";
import type { DeliveryDraft, Sender } from "../schema";
import {
  calculateDeliveryAmounts,
  calculateTotal,
  formatWon,
} from "../calculations";

export function OrderReview({
  category,
  sender,
  deliveries,
  products,
  bundleDiscount = 0,
  preview,
  onEditSender,
  onEdit,
  onRemove,
  onAdd,
  hasPendingDelivery = false,
}: {
  category: CatalogCategory;
  sender: Sender;
  deliveries: DeliveryDraft[];
  products: Product[];
  bundleDiscount?: number;
  preview: boolean;
  onEditSender: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  hasPendingDelivery?: boolean;
}) {
  const byId = new Map(products.map((product) => [product.id, product]));
  return (
    <div>
      <section className="mb-7 flex items-start justify-between gap-3 rounded-2xl bg-secondary/60 p-5">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">보내는 분</p>
          <p className="font-semibold">{sender.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{sender.phone}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onEditSender}>
          <Pencil className="size-3.5" />
          수정
        </Button>
      </section>
      <div className="space-y-4">
        {deliveries.map((delivery, index) => (
          <section
            key={index}
            aria-label={`배송지 ${index + 1} 주문 요약`}
            className="rounded-2xl border border-border p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                <h3 className="font-semibold">
                  {index + 1}. {delivery.recipient.name}
                </h3>
              </div>
              <div className="flex">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(index)}
                  aria-label={`배송지 ${index + 1} 수정`}
                >
                  <Pencil className="size-3.5" />
                  수정
                </Button>
                {deliveries.length > 1 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`배송지 ${index + 1} 삭제`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>이 배송지를 삭제할까요?</DialogTitle>
                        <DialogDescription>
                          아직 접수하지 않은 배송지와 선택한 상품이 삭제돼요.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">돌아가기</Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button onClick={() => onRemove(index)}>
                            배송지 삭제
                          </Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {delivery.recipient.phone}
              <br />({delivery.recipient.postalCode}){" "}
              {delivery.recipient.address}
              <br />
              {delivery.recipient.addressDetail}
            </p>
            {category === "product" && (
              <p className="mt-3 text-xs text-muted-foreground">
                {delivery.deliveryMode === "regular"
                  ? "일반 배송 · 가능한 빠르게 보내드려요"
                  : `예약 배송 · ${delivery.requestedDate}`}
              </p>
            )}
            <ul className="mt-4 space-y-3 border-t border-border pt-4">
              {delivery.items.map((item) => {
                const product = byId.get(item.productId)!;
                return (
                  <li
                    key={item.productId}
                    className="flex justify-between gap-3 text-sm"
                  >
                    <span>
                      {productLabel(product)}
                      <span className="ml-2 text-muted-foreground">
                        × {item.quantity}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatWon(product.price * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-right text-sm text-muted-foreground">
              상품 합계{" "}
              {formatWon(
                calculateDeliveryAmounts(
                  delivery.items,
                  products,
                  bundleDiscount,
                ).subtotal,
              )}{" "}
              {category === "product" && (
                <>
                  · 묶음 할인 −
                  {formatWon(
                    calculateDeliveryAmounts(
                      delivery.items,
                      products,
                      bundleDiscount,
                    ).discount,
                  )}
                </>
              )}
            </p>
            <p className="mt-4 text-right font-semibold tabular-nums">
              {formatWon(
                calculateDeliveryAmounts(
                  delivery.items,
                  products,
                  bundleDiscount,
                ).total,
              )}
            </p>
          </section>
        ))}
      </div>
      <Button
        variant="outline"
        className="mt-5 h-13 w-full rounded-xl border-dashed"
        onClick={onAdd}
      >
        <Plus className="size-4" />
        {hasPendingDelivery ? "배송지 추가 이어쓰기" : "다른 배송지 추가"}
      </Button>
      {hasPendingDelivery && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          작성 중인 추가 배송지가 있어요. 입력을 완료하면 주문에 포함돼요.
        </p>
      )}
      <div className="mt-8 flex items-end justify-between gap-3 border-t border-border pt-6">
        <div>
          <p className="text-xs text-muted-foreground">
            배송지 {deliveries.length}곳
          </p>
          <p className="mt-2 font-semibold">총 결제금액</p>
        </div>
        <strong className="text-2xl text-primary tabular-nums">
          {formatWon(calculateTotal(deliveries, products, bundleDiscount))}
        </strong>
      </div>
      <div
        className="mt-7 rounded-xl bg-secondary p-4 text-sm leading-6 text-muted-foreground"
        role="status"
      >
        {preview
          ? "미리보기의 마지막 단계예요. 입력값은 서버에 저장되지 않으며 실제 주문번호가 발급되지 않아요."
          : "접수 후에는 내용을 수정할 수 없어요. 주문번호를 카운터에 제시하고 결제해주세요."}
      </div>
      <OrderActionBar>
        {preview ? (
          <Button disabled className="h-13 w-full rounded-xl text-base">
            미리보기 · 실제 접수 불가
          </Button>
        ) : (
          <SubmitOrder
            category={category}
            sender={sender}
            deliveries={deliveries}
          />
        )}
      </OrderActionBar>
    </div>
  );
}
