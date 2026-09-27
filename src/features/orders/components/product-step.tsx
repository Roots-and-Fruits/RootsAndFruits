"use client";

import { Minus, Plus, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  isSoldOut,
  productLabel,
  type Product,
} from "@/features/catalog/types";
import type { OrderLine } from "../schema";
import { calculateDeliveryAmounts, formatWon } from "../calculations";
import { StepActions } from "./step-actions";

export function ProductStep({
  products,
  bundleDiscount = 0,
  items,
  onChange,
  onBack,
  onNext,
  showActions = true,
}: {
  products: Product[];
  bundleDiscount?: number;
  items: OrderLine[];
  onChange: (items: OrderLine[]) => void;
  onBack?: () => void;
  onNext?: () => void;
  showActions?: boolean;
}) {
  const groups = Map.groupBy(products, (product) => product.fruitType);
  function updateQuantity(product: Product, quantity: number) {
    const rest = items.filter((line) => line.productId !== product.id);
    onChange(
      quantity > 0 ? [...rest, { productId: product.id, quantity }] : rest,
    );
  }
  return (
    <div>
      {bundleDiscount > 0 && (
        <p className="mb-5 rounded-xl bg-secondary p-4 text-sm">
          이 배송지의 할인 대상 상품 2개마다 {formatWon(bundleDiscount)}{" "}
          할인돼요. 종류가 달라도 합산하며, 3개는 1회·4개는 2회 할인이에요.
        </p>
      )}
      {products.length === 0 ? (
        <div className="rounded-2xl bg-secondary/40 px-5 py-12 text-center">
          <PackageOpen className="mx-auto mb-4 size-8 text-muted-foreground" />
          <h3 className="font-semibold">
            주문할 수 있는 상품을 준비 중이에요.
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            상품 안내는 현장 카운터에 문의해주세요.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {[...groups].map(([fruit, group]) => (
            <section key={fruit} aria-label={fruit}>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                {fruit}
              </h3>
              <div className="divide-y divide-border rounded-2xl border border-border">
                {group.map((product) => {
                  const count =
                    items.find((item) => item.productId === product.id)
                      ?.quantity ?? 0;
                  const unavailable = isSoldOut(product) && count === 0;
                  return (
                    <article
                      key={product.id}
                      className={`flex flex-wrap items-center justify-between gap-4 p-5 ${unavailable ? "opacity-55" : ""}`}
                      aria-label={productLabel(product)}
                    >
                      <div>
                        <p className="font-semibold">
                          {product.weightGrams / 1000}kg{" "}
                          <span className="ml-1 text-sm font-normal text-muted-foreground">
                            {product.description}
                          </span>
                        </p>
                        {product.unavailableReason && (
                          <p className="mt-2 text-sm text-destructive">
                            {product.unavailableReason}
                          </p>
                        )}
                        {product.bundleEligible && (
                          <Badge variant="secondary" className="mt-2">
                            묶음 할인 대상
                          </Badge>
                        )}
                        <p className="mt-2 text-sm">
                          {formatWon(product.price)}
                        </p>
                      </div>
                      {unavailable ? (
                        <Badge variant="secondary">품절</Badge>
                      ) : (
                        <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-10 rounded-full"
                            aria-label={`${productLabel(product)} 수량 줄이기`}
                            disabled={count === 0}
                            onClick={() => updateQuantity(product, count - 1)}
                          >
                            <Minus className="size-4" />
                          </Button>
                          <output
                            className="min-w-7 text-center font-semibold tabular-nums"
                            aria-label={`${productLabel(product)} 수량`}
                          >
                            {count}
                          </output>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-10 rounded-full"
                            aria-label={`${productLabel(product)} 수량 늘리기`}
                            onClick={() => updateQuantity(product, count + 1)}
                          >
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="mt-4 text-right text-sm text-muted-foreground">
        상품 합계{" "}
        {formatWon(
          calculateDeliveryAmounts(items, products, bundleDiscount).subtotal,
        )}{" "}
        · 묶음 할인 −
        {formatWon(
          calculateDeliveryAmounts(items, products, bundleDiscount).discount,
        )}
      </p>
      <div className="mt-7 flex items-center justify-between rounded-xl bg-secondary p-5">
        <span className="text-sm text-muted-foreground">
          이 배송지 · 총 {items.reduce((sum, item) => sum + item.quantity, 0)}
          박스
        </span>
        <strong className="text-lg tabular-nums">
          {formatWon(
            calculateDeliveryAmounts(items, products, bundleDiscount).total,
          )}
        </strong>
      </div>
      <p className="mt-3 text-right text-xs text-muted-foreground">
        배송비가 포함된 금액이에요.
      </p>
      {showActions && (
        <StepActions
          onBack={onBack}
          onNext={onNext}
          disabled={items.length === 0}
        />
      )}
    </div>
  );
}
