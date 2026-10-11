import {
  clearOrderDraft,
  draftStorageKey,
} from "@/features/orders/draft-storage";
import {
  clearPendingSubmission,
  clearReceipt,
  forgetCustomerSubmissionMemory,
  hasUnresolvedCustomerSubmission,
  notifySubmission,
} from "@/features/orders/submission-storage";
import {
  customerEpoch,
  customerEpochStorage,
  customerResetEvent,
} from "./session-version";

const warningKey = "roots-and-fruits:cleared-submission-warning";
let documentEpoch: string | undefined;
let warning = false;
let warningFallback = false;
export function clearSubmissionWarning() {
  warning = false;
  warningFallback = false;
  try {
    localStorage.removeItem(warningKey);
  } catch {}
}
export function synchronizeCustomerSession() {
  const epoch = customerEpoch();
  let cleanedEpoch: string | null = null;
  try {
    cleanedEpoch = localStorage.getItem(customerEpochStorage);
  } catch {}
  if (documentEpoch === undefined) {
    try {
      documentEpoch = sessionStorage.getItem(customerEpochStorage) ?? "";
    } catch {
      documentEpoch = "";
    }
  }
  const needsCleanup = (cleanedEpoch ?? "") !== epoch;
  const changedDocument =
    documentEpoch !== undefined && documentEpoch !== epoch;
  let failed = false;
  if (needsCleanup) {
    warning = hasUnresolvedCustomerSubmission();
    if (warning) {
      try {
        localStorage.setItem(warningKey, "1");
      } catch {
        warningFallback = true;
      }
    }
    for (const category of ["product", "experience"]) {
      for (const preview of [false, true]) {
        if (!clearOrderDraft(draftStorageKey(category, preview))) failed = true;
      }
      clearPendingSubmission(category);
      try {
        if (localStorage.getItem(`roots-and-fruits:submission:${category}`))
          failed = true;
      } catch {
        failed = true;
      }
    }
    if (!clearReceipt()) failed = true;
    if (!failed) {
      try {
        localStorage.setItem(customerEpochStorage, epoch);
      } catch {
        failed = true;
      }
    }
  } else if (changedDocument) {
    // Another tab already cleared shared storage. Do not erase that account's new draft.
    if (!clearReceipt()) failed = true;
  }
  if (needsCleanup || changedDocument) {
    forgetCustomerSubmissionMemory();
    window.dispatchEvent(new Event(customerResetEvent));
    notifySubmission();
  }
  if (!failed) {
    documentEpoch = epoch;
    try {
      sessionStorage.setItem(customerEpochStorage, epoch);
    } catch {}
  }
  try {
    warning = warningFallback || localStorage.getItem(warningKey) === "1";
  } catch {}
  return { epoch, warning, failed };
}
