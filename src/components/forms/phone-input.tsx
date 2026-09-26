import type { ComponentProps } from "react";
import { LabeledInput } from "./labeled-input";

export function PhoneInput(props: ComponentProps<typeof LabeledInput>) {
  // Keep the browser's editing buffer intact for text replacement and IME.
  // phoneSchema normalizes the submitted value without rewriting this input.
  return <LabeledInput {...props} type="tel" inputMode="numeric" />;
}
