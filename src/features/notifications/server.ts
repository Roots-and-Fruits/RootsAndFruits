import "server-only";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { dispatchNotifications } from "./dispatch";
import { smsConfig, solapiProvider } from "./solapi";
import type { NotificationJob } from "./messages";

export function smsReady() {
  return smsConfig(process.env) !== null;
}

export async function processNotifications() {
  const config = smsConfig(process.env);
  if (!config) return 0;
  const db = createServiceClient();
  return dispatchNotifications(
    {
      async claim() {
        const { data, error } = await db.rpc("claim_order_notifications", {
          p_limit: 3,
        });
        if (error) throw new Error("Notification claim failed");
        return (data ?? []) as NotificationJob[];
      },
      async finish(job, result) {
        const { error } = await db
          .from("order_notifications")
          .update({
            status: result.status,
            provider_id: result.providerId ?? null,
            error_code: result.errorCode ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("status", "sending")
          .eq("attempts", job.attempts);
        if (error) throw new Error("Notification result update failed");
      },
    },
    solapiProvider(config),
  );
}

export function scheduleNotifications() {
  if (!smsReady()) return;
  after(async () => {
    try {
      await processNotifications();
    } catch {
      console.error(
        "문자 발송 처리 중 오류가 발생했습니다. 관리자 문자 내역을 확인해주세요.",
      );
    }
  });
}
