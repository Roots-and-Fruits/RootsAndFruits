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
      <DialogContent showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>결제 완료</DialogTitle>
          <DialogDescription>
            실제 결제가 완료되었나요? 결제 방식을 선택해주세요. 주문 취소는 엑셀
            출력 전에만 가능합니다.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async ({ paymentMethod }) => {
            setError(null);
            const message = await onConfirm(paymentMethod);
            if (message) setError(message);
            else setOpen(false);
          })}
        >
          <fieldset disabled={saving} className="space-y-2">
            <legend className="mb-2 font-medium">결제 방식</legend>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethodSchema.options.map((method) => (
                <label
                  key={method}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-3 py-2 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-2 has-focus-visible:ring-ring"
                >
                  <input
                    type="radio"
                    value={method}
                    {...form.register("paymentMethod")}
                    className="size-4 accent-primary"
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
              className="text-sm text-destructive"
            >
              {form.formState.errors.paymentMethod.message}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            기타 결제의 상세 내용은 필요시 기존 메모 칸에 남겨주세요.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
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
