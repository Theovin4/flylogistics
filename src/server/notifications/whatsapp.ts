import { cleanEnv } from "@/lib/env";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

type WhatsAppNotificationInput = {
  to?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
};

export type WhatsAppNotificationResult = {
  ok: boolean;
  mode: "link" | "not_configured";
  provider: "wa_link" | "whatsapp_cloud_api" | "twilio";
  url: string;
  reason?: string;
};

export async function sendWhatsAppNotification(input: WhatsAppNotificationInput): Promise<WhatsAppNotificationResult> {
  const provider = cleanEnv(process.env.WHATSAPP_PROVIDER) ?? "link";
  const url = buildWhatsAppUrl({ phone: input.to, message: input.message });

  if (provider === "whatsapp_cloud_api") {
    const token = cleanEnv(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN);
    const phoneNumberId = cleanEnv(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID);
    if (!token || !phoneNumberId) {
      return {
        ok: false,
        mode: "not_configured",
        provider: "whatsapp_cloud_api",
        url,
        reason: "WhatsApp Cloud API credentials are not configured."
      };
    }

    return {
      ok: false,
      mode: "not_configured",
      provider: "whatsapp_cloud_api",
      url,
      reason: "Cloud API transport placeholder is ready; enable the provider implementation when credentials are approved."
    };
  }

  if (provider === "twilio") {
    const accountSid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
    const authToken = cleanEnv(process.env.TWILIO_AUTH_TOKEN);
    const from = cleanEnv(process.env.TWILIO_WHATSAPP_FROM);
    if (!accountSid || !authToken || !from) {
      return {
        ok: false,
        mode: "not_configured",
        provider: "twilio",
        url,
        reason: "Twilio WhatsApp credentials are not configured."
      };
    }

    return {
      ok: false,
      mode: "not_configured",
      provider: "twilio",
      url,
      reason: "Twilio transport placeholder is ready; enable the provider implementation when credentials are approved."
    };
  }

  return {
    ok: true,
    mode: "link",
    provider: "wa_link",
    url
  };
}
