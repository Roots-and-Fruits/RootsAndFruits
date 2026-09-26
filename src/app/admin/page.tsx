import { redirect } from "next/navigation";
export default function AdminPage() {
  // No admin data or bypass before authentication/authorization is implemented.
  redirect("/admin/login");
}
