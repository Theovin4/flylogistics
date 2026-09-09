import { siteConfig } from "@/lib/site";
import type { ShipmentRecord } from "@/lib/shipments";
import type { getSupabaseAdmin } from "@/lib/supabase-server";
import { renderFlyEmail, renderFlyEmailText } from "@/server/email-template";
import { logWarn } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { resendFromEmail, resendReplyToEmail } from "@/server/resend-sender";
import { whiteLabelCustomerText } from "@/server/notifications/white-label";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type ShipmentEmailKind = "created" | "in_transit" | "delivered";

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://flylogistics.com.ng").replace(/\/$/, "");
}

function uniqueEmails(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter((value) => value.includes("@"))
    )
  );
}

async function merchantRecipients(supabase: SupabaseAdminClient | null, shipment: ShipmentRecord) {
  if (!supabase || !shipment.business_account_id) return [];

  const { data, error } = await supabase
    .from("business_accounts")
    .select("contact_email,billing_email")
    .eq("id", shipment.business_account_id)
    .maybeSingle();

  if (error) {
    logWarn("Unable to load merchant email recipients for shipment notification.", {
      trackingId: shipment.tracking_id,
      businessAccountId: shipment.business_account_id,
      reason: error.message
    });
    return [];
  }

  return uniqueEmails([data?.contact_email, data?.billing_email]);
}

function trackingUrl(shipment: ShipmentRecord) {
  return `${appUrl()}/tracking?trackingId=${encodeURIComponent(shipment.tracking_id)}`;
}

function emailCopy(kind: ShipmentEmailKind, shipment: ShipmentRecord) {
  if (kind === "delivered") {
    return {
      subject: `Fly Logistics: ${shipment.tracking_id} has been delivered`,
      title: "Delivery completed",
      eyebrow: "Delivery confirmation",
      message: `Your shipment ${shipment.tracking_id} has been delivered and completion has been recorded by Fly Logistics operations.`,
      cta: "View tracking"
    };
  }

  if (kind === "in_transit") {
    return {
      subject: `Fly Logistics: ${shipment.tracking_id} is in transit`,
      title: "Shipment in transit",
      eyebrow: "Transit update",
      message: `Your shipment ${shipment.tracking_id} is now in transit through the Fly Logistics network. You can follow progress with your Fly Logistics tracking ID.`,
      cta: "Track shipment"
    };
  }

  return {
    subject: `Fly Logistics: ${shipment.tracking_id} has been created`,
    title: "Shipment created and processed",
    eyebrow: "Shipment confirmation",
    message: `Your shipment ${shipment.tracking_id} has been created and processed by Fly Logistics operations. You can track progress with your Fly Logistics tracking ID.`,
    cta: "Track shipment"
  };
}

function shipmentEmailHtml(kind: ShipmentEmailKind, shipment: ShipmentRecord) {
  const copy = emailCopy(kind, shipment);
  const url = trackingUrl(shipment);
  return renderFlyEmail({
    eyebrow: copy.eyebrow,
    title: copy.title,
    body: whiteLabelCustomerText(copy.message),
    reference: shipment.tracking_id,
    cta: { label: copy.cta, url },
    details: [
      { label: "Receiver", value: shipment.recipient_name ?? "Receiver" },
      { label: "Status", value: shipment.status },
      { label: "ETA", value: shipment.eta ?? "Pending" },
      { label: "Support", value: `${siteConfig.contact.supportEmail} | ${siteConfig.contact.supportPhone}` }
    ],
    variant: kind === "delivered" ? "success" : "customer"
  });
}

async function sendEmail(
  to: string[],
  subject: string,
  html: string,
  text: string,
  idempotencyKey: string
) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, mode: "dashboard_only" as const, reason: "RESEND_API_KEY not configured" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
      from: resendFromEmail(),
      to,
      reply_to: resendReplyToEmail(),
      subject,
      html,
      text
    })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? `Resend returned ${response.status}.`);
  }

  return { ok: true, mode: "email_and_dashboard" as const };
}

export async function sendShipmentLifecycleEmail(
  supabase: SupabaseAdminClient | null,
  shipment: ShipmentRecord,
  kind: ShipmentEmailKind,
  request?: Request
) {
  const recipients = uniqueEmails([
    shipment.customer_email,
    ...(await merchantRecipients(supabase, shipment))
  ]);
  const copy = emailCopy(kind, shipment);

  await writeOperationalEvent(supabase, {
    category: "notification",
    message: `Shipment ${kind === "delivered" ? "delivery" : kind === "in_transit" ? "transit" : "creation"} email prepared.`,
    entityType: "shipment",
    entityId: shipment.tracking_id,
    metadata: {
      workflow: kind === "delivered" ? "shipment_delivered_email" : kind === "in_transit" ? "shipment_in_transit_email" : "shipment_created_email",
      recipients: recipients.length,
      emailProvider: process.env.RESEND_API_KEY ? "resend" : "not_configured"
    },
    request
  });

  if (recipients.length === 0) return { ok: false, mode: "no_recipient" as const };

  try {
    return await sendEmail(
      recipients,
      whiteLabelCustomerText(copy.subject, "Fly Logistics shipment update"),
      shipmentEmailHtml(kind, shipment),
      renderFlyEmailText({
        eyebrow: copy.eyebrow,
        title: copy.title,
        body: whiteLabelCustomerText(copy.message),
        reference: shipment.tracking_id,
        cta: { label: copy.cta, url: trackingUrl(shipment) },
        details: [
          { label: "Receiver", value: shipment.recipient_name ?? "Receiver" },
          { label: "Status", value: shipment.status },
          { label: "ETA", value: shipment.eta ?? "Pending" }
        ]
      }),
      `shipment-${kind}-${shipment.tracking_id}`
    );
  } catch (error) {
    logWarn("Shipment lifecycle email failed.", {
      trackingId: shipment.tracking_id,
      kind,
      error: error instanceof Error ? error.message : "Unknown email error"
    });
    return { ok: false, mode: "dashboard_only" as const };
  }
}
