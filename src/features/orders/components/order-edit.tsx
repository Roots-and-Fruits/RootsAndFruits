"use client";

import { useEffect, useRef } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { CatalogCategory, Product } from "@/features/catalog/types";
import {
  senderSchema,
  recipientSchema,
  type Sender,
  type DeliveryDraft,
} from "../schema";
import {
  addDays,
  calculateTotal,
  formatWon,
  isAllowedScheduledDate,
} from "../calculations";
import { useDraftForm } from "../use-draft-form";
import { OrderActionBar } from "./order-action-bar";
import { SenderFields } from "./sender-step";
import { RecipientFields } from "./recipient-step";
import { AddressFields } from "./address-step";
import { ProductStep } from "./product-step";
import { DeliveryDateStep } from "./delivery-date-step";

function editSchema(today: string, maxDays: number) {
  return z.object({
    sender: senderSchema,
    deliveries: z
      .array(
        z
          .object({
            recipient: recipientSchema,
            items: z
              .array(
                z.object({
                  productId: z.string(),
                  quantity: z.number().int().positive(),
                }),
              )
              .min(1, "이 배송지에 보낼 상품을 하나 이상 선택해주세요."),
            deliveryMode: z.enum(["regular", "scheduled"]),
            requestedDate: z.string(),
          })
          .superRefine((delivery, ctx) => {
            if (
              delivery.deliveryMode === "scheduled" &&
              !isAllowedScheduledDate(delivery.requestedDate, today, maxDays)
            ) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["requestedDate"],
                message:
                  "선택 가능한 기간의 날짜를 입력해주세요. 일요일은 선택할 수 없어요.",
              });
            }
          }),
      )
      .min(1),
  });
}

type EditValues = { sender: Sender; deliveries: DeliveryDraft[] };

export function OrderEdit({
  sender,
  deliveries,
  products,
  category,
  today,
  maxDays,
  preview,
  initialSection,
  onSave,
  onChange,
  onCancel,
}: {
  sender: Sender;
  deliveries: DeliveryDraft[];
  products: Product[];
  category: CatalogCategory;
  today: string;
  maxDays: number;
  preview: boolean;
  initialSection: "sender" | number;
  onChange: (value: EditValues) => void;
  onSave: (value: EditValues) => void;
  onCancel: () => void;
}) {
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema(today, maxDays)),
    defaultValues: { sender, deliveries },
  });
  useDraftForm(form, onChange);
  const values = useWatch({
    control: form.control,
    defaultValue: { sender, deliveries },
  }) as EditValues;
  const targetRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    targetRef.current?.focus({ preventScroll: true });
    targetRef.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(
          (value) =>
            onSave({
              ...value,
              deliveries: value.deliveries.map((delivery) => ({
                ...delivery,
                requestedDate:
                  delivery.deliveryMode === "regular"
                    ? addDays(today, 2)
                    : delivery.requestedDate,
              })),
            }),
          () => {
            // Product and date controls are not registered text inputs; focus their error too.
            requestAnimationFrame(() => {
              const error = document.querySelector<HTMLElement>(
                "[data-edit-form] [role='alert']",
              );
              error?.scrollIntoView({ block: "center" });
              error?.focus();
            });
          },
        )}
        data-edit-form
      >
        <section aria-label="보내는 분 수정" className="space-y-6">
          <h2
            ref={initialSection === "sender" ? targetRef : undefined}
            tabIndex={-1}
            className="scroll-mt-8 text-lg font-semibold"
          >
            보내는 분
          </h2>
          <SenderFields prefix="sender." />
        </section>
        {values.deliveries.map((delivery, index) => (
          <section
            key={index}
            aria-label={`배송지 ${index + 1} 수정`}
            className="mt-10 space-y-7 border-t border-border pt-8"
          >
            <h2
              ref={initialSection === index ? targetRef : undefined}
              tabIndex={-1}
              className="scroll-mt-8 text-lg font-semibold"
            >
              배송지 {index + 1}
            </h2>
            <RecipientFields
              sender={values.sender}
              prefix={`deliveries.${index}.recipient.`}
              idPrefix={`edit-${index}`}
            />
            <AddressFields
              preview={preview}
              prefix={`deliveries.${index}.recipient.`}
              idPrefix={`edit-${index}`}
            />
            <div>
              <h3 className="mb-5 font-semibold">보낼 상품</h3>
              <Controller
                control={form.control}
                name={`deliveries.${index}.items`}
                render={({ field, fieldState }) => (
                  <>
                    <ProductStep
                      products={products}
                      items={field.value}
                      onChange={field.onChange}
                      showActions={false}
                    />
                    {fieldState.error && (
                      <p
                        role="alert"
                        tabIndex={-1}
                        className="mt-3 text-sm text-destructive"
                      >
                        {fieldState.error.message}
                      </p>
                    )}
                  </>
                )}
              />
            </div>
            {category === "product" ? (
              <div>
                <h3 className="mb-5 font-semibold">배송 일정</h3>
                <DeliveryDateStep
                  today={today}
                  maxDays={maxDays}
                  mode={delivery.deliveryMode}
                  date={delivery.requestedDate}
                  showActions={false}
                  idPrefix={`edit-${index}`}
                  validationError={
                    form.formState.errors.deliveries?.[index]?.requestedDate
                      ?.message
                  }
                  onChange={(mode, date) => {
                    form.setValue(`deliveries.${index}.deliveryMode`, mode, {
                      shouldDirty: true,
                    });
                    form.setValue(`deliveries.${index}.requestedDate`, date, {
                      shouldDirty: true,
                      shouldValidate: form.formState.isSubmitted,
                    });
                  }}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                체험 상품은 별도 날짜 선택 없이 일반 배송으로 보내드려요.
              </p>
            )}
          </section>
        ))}
        <OrderActionBar>
          <p className="mb-3 flex justify-between text-sm">
            <span>총 결제금액</span>
            <strong>
              {formatWon(calculateTotal(values.deliveries, products))}
            </strong>
          </p>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-13 rounded-xl"
              onClick={onCancel}
            >
              취소
            </Button>
            <Button type="submit" className="h-13 flex-1 rounded-xl">
              수정 완료
            </Button>
          </div>
        </OrderActionBar>
      </form>
    </FormProvider>
  );
}
