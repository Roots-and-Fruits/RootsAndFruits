import { AdminShell } from "@/features/admin/shell";

// Static navigation only. Each page and API authorizes access to its data.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
