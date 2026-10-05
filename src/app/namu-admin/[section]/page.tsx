import { notFound, redirect } from "next/navigation";
import { getStaff } from "@/features/admin/auth";
import { AdminShell } from "@/features/admin/shell";
import { adminTimingLabel, createAdminTiming } from "@/lib/admin-timing";
export const dynamic = "force-dynamic";
export default async function AdminSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const timing = createAdminTiming(`page.${adminTimingLabel(section)}`);
  let staff;
  try {
    staff = await getStaff(timing);
  } finally {
    timing.finish();
  }
  if (!staff) redirect("/namu-admin/login");
  if (
    ![
      "counter",
      "orders",
      "shipping",
      "products",
      "settings",
      "notifications",
    ].includes(section)
  )
    notFound();
  return <AdminShell section={section} />;
}
