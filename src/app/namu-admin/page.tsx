import { redirect } from "next/navigation";
import { getStaff } from "@/features/admin/auth";
import { createAdminTiming } from "@/lib/admin-timing";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const timing = createAdminTiming("page.entry");
  let staff;
  try {
    staff = await getStaff(timing);
  } finally {
    timing.finish();
  }
  redirect(staff ? "/namu-admin/counter" : "/namu-admin/login");
}
