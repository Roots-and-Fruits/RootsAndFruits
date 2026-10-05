import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { adminTimingLabel, createAdminTiming } from "@/lib/admin-timing";
export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig();
  let response = NextResponse.next({ request });
  if (!config) return response;
  const client = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const pathname = request.nextUrl.pathname;
  const isAdmin =
    pathname.startsWith("/namu-admin/") ||
    pathname === "/namu-admin" ||
    pathname.startsWith("/api/admin/");
  const timing = createAdminTiming(
    `proxy.${pathname.startsWith("/api/") ? "api" : "page"}.${adminTimingLabel(pathname.split("/").at(-1) ?? "")}`,
    process.env.ADMIN_TIMING === "true" && request.method === "GET" && isAdmin,
  );
  try {
    await timing.measure("proxy_auth", () => client.auth.getUser());
  } finally {
    timing.finish();
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/namu-admin/:path*",
    "/api/:path*",
    "/auth/:path*",
    "/login",
    "/tablet-login",
    "/product",
    "/experience",
    "/",
  ],
};
