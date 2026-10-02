import { notificationText, type NotificationJob } from "./messages";
import type { SendResult, SmsProvider } from "./solapi";

export interface NotificationStore {
  claim(): Promise<NotificationJob[]>;
  finish(job: NotificationJob, result: SendResult): Promise<void>;
}

export async function dispatchNotifications(
  store: NotificationStore,
  provider: SmsProvider,
  budgetMs = 35000,
) {
  const deadline = Date.now() + budgetMs;
  let processed = 0;
  do {
    const jobs = await store.claim();
    if (!jobs.length) break;
    const results = await Promise.allSettled(
      jobs.map(async (job) => {
        let text: string;
        try {
          text = notificationText(job);
        } catch {
          await store.finish(job, {
            status: "failed",
            errorCode: "INVALID_PAYLOAD",
          });
          return;
        }
        const result = await provider.send(job.phone, text, job.id);
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
