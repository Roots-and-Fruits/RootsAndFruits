// Server adapter: credentials are passed by server.ts, never exposed to the client.
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";

export type SmsConfig = { apiKey: string; apiSecret: string; from: string };
export type SendResult = {
  status: "accepted" | "failed" | "unknown";
  providerId?: string;
  errorCode?: string;
};
export interface SmsProvider {
  send(to: string, text: string, reference: string): Promise<SendResult>;
}

export function smsConfig(env: NodeJS.ProcessEnv): SmsConfig | null {
  if (env.SMS_ENABLED !== "true") return null;
  const apiKey = env.SOLAPI_API_KEY?.trim();
  const apiSecret = env.SOLAPI_API_SECRET?.trim();
  const from = env.SOLAPI_SENDER_NUMBER?.replace(/[\s-]/g, "");
  if (!apiKey || !apiSecret || !from || !/^\d{8,11}$/.test(from)) return null;
  return { apiKey, apiSecret, from };
}

const reply = z.object({
  failedMessageList: z.array(z.object({ statusCode: z.string() })),
  groupInfo: z.object({
    groupId: z.string().min(1),
    count: z.object({ registeredSuccess: z.number().int().nonnegative() }),
  }),
});

export function solapiProvider(
  config: SmsConfig,
  request: typeof fetch = fetch,
): SmsProvider {
  return {
    async send(to, text, reference) {
      if (!/^01\d{9}$/.test(to))
        return { status: "failed", errorCode: "INVALID_PHONE" };
      const date = new Date().toISOString();
      const salt = randomBytes(16).toString("hex");
      const signature = createHmac("sha256", config.apiSecret)
        .update(date + salt)
        .digest("hex");
      try {
        // One network attempt only: a timeout/5xx can still mean the SMS was accepted.
        const response = await request(
          "https://api.solapi.com/messages/v4/send-many/detail",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `HMAC-SHA256 apiKey=${config.apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
            },
            body: JSON.stringify({
              messages: [
                {
                  to,
                  from: config.from,
                  text,
                  customFields: { notificationId: reference },
                },
              ],
            }),
            signal: AbortSignal.timeout(8000),
            cache: "no-store",
            redirect: "error",
          },
        );
        if (!response.ok) {
          return {
            status: [400, 401, 402, 403, 404, 429].includes(response.status)
              ? "failed"
              : "unknown",
            errorCode: `HTTP_${response.status}`,
          };
        }
        const value = reply.safeParse(await response.json());
        if (!value.success)
          return { status: "unknown", errorCode: "INVALID_RESPONSE" };
        const { groupInfo, failedMessageList } = value.data;
        if (
          groupInfo.count.registeredSuccess === 1 &&
          failedMessageList.length === 0
        )
          return { status: "accepted", providerId: groupInfo.groupId };
        if (
          groupInfo.count.registeredSuccess === 0 &&
          failedMessageList.length === 1
        )
          return {
            status: "failed",
            providerId: groupInfo.groupId,
            errorCode: /^\d{4}$/.test(failedMessageList[0].statusCode)
              ? `SOLAPI_${failedMessageList[0].statusCode}`
              : "PROVIDER_REJECTED",
          };
        return {
          status: "unknown",
          providerId: groupInfo.groupId,
          errorCode: "INVALID_RESPONSE",
        };
      } catch {
        // Never persist raw provider errors: they may contain message content/phone numbers/keys.
        return { status: "unknown", errorCode: "NETWORK_OR_RESPONSE_ERROR" };
      }
    },
  };
}
