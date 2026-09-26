"use client";

import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/forms/phone-input";
import { LockKeyhole } from "lucide-react";
import { LabeledInput } from "@/components/forms/labeled-input";
import { recipientSchema, type Recipient, type Sender } from "../schema";
import { useDraftForm } from "../use-draft-form";
import { StepActions } from "./step-actions";

const contactSchema = recipientSchema.pick({
  name: true,
  phone: true,
  sameAsSender: true,
});
type Contact = Pick<Recipient, "name" | "phone" | "sameAsSender">;

export function RecipientStep({
  value,
  sender,
  onNext,
  onChange,
  onBack,
}: {
  value: Contact;
  sender: Sender;
  onChange: (value: Contact) => void;
  onNext: (value: Contact) => void;
  onBack: (value: Contact) => void;
}) {
  const form = useForm<Contact>({
    resolver: zodResolver(contactSchema),
    defaultValues: value,
  });
  useDraftForm(form, onChange);
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onNext)} noValidate>
        <RecipientFields sender={sender} />
        <StepActions submit onBack={() => onBack(form.getValues())} />
      </form>
    </FormProvider>
  );
}

export function RecipientFields({
  sender,
  prefix = "",
  idPrefix = "recipient",
}: {
  sender: Pick<Sender, "name" | "phone">;
  prefix?: string;
  idPrefix?: string;
}) {
  const { register, setValue, getFieldState, formState, control } =
    useFormContext();
  const path = (name: string) => `${prefix}${name}`;
  const sameAsSender = useWatch({
    control,
    name: path("sameAsSender"),
    defaultValue: false,
  });
  const error = (name: string) =>
    getFieldState(path(name), formState).error?.message;
  return (
    <>
      <div className="mb-7 flex items-center gap-3 rounded-xl bg-secondary/50 p-4">
        <Checkbox
          id={`${idPrefix}-same-as-sender`}
          checked={sameAsSender}
          onCheckedChange={(checked) => {
            setValue(path("sameAsSender"), checked === true, {
              shouldDirty: true,
            });
            if (checked === true) {
              setValue(path("name"), sender.name, {
                shouldValidate: true,
                shouldDirty: true,
              });
              setValue(path("phone"), sender.phone, {
                shouldValidate: true,
                shouldDirty: true,
              });
            }
          }}
        />
        <Label htmlFor={`${idPrefix}-same-as-sender`}>
          보내는 사람과 같아요
        </Label>
      </div>
      {sameAsSender && (
        <p
          id={`${idPrefix}-locked`}
          className="mb-5 flex items-start gap-2 rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm leading-6 text-slate-600"
        >
          <LockKeyhole className="mt-0.5 size-4 shrink-0" />
          보내는 분 정보가 입력되어 있어요. 직접 수정하려면 위 선택을
          해제해주세요.
        </p>
      )}
      <div className="space-y-6">
        <LabeledInput
          id={`${idPrefix}-name`}
          label="받는 분 이름"
          placeholder="이름을 입력해주세요"
          autoComplete="off"
          readOnly={sameAsSender}
          className={
            sameAsSender
              ? "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500"
              : undefined
          }
          aria-describedby={sameAsSender ? `${idPrefix}-locked` : undefined}
          {...register(path("name"))}
          error={error("name")}
        />
        <PhoneInput
          id={`${idPrefix}-phone`}
          label="받는 분 휴대폰 번호"
          placeholder="01012345678"
          autoComplete="off"
          type="tel"
          readOnly={sameAsSender}
          className={
            sameAsSender
              ? "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500"
              : undefined
          }
          aria-describedby={sameAsSender ? `${idPrefix}-locked` : undefined}
          {...register(path("phone"))}
          error={error("phone")}
        />
      </div>
    </>
  );
}
