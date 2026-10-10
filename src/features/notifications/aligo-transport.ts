// Node-only, scoped to Aligo. Never change the global fetch dispatcher.
import { fetch, ProxyAgent } from "undici";
import { NotificationError } from "./provider";

export type AligoRequestOptions = {
  method: "POST";
  headers: Record<string, string>;
  body: URLSearchParams;
  signal: AbortSignal;
  cache: "no-store";
  redirect: "error";
};
export type AligoRequest = (
  url: string,
  options: AligoRequestOptions,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function validFixieUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !!decodeURIComponent(url.username) &&
      !!decodeURIComponent(url.password) &&
      !url.search &&
      !url.hash &&
      url.pathname === "/"
    );
  } catch {
    return false;
  }
}

export function createAligoTransport(proxyUrl?: string) {
  if (proxyUrl && !validFixieUrl(proxyUrl))
    throw new NotificationError("ALIGO_PROXY_INVALID");
  // HTTPS CONNECT preserves end-to-end TLS. Proxy credentials stay in CONNECT.
  const agent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  const request: AligoRequest = async (url, options) => {
    if (
      ![
        "https://kakaoapi.aligo.in/akv10/template/list/",
        "https://kakaoapi.aligo.in/akv10/alimtalk/send/",
      ].includes(url)
    )
      throw new NotificationError("ALIGO_ENDPOINT_INVALID");
    try {
      return await fetch(url, { ...options, dispatcher: agent });
    } catch {
      // No direct fallback, retries, raw errors or URLs containing credentials.
      throw new NotificationError("ALIGO_CONNECTION_FAILED");
    }
  };
  return {
    request,
    close: async () => {
      await agent?.close();
    },
  };
}

let current:
  | { proxyUrl?: string; transport: ReturnType<typeof createAligoTransport> }
  | undefined;
export function aligoRequest(proxyUrl?: string): AligoRequest {
  if (!current || current.proxyUrl !== proxyUrl) {
    const previous = current;
    current = { proxyUrl, transport: createAligoTransport(proxyUrl) };
    void previous?.transport.close().catch(() => {});
  }
  return current.transport.request;
}
