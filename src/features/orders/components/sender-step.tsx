"use client";

import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/forms/phone-input";
import { LabeledInput } from "@/components/forms/labeled-input";
import { senderSchema, type Sender } from "../schema";
import { useDraftForm } from "../use-draft-form";
import { StepActions } from "./step-actions";
import { ConsentDetails } from "./consent-details";

export function SenderStep({
  value,
  onNext,
  onChange,
}: {
  value: Sender;
  onChange: (value: Sender) => void;
  onNext: (sender: Sender) => void;
}) {
  const form = useForm<Sender>({
    resolver: zodResolver(senderSchema),
    defaultValues: value,
  });
  useDraftForm(form, onChange);
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onNext)} noValidate>
        <SenderFields />
        <StepActions submit />
      </form>
    </FormProvider>
  );
}

export function SenderFields({ prefix = "" }: { prefix?: string }) {
  const { register, control, getFieldState, formState, setValue } =
    useFormContext();
  const path = (name: string) => `${prefix}${name}`;
  const error = (name: string) =>
    getFieldState(path(name), formState).error?.message;
  const privacyConsent = useWatch({ control, name: path("privacyConsent") });
  const marketingConsent = useWatch({
    control,
    name: path("marketingConsent"),
  });
  return (
    <>
      <div className="space-y-6">
        <LabeledInput
          id="sender-name"
          label="보내는 분 이름"
          placeholder="이름을 입력해주세요"
          autoComplete="off"
          {...register(path("name"))}
          error={error("name")}
        />
        <PhoneInput
          id="sender-phone"
          label="휴대폰 번호"
          placeholder="01012345678"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          {...register(path("phone"))}
          error={error("phone")}
          hint="주문 확인을 위해 연락드릴 수 있는 번호를 입력해주세요."
        />
      </div>
      <div className="mt-8 space-y-5 rounded-2xl bg-secondary/50 p-5">
        <div className="border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <Checkbox
              id="all-consents"
              className="size-5"
              checked={
                privacyConsent && marketingConsent
                  ? true
                  : privacyConsent || marketingConsent
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(checked) => {
                for (const name of ["privacyConsent", "marketingConsent"]) {
                  setValue(path(name), checked === true, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }
              }}
            />
            <Label htmlFor="all-consents" className="text-base font-semibold">
              전체 동의 (선택 포함)
            </Label>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            선택 항목에 동의하지 않아도 주문할 수 있어요.
          </p>
        </div>
        {(["privacyConsent", "marketingConsent"] as const).map((name) => (
          <div key={name}>
            <div className="flex items-start justify-between gap-2">
              <Controller
                name={path(name)}
                control={control}
                render={({ field }) => (
                  <div className="flex gap-3">
                    <Checkbox
                      id={name}
                      checked={field.value}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true)
                      }
                      onBlur={field.onBlur}
                      ref={field.ref}
                      className="mt-0.5 size-5"
                    />
                    <Label htmlFor={name} className="text-sm leading-6">
                      {name === "privacyConsent"
                        ? "[필수] 개인정보 수집 및 이용 동의"
                        : "[선택] 마케팅 활용 동의"}
                    </Label>
                  </div>
                )}
              />
              <ConsentDetails marketing={name === "marketingConsent"} />
            </div>
            {name === "marketingConsent" && (
              <p className="mt-2 pl-8 text-xs leading-5 text-muted-foreground">
                상품 안내와 이벤트 소식을 받아보실 수 있어요.
              </p>
            )}
            {error(name) && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {error(name)}
              </p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
