import { siteConfig } from "@/lib/site";
import { shipmentTrackingUrl } from "@/lib/whatsapp";
import { renderFlyEmail, renderFlyEmailText } from "@/server/email-template";
import { resendFromEmail, resendReplyToEmail } from "@/server/resend-sender";
import { recordNotificationAttempt, type NotificationDeliveryResult, type NotificationRequest } from "@/server/notifications/shared";

type EmailNotificationInput = NotificationRequest & {
  emailTo?: string | null;
  subject?: string | null;
  title?: string | null;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
};

export type EmailNotificationResult = NotificationDeliveryResult & {
  provider: "resend";
};

function workflowTitle(workflow?: string | null) {
  return String(workflow ?? "Fly Logistics update")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function defaultCta(input: EmailNotificationInput) {
  if (input.entityType === "shipment" && input.entityId) return shipmentTrackingUrl(String(input.entityId));
  if (input.entityType === "quote_request") return `${siteConfig.url}/customer`;
  return `${siteConfig.url}/customer`;
}

function brandedHtml(input: EmailNotificationInput) {
  return renderFlyEmail({
    eyebrow: "Customer update",
    title: input.title ?? workflowTitle(input.workflow),
    body: input.message,
    reference: input.entityId,
    cta: {
      label: input.ctaLabel ?? "Open Fly Logistics",
      url: input.ctaUrl ?? defaultCta(input)
    },
    details: [
      { label: "Workflow", value: workflowTitle(input.workflow) },
      { label: "Support", value: `${siteConfig.contact.supportEmail} | ${siteConfig.contact.supportPhone}` }
    ],
    variant: "customer"
  });
}

export class ResendEmailProvider {
  private apiKey = process.env.RESEND_API_KEY?.trim();

  isConfigured() {
    return Boolean(this.apiKey);
  }

  health() {
    return {
      provider: "resend",
      configured: this.isConfigured(),
      sender: resendFromEmail(),
      status: this.isConfigured() ? "ready" : "missing_config"
    };
  }

  async send(input: EmailNotificationInput): Promise<EmailNotificationResult> {
    if (!this.apiKey) {
      return {
        ok: false,
        mode: "not_configured",
        provider: "resend",
        status: "NOT_CONFIGURED",
        reason: "Resend email credentials are not configured."
      };
    }

    if (!input.emailTo) {
      return {
        ok: false,
        mode: "failed",
        provider: "resend",
        status: "FAILED",
        reason: "Recipient email is required."
      };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `${input.workflow ?? "custom"}:${input.entityType ?? "notification"}:${input.entityId ?? input.emailTo}`
      },
      body: JSON.stringify({
        from: resendFromEmail(),
        to: input.emailTo,
        reply_to: resendReplyToEmail(),
        subject: input.subject ?? `Fly Logistics: ${workflowTitle(input.workflow)}`,
        html: brandedHtml(input),
        text: renderFlyEmailText({
          eyebrow: "Customer update",
          title: input.title ?? workflowTitle(input.workflow),
          body: input.message,
          reference: input.entityId,
          cta: {
            label: input.ctaLabel ?? "Open Fly Logistics",
            url: input.ctaUrl ?? defaultCta(input)
          }
        })
      })
    });

    const body = await response.json().catch(() => null) as { id?: string; message?: string; error?: string } | null;

    if (!response.ok) {
      return {
        ok: false,
        mode: "failed",
        provider: "resend",
        status: "FAILED",
        providerStatus: String(response.status),
        reason: body?.message ?? body?.error ?? "Resend email request failed."
      };
    }

    return {
      ok: true,
      mode: "sent",
      provider: "resend",
      status: "SENT",
      providerMessageId: body?.id,
      providerStatus: String(response.status)
    };
  }
}

export async function sendEmailNotification(input: EmailNotificationInput): Promise<EmailNotificationResult> {
  let result: EmailNotificationResult;

  try {
    result = await new ResendEmailProvider().send(input);
  } catch (error) {
    result = {
      ok: false,
      mode: "failed",
      provider: "resend",
      status: "FAILED",
      reason: error instanceof Error ? error.message : "Unable to send email notification."
    };
  }

  await recordNotificationAttempt("email", { ...input, to: input.emailTo ?? input.to }, result);
  return result;
}
