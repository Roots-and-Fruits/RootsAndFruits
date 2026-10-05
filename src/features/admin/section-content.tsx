"use client";
import { useEffect } from "react";
import { CatalogAdmin } from "./catalog-admin";
import { OrdersAdmin } from "./orders-admin";
import { NotificationsAdmin } from "./notifications-admin";
import { markAdminReady } from "./timing-client";

export function AdminSectionContent({ section }: { section: string }) {
  useEffect(() => {
    // Keep the baseline marker after page authorization, even with a shared shell.
    markAdminReady(section, "shell");
  }, [section]);
  if (section === "notifications") return <NotificationsAdmin />;
  if (section === "products" || section === "settings")
    return <CatalogAdmin section={section} />;
  return <OrdersAdmin section={section} />;
}
