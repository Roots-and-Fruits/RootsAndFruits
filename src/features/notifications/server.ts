import "server-only";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { dispatchNotifications } from "./dispatch";
import type { NotificationJob } from "./messages";
import { notificationConfig } from "./config";
import { aligoConfig, aligoProvider, createAligoTemplateCache } from "./aligo";
import { aligoRequest } from "./aligo-transport";
import { NotificationError } from "./provider";

export function notificationRuntime() {
  const { provider, testMode, ready } = notificationConfig(process.env);
  return { provider, testMode, ready };
}
export function notificationsReady() {
  return notificationRuntime().ready;
}
const cachedTemplates = createAligoTemplateCache();
async function providerConnection(refresh = false) {
  if (!notificationsReady())
    throw new NotificationError("NOTIFICATION_NOT_CONFIGURED");
  const config = aligoConfig(process.env)!;
  const request = aligoRequest(config.proxyUrl);
  const templates = await cachedTemplates(config, request, refresh);
  return {
    provider: aligoProvider(config, templates, request),
    templates: Object.values(templates).map((template) => ({
      code: template.templtCode,
      title: template.templtTitle || template.templtName,
      approval: template.inspStatus,
      status: template.status,
    })),
  };
}
export async function checkNotificationConnection() {
  const { templates } = await providerConnection(true);
  return { ...notificationRuntime(), templates };
}

async function processNotifications() {
  const runtime = notificationRuntime();
  if (!runtime.ready) return 0;
  const db = createServiceClient();
  const { data: settings, error: settingsError } = await db
    .from("notification_settings")
    .select("enabled,provider,test_mode")
    .eq("id", 1)
    .single();
  if (settingsError) throw new Error("Notification settings failed");
  if (
    !settings.enabled ||
    settings.provider !== runtime.provider ||
    settings.test_mode !== runtime.testMode
  )
    return 0;
  const { error: interruptedError } = await db
    .from("order_notifications")
    .update({
      status: "unknown",
      error_code: "INTERRUPTED",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "sending")
    .lt("updated_at", new Date(Date.now() - 5 * 60_000).toISOString());
  if (interruptedError) throw new Error("Notification recovery failed");
  // Empty event-triggered runs must not consume limited external API requests.
  const { data: pending, error: pendingError } = await db
    .from("order_notifications")
    .select("id")
    .eq("status", "pending")
    .eq("provider", runtime.provider)
    .eq("test_mode", runtime.testMode)
    .limit(1);
  if (pendingError) throw new Error("Notification queue lookup failed");
  if (!pending?.length) return 0;
  // Template/auth failures occur before claiming jobs, so the queue stays retryable.
  const { provider } = await providerConnection();
  return dispatchNotifications(
    {
      async claim() {
        const { data, error } = await db.rpc("claim_notification_delivery", {
          p_limit: 3,
          p_provider: provider.name,
          p_test_mode: provider.testMode,
        });
        if (error) throw new Error("Notification claim failed");
        return (data ?? []) as NotificationJob[];
      },
      async prepare(job, message) {
        const { data, error } = await db.rpc("prepare_order_notification", {
          p_id: job.id,
          p_attempt: job.attempts,
          p_provider: provider.name,
          p_test_mode: provider.testMode,
          p_message: message,
        });
        if (error) throw new Error("Notification message snapshot failed");
        return data === true;
      },
      async finish(job, result) {
        const { error } = await db
          .from("order_notifications")
          .update({
            status: result.status,
            provider_id: result.providerId ?? null,
            provider_code: result.providerCode ?? null,
            error_code: result.errorCode ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("status", "sending")
          .eq("attempts", job.attempts);
        if (error) throw new Error("Notification result update failed");
      },
    },
    provider,
  );
}

export function scheduleNotifications() {
  if (!notificationsReady()) return;
  after(async () => {
    try {
      await processNotifications();
    } catch {
      console.error(
        "알림 발송 처리 중 오류가 발생했습니다. 관리자 알림 내역을 확인해주세요.",
      );
    }
  });
}
