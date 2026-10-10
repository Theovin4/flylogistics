import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeQuoteStatus, type QuoteStatus } from "@/lib/quotes";
import { type QuoteRequestRecord } from "@/lib/shipments";
import { whatsappMessages } from "@/lib/whatsapp";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logShipmentWorkflowError, requestContext } from "@/server/monitoring";
import { getCustomerNotificationPreferences } from "@/server/notifications/preferences";
import { sendCustomerNotification } from "@/server/notifications/service";
import { writeOperationalEvent } from "@/server/operational-events";
import { nextQuoteHistory, quoteAmount, quoteEtaHours, updateQuoteWithWorkflowFallback, writeQuoteStatusEvent } from "@/server/quote-workflow";
import { getTenantContextForProfile } from "@/server/tenancy";

const quoteReviewSchema = z.object({
  action: z.enum(["send_quote", "decline", "expire", "mark_paid", "update_quote"]).optional(),
  status: z.enum(["APPROVED", "REJECTED", "QUOTED", "DECLINED", "EXPIRED", "PAID"]).optional(),
  quotedPrice: z.coerce.number().positive().optional(),
  quotedEtaHours: z.coerce.number().int().positive().optional(),
  quotedEtaLabel: z.string().trim().max(120).optional(),
  quoteNotes: z.string().trim().max(2000).optional(),
  quoteValidUntil: z.string().trim().max(80).optional().nullable(),
  reviewNotes: z.string().trim().max(2000).optional()
});

function resolveAction(input: z.infer<typeof quoteReviewSchema>) {
  if (input.action) return input.action;
  if (input.status === "APPROVED" || input.status === "QUOTED") return "send_quote";
  if (input.status === "REJECTED" || input.status === "DECLINED") return "decline";
  if (input.status === "EXPIRED") return "expire";
  if (input.status === "PAID") return "mark_paid";
  return "update_quote";
}

function validUntil(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function isOptionalSchemaError(error: { code?: string; message?: string } | null) {
  return Boolean(error && ["42P01", "42703"].includes(error.code ?? ""));
}

async function deleteRelatedQuoteRows(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, requestId: string) {
  const operations = [
    supabase.from("quote_status_events").delete().eq("request_id", requestId),
    supabase.from("notification_messages").delete().eq("entity_type", "quote_request").eq("entity_id", requestId),
    supabase.from("customer_notifications").delete().eq("entity_type", "quote_request").eq("entity_id", requestId)
  ];

  for (const operation of operations) {
    const { error } = await operation;
    if (error && !isOptionalSchemaError(error)) throw error;
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const access = await requireRole(request, ["admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, quoteReviewSchema, "Invalid quote review request.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Quote review is temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const normalizedRequestId = requestId.trim().toUpperCase();
  let quoteQuery = supabase
    .from("quote_requests")
    .select("*")
    .eq("request_id", normalizedRequestId);
  if (tenant.schemaReady && tenant.companyId) quoteQuery = quoteQuery.eq("company_id", tenant.companyId);
  const { data: quote, error: quoteError } = await quoteQuery.maybeSingle();

  if (quoteError) {
    logShipmentWorkflowError(quoteError, "Unable to load quote request for review.", requestContext(request, { requestId: normalizedRequestId }));
    return NextResponse.json({ error: "Unable to load quote request." }, { status: 500 });
  }

  if (!quote) {
    return NextResponse.json({ error: "Quote request not found." }, { status: 404 });
  }

  const currentQuote = quote as QuoteRequestRecord;
  const currentStatus = normalizeQuoteStatus(currentQuote.status);
  if (currentStatus === "CONVERTED_TO_SHIPMENT") {
    return NextResponse.json({ error: "Converted quote requests cannot be changed." }, { status: 409 });
  }

  const action = resolveAction(parsed.data);
  const now = new Date().toISOString();
  const merchantPriceLocked = Boolean(currentQuote.business_account_id && currentQuote.final_price != null);
  const persistedMerchantPrice = quoteAmount(currentQuote);
  if (merchantPriceLocked && parsed.data.quotedPrice != null && parsed.data.quotedPrice !== persistedMerchantPrice) {
    return NextResponse.json({ error: "Merchant prices are generated by the pricing engine and cannot be changed manually." }, { status: 409 });
  }
  const nextQuotedPrice = merchantPriceLocked ? persistedMerchantPrice : parsed.data.quotedPrice ?? persistedMerchantPrice;
  const nextEtaHours = parsed.data.quotedEtaHours ?? quoteEtaHours(currentQuote);
  const nextEtaLabel = parsed.data.quotedEtaLabel || currentQuote.quoted_eta_label || (nextEtaHours ? `${nextEtaHours}h` : null);
  const nextValidUntil = validUntil(parsed.data.quoteValidUntil) ?? currentQuote.quote_valid_until ?? null;
  const nextNote = parsed.data.quoteNotes ?? currentQuote.quote_notes ?? parsed.data.reviewNotes ?? currentQuote.review_notes ?? null;
  const updatePayload: Record<string, unknown> = {
    quoted_price: nextQuotedPrice || null,
    quoted_eta_hours: nextEtaHours || null,
    quoted_eta_label: nextEtaLabel,
    quote_notes: nextNote,
    quote_valid_until: nextValidUntil,
    review_notes: parsed.data.reviewNotes ?? currentQuote.review_notes ?? null,
    reviewed_at: now,
    reviewed_by: access.profile.id
  };
  if (merchantPriceLocked) {
    updatePayload.final_price = persistedMerchantPrice;
    updatePayload.payment_amount = persistedMerchantPrice;
  }

  let nextStatus: QuoteStatus | null = null;
  if (action === "send_quote") {
    nextStatus = "QUOTED";
    updatePayload.status = nextStatus;
    updatePayload.quote_sent_at = now;
    updatePayload.payment_amount = nextQuotedPrice || Number(currentQuote.payment_amount ?? currentQuote.estimated_price ?? 0);
  } else if (action === "decline") {
    nextStatus = "DECLINED";
    updatePayload.status = nextStatus;
    updatePayload.declined_at = now;
  } else if (action === "expire") {
    nextStatus = "EXPIRED";
    updatePayload.status = nextStatus;
  } else if (action === "mark_paid") {
    nextStatus = "PAID";
    updatePayload.status = nextStatus;
    updatePayload.payment_status = "PAID";
    updatePayload.paid_at = now;
    updatePayload.payment_amount = nextQuotedPrice || Number(currentQuote.payment_amount ?? currentQuote.estimated_price ?? 0);
  }

  if (nextStatus && nextStatus !== currentStatus) {
    updatePayload.quote_status_history = nextQuoteHistory(currentQuote, nextStatus, access.profile, parsed.data.reviewNotes ?? parsed.data.quoteNotes ?? null);
  }

  const { data, error } = await updateQuoteWithWorkflowFallback(supabase, normalizedRequestId, updatePayload, {
    companyId: tenant.schemaReady ? tenant.companyId : null
  });

  if (error) {
    logShipmentWorkflowError(error, "Unable to update quote request review.", requestContext(request, { requestId: normalizedRequestId }));
    return NextResponse.json({ error: "Unable to update quote request review." }, { status: 500 });
  }

  let customerNotification: { ok: boolean; provider: string; mode: string } | null = null;
  if ((currentQuote.customer_phone || currentQuote.customer_email) && (action === "send_quote" || action === "decline")) {
    try {
      const message =
        action === "send_quote"
          ? whatsappMessages.quoteApproved({ ...currentQuote, ...(data ?? {}) })
          : whatsappMessages.quoteRejected(currentQuote);
      const preferences = await getCustomerNotificationPreferences(supabase, currentQuote.customer_email);
      const result = await sendCustomerNotification({
        to: currentQuote.customer_phone,
        message,
        workflow: action === "send_quote" ? "quote_sent" : "quote_declined",
        entityType: "quote_request",
        entityId: normalizedRequestId,
        metadata: { requestId: normalizedRequestId, status: nextStatus, action, workflow: "quote_review" },
        preferences
      });
      customerNotification = {
        ok: result.ok,
        provider: result.results.whatsapp?.provider ?? result.results.sms?.provider ?? "multi_channel",
        mode: result.results.whatsapp?.mode ?? result.results.sms?.mode ?? "failed"
      };
    } catch (notificationError) {
      logShipmentWorkflowError(notificationError, "Unable to prepare quote review notification.", requestContext(request, { requestId: normalizedRequestId }));
    }
  }

  if (nextStatus && nextStatus !== currentStatus) {
    await writeQuoteStatusEvent(supabase, {
      requestId: normalizedRequestId,
      previousStatus: currentQuote.status,
      nextStatus,
      actor: access.profile,
      note: parsed.data.reviewNotes ?? parsed.data.quoteNotes ?? null,
      metadata: { action, customerNotification }
    });
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: `quote.${action}`,
    entityType: "quote_request",
    entityId: normalizedRequestId,
    metadata: {
      reviewNotesUpdated: parsed.data.reviewNotes !== undefined,
      quotedPrice: nextQuotedPrice,
      quotedEtaHours: nextEtaHours,
      nextStatus,
      customerNotification
    },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "quote",
    message: action === "send_quote" ? "Quote sent to customer for acceptance." : `Quote workflow action completed: ${action}.`,
    entityType: "quote_request",
    entityId: normalizedRequestId,
    metadata: {
      status: nextStatus ?? currentStatus,
      action,
      reviewNotesUpdated: parsed.data.reviewNotes !== undefined,
      customerNotification
    },
    request
  });

  return NextResponse.json(data as QuoteRequestRecord);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const limited = await enforceRateLimit(request, "admin-quote-delete", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const { requestId } = await params;
  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const normalizedRequestId = requestId.trim().toUpperCase();
  if (!normalizedRequestId) return NextResponse.json({ error: "Quote request ID is required." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Quote deletion is temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  let quoteQuery = supabase
    .from("quote_requests")
    .select("*")
    .eq("request_id", normalizedRequestId);
  if (tenant.schemaReady && tenant.companyId) quoteQuery = quoteQuery.eq("company_id", tenant.companyId);
  const { data: quote, error: quoteError } = await quoteQuery.maybeSingle();

  if (quoteError) {
    logShipmentWorkflowError(quoteError, "Unable to load quote request before deletion.", requestContext(request, { requestId: normalizedRequestId }));
    return NextResponse.json({ error: "Unable to load quote request before deletion." }, { status: 500 });
  }

  if (!quote) return NextResponse.json({ error: "Quote request not found." }, { status: 404 });

  try {
    const currentQuote = quote as QuoteRequestRecord;
    await writeAuditLog(supabase, {
      actor: access.profile,
      action: "quote.delete",
      entityType: "quote_request",
      entityId: normalizedRequestId,
      metadata: {
        status: currentQuote.status,
        paymentStatus: currentQuote.payment_status,
        customerName: currentQuote.customer_name,
        paymentAmount: currentQuote.payment_amount ?? currentQuote.estimated_price
      },
      request
    });

    await deleteRelatedQuoteRows(supabase, normalizedRequestId);

    let deleteQuery = supabase
      .from("quote_requests")
      .delete()
      .eq("request_id", normalizedRequestId);
    if (tenant.schemaReady && tenant.companyId) deleteQuery = deleteQuery.eq("company_id", tenant.companyId);
    const deleted = await deleteQuery.select("request_id").maybeSingle();

    if (deleted.error) throw deleted.error;

    await writeOperationalEvent(supabase, {
      category: "quote",
      severity: "warning",
      message: "Quote request deleted by admin.",
      entityType: "quote_request",
      entityId: normalizedRequestId,
      metadata: {
        status: currentQuote.status,
        paymentStatus: currentQuote.payment_status
      },
      request
    });

    return NextResponse.json({ ok: true, requestId: normalizedRequestId });
  } catch (error) {
    logShipmentWorkflowError(error, "Unable to delete quote request.", requestContext(request, { requestId: normalizedRequestId }));
    return NextResponse.json({ error: "Unable to delete quote request." }, { status: 500 });
  }
}
