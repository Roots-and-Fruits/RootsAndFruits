import { redirect } from "next/navigation";
import { getStaff } from "@/features/admin/auth";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  redirect((await getStaff()) ? "/admin/counter" : "/admin/login");
}
