import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";
export function createServiceClient() {
  const config = getSupabaseConfig();
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) throw new Error("Supabase 서버 연결 설정이 필요합니다.");
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
