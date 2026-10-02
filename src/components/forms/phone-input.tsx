"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { useController } from "react-hook-form";
import { LabeledInput } from "./labeled-input";

// Preserve replacement text and invalid/overlong input for submit-time validation.
function formatPhone(value: string) {
  if (!/^[\d-]*$/.test(value)) return value;
  const digits = value.replace(/-/g, "");
  if (digits.length > 11) return value;
  return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)]
    .filter(Boolean)
    .join("-");
}

type Props = Omit<
  ComponentProps<typeof LabeledInput>,
  "value" | "defaultValue" | "onChange" | "onBlur" | "ref" | "name"
> & { name: string };

export function PhoneInput({ name, ...props }: Props) {
  const { field } = useController({ name });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const [composing, setComposing] = useState(false);
  const value: string = field.value ?? "";
  const displayValue = composing ? value : formatPhone(value);

  useLayoutEffect(() => {
    if (caret.current !== null && inputRef.current === document.activeElement) {
      inputRef.current?.setSelectionRange(caret.current, caret.current);
    }
    caret.current = null;
  });

  function updateValue(input: HTMLInputElement, inputType?: string) {
    let raw = input.value;
    let position = input.selectionStart ?? raw.length;
    // Backspace/Delete across a separator should remove a digit, not get stuck.
    if (
      inputType?.startsWith("delete") &&
      displayValue.length === raw.length + 1 &&
      raw.replace(/-/g, "") === displayValue.replace(/-/g, "")
    ) {
      const index =
        inputType === "deleteContentBackward" ? position - 1 : position;
      if (index >= 0 && index < raw.length) {
        raw = raw.slice(0, index) + raw.slice(index + 1);
        position = index;
      }
    }
    const formatted = formatPhone(raw);
    if (formatted !== raw) {
      const digitsBefore = raw.slice(0, position).replace(/-/g, "").length;
      let nextPosition = 0;
      let count = 0;
      while (nextPosition < formatted.length && count < digitsBefore) {
        if (formatted[nextPosition] !== "-") count++;
        nextPosition++;
      }
      caret.current = nextPosition;
    } else {
      caret.current = position;
    }
    // Keep the browser event untouched; RHF owns the value, React renders it.
    field.onChange(raw);
  }

  return (
    <LabeledInput
      {...props}
      name={field.name}
      ref={(element) => {
        inputRef.current = element;
        field.ref(element);
      }}
      value={displayValue}
      type="tel"
      inputMode="numeric"
      onBlur={field.onBlur}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={(event) => {
        setComposing(false);
        updateValue(event.currentTarget);
      }}
      onChange={(event) => {
        const native = event.nativeEvent as InputEvent;
        if (composing || native.isComposing) {
          field.onChange(event.currentTarget.value);
          return;
        }
        updateValue(event.currentTarget, native.inputType);
      }}
    />
  );
}
