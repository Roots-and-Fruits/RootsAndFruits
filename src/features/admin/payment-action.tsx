"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AdminButton as Button } from "./admin-button";
import {
  paymentMethodLabels,
  paymentMethodSchema,
  paymentSchema,
  type PaymentMethod,
} from "./schema";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function PaymentAction({
  busy,
  onConfirm,
}: {
  busy: boolean;
  onConfirm: (method: PaymentMethod) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ paymentMethod: PaymentMethod }>({
    resolver: zodResolver(paymentSchema),
  });
  const saving = busy || form.formState.isSubmitting;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        form.reset();
        setError(null);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={saving}>
          결제 완료
        </Button>
      </DialogTrigger>
      <DialogContent
        className="admin-payment p-6 sm:max-w-xl sm:p-8"
        showCloseButton={!saving}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">결제 완료</DialogTitle>
          <DialogDescription className="text-base leading-7 sm:text-lg">
            실제 결제가 완료되었나요? 결제 방식을 선택해주세요. 주문 취소는 엑셀
            출력 전에만 가능합니다.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-6"
          onSubmit={form.handleSubmit(async ({ paymentMethod }) => {
            setError(null);
            const message = await onConfirm(paymentMethod);
            if (message) setError(message);
            else setOpen(false);
          })}
        >
          <fieldset disabled={saving} className="space-y-2">
            <legend className="mb-3 text-lg font-semibold">결제 방식</legend>
            <div className="grid grid-cols-2 gap-3">
              {paymentMethodSchema.options.map((method) => (
                <label
                  key={method}
                  className="flex min-h-20 cursor-pointer items-center gap-3 rounded-lg border border-input px-5 py-4 text-xl font-semibold has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-2 has-focus-visible:ring-ring"
                >
                  <input
                    type="radio"
                    value={method}
                    {...form.register("paymentMethod")}
                    className="size-5 accent-primary"
                    aria-describedby={
                      form.formState.errors.paymentMethod
                        ? "payment-method-error"
                        : undefined
                    }
                  />
                  {paymentMethodLabels[method]}
                </label>
              ))}
            </div>
          </fieldset>
          {form.formState.errors.paymentMethod && (
            <p
              id="payment-method-error"
              role="alert"
              className="text-base text-destructive"
            >
              {form.formState.errors.paymentMethod.message}
            </p>
          )}
          <p className="text-base text-muted-foreground">
            기타 결제의 상세 내용은 필요시 기존 메모 칸에 남겨주세요.
          </p>
          {error && (
            <p role="alert" className="text-base text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              돌아가기
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "기록 중…" : "확인"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
