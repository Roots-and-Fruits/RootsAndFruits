"use client";

import { useState } from "react";
import { Truck, CalendarDays } from "lucide-react";
import { LabeledInput } from "@/components/forms/labeled-input";
import { addDays, isAllowedScheduledDate } from "../calculations";
import { StepActions } from "./step-actions";

export function DeliveryDateStep({
  today,
  maxDays,
  mode,
  date,
  onChange,
  onNext,
  onBack,
  showActions = true,
  idPrefix = "delivery",
  validationError,
}: {
  today: string;
  maxDays: number;
  mode: "regular" | "scheduled";
  date: string;
  onChange: (mode: "regular" | "scheduled", date: string) => void;
  onNext?: () => void;
  onBack?: () => void;
  showActions?: boolean;
  idPrefix?: string;
  validationError?: string;
}) {
  const [error, setError] = useState("");
  const options = [
    {
      value: "regular" as const,
      title: "일반 배송",
      body: "가능한 가장 빠른 날짜에 발송해드려요.",
      icon: Truck,
    },
    {
      value: "scheduled" as const,
      title: "예약 배송",
      body: "희망하는 배송 날짜를 선택해주세요.",
      icon: CalendarDays,
    },
  ];
  return (
    <div>
      <fieldset className="space-y-3">
        <legend className="sr-only">배송 방식</legend>
        {options.map(({ value, title, body, icon: Icon }) => (
          <label
            key={value}
            className={`flex cursor-pointer items-center gap-4 rounded-2xl border p-5 ${mode === value ? "border-primary bg-secondary/50" : "border-border"}`}
          >
            <input
              type="radio"
              name={`${idPrefix}-mode`}
              value={value}
              checked={mode === value}
              onChange={() => {
                onChange(value, value === "regular" ? addDays(today, 2) : "");
                setError("");
              }}
              className="size-4 accent-primary"
            />
            <Icon className="size-5 shrink-0 text-primary" />
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {body}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {mode === "scheduled" && (
        <div className="mt-6">
          <LabeledInput
            id={`${idPrefix}-requested-date`}
            label="희망 배송일"
            type="date"
            value={date}
            min={addDays(today, 3)}
            max={addDays(today, maxDays)}
            onChange={(event) => {
              onChange(mode, event.target.value);
              setError("");
            }}
            error={validationError || error}
            hint={`오늘부터 3일 뒤~${maxDays}일 뒤 중 선택할 수 있어요. 일요일은 제외돼요.`}
          />
        </div>
      )}
      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        일반 배송은 보통 배송 출발까지 2일 정도 소요되며, 기상 상황에 따라
        일정이 변동될 수 있어요.
      </p>
      {showActions && (
        <StepActions
          onBack={onBack}
          onNext={() => {
            if (
              mode === "scheduled" &&
              !isAllowedScheduledDate(date, today, maxDays)
            ) {
              setError(
                "선택 가능한 기간의 날짜를 입력해주세요. 일요일은 선택할 수 없어요.",
              );
              return;
            }
            onNext?.();
          }}
        />
      )}
    </div>
  );
}
