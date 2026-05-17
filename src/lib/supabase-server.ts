import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "@/lib/env";

export function getSupabaseAdmin() {
  const url = cleanEnv(process.env.SUPABASE_URL) ?? cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !serviceRoleKey) return null;

  try {
    return createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}
