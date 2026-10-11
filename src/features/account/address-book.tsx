"use client";
import { useState } from "react";
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LabeledInput } from "@/components/forms/labeled-input";
import { PhoneInput } from "@/components/forms/phone-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AddressFields } from "@/features/orders/components/address-step";
import { createRequestId } from "@/lib/request-id";
import { formatPhone } from "@/lib/phone";
import type { Recipient } from "@/features/orders/schema";
import {
  savedAddressSchema,
  type SavedAddress,
  type SavedSender,
} from "./schema";
import { useAccountRequest } from "./client";

export function SavedContactFields({ sender = false }: { sender?: boolean }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<SavedSender>();
  return (
    <div className="space-y-5">
      <LabeledInput
        id={sender ? "default-sender-name" : "saved-recipient-name"}
        label={sender ? "보내는 분 이름" : "받는 분 이름"}
        autoComplete="off"
        {...register("name")}
        error={errors.name?.message}
      />
      <PhoneInput
        id={sender ? "default-sender-phone" : "saved-recipient-phone"}
        label="휴대폰 번호"
        name="phone"
        type="tel"
        inputMode="numeric"
        error={errors.phone?.message}
      />
    </div>
  );
}
export function AddressEditor({
  initial,
  onSaved,
  onCancel,
}: {
  initial: SavedAddress;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { id, ...value } = initial;
  const form = useForm<typeof value>({
    resolver: zodResolver(savedAddressSchema),
    defaultValues: value,
  });
  const request = useAccountRequest();
  const [error, setError] = useState("");
  const busy = form.formState.isSubmitting;
  const isDefault = useWatch({ control: form.control, name: "isDefault" });
  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="space-y-5"
        onSubmit={(event) => {
          event.stopPropagation();
          void form.handleSubmit(async (values) => {
            setError("");
            try {
              await request(`addresses/${id}`, "PUT", values);
              onSaved();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "배송지를 저장하지 못했어요.",
              );
            }
          })(event);
        }}
      >
        <LabeledInput
          id="address-label"
          label="배송지 이름"
          placeholder="예: 우리 집, 부모님 댁"
          {...form.register("label")}
          error={form.formState.errors.label?.message}
        />
        <SavedContactFields />
        <AddressFields preview={false} idPrefix="saved-address" />
        <div className="flex items-center gap-3">
          <Checkbox
            id="saved-default"
            checked={isDefault}
            onCheckedChange={(v) => form.setValue("isDefault", v === true)}
          />
          <Label htmlFor="saved-default">기본 배송지로 지정</Label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            취소
          </Button>
          <Button disabled={busy}>{busy ? "저장 중…" : "배송지 저장"}</Button>
        </div>
      </form>
    </FormProvider>
  );
}
const emptyAddress = {
  label: "",
  name: "",
  phone: "",
  postalCode: "",
  address: "",
  addressDetail: "",
  isDefault: false,
};
export function AddressDialog({
  address,
  recipient,
  onSaved,
  children,
}: {
  address?: SavedAddress;
  recipient?: Recipient;
  onSaved: () => void;
  children: React.ReactNode;
}) {
  const [initial, setInitial] = useState<SavedAddress | null>(null);
  return (
    <Dialog
      open={initial !== null}
      onOpenChange={(open) => {
        if (!open) setInitial(null);
        else {
          const {
            name = "",
            phone = "",
            postalCode = "",
            address: street = "",
            addressDetail = "",
          } = recipient ?? {};
          setInitial(
            address ?? {
              ...emptyAddress,
              id: createRequestId(),
              name,
              phone,
              postalCode,
              address: street,
              addressDetail,
            },
          );
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{address ? "배송지 수정" : "주소록에 저장"}</DialogTitle>
          <DialogDescription>
            주소록 변경은 이미 접수한 주문에 영향을 주지 않아요.
          </DialogDescription>
        </DialogHeader>
        {initial && (
          <AddressEditor
            initial={initial}
            onCancel={() => setInitial(null)}
            onSaved={() => {
              setInitial(null);
              onSaved();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
export function AddressSummary({ address }: { address: SavedAddress }) {
  return (
    <div className="min-w-0 space-y-1 break-words text-sm leading-6">
      <p className="font-semibold">
        {address.label}
        {address.isDefault && (
          <span className="ml-2 rounded bg-secondary px-2 py-1 text-xs text-primary">
            기본
          </span>
        )}
      </p>
      <p>
        {address.name} · {formatPhone(address.phone)}
      </p>
      <p className="text-muted-foreground">
        ({address.postalCode}) {address.address} {address.addressDetail}
      </p>
    </div>
  );
}
export function AddressBookTools({
  addresses,
  recipient,
  onSelect,
  onSaved,
  save = false,
}: {
  addresses: SavedAddress[];
  recipient: Recipient;
  onSelect: (recipient: Recipient) => void;
  onSaved: () => void;
  save?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline">
            주소록에서 선택
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>주소록에서 선택</DialogTitle>
            <DialogDescription>
              선택한 배송지로 이번 받는 분과 주소를 채워요.
            </DialogDescription>
          </DialogHeader>
          {!addresses.length && (
            <p className="py-5 text-sm text-muted-foreground">
              저장한 배송지가 없어요. 주소를 입력한 뒤 주소록에 저장할 수
              있어요.
            </p>
          )}
          {addresses.map((address) => (
            <button
              type="button"
              key={address.id}
              className="w-full rounded-xl border p-4 text-left hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
              onClick={() => {
                const {
                  name,
                  phone,
                  postalCode,
                  address: street,
                  addressDetail,
                } = address;
                onSelect({
                  name,
                  phone,
                  postalCode,
                  address: street,
                  addressDetail,
                  sameAsSender: false,
                });
                setOpen(false);
              }}
            >
              <AddressSummary address={address} />
            </button>
          ))}
        </DialogContent>
      </Dialog>
      {save && (
        <AddressDialog recipient={recipient} onSaved={onSaved}>
          <Button type="button" variant="outline">
            이 배송지 주소록에 저장
          </Button>
        </AddressDialog>
      )}
    </div>
  );
}
