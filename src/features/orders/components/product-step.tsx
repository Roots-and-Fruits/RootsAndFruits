"use client";

import { Minus, Plus, PackageCheck, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  isSoldOut,
  productLabel,
  type Product,
  type CatalogCategory,
} from "@/features/catalog/types";
import type { OrderLine } from "../schema";
import { calculateDeliveryAmounts, formatWon } from "../calculations";
import { StepActions } from "./step-actions";

export function ProductStep({
  category,
  products,
  bundleDiscount = 0,
  items,
  onChange,
  onBack,
  onNext,
  showActions = true,
}: {
  category: CatalogCategory;
  products: Product[];
  bundleDiscount?: number;
  items: OrderLine[];
  onChange: (items: OrderLine[]) => void;
  onBack?: () => void;
  onNext?: () => void;
  showActions?: boolean;
}) {
  const experience = category === "experience";
  const groups = Map.groupBy(products, (product) =>
    experience ? "체험 상품" : product.fruitType!,
  );
  function updateQuantity(product: Product, quantity: number) {
    const rest = items.filter((line) => line.productId !== product.id);
    onChange(
      quantity > 0 ? [...rest, { productId: product.id, quantity }] : rest,
    );
  }
  return (
    <div>
      {experience && (
        <aside
          aria-label="체험 과일 포장 안내"
          className="mb-4 flex items-start gap-3 rounded-xl border border-primary/25 bg-secondary px-4 py-3.5"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <PackageCheck aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 break-keep">
            <h3 className="text-base font-bold leading-6 text-primary">
              박스 포장비 포함
            </h3>
            <p className="mt-1 text-sm leading-6">
              직접 수확한 과일을 포장해 보내드리는 금액이에요.
            </p>
          </div>
        </aside>
      )}
      {!experience && bundleDiscount > 0 && (
        <p className="mb-4 rounded-xl bg-secondary px-3 py-2.5 text-sm">
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
        <div className="space-y-5">
          {[...groups].map(([fruit, group]) => (
            <section key={fruit} aria-label={fruit}>
              {!experience && (
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                  {fruit}
                </h3>
              )}
              <div className="divide-y divide-border rounded-xl border border-border">
                {group.map((product) => {
                  const count =
                    items.find((item) => item.productId === product.id)
                      ?.quantity ?? 0;
                  const unavailable = isSoldOut(product) && count === 0;
                  return (
                    <article
                      key={product.id}
                      className={`flex flex-nowrap items-center justify-between gap-3 px-3 py-2.5 sm:px-4 ${unavailable ? "opacity-55" : ""}`}
                      aria-label={productLabel(product)}
                    >
                      <div className="min-w-0 flex-1 break-words">
                        <p className="text-sm font-semibold leading-5">
                          {experience ? (
                            product.description
                          ) : (
                            <>
                              {product.weightGrams! / 1000}kg{" "}
                              <span className="ml-1 text-sm font-normal text-muted-foreground">
                                {product.description}
                              </span>
                            </>
                          )}
                        </p>
                        {product.unavailableReason && (
                          <p className="mt-1 text-xs text-destructive">
                            {product.unavailableReason}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm tabular-nums">
                            {formatWon(product.price)}
                          </span>
                          {!experience && product.bundleEligible && (
                            <Badge
                              variant="secondary"
                              className="px-1.5 text-[11px]"
                            >
                              묶음 할인 대상
                            </Badge>
                          )}
                        </div>
                      </div>
                      {unavailable ? (
                        <Badge variant="secondary">품절</Badge>
                      ) : (
                        <div className="flex w-fit flex-none items-center rounded-full border border-border bg-background">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-11 rounded-full"
                            aria-label={`${productLabel(product)} 수량 줄이기`}
                            disabled={count === 0}
                            onClick={() => updateQuantity(product, count - 1)}
                          >
                            <Minus className="size-4" />
                          </Button>
                          <output
                            className="min-w-6 text-center text-sm font-semibold tabular-nums"
                            aria-label={`${productLabel(product)} 수량`}
                          >
                            {count}
                          </output>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-11 rounded-full"
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
      <p className="mt-3 text-right text-sm text-muted-foreground">
        상품 합계{" "}
        {formatWon(
          calculateDeliveryAmounts(items, products, bundleDiscount).subtotal,
        )}{" "}
        {!experience && (
          <>
            · 묶음 할인 −
            {formatWon(
              calculateDeliveryAmounts(items, products, bundleDiscount)
                .discount,
            )}
          </>
        )}
      </p>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
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
