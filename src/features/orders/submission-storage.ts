// Persist only unresolved requests and a minimal receipt. Memory fallback keeps
// same-page retries safe when browser storage is unavailable.
import { customerEpoch } from "@/features/auth/session-version";
const pendingMemory = new Map<
  string,
  { value: string; persisted: boolean; epoch: string }
>();
let receiptMemory: string | null = null;
const receiptKey = "roots-and-fruits:receipt";
const keyFor = (category: string) => `roots-and-fruits:submission:${category}`;
// Cleanup needs only the presence of a pending request, even from the old epoch.
// Do not read its payload through getPendingSubmission, which rejects stale memory.
export function hasUnresolvedCustomerSubmission() {
  return ["product", "experience"].some((category) => {
    if (pendingMemory.has(category)) return true;
    try {
      return Boolean(localStorage.getItem(keyFor(category)));
    } catch {
      return false;
    }
  });
}
export function getPendingSubmission(category: string) {
  const memory = pendingMemory.get(category);
  if (
    memory &&
    !category.startsWith("admin:") &&
    memory.epoch !== customerEpoch()
  )
    pendingMemory.delete(category);
  if (
    memory &&
    (category.startsWith("admin:") || memory.epoch === customerEpoch()) &&
    !memory.persisted
  )
    return memory.value;
  try {
    return localStorage.getItem(keyFor(category));
  } catch {
    return pendingMemory.get(category)?.value ?? null;
  }
}
export function savePendingSubmission(category: string, value: string) {
  let persisted = false;
  try {
    localStorage.setItem(keyFor(category), value);
    persisted = true;
  } catch {}
  pendingMemory.set(category, { value, persisted, epoch: customerEpoch() });
  return persisted;
}
export function clearPendingSubmission(category: string) {
  pendingMemory.delete(category);
  try {
    localStorage.removeItem(keyFor(category));
  } catch {
    /* Memory fallback still cleared. */
  }
}
export function notifySubmission() {
  window.dispatchEvent(new Event("order-submission"));
}
export function saveReceipt(value: {
  orderNumber: number;
  total: number;
  category: string;
  storageWarning?: boolean;
}) {
  receiptMemory = JSON.stringify(value);
  try {
    sessionStorage.setItem(receiptKey, receiptMemory);
  } catch {
    receiptMemory = JSON.stringify({ ...value, storageWarning: true });
  }
}
export function getReceipt() {
  try {
    return receiptMemory ?? sessionStorage.getItem(receiptKey);
  } catch {
    return receiptMemory;
  }
}
export function clearReceipt() {
  receiptMemory = null;
  try {
    sessionStorage.removeItem(receiptKey);
    return sessionStorage.getItem(receiptKey) === null;
  } catch {
    return false;
  }
}
export function forgetCustomerSubmissionMemory() {
  pendingMemory.delete("product");
  pendingMemory.delete("experience");
  receiptMemory = null;
}
