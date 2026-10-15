import { siteConfig } from "@/lib/site";
import type { getSupabaseAdmin } from "@/lib/supabase-server";
import { renderFlyEmail, renderFlyEmailText } from "@/server/email-template";
import { logWarn } from "@/server/monitoring";
import { sendWhatsAppNotification } from "@/server/notifications/whatsapp";
import { writeOperationalEvent } from "@/server/operational-events";
import { resendFromEmail, resendReplyToEmail } from "@/server/resend-sender";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type AdminNotificationInput = {
  title: string;
  message: string;
  severity?: "info" | "warning" | "error";
  entityType?: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
  request?: Request;
};

const defaultAdminEmail = "vincenttheoikechukwu@gmail.com";
const defaultAdminPhone = "08139171125";

function adminEmail() {
  return process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || defaultAdminEmail;
}

function adminPhone() {
  return process.env.ADMIN_NOTIFICATION_PHONE?.trim() || defaultAdminPhone;
}

function severityVariant(severity: AdminNotificationInput["severity"]) {
  if (severity === "error") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "admin" as const;
}

function htmlEmail(input: AdminNotificationInput) {
  return renderFlyEmail({
    eyebrow: "Admin operations alert",
    title: input.title,
    body: input.message,
    reference: input.entityId,
    cta: { label: "Open admin dashboard", url: `${siteConfig.url}/admin/dashboard` },
    details: [
      { label: "Severity", value: input.severity ?? "info" },
      { label: "Entity", value: input.entityType },
      { label: "Support", value: `${siteConfig.contact.supportEmail} | ${siteConfig.contact.supportPhone}` }
    ],
    variant: severityVariant(input.severity)
  });
}

export async function notifyAdmin(supabase: SupabaseAdminClient | null, input: AdminNotificationInput) {
  const to = adminEmail();
  const phone = adminPhone();

  await writeOperationalEvent(supabase, {
    category: "notification",
    severity: input.severity ?? "info",
    message: input.title,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: {
      ...(input.metadata ?? {}),
      adminEmail: to,
      adminPhoneConfigured: Boolean(phone),
      emailProvider: process.env.RESEND_API_KEY ? "resend" : "not_configured"
    },
    request: input.request
  });

  const whatsapp = phone
    ? await sendWhatsAppNotification({
        to: phone,
        message: `Fly Logistics admin alert\n\n${input.title}\n${input.message}${input.entityId ? `\n\nReference: ${input.entityId}` : ""}\n\nDashboard: ${siteConfig.url}/admin/dashboard`,
        workflow: "admin_alert",
        entityType: input.entityType ?? "admin_notification",
        entityId: input.entityId,
        metadata: {
          severity: input.severity ?? "info",
          title: input.title,
          source: "notify_admin"
        }
      })
    : null;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    logWarn("Admin email notification skipped because RESEND_API_KEY is not configured.", {
      notificationTitle: input.title,
      entityType: input.entityType,
      entityId: input.entityId
    });
    return { ok: Boolean(whatsapp?.ok), mode: whatsapp?.ok ? "whatsapp_and_dashboard" as const : "dashboard_only" as const, whatsapp };
  }

  try {
    const eventIdentity = String(
      input.metadata?.idempotencyKey ??
      `${input.entityType ?? "operations"}-${input.entityId ?? input.title}`
    )
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .slice(0, 180);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `admin-${eventIdentity}`
      },
      body: JSON.stringify({
        from: resendFromEmail(),
        to,
        reply_to: resendReplyToEmail(),
        subject: `Fly Logistics: ${input.title}`,
        html: htmlEmail(input),
        text: renderFlyEmailText({
          eyebrow: "Admin operations alert",
          title: input.title,
          body: input.message,
          reference: input.entityId,
          cta: { label: "Open admin dashboard", url: `${siteConfig.url}/admin/dashboard` },
          details: [
            { label: "Severity", value: input.severity ?? "info" },
            { label: "Entity", value: input.entityType }
          ],
          variant: severityVariant(input.severity)
        })
      })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message ?? `Resend returned ${response.status}.`);
    }

    return { ok: true, mode: whatsapp?.ok ? "email_whatsapp_and_dashboard" as const : "email_and_dashboard" as const, whatsapp };
  } catch (error) {
    logWarn("Admin email notification failed.", {
      notificationTitle: input.title,
      entityType: input.entityType,
      entityId: input.entityId,
      error: error instanceof Error ? error.message : "Unknown email error"
    });
    return { ok: Boolean(whatsapp?.ok), mode: whatsapp?.ok ? "whatsapp_and_dashboard" as const : "dashboard_only" as const, whatsapp };
  }
}
