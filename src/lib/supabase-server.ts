import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "@/lib/env";
import { logApiError } from "@/server/monitoring";

export function getSupabaseAdmin() {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? cleanEnv(process.env.SUPABASE_URL);
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
    logApiError(error, "Unable to create Supabase admin client.");
    return null;
  }
}
