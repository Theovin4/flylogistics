import { cleanEnv } from "@/lib/env";
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from "@/lib/whatsapp";
import { recordNotificationAttempt } from "@/server/notifications/shared";

type WhatsAppNotificationInput = {
  to?: string | null;
  message: string;
  workflow?: string;
  entityType?: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
};

type WhatsAppTemplateInput = Omit<WhatsAppNotificationInput, "message"> & {
  templateName: string;
  language?: string;
  components?: Array<Record<string, unknown>>;
  message?: string;
};

export type WhatsAppNotificationResult = {
  ok: boolean;
  mode: "link" | "sent" | "queued" | "failed" | "not_configured";
  provider: "wa_link" | "whatsapp_cloud_api" | "twilio";
  url: string;
  status: "LINK_READY" | "SENT" | "QUEUED" | "FAILED" | "NOT_CONFIGURED";
  providerMessageId?: string;
  providerStatus?: string;
  reason?: string;
};

function providerName() {
  const configuredProvider = cleanEnv(process.env.WHATSAPP_PROVIDER)?.toLowerCase();
  if (configuredProvider) return configuredProvider;
  if (cloudToken() && cloudPhoneNumberId()) {
    return "whatsapp_cloud_api";
  }
  return "link";
}

function cloudToken() {
  return cleanEnv(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN) ?? cleanEnv(process.env.WHATSAPP_ACCESS_TOKEN);
}

function cloudPhoneNumberId() {
  return cleanEnv(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID) ?? cleanEnv(process.env.WHATSAPP_PHONE_NUMBER_ID);
}

function cloudApiVersion() {
  return cleanEnv(process.env.WHATSAPP_CLOUD_API_VERSION) ?? cleanEnv(process.env.WHATSAPP_API_VERSION) ?? "v20.0";
}

function cloudWebhookVerifyToken() {
  return cleanEnv(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) ?? cleanEnv(process.env.WHATSAPP_VERIFY_TOKEN);
}

function cloudAppSecret() {
  return cleanEnv(process.env.WHATSAPP_APP_SECRET) ?? cleanEnv(process.env.META_APP_SECRET);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseProviderResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function cloudApiError(payload: Record<string, unknown> | null) {
  const error = payload?.error as { message?: string; code?: number; error_subcode?: number } | undefined;
  const code = error?.code ? `#${error.code}` : null;
  if (error?.code === 131030) {
    return "Meta rejected this recipient because the WhatsApp number is still restricted to test recipients. Add the number in Meta API Setup for testing, or complete business/phone registration for production messaging. (#131030)";
  }
  return [code, error?.message].filter(Boolean).join(" ") || "WhatsApp Cloud API request failed.";
}

const templateWorkflowNames: Record<string, string> = {
  account_created: "account_created",
  quote_sent: "quote_sent",
  quote_accepted: "quote_accepted",
  wallet_funded: "wallet_funded",
  payment_received: "payment_received",
  payment_confirmation: "payment_received",
  shipment_created: "shipment_created",
  shipment_confirmed: "shipment_created",
  driver_assigned: "driver_assigned",
  shipment_picked_up: "pickup_confirmed",
  in_transit_update: "shipment_in_transit",
  approaching_destination: "out_for_delivery",
  delivered_confirmation: "delivered",
  failed_delivery: "delivery_failed",
  refund_processed: "refund_processed"
};

function templateEnvKey(workflow: string) {
  return `WHATSAPP_TEMPLATE_${workflow.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}`;
}

function approvedTemplateFor(input: WhatsAppNotificationInput): WhatsAppTemplateInput | null {
  const workflow = String(input.workflow ?? "").trim().toLowerCase();
  const defaultName = templateWorkflowNames[workflow];
  if (!defaultName || cleanEnv(process.env.WHATSAPP_USE_TEMPLATES)?.toLowerCase() === "false") return null;
  const templateName = cleanEnv(process.env[templateEnvKey(workflow)]) ?? defaultName;
  return {
    ...input,
    templateName,
    language: cleanEnv(process.env.WHATSAPP_TEMPLATE_LANGUAGE) ?? "en_US",
    components: [
      {
        type: "body",
        parameters: [{ type: "text", text: input.message.slice(0, 1024) }]
      }
    ]
  };
}

async function sendWithCloudApi(input: WhatsAppNotificationInput, url: string): Promise<WhatsAppNotificationResult> {
  const token = cloudToken();
  const phoneNumberId = cloudPhoneNumberId();
  const version = cloudApiVersion();

  if (!token || !phoneNumberId) {
    return {
      ok: false,
      mode: "not_configured",
      provider: "whatsapp_cloud_api",
      status: "NOT_CONFIGURED",
      url,
      reason: "WhatsApp Cloud API credentials are not configured."
    };
  }

  if (!input.to) {
    return {
      ok: false,
      mode: "failed",
      provider: "whatsapp_cloud_api",
      status: "FAILED",
      url,
      reason: "Recipient phone number is required for WhatsApp Cloud API."
    };
  }

  const response = await fetchWithTimeout(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizeWhatsAppPhone(input.to),
      type: "text",
      text: {
        body: input.message,
        preview_url: true
      }
    })
  });

  const payload = await parseProviderResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      mode: "failed",
      provider: "whatsapp_cloud_api",
      status: "FAILED",
      url,
      providerStatus: String(response.status),
      reason: cloudApiError(payload)
    };
  }

  const messages = payload?.messages as Array<{ id?: string }> | undefined;
  return {
    ok: true,
    mode: "sent",
    provider: "whatsapp_cloud_api",
    status: "SENT",
    url,
    providerMessageId: messages?.[0]?.id,
    providerStatus: String(response.status)
  };
}

async function sendTemplateWithCloudApi(input: WhatsAppTemplateInput, url: string): Promise<WhatsAppNotificationResult> {
  const token = cloudToken();
  const phoneNumberId = cloudPhoneNumberId();
  const version = cloudApiVersion();

  if (!token || !phoneNumberId) {
    return {
      ok: false,
      mode: "not_configured",
      provider: "whatsapp_cloud_api",
      status: "NOT_CONFIGURED",
      url,
      reason: "WhatsApp Cloud API credentials are not configured."
    };
  }

  if (!input.to) {
    return {
      ok: false,
      mode: "failed",
      provider: "whatsapp_cloud_api",
      status: "FAILED",
      url,
      reason: "Recipient phone number is required for WhatsApp Cloud API."
    };
  }

  const response = await fetchWithTimeout(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeWhatsAppPhone(input.to),
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.language ?? "en_US" },
        ...(input.components?.length ? { components: input.components } : {})
      }
    })
  });

  const payload = await parseProviderResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      mode: "failed",
      provider: "whatsapp_cloud_api",
      status: "FAILED",
      url,
      providerStatus: String(response.status),
      reason: cloudApiError(payload)
    };
  }

  const messages = payload?.messages as Array<{ id?: string }> | undefined;
  return {
    ok: true,
    mode: "sent",
    provider: "whatsapp_cloud_api",
    status: "SENT",
    url,
    providerMessageId: messages?.[0]?.id,
    providerStatus: String(response.status)
  };
}

export class WhatsAppCloudProvider {
  private token = cloudToken();
  private phoneNumberId = cloudPhoneNumberId();
  private businessAccountId = cleanEnv(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);
  private webhookVerifyToken = cloudWebhookVerifyToken();
  private appSecret = cloudAppSecret();
  private version = cloudApiVersion();

  isConfigured() {
    return Boolean(this.token && this.phoneNumberId);
  }

  health() {
    return {
      provider: "whatsapp_cloud_api",
      configured: this.isConfigured(),
      phoneNumberIdConfigured: Boolean(this.phoneNumberId),
      businessAccountIdConfigured: Boolean(this.businessAccountId),
      webhookVerifyTokenConfigured: Boolean(this.webhookVerifyToken),
      appSecretConfigured: Boolean(this.appSecret),
      status: this.isConfigured() ? "ready" : "missing_config",
      graphVersion: this.version
    };
  }

  async diagnose() {
    const health = this.health();
    if (!this.isConfigured()) return { ...health, connection: "not_configured" as const };
    try {
      const response = await fetchWithTimeout(
        `https://graph.facebook.com/${this.version}/${this.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" },
        8_000
      );
      const payload = await parseProviderResponse(response);
      if (!response.ok) {
        return {
          ...health,
          connection: "failed" as const,
          providerStatus: response.status,
          reason: cloudApiError(payload)
        };
      }
      return {
        ...health,
        connection: "connected" as const,
        verifiedName: typeof payload?.verified_name === "string" ? payload.verified_name : null,
        displayPhoneNumber: typeof payload?.display_phone_number === "string" ? payload.display_phone_number : null,
        qualityRating: typeof payload?.quality_rating === "string" ? payload.quality_rating : null
      };
    } catch (error) {
      return {
        ...health,
        connection: "failed" as const,
        reason: error instanceof Error ? error.message : "Unable to reach Meta WhatsApp Cloud API."
      };
    }
  }

  async send(input: WhatsAppNotificationInput, url = buildWhatsAppUrl({ phone: input.to, message: input.message })) {
    return sendWithCloudApi(input, url);
  }

  async sendTemplate(input: WhatsAppTemplateInput, url = buildWhatsAppUrl({ phone: input.to, message: input.message ?? input.templateName })) {
    return sendTemplateWithCloudApi(input, url);
  }
}

function twilioFrom(value: string) {
  return value.startsWith("whatsapp:") ? value : `whatsapp:+${normalizeWhatsAppPhone(value)}`;
}

async function sendWithTwilio(input: WhatsAppNotificationInput, url: string): Promise<WhatsAppNotificationResult> {
  const accountSid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
  const authToken = cleanEnv(process.env.TWILIO_AUTH_TOKEN);
  const from = cleanEnv(process.env.TWILIO_WHATSAPP_FROM);

  if (!accountSid || !authToken || !from) {
    return {
      ok: false,
      mode: "not_configured",
      provider: "twilio",
      status: "NOT_CONFIGURED",
      url,
      reason: "Twilio WhatsApp credentials are not configured."
    };
  }

  if (!input.to) {
    return {
      ok: false,
      mode: "failed",
      provider: "twilio",
      status: "FAILED",
      url,
      reason: "Recipient phone number is required for Twilio WhatsApp."
    };
  }

  const body = new URLSearchParams({
    From: twilioFrom(from),
    To: `whatsapp:+${normalizeWhatsAppPhone(input.to)}`,
    Body: input.message
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const payload = await parseProviderResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      mode: "failed",
      provider: "twilio",
      status: "FAILED",
      url,
      providerStatus: String(response.status),
      reason: String(payload?.message ?? payload?.error_message ?? "Twilio WhatsApp request failed.")
    };
  }

  return {
    ok: true,
    mode: "queued",
    provider: "twilio",
    status: "QUEUED",
    url,
    providerMessageId: typeof payload?.sid === "string" ? payload.sid : undefined,
    providerStatus: typeof payload?.status === "string" ? payload.status : String(response.status)
  };
}

export async function sendWhatsAppNotification(input: WhatsAppNotificationInput): Promise<WhatsAppNotificationResult> {
  const url = buildWhatsAppUrl({ phone: input.to, message: input.message });
  let result: WhatsAppNotificationResult;

  try {
    if (providerName() === "whatsapp_cloud_api") {
      const provider = new WhatsAppCloudProvider();
      const template = approvedTemplateFor(input);
      if (template) {
        const templateResult = await provider.sendTemplate(template, url);
        result = templateResult.ok ? templateResult : await provider.send(input, url);
        if (!result.ok && templateResult.reason && result.reason !== templateResult.reason) {
          result.reason = `Template: ${templateResult.reason} Text fallback: ${result.reason ?? "failed"}`;
        }
      } else {
        result = await provider.send(input, url);
      }
    } else if (providerName() === "twilio") {
      result = await sendWithTwilio(input, url);
    } else {
      result = {
        ok: true,
        mode: "link",
        provider: "wa_link",
        status: "LINK_READY",
        url
      };
    }
  } catch (error) {
    result = {
      ok: false,
      mode: "failed",
      provider: providerName() === "twilio" ? "twilio" : providerName() === "whatsapp_cloud_api" ? "whatsapp_cloud_api" : "wa_link",
      status: "FAILED",
      url,
      reason: error instanceof Error ? error.message : "Unable to send WhatsApp notification."
    };
  }

  await recordNotificationAttempt("whatsapp", { ...input, to: input.to ? normalizeWhatsAppPhone(input.to) : input.to }, result);
  return result;
}
