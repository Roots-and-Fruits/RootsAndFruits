import assert from "node:assert/strict";
import test from "node:test";
import {
  synchronizeCustomerSession,
  clearSubmissionWarning,
} from "../../src/features/auth/customer-cleanup";
import {
  savePendingSubmission,
  getPendingSubmission,
  saveReceipt,
  getReceipt,
} from "../../src/features/orders/submission-storage";
import { customerEpochStorage } from "../../src/features/auth/session-version";

test("account cleanup warns about memory-only requests and blocks until old receipts are removed", () => {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  let blockedLocalWrite = false;
  let blockedReceiptRemoval = false;
  const documentStub = { cookie: "rf-customer-epoch=account-a" };
  const descriptors = [
    "window",
    "document",
    "localStorage",
    "sessionStorage",
  ].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: new EventTarget() },
    document: { configurable: true, value: documentStub },
    localStorage: {
      configurable: true,
      value: {
        getItem: (key: string) => local.get(key) ?? null,
        removeItem: (key: string) => local.delete(key),
        setItem: (key: string, value: string) => {
          if (
            blockedLocalWrite &&
            (key.includes(":submission:") ||
              key.endsWith(":cleared-submission-warning"))
          )
            throw new Error("quota");
          local.set(key, value);
        },
      },
    },
    sessionStorage: {
      configurable: true,
      value: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => session.set(key, value),
        removeItem: (key: string) => {
          if (blockedReceiptRemoval && key.endsWith(":receipt"))
            throw new Error("blocked");
          session.delete(key);
        },
      },
    },
  });
  try {
    assert.equal(synchronizeCustomerSession().failed, false);
    blockedLocalWrite = true;
    assert.equal(
      savePendingSubmission("product", "private unresolved payload"),
      false,
    );
    saveReceipt({ orderNumber: 1, total: 1000, category: "product" });
    documentStub.cookie = "rf-customer-epoch=account-b";
    const changed = synchronizeCustomerSession();
    assert.equal(changed.warning, true);
    assert.equal(changed.failed, false);
    assert.equal(getPendingSubmission("product"), null);
    assert.equal(getReceipt(), null);
    assert.equal(synchronizeCustomerSession().warning, true);
    clearSubmissionWarning();
    assert.equal(synchronizeCustomerSession().warning, false);

    saveReceipt({ orderNumber: 2, total: 1000, category: "experience" });
    documentStub.cookie = "rf-customer-epoch=account-c";
    // Another tab has already cleaned shared local storage; this tab must still clear its receipt.
    local.set(customerEpochStorage, "account-c");
    blockedReceiptRemoval = true;
    assert.equal(synchronizeCustomerSession().failed, true);
    assert.equal(synchronizeCustomerSession().failed, true);
    blockedReceiptRemoval = false;
    assert.equal(synchronizeCustomerSession().failed, false);
    assert.equal(getReceipt(), null);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
