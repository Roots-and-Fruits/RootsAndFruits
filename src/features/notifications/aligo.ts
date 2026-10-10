// Server adapter. Credentials are supplied by server.ts and never returned to clients.
import { z } from "zod";
import {
  NotificationError,
  type NotificationProvider,
  type PreparedNotification,
  type SendResult,
} from "./provider";
import { aligoVariables, type NotificationJob } from "./messages";
import {
  aligoRequest,
  validFixieUrl,
  type AligoRequest,
  type AligoRequestOptions,
} from "./aligo-transport";

export type AligoConfig = {
  apiKey: string;
  userId: string;
  senderKey: string;
  from: string;
  orderTemplate: string;
  shippingTemplate: string;
  testMode: boolean;
  proxyUrl?: string;
};
export function aligoConfig(env: NodeJS.ProcessEnv): AligoConfig | null {
  if (env.ALIGO_ENABLED !== "true") return null;
  const apiKey = env.ALIGO_API_KEY?.trim();
  const userId = env.ALIGO_USER_ID?.trim();
  const senderKey = env.ALIGO_SENDER_KEY?.trim();
  const from = env.ALIGO_SENDER_NUMBER?.replace(/[\s-]/g, "");
  const orderTemplate = env.ALIGO_ORDER_TEMPLATE_CODE?.trim() || "UM_0746";
  const shippingTemplate =
    env.ALIGO_SHIPPING_TEMPLATE_CODE?.trim() || "UM_0737";
  const testMode = env.ALIGO_TEST_MODE ?? "true";
  const proxyUrl = env.FIXIE_URL?.trim();
  if (
    !apiKey ||
    !userId ||
    !senderKey ||
    !from ||
    !/^\d{8,11}$/.test(from) ||
    !/^[A-Za-z0-9_-]{1,50}$/.test(orderTemplate) ||
    !/^[A-Za-z0-9_-]{1,50}$/.test(shippingTemplate) ||
    !["true", "false"].includes(testMode) ||
    (proxyUrl && !validFixieUrl(proxyUrl)) ||
    (env.VERCEL === "1" && !proxyUrl)
  )
    return null;
  return {
    apiKey,
    userId,
    senderKey,
    from,
    orderTemplate,
    shippingTemplate,
    testMode: testMode === "true",
    ...(proxyUrl ? { proxyUrl } : {}),
  };
}

const buttonSchema = z.object({
  ordering: z.union([z.string(), z.number()]).optional(),
  name: z.string().min(1),
  linkType: z.enum(["AC", "DS", "WL", "AL", "BK", "MD"]),
  linkTypeName: z.string().nullish(),
  linkMo: z.string().nullish(),
  linkPc: z.string().nullish(),
  linkIos: z.string().nullish(),
  linkAnd: z.string().nullish(),
});
export const aligoTemplateSchema = z.object({
  templtCode: z.string().min(1),
  templtName: z.string().min(1),
  templtContent: z.string().min(1),
  templateEmType: z.enum(["NONE", "TEXT", "IMAGE"]),
  templtTitle: z.string().nullish(),
  templtSubtitle: z.string().nullish(),
  status: z.enum(["S", "A", "R"]),
  inspStatus: z.enum(["REG", "REQ", "APR", "REJ"]),
  buttons: z.array(buttonSchema).max(5).nullish(),
});
export type AligoTemplate = z.infer<typeof aligoTemplateSchema>;
export type AligoTemplates = Record<NotificationJob["event"], AligoTemplate>;
const code = z
  .union([z.number().int(), z.string().regex(/^-?\d+$/)])
  .transform(String);
const replySchema = z.object({
  code,
  info: z
    .object({
      mid: z
        .union([
          z.string().regex(/^\d{1,40}$/),
          z.number().int().nonnegative().safe().transform(String),
        ])
        .optional(),
      scnt: z.coerce.number().int().nonnegative().optional(),
      fcnt: z.coerce.number().int().nonnegative().optional(),
    })
    .optional(),
});

function auth(config: AligoConfig) {
  return {
    apikey: config.apiKey,
    userid: config.userId,
    senderkey: config.senderKey,
  };
}
function options(body: URLSearchParams): AligoRequestOptions {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
    redirect: "error",
  };
}
export async function loadAligoTemplates(
  config: AligoConfig,
  request: AligoRequest = aligoRequest(config.proxyUrl),
): Promise<AligoTemplates> {
  try {
    const response = await request(
      "https://kakaoapi.aligo.in/akv10/template/list/",
      options(new URLSearchParams(auth(config))),
    );
    if (!response.ok)
      throw new NotificationError(`ALIGO_TEMPLATE_HTTP_${response.status}`);
    const reply = z
      .object({ code, list: z.array(z.unknown()).optional() })
      .safeParse(await response.json());
    if (!reply.success)
      throw new NotificationError("ALIGO_TEMPLATE_RESPONSE_INVALID");
    if (reply.data.code !== "0")
      throw new NotificationError(`ALIGO_TEMPLATE_${reply.data.code}`);
    const templates = [config.orderTemplate, config.shippingTemplate].map(
      (templateCode) => {
        const matches = (reply.data.list ?? [])
          .map((item) => aligoTemplateSchema.safeParse(item))
          .filter(
            (item) => item.success && item.data.templtCode === templateCode,
          );
        if (matches.length !== 1 || !matches[0].success)
          throw new NotificationError("ALIGO_TEMPLATE_NOT_FOUND");
        const template = matches[0].data;
        if (
          !config.testMode &&
          // R is the pre-send lifecycle state, separate from review approval.
          // Approved templates may be used for their first send; S stays blocked.
          (template.inspStatus !== "APR" || template.status === "S")
        )
          throw new NotificationError("ALIGO_TEMPLATE_NOT_APPROVED");
        return template;
      },
    );
    return { received: templates[0], shipped: templates[1] };
  } catch (error) {
    if (error instanceof NotificationError) throw error;
    throw new NotificationError("ALIGO_TEMPLATE_CONNECTION_FAILED");
  }
}

// Per-process only: no credentials or customer data enter Next's shared cache.
// New Vercel instances still make one lookup. Explicit connection checks refresh it.
export function createAligoTemplateCache(now = Date.now) {
  let cached:
    | { key: string; expires: number; value: Promise<AligoTemplates> }
    | undefined;
  return (config: AligoConfig, request: AligoRequest, refresh = false) => {
    const key = JSON.stringify(config);
    if (!refresh && cached?.key === key && cached.expires > now())
      return cached.value;
    const entry = {
      key,
      expires: Infinity,
      value: loadAligoTemplates(config, request),
    };
    cached = entry;
    entry.value = entry.value.then(
      (templates) => {
        entry.expires = now() + 5 * 60_000;
        return templates;
      },
      (error) => {
        if (cached === entry) cached = undefined;
        throw error;
      },
    );
    return entry.value;
  };
}

function substitute(source: string, variables: Record<string, string>): string {
  const value = source.replace(/#\{([^{}]+)\}/g, (_, key: string) => {
    if (!Object.hasOwn(variables, key))
      throw new NotificationError("ALIGO_TEMPLATE_VARIABLE_UNKNOWN");
    return variables[key];
  });
  if (/#\{/.test(value))
    throw new NotificationError("ALIGO_TEMPLATE_VARIABLE_INVALID");
  return value;
}
export function prepareAligo(
  job: NotificationJob,
  template: AligoTemplate,
): PreparedNotification {
  const variables = aligoVariables(job);
  // Keep registered wording and line breaks exactly; never truncate an address or order.
  const text = substitute(template.templtContent, variables);
  const emphasisTitle =
    template.templateEmType === "TEXT"
      ? substitute(template.templtTitle ?? "", variables)
      : undefined;
  if (Array.from(text).length > 1000)
    throw new NotificationError("ALIGO_MESSAGE_TOO_LONG");
  if (
    emphasisTitle !== undefined &&
    (!emphasisTitle || Array.from(emphasisTitle).length > 28)
  )
    throw new NotificationError("ALIGO_TITLE_INVALID");
  const buttons = [...(template.buttons ?? [])]
    .sort((a, b) => Number(a.ordering ?? 0) - Number(b.ordering ?? 0))
    .map((button) =>
      Object.fromEntries(
        Object.entries(button)
          .filter(
            (entry): entry is [string, string] =>
              entry[0] !== "ordering" && typeof entry[1] === "string",
          )
          .map(([key, value]) => [key, substitute(value, variables)]),
      ),
    );
  return {
    text,
    subject: template.templtName,
    templateCode: template.templtCode,
    emphasisTitle,
    buttons,
  };
}

export function aligoProvider(
  config: AligoConfig,
  templates: AligoTemplates,
  request: AligoRequest = aligoRequest(config.proxyUrl),
): NotificationProvider {
  return {
    name: "aligo",
    testMode: config.testMode,
    prepare: (job) => prepareAligo(job, templates[job.event]),
    async send(to, message): Promise<SendResult> {
      if (!/^01\d{9}$/.test(to))
        return { status: "failed", errorCode: "INVALID_PHONE" };
      if (!message.templateCode)
        return { status: "failed", errorCode: "ALIGO_TEMPLATE_NOT_FOUND" };
      const body = new URLSearchParams({
        ...auth(config),
        sender: config.from,
        tpl_code: message.templateCode,
        receiver_1: to,
        subject_1: message.subject,
        message_1: message.text,
        failover: "N",
        testMode: config.testMode ? "Y" : "N",
      });
      if (message.emphasisTitle) body.set("emtitle_1", message.emphasisTitle);
      if (message.buttons?.length)
        body.set("button_1", JSON.stringify({ button: message.buttons }));
      try {
        const response = await request(
          "https://kakaoapi.aligo.in/akv10/alimtalk/send/",
          options(body),
        );
        if (!response.ok)
          return {
            status: [400, 401, 402, 403, 404, 429].includes(response.status)
              ? "failed"
              : "unknown",
            errorCode: `HTTP_${response.status}`,
          };
        const parsed = replySchema.safeParse(await response.json());
        if (!parsed.success)
          return { status: "unknown", errorCode: "INVALID_RESPONSE" };
        const { code: providerCode, info } = parsed.data;
        const providerId = info?.mid;
        if (providerCode !== "0")
          return {
            status: "failed",
            providerCode,
            providerId,
            errorCode: `ALIGO_${providerCode}`,
          };
        if (info?.scnt === 0 && info.fcnt === 1)
          return {
            status: "failed",
            providerCode,
            providerId,
            errorCode: "ALIGO_INVALID_RECIPIENT",
          };
        if (config.testMode && (!info || (info.scnt === 0 && info.fcnt === 0)))
          return { status: "tested", providerCode, providerId };
        if (providerId && info?.scnt === 1 && info.fcnt === 0)
          return {
            status: config.testMode ? "tested" : "accepted",
            providerCode,
            providerId,
          };
        return {
          status: "unknown",
          providerCode,
          providerId,
          errorCode: "INVALID_RESPONSE",
        };
      } catch {
        return { status: "unknown", errorCode: "NETWORK_OR_RESPONSE_ERROR" };
      }
    },
  };
}
