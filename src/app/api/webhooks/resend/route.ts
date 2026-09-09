import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { logApiError, logInfo, logWarn, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { getReceivedEmail, senderAddress, verifyResendWebhook } from "@/server/resend-webhooks";

export const dynamic = "force-dynamic";
const MAX_BODY = 1_000_000;

type ResendEvent = { type?: string; created_at?: string; data?: Record<string, unknown> };

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  const rawBody = await request.text();
  if (!rawBody || rawBody.length > MAX_BODY) return NextResponse.json({ error: "Invalid webhook payload." }, { status: rawBody.length > MAX_BODY ? 413 : 400 });
  const verified = verifyResendWebhook(rawBody, request.headers);
  if (!verified.ok) { logWarn("Rejected Resend webhook.", requestContext(request, { reason: verified.error })); return NextResponse.json({ error: verified.error }, { status: verified.status }); }
  let event: ResendEvent;
  try { event = JSON.parse(rawBody) as ResendEvent; } catch { return NextResponse.json({ error: "Invalid webhook JSON." }, { status: 400 }); }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Notification storage is unavailable." }, { status: 503 });
  const eventType = String(event.type ?? "unknown"); const data = event.data ?? {};

  try {
    const stored = await supabase.from("resend_webhook_events").insert({ event_id: verified.eventId, event_type: eventType, payload: event, received_at: new Date().toISOString() });
    if (stored.error?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    if (stored.error) throw stored.error;

    const emailId = String(data.email_id ?? data.id ?? "");
    if (emailId && eventType.startsWith("email.") && eventType !== "email.received") {
      const status = eventType === "email.delivered" ? "DELIVERED" : eventType === "email.bounced" || eventType === "email.failed" ? "FAILED" : eventType === "email.complained" ? "COMPLAINED" : "SENT";
      await supabase.from("notification_messages").update({ status, sent_at: data.created_at ?? event.created_at ?? new Date().toISOString(), error_message: typeof data.reason === "string" ? data.reason : null }).eq("external_message_id", emailId);
    }

    if (eventType === "email.received" && emailId) {
      const content = await getReceivedEmail(emailId);
      const from = senderAddress(data.from ?? content.from); const subject = String(data.subject ?? content.subject ?? "Email support request").slice(0, 240);
      const message = String(content.text ?? content.html ?? "Inbound email received.").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 10_000);
      const profile = from ? await supabase.from("user_profiles").select("id,full_name,email").ilike("email", from).maybeSingle() : { data: null, error: null };
      const ticketId = `EMAIL-${Date.now().toString(36).toUpperCase()}`;
      await supabase.from("customer_support_tickets").insert({ ticket_id: ticketId, user_id: profile.data?.id ?? null, subject, priority: "NORMAL", status: "OPEN", message, ticket_type: "email", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_message_at: new Date().toISOString(), unread_admin_count: 1 });
      await supabase.from("support_chat_messages").insert({ ticket_id: ticketId, user_id: profile.data?.id ?? null, sender_id: profile.data?.id ?? null, sender_role: "customer", sender_name: profile.data?.full_name ?? from, message, metadata: { source: "resend_inbound", emailId, from, subject } });
    }

    await writeOperationalEvent(supabase, { category: "notification", severity: "info", message: `Resend ${eventType} event processed.`, entityType: "resend_email", entityId: emailId || verified.eventId, metadata: { eventType } });
    logInfo("Processed Resend webhook.", requestContext(request, { eventType, emailId }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError(error, "Resend webhook processing failed.", requestContext(request, { eventType }));
    await writeOperationalEvent(supabase, { category: "notification", severity: "error", message: "Resend webhook processing failed.", entityType: "resend_webhook", entityId: verified.eventId, metadata: { eventType, error: error instanceof Error ? error.message : String(error) } });
    return NextResponse.json({ error: "Unable to process email event." }, { status: 500 });
  }
}
