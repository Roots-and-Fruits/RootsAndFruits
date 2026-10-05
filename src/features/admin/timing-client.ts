import { adminTimingLabel } from "@/lib/admin-timing";

const enabled = process.env.NEXT_PUBLIC_ADMIN_TIMING === "true";
let navigation: { section: string; start: number; kind: string } | null = null;
const reported = new Set<string>();

export function startAdminNavigation(
  url: string,
  kind: string,
  start = performance.now(),
) {
  if (!enabled) return;
  const pathname = new URL(url, window.location.origin).pathname;
  const section = adminTimingLabel(pathname.split("/")[2] ?? "");
  navigation =
    pathname.startsWith("/namu-admin/") && section !== "other"
      ? { section, start, kind }
      : null;
  reported.clear();
}

export function markAdminReady(
  section: string,
  stage: "shell" | "orders_committed",
) {
  if (!enabled || navigation?.section !== section || reported.has(stage))
    return;
  reported.add(stage);
  console.info(
    "[admin-browser-timing]",
    JSON.stringify({
      section: adminTimingLabel(section),
      stage,
      kind: navigation.kind,
      ms: Math.round((performance.now() - navigation.start) * 10) / 10,
    }),
  );
}

export function observeAdminResources() {
  if (!enabled) return;
  startAdminNavigation(window.location.href, "document", 0);
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
      const url = new URL(entry.name);
      if (url.origin !== window.location.origin) continue;
      const api = url.pathname.startsWith("/api/admin/");
      if (!api && !url.pathname.startsWith("/namu-admin/")) continue;
      const label = adminTimingLabel(
        url.pathname.split("/")[api ? 3 : 2] ?? "",
      );
      if (label === "other") continue;
      console.info(
        "[admin-browser-timing]",
        JSON.stringify({
          resource: `${api ? "api" : "page"}.${label}`,
          type: entry.initiatorType,
          start: Math.round(entry.startTime),
          ms: Math.round(entry.duration),
          ttfbMs: Math.round(entry.responseStart - entry.startTime),
          bytes: entry.encodedBodySize,
          server: entry.serverTiming.map(({ name, duration }) => ({
            name,
            ms: duration,
          })),
        }),
      );
    }
  });
  observer.observe({ type: "resource", buffered: true });
  observer.observe({ type: "navigation", buffered: true });
}
