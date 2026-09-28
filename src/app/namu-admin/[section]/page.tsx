import { notFound, redirect } from "next/navigation";
import { getStaff } from "@/features/admin/auth";
import { AdminShell } from "@/features/admin/shell";
export const dynamic = "force-dynamic";
export default async function AdminSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  if (!(await getStaff())) redirect("/namu-admin/login");
  const { section } = await params;
  if (
    !["counter", "orders", "shipping", "products", "settings"].includes(section)
  )
    notFound();
  return <AdminShell section={section} />;
}
