import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aligoVariables,
  type NotificationJob,
} from "../../src/features/notifications/messages";
import { dispatchNotifications } from "../../src/features/notifications/dispatch";

const job: NotificationJob = {
  id: "test-event",
  event: "received",
  phone: "01033334444",
  attempts: 1,
  provider: "aligo",
  test_mode: false,
  payload: {
    category: "experience",
    orderNumber: 12,
    total: 47000,
    deliveryCount: 1,
    deliveries: [
      {
        position: 1,
        recipientName: "가상 받는분",
        address: "가상 주소",
        addressDetail: "",
        items: [{ label: "체험귤", weightGrams: null, quantity: 1 }],
      },
    ],
  },
};

test("dispatcher sends only claimed jobs to sender, persists outcomes and leaves uncertain jobs alone", async () => {
  const sent: string[] = [],
    finished: unknown[] = [];
  await dispatchNotifications(
    {
      async claim() {
        return [job, { ...job, id: "bad", payload: {} }];
      },
      async finish(row, result) {
        finished.push([row.id, result.status]);
      },
      async prepare() {
        return true;
      },
    },
    {
      name: "aligo",
      testMode: false,
      prepare: (job) => ({
        text: `주문번호: ${aligoVariables(job).주문번호}`,
        subject: "주문 안내",
      }),
      async send(to) {
        sent.push(to);
        return { status: "unknown", errorCode: "TIMEOUT" };
      },
    },
    0,
  );
  assert.deepEqual(sent, [job.phone]);
  assert.deepEqual(
    finished.sort(),
    [
      ["bad", "failed"],
      [job.id, "unknown"],
    ].sort(),
  );
});
