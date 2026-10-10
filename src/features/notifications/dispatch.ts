import type { NotificationJob } from "./messages";
import {
  NotificationError,
  type NotificationProvider,
  type PreparedNotification,
  type SendResult,
} from "./provider";

export interface NotificationStore {
  claim(): Promise<NotificationJob[]>;
  prepare(
    job: NotificationJob,
    message: PreparedNotification,
  ): Promise<boolean>;
  finish(job: NotificationJob, result: SendResult): Promise<void>;
}

export async function dispatchNotifications(
  store: NotificationStore,
  provider: NotificationProvider,
  budgetMs = 35000,
) {
  const deadline = Date.now() + budgetMs;
  let processed = 0;
  do {
    const jobs = await store.claim();
    if (!jobs.length) break;
    const results = await Promise.allSettled(
      jobs.map(async (job) => {
        // Covers recipient jobs queued before the sender-only SQL is applied.
        if (job.recipient_role === "recipient") {
          await store.finish(job, {
            status: "skipped",
            errorCode: "RECIPIENT_DISABLED",
          });
          return;
        }
        // Claiming is provider/mode-specific. Do not route jobs to another service.
        if (
          job.provider !== provider.name ||
          !!job.test_mode !== provider.testMode
        )
          throw new Error("Notification provider mismatch");
        let message: PreparedNotification;
        try {
          message = provider.prepare(job);
        } catch (error) {
          await store.finish(job, {
            status: "failed",
            errorCode:
              error instanceof NotificationError
                ? error.code
                : "INVALID_PAYLOAD",
          });
          return;
        }
        if (!(await store.prepare(job, message))) return;
        const result = await provider.send(job.phone, message, job.id);
        await store.finish(job, result);
      }),
    );
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Notification processing interrupted");
    processed += jobs.length;
    // Keep a single worker comfortably below the provider's basic rate limit.
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } while (Date.now() < deadline);
  return processed;
}
