import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AdminTiming } from "@/lib/admin-timing";
export async function getStaff(timing?: AdminTiming) {
  try {
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await (timing
      ? timing.measure("auth_user", () => client.auth.getUser())
      : client.auth.getUser());
    if (error || !user) return null;
    const { data: staff, error: roleError } = await (timing
      ? timing.measure("auth_role", () => client.rpc("is_staff"))
      : client.rpc("is_staff"));
    return !roleError && staff === true ? user : null;
  } catch {
    return null;
  }
}
