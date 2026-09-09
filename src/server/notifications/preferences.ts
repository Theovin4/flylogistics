import type { getSupabaseAdmin } from "@/lib/supabase-server";
import type { CustomerNotificationPreferences } from "@/server/notifications/service";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export async function getCustomerNotificationPreferences(
  supabase: SupabaseAdminClient | null,
  email?: string | null
): Promise<CustomerNotificationPreferences> {
  if (!supabase || !email) return { emailEnabled: true, whatsappEnabled: true, smsEnabled: true };

  let result = await supabase
    .from("user_profiles")
    .select("id,email,email_notifications_enabled,whatsapp_notifications_enabled,sms_notifications_enabled")
    .ilike("email", email)
    .eq("role", "customer")
    .maybeSingle();

  if (result.error && (result.error.code === "42703" || result.error.code === "PGRST204")) {
    result = await supabase
      .from("user_profiles")
      .select("id,email,whatsapp_notifications_enabled,sms_notifications_enabled")
      .ilike("email", email)
      .eq("role", "customer")
      .maybeSingle();
  }

  if (result.error || !result.data) return { email, emailEnabled: true, whatsappEnabled: true, smsEnabled: true };

  return {
    userId: result.data.id,
    email: result.data.email ?? email,
    emailEnabled: "email_notifications_enabled" in result.data ? result.data.email_notifications_enabled !== false : true,
    whatsappEnabled: result.data.whatsapp_notifications_enabled !== false,
    smsEnabled: result.data.sms_notifications_enabled !== false
  };
}
