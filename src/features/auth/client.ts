import { synchronizeCustomerSession } from "./customer-cleanup";

export async function authRequest(action: string, body?: unknown) {
  const response = await fetch(
    `/api/auth/${action}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "로그인을 처리하지 못했어요.");
  if (action === "logout" || action === "tablet-login")
    synchronizeCustomerSession();
  return data;
}
