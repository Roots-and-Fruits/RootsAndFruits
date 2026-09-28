"use client";

import { useState } from "react";
import { DayPicker } from "@daypicker/react";
import { ko } from "@daypicker/react/locale";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fromDateOnly, toDateOnly } from "@/lib/date-only";
import "@daypicker/react/style.css";
import styles from "./date-picker.module.css";

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function DatePicker({
  id,
  label,
  value,
  min,
  max,
  today,
  disabledWeekdays = [],
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  min: string;
  max: string;
  today: string;
  disabledWeekdays?: Weekday[];
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromDateOnly(value);
  const first = fromDateOnly(min)!;
  const last = fromDateOnly(max)!;
  const unavailable = (date: Date) => {
    const day = toDateOnly(date);
    return (
      day < min ||
      day > max ||
      disabledWeekdays.includes(date.getDay() as Weekday)
    );
  };
  const message =
    error ||
    (value && (!selected || unavailable(selected))
      ? "선택할 수 없는 날짜예요. 다시 선택해주세요."
      : undefined);
  const formatted = selected?.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  return (
    <div className="min-w-0 space-y-2.5">
      <Label htmlFor={id}>{label}</Label>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={!!message}
            aria-describedby={
              message ? `${id}-error` : hint ? `${id}-hint` : undefined
            }
            className={cn(
              "h-14 w-full min-w-0 justify-between rounded-xl bg-background px-4 text-base font-normal whitespace-normal",
              !value && "text-muted-foreground",
            )}
          >
            <span className="text-left">
              {formatted || value || "날짜를 선택해주세요"}
            </span>
            <CalendarDays className="ml-2 size-5 shrink-0 text-primary" />
          </Button>
        </DialogTrigger>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>{label} 선택</DialogTitle>
            <DialogDescription>
              {hint || "달력에서 날짜를 선택해주세요."}
            </DialogDescription>
          </DialogHeader>
          <DayPicker
            mode="single"
            required
            locale={ko}
            weekStartsOn={0}
            autoFocus
            className={styles.calendar}
            navLayout="around"
            fixedWeeks
            today={fromDateOnly(today)}
            defaultMonth={
              selected && value >= min && value <= max ? selected : first
            }
            startMonth={first}
            endMonth={last}
            selected={selected}
            disabled={[
              { before: first },
              { after: last },
              { dayOfWeek: disabledWeekdays },
            ]}
            labels={{
              labelPrevious: () => "이전 달",
              labelNext: () => "다음 달",
              labelDayButton: (date, modifiers) =>
                `${toDateOnly(date)} (${date.toLocaleDateString("ko-KR", { weekday: "short" })})${modifiers.selected ? ", 선택됨" : ""}${modifiers.today ? ", 오늘" : ""}`,
            }}
            onSelect={(date) => {
              if (!date || unavailable(date)) return;
              onChange(toDateOnly(date));
              setOpen(false);
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-xl"
            onClick={() => setOpen(false)}
          >
            닫기
          </Button>
        </DialogContent>
      </Dialog>
      {message ? (
        <p
          id={`${id}-error`}
          role="alert"
          tabIndex={-1}
          className="text-sm text-destructive"
        >
          {message}
        </p>
      ) : hint ? (
        <p
          id={`${id}-hint`}
          className="text-xs leading-5 text-muted-foreground"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
