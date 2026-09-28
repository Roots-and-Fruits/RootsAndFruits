// Only known customer entry points may be used after authentication.
export function customerReturnPath(value: unknown) {
  return value === "/product" || value === "/experience" ? value : "/";
}
export const customerSessionCookie = "rf-customer-session";

// Next's internal request URL may use localhost behind a proxy. Preserve the
// browser-facing Host so the PKCE verifier cookie remains on the same origin.
export function requestOrigin(request: Request) {
  const fallback = new URL(request.url);
  const host = request.headers.get("host") ?? fallback.host;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    fallback.protocol.slice(0, -1);
  if (!["http", "https"].includes(protocol) || /[\\/@\s?#]/.test(host))
    throw new Error("Invalid request origin");
  return new URL(`${protocol}://${host}`).origin;
}
