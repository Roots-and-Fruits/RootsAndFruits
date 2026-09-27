import "server-only";
import { createClient } from "@/lib/supabase/server";
export async function getStaff() {
  try {
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user) return null;
    const { data: staff, error: roleError } = await client.rpc("is_staff");
    return !roleError && staff === true ? user : null;
  } catch {
    return null;
  }
}
