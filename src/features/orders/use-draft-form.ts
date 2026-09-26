"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

// Observe raw values without rewriting the input (including Apple's text replacement).
export function useDraftForm<T extends FieldValues>(
  form: UseFormReturn<T>,
  onChange: (value: T) => void,
) {
  const callback = useRef(onChange);
  useLayoutEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const subscription = form.watch(() =>
      callback.current(JSON.parse(JSON.stringify(form.getValues())) as T),
    );
    return () => subscription.unsubscribe();
  }, [form]);
}
