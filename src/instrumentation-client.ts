import {
  observeAdminResources,
  startAdminNavigation,
} from "@/features/admin/timing-client";

// Diagnostics only: no analytics upload, credentials, query values, or response bodies.
if (process.env.NEXT_PUBLIC_ADMIN_TIMING === "true") {
  observeAdminResources();
}

export function onRouterTransitionStart(
  url: string,
  type: "push" | "replace" | "traverse",
) {
  startAdminNavigation(url, type);
}
