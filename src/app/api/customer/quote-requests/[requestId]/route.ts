import { NextResponse } from "next/server";
import { z } from "zod";
import { canCustomerRespondToQuote, normalizeQuoteStatus, type QuoteStatus } from "@/lib/quotes";
import type { QuoteRequestRecord } from "@/lib/shipments";
import { whatsappMessages } from "@/lib/whatsapp";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { getCustomerNotificationPreferences } from "@/server/notifications/preferences";
import { sendCustomerNotification } from "@/server/notifications/service";
import { writeOperationalEvent } from "@/server/operational-events";
import { nextQuoteHistory, updateQuoteWithWorkflowFallback, writeQuoteStatusEvent } from "@/server/quote-workflow";
import { getTenantContextForProfile } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const customerQuoteActionSchema = z.object({
  action: z.enum(["accept", "decline"])
});

export async function PATCH(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.profile.email) return NextResponse.json({ error: "Your customer account needs an email before responding to quotes." }, { status: 409 });

  const parsed = await parseJson(request, customerQuoteActionSchema, "Choose whether to accept or decline this quote.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Quote response is temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const normalizedRequestId = requestId.trim().toUpperCase();
  let quoteQuery = supabase
    .from("quote_requests")
    .select("*")
    .eq("request_id", normalizedRequestId)
    .ilike("customer_email", access.profile.email);
  if (tenant.schemaReady && tenant.companyId) quoteQuery = quoteQuery.eq("company_id", tenant.companyId);
  const { data: quote, error } = await quoteQuery.maybeSingle();

  if (error) {
    logApiError(error, "Unable to load quote request for customer response.", requestContext(request, { requestId: normalizedRequestId }));
    return NextResponse.json({ error: "Unable to load this quote request." }, { status: 500 });
  }

  if (!quote) return NextResponse.json({ error: "Quote request not found for this customer account." }, { status: 404 });

  const currentQuote = quote as QuoteRequestRecord;
  const currentStatus = normalizeQuoteStatus(currentQuote.status);
  if (!canCustomerRespondToQuote(currentQuote.status, currentQuote.quote_valid_until)) {
    return NextResponse.json({ error: "Only active quotes can be accepted or declined." }, { status: 409 });
  }

  const nextStatus: QuoteStatus = parsed.data.action === "accept" ? "ACCEPTED" : "DECLINED";
  const now = new Date().toISOString();
  const update = {
    status: nextStatus,
    accepted_at: nextStatus === "ACCEPTED" ? now : currentQuote.accepted_at ?? null,
    declined_at: nextStatus === "DECLINED" ? now : currentQuote.declined_at ?? null,
    quote_status_history: nextQuoteHistory(
      currentQuote,
      nextStatus,
      access.profile,
      nextStatus === "ACCEPTED" ? "Customer accepted the quoted delivery price." : "Customer declined the quoted delivery price."
    )
  };

  const updated = await updateQuoteWithWorkflowFallback(supabase, normalizedRequestId, update, {
    companyId: tenant.schemaReady ? tenant.companyId : null
  });
  if (updated.error) {
    logApiError(updated.error, "Unable to update quote customer response.", requestContext(request, { requestId: normalizedRequestId }));
    return NextResponse.json({ error: "Unable to save your quote response." }, { status: 500 });
  }

  await writeQuoteStatusEvent(supabase, {
    requestId: normalizedRequestId,
    previousStatus: currentStatus,
    nextStatus,
    actor: access.profile,
    note: nextStatus === "ACCEPTED" ? "Customer accepted quote." : "Customer declined quote."
  });

  let customerNotification: { ok: boolean; provider: string; mode: string } | null = null;
  if (nextStatus === "ACCEPTED" && (currentQuote.customer_phone || currentQuote.customer_email)) {
    const preferences = await getCustomerNotificationPreferences(supabase, currentQuote.customer_email);
    const notification = await sendCustomerNotification({
      to: currentQuote.customer_phone,
      message: whatsappMessages.quoteAccepted({ ...currentQuote, ...(updated.data ?? {}) }),
      workflow: "quote_accepted",
      entityType: "quote_request",
      entityId: normalizedRequestId,
      metadata: { requestId: normalizedRequestId, status: nextStatus },
      preferences
    });
    customerNotification = {
      ok: notification.ok,
      provider: notification.results.whatsapp?.provider ?? notification.results.sms?.provider ?? "multi_channel",
      mode: notification.results.whatsapp?.mode ?? notification.results.sms?.mode ?? "failed"
    };
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: nextStatus === "ACCEPTED" ? "quote.accept" : "quote.decline",
    entityType: "quote_request",
    entityId: normalizedRequestId,
    metadata: { previousStatus: currentStatus, nextStatus, customerNotification },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "quote",
    message: nextStatus === "ACCEPTED" ? "Customer accepted a quote." : "Customer declined a quote.",
    entityType: "quote_request",
    entityId: normalizedRequestId,
    metadata: { previousStatus: currentStatus, nextStatus, customerNotification },
    request
  });

  return NextResponse.json(updated.data);
}
