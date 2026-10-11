// Preserve replacement text and invalid/overlong input for submit-time validation.
export function formatPhone(value: string) {
  if (!/^[\d-]*$/.test(value)) return value;
  const digits = value.replace(/-/g, "");
  if (digits.length > 11) return value;
  return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)]
    .filter(Boolean)
    .join("-");
}
