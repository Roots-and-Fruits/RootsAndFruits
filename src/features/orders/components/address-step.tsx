"use client";

import { useState } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loadPostcode } from "react-daum-postcode";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LabeledInput } from "@/components/forms/labeled-input";
import { recipientSchema, type Recipient } from "../schema";
import { useDraftForm } from "../use-draft-form";
import { StepActions } from "./step-actions";

const addressSchema = recipientSchema.pick({
  postalCode: true,
  address: true,
  addressDetail: true,
});
type Address = Pick<Recipient, "postalCode" | "address" | "addressDetail">;
const scriptUrl =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

export function AddressStep({
  value,
  onNext,
  onChange,
  onBack,
  preview,
}: {
  value: Address;
  onChange: (value: Address) => void;
  onNext: (value: Address) => void;
  onBack: (value: Address) => void;
  preview: boolean;
}) {
  const form = useForm<Address>({
    resolver: zodResolver(addressSchema),
    defaultValues: value,
  });
  useDraftForm(form, onChange);
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onNext)} noValidate>
        <AddressFields preview={preview} />
        <StepActions submit onBack={() => onBack(form.getValues())} />
      </form>
    </FormProvider>
  );
}

export function AddressFields({
  preview,
  prefix = "",
  idPrefix = "recipient",
}: {
  preview: boolean;
  prefix?: string;
  idPrefix?: string;
}) {
  const { register, setValue, getFieldState, formState, setFocus } =
    useFormContext();
  const path = (name: string) => `${prefix}${name}`;
  const error = (name: string) =>
    getFieldState(path(name), formState).error?.message;
  const [searchError, setSearchError] = useState("");
  async function searchAddress() {
    setSearchError("");
    try {
      const Postcode = await loadPostcode(scriptUrl);
      new Postcode({
        oncomplete(data) {
          const extra =
            data.addressType === "R"
              ? [data.bname, data.buildingName].filter(Boolean).join(", ")
              : "";
          setValue(path("postalCode"), data.zonecode, {
            shouldDirty: true,
            shouldValidate: true,
          });
          setValue(
            path("address"),
            `${data.address}${extra ? ` (${extra})` : ""}`,
            {
              shouldDirty: true,
              shouldValidate: true,
            },
          );
          setFocus(path("addressDetail"));
        },
      }).open();
    } catch {
      setSearchError(
        "주소 검색을 열지 못했어요. 인터넷 연결과 팝업 차단을 확인해주세요.",
      );
    }
  }
  return (
    <>
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <LabeledInput
              id={`${idPrefix}-postal-code`}
              label="우편번호"
              placeholder="주소 검색"
              readOnly
              role="button"
              aria-label="우편번호 · 주소 검색"
              className="cursor-pointer"
              onClick={searchAddress}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void searchAddress();
                }
              }}
              {...register(path("postalCode"))}
              error={error("postalCode")}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={searchAddress}
            className="mt-[27px] h-14 rounded-xl px-4"
          >
            <Search className="size-4" />
            주소 검색
          </Button>
        </div>
        {searchError && (
          <p role="alert" className="text-sm text-destructive">
            {searchError}
          </p>
        )}
        <LabeledInput
          id={`${idPrefix}-address`}
          label="주소"
          placeholder="도로명 또는 지번 주소"
          readOnly
          {...register(path("address"))}
          error={error("address")}
        />
        <LabeledInput
          id={`${idPrefix}-address-detail`}
          label="상세주소"
          placeholder="예: 101동 1201호 / 단독주택"
          autoComplete="off"
          {...register(path("addressDetail"))}
          error={error("addressDetail")}
        />
        {preview && (
          <Button
            type="button"
            variant="ghost"
            className="text-xs text-muted-foreground"
            onClick={() => {
              setValue(path("postalCode"), "00000", {
                shouldDirty: true,
                shouldValidate: true,
              });
              setValue(path("address"), "미리보기용 가상 주소", {
                shouldDirty: true,
                shouldValidate: true,
              });
              setValue(path("addressDetail"), "예시 상세주소", {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
          >
            미리보기용 가상 주소 채우기
          </Button>
        )}
      </div>
    </>
  );
}
