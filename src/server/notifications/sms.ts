import { cleanEnv } from "@/lib/env";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";
import { recordNotificationAttempt, type NotificationDeliveryResult, type NotificationRequest } from "@/server/notifications/shared";

export type SmsNotificationResult = NotificationDeliveryResult & {
  provider: "termii";
};

export class TermiiSmsProvider {
  private apiKey = cleanEnv(process.env.TERMII_API_KEY);
  private senderId = cleanEnv(process.env.TERMII_SENDER_ID) ?? "FlyLog";
  private baseUrl = (cleanEnv(process.env.TERMII_BASE_URL) ?? "https://api.ng.termii.com/api").replace(/\/$/, "");

  isConfigured() {
    return Boolean(this.apiKey && this.baseUrl);
  }

  health() {
    return {
      provider: "termii",
      configured: this.isConfigured(),
      senderId: this.senderId,
      baseUrl: this.baseUrl,
      status: this.isConfigured() ? "ready" : "missing_config"
    };
  }

  private sendEndpoint() {
    if (this.baseUrl.endsWith("/sms/send")) return this.baseUrl;
    if (this.baseUrl.endsWith("/api")) return `${this.baseUrl}/sms/send`;
    return `${this.baseUrl}/api/sms/send`;
  }

  async send(input: NotificationRequest & { route?: "dnd" | "generic" }): Promise<SmsNotificationResult> {
    if (!this.isConfigured() || !this.apiKey) {
      return {
        ok: false,
        mode: "not_configured",
        provider: "termii",
        status: "NOT_CONFIGURED",
        reason: "Termii SMS credentials are not configured."
      };
    }

    if (!input.to) {
      return {
        ok: false,
        mode: "failed",
        provider: "termii",
        status: "FAILED",
        reason: "Recipient phone number is required for SMS."
      };
    }

    const response = await fetch(this.sendEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        to: normalizeWhatsAppPhone(input.to),
        from: this.senderId,
        sms: input.message,
        type: "plain",
        channel: input.route ?? "dnd"
      })
    });

    const responseText = await response.text();
    let payload: Record<string, unknown> | null = null;
    if (responseText) {
      try {
        payload = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        payload = { raw: responseText };
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        mode: "failed",
        provider: "termii",
        status: "FAILED",
        providerStatus: String(response.status),
        reason: String(payload?.message ?? payload?.error ?? "Termii SMS request failed.")
      };
    }

    const messageId = payload?.message_id ?? payload?.messageId ?? payload?.id;
    return {
      ok: true,
      mode: "queued",
      provider: "termii",
      status: "QUEUED",
      providerMessageId: messageId === undefined || messageId === null ? undefined : String(messageId),
      providerStatus: String(payload?.message ?? payload?.code ?? response.status)
    };
  }
}

export async function sendSmsNotification(input: NotificationRequest & { route?: "dnd" | "generic" }): Promise<SmsNotificationResult> {
  let result: SmsNotificationResult;

  try {
    result = await new TermiiSmsProvider().send(input);
  } catch (error) {
    result = {
      ok: false,
      mode: "failed",
      provider: "termii",
      status: "FAILED",
      reason: error instanceof Error ? error.message : "Unable to send SMS notification."
    };
  }

  await recordNotificationAttempt("sms", input, result);
  return result;
}
