import { makeTrackingId, shipmentCustomerMessage, type QuoteRequestRecord, type ShipmentRecord } from "@/lib/shipments";
import { shipmentMarginPercent, shipmentProfit } from "@/lib/shipment-finance";
import { makeTimelineEvent, shipmentWithDriverSelect } from "@/lib/shipment-data";
import type { AuthProfile } from "@/lib/request-auth";
import type { getSupabaseAdmin } from "@/lib/supabase-server";
import { debitAdminWalletForCarrier } from "@/server/admin-wallet";
import { notifyAdmin } from "@/server/admin-notifications";
import { updateShipmentCarrierFields } from "@/server/carrier-storage";
import { refreshCarrierTrackingForFlyNumber } from "@/server/carrier-tracking";
import { createCarrierShipment } from "@/server/carriers";
import { logApiError } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { nextQuoteHistory, quoteAmount, updateQuoteWithWorkflowFallback, writeQuoteStatusEvent } from "@/server/quote-workflow";
import { sendShipmentLifecycleEmail } from "@/server/shipment-emails";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const optionalAutoShipmentColumns = new Set([
  "pickup_state",
  "destination_state",
  "pickup_country",
  "destination_country",
  "delivery_category",
  "shipment_type",
  "freight_mode",
  "quote_currency",
  "freight_classification",
  "commercial_invoice",
  "international_tracking_mode",
  "customs_information",
  "package_value",
  "duties_taxes_amount",
  "export_import_documents",
  "pricing_breakdown",
  "business_account_id",
  "business_reference",
  "merchant_batch_id",
  "standard_price",
  "discountable_amount",
  "discount_rate",
  "discount_amount",
  "final_price",
  "pricing_rule_version",
  "vehicle_type",
  "delivery_type",
  "service_warnings",
  "recipient_name",
  "pickup_phone",
  "delivery_phone",
  "payment_status",
  "payment_reference",
  "payment_amount",
  "payment_provider",
  "carrier",
  "carrier_provider",
  "carrier_shipment_id",
  "carrier_tracking_id",
  "carrier_order_id",
  "carrier_order_no",
  "carrier_waybill_no",
  "carrier_label_url",
  "carrier_rate_amount",
  "carrier_cost_amount",
  "carrier_profit_amount",
  "carrier_margin_percent",
  "carrier_status",
  "carrier_payload",
  "carrier_response",
  "carrier_error",
  "carrier_raw_response",
  "carrier_synced_at",
  "external_tracking_enabled",
  "customer_status_message",
  "timeline",
  "company_id"
]);

function missingColumnFromPostgrest(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";
  if (error?.code === "PGRST204") return message.match(/'([^']+)' column/)?.[1] ?? null;
  return message.match(/column "([^"]+)" of relation/i)?.[1] ?? message.match(/Could not find the '([^']+)' column/i)?.[1] ?? null;
}

function sideEffectMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown post-create side-effect error.";
}

async function runShipmentSideEffect<T>(
  step: string,
  task: () => Promise<T>,
  fallback: T,
  context: { trackingId: string; requestId?: string | null }
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    logApiError(error, `Shipment was created but ${step} failed.`, {
      path: "autoCreateShipmentFromPaidQuote",
      trackingId: context.trackingId,
      requestId: context.requestId ?? null,
      step,
      message: sideEffectMessage(error)
    });
    return fallback;
  }
}

async function insertAutoShipment(supabase: SupabaseAdminClient, payload: Record<string, unknown>) {
  const nextPayload = { ...payload };

  for (let attempt = 0; attempt <= optionalAutoShipmentColumns.size; attempt += 1) {
    const result = await supabase
      .from("shipments")
      .insert(nextPayload)
      .select(shipmentWithDriverSelect)
      .single();

    if (!result.error) return result;

    const missingColumn = missingColumnFromPostgrest(result.error);
    if (!missingColumn || !optionalAutoShipmentColumns.has(missingColumn) || !(missingColumn in nextPayload)) return result;
    delete nextPayload[missingColumn];
  }

  return {
    data: null,
    error: {
      code: "AUTO_SHIPMENT_FALLBACK_EXHAUSTED",
      message: "Unable to create shipment after retrying optional shipment fields."
    }
  };
}

async function findShipmentForPaidQuote(supabase: SupabaseAdminClient, quote: QuoteRequestRecord) {
  if (!quote.payment_reference) return { data: null as ShipmentRecord | null, error: null };

  let query = supabase
    .from("shipments")
    .select(shipmentWithDriverSelect)
    .eq("payment_reference", quote.payment_reference);
  const companyId = (quote as Record<string, unknown>).company_id;
  if (typeof companyId === "string" && companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query.maybeSingle();

  return { data: (data as ShipmentRecord | null) ?? null, error };
}

export async function autoCreateShipmentFromPaidQuote(
  supabase: SupabaseAdminClient,
  quote: QuoteRequestRecord,
  options: { actor?: AuthProfile | null; request?: Request; note?: string } = {}
) {
  if (String(quote.payment_status ?? "").toUpperCase() !== "PAID") {
    return { shipment: null as ShipmentRecord | null, created: false, error: null, skippedReason: "Quote is not paid." };
  }

  const existing = await findShipmentForPaidQuote(supabase, quote);
  if (existing.error) return { shipment: null, created: false, error: existing.error, skippedReason: null };
  if (existing.data) return { shipment: existing.data, created: false, error: null, skippedReason: "Shipment already exists." };

  const now = new Date().toISOString();
  const trackingId = makeTrackingId();
  const companyId = (quote as Record<string, unknown>).company_id;
  const paymentAmount = quoteAmount(quote);
  const eta = quote.quoted_eta_label || (quote.quoted_eta_hours ? `${quote.quoted_eta_hours}h` : `${quote.estimated_eta_hours ?? 24}h`);
  const timeline = [
    makeTimelineEvent("Payment confirmed", quote.pickup_address),
    makeTimelineEvent("Shipment created", quote.pickup_address),
    makeTimelineEvent("Pending pickup", quote.pickup_address, false)
  ];

  const payload = {
    ...(typeof companyId === "string" && companyId ? { company_id: companyId } : {}),
    tracking_id: trackingId,
    customer_name: quote.customer_name,
    customer_email: quote.customer_email,
    customer_phone: quote.customer_phone ?? null,
    recipient_name: quote.recipient_name ?? null,
    pickup_phone: quote.pickup_phone ?? quote.customer_phone ?? null,
    delivery_phone: quote.delivery_phone ?? quote.customer_phone ?? null,
    pickup_address: quote.pickup_address,
    delivery_address: quote.delivery_address,
    package_type: quote.package_type,
    weight_kg: quote.weight_kg,
    urgency: quote.urgency,
    pickup_state: quote.pickup_state ?? null,
    destination_state: quote.destination_state ?? null,
    pickup_country: quote.pickup_country ?? null,
    destination_country: quote.destination_country ?? null,
    delivery_category: quote.delivery_category ?? null,
    shipment_type: quote.shipment_type ?? null,
    freight_mode: quote.freight_mode ?? null,
    quote_currency: quote.quote_currency ?? "NGN",
    freight_classification: quote.freight_classification ?? null,
    commercial_invoice: quote.commercial_invoice ?? {},
    international_tracking_mode: quote.international_tracking_mode ?? null,
    customs_information: quote.customs_information ?? null,
    package_value: quote.package_value ?? null,
    duties_taxes_amount: quote.duties_taxes_amount ?? null,
    export_import_documents: quote.export_import_documents ?? null,
    pricing_breakdown: quote.pricing_breakdown ?? null,
    business_account_id: quote.business_account_id ?? null,
    business_reference: quote.business_reference ?? null,
    merchant_batch_id: quote.merchant_batch_id ?? null,
    standard_price: quote.standard_price ?? null,
    discountable_amount: quote.discountable_amount ?? null,
    discount_rate: quote.discount_rate ?? null,
    discount_amount: quote.discount_amount ?? null,
    final_price: quote.final_price ?? paymentAmount,
    pricing_rule_version: quote.pricing_rule_version ?? null,
    vehicle_type: quote.vehicle_type ?? null,
    delivery_type: quote.delivery_type ?? null,
    service_warnings: quote.service_warnings ?? null,
    quoted_price: quote.quoted_price ?? quote.estimated_price,
    payment_status: "PAID",
    payment_reference: quote.payment_reference ?? null,
    payment_amount: paymentAmount,
    payment_provider: quote.payment_provider ?? "flutterwave",
    carrier: "fez",
    carrier_provider: "fez_logistics",
    carrier_shipment_id: null,
    carrier_tracking_id: trackingId,
    carrier_order_id: null,
    carrier_order_no: null,
    carrier_waybill_no: null,
    carrier_label_url: null,
    carrier_rate_amount: null,
    carrier_cost_amount: null,
    carrier_profit_amount: paymentAmount,
    carrier_margin_percent: paymentAmount > 0 ? 100 : 0,
    carrier_status: "pending_fez_creation",
    carrier_payload: {},
    carrier_response: {},
    carrier_error: null,
    carrier_raw_response: {},
    carrier_synced_at: now,
    external_tracking_enabled: false,
    status: "PENDING_PICKUP",
    driver_id: null,
    eta,
    internal_notes: options.note ?? "Automatically created after customer payment.",
    customer_status_message: shipmentCustomerMessage("PENDING_PICKUP"),
    timeline,
    created_at: now,
    updated_at: now
  };

  const { data, error } = await insertAutoShipment(supabase, payload);
  if (error || !data) return { shipment: null, created: false, error, skippedReason: null };

  let shipmentRecord = data as ShipmentRecord;
  const sideEffectContext = { trackingId: shipmentRecord.tracking_id, requestId: quote.request_id };

  const carrierResult = await createCarrierShipment(shipmentRecord, "fez_logistics").catch((error) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : "FEZ carrier request failed unexpectedly.",
    status: undefined
  }));
  if (carrierResult.ok) {
    const carrierUpdate = await updateShipmentCarrierFields(supabase, shipmentRecord.tracking_id, {
      carrier_provider: carrierResult.data.provider,
      carrier: "fez",
      carrier_shipment_id: carrierResult.data.carrierShipmentId ?? null,
      carrier_tracking_id: carrierResult.data.carrierTrackingId ?? shipmentRecord.tracking_id,
      carrier_order_id: carrierResult.data.carrierOrderId ?? carrierResult.data.carrierShipmentId ?? null,
      carrier_order_no: carrierResult.data.carrierOrderId ?? carrierResult.data.carrierShipmentId ?? null,
      carrier_waybill_no: carrierResult.data.carrierTrackingId ?? carrierResult.data.carrierOrderId ?? null,
      carrier_label_url: carrierResult.data.carrierLabelUrl ?? null,
      carrier_rate_amount: carrierResult.data.carrierRateAmount ?? null,
      carrier_cost_amount: carrierResult.data.carrierRateAmount ?? shipmentRecord.carrier_cost_amount ?? null,
      carrier_profit_amount: shipmentProfit({
        ...shipmentRecord,
        carrier_provider: carrierResult.data.provider,
        carrier_rate_amount: carrierResult.data.carrierRateAmount ?? shipmentRecord.carrier_rate_amount ?? null,
        carrier_cost_amount: carrierResult.data.carrierRateAmount ?? shipmentRecord.carrier_cost_amount ?? null
      }),
      carrier_margin_percent: shipmentMarginPercent({
        ...shipmentRecord,
        carrier_provider: carrierResult.data.provider,
        carrier_rate_amount: carrierResult.data.carrierRateAmount ?? shipmentRecord.carrier_rate_amount ?? null,
        carrier_cost_amount: carrierResult.data.carrierRateAmount ?? shipmentRecord.carrier_cost_amount ?? null
      }),
      carrier_status: carrierResult.data.carrierStatus ?? "created",
      carrier_response: carrierResult.data.rawResponse ?? {},
      carrier_error: null,
      carrier_raw_response: carrierResult.data.rawResponse ?? {},
      carrier_synced_at: new Date().toISOString(),
      external_tracking_enabled: false
    });

    if (!carrierUpdate.error && carrierUpdate.data) {
      shipmentRecord = carrierUpdate.data;
      const synced = await runShipmentSideEffect(
        "automatic FEZ tracking sync",
        () => refreshCarrierTrackingForFlyNumber(supabase, shipmentRecord.tracking_id, options.request),
        { data: shipmentRecord, error: null },
        sideEffectContext
      );
      if (!synced.error && synced.data) shipmentRecord = synced.data;
    }

    await runShipmentSideEffect(
      "admin wallet carrier debit",
      () => debitAdminWalletForCarrier(supabase, {
        amount: carrierResult.data.carrierRateAmount,
        trackingId: shipmentRecord.tracking_id,
        provider: "fez_logistics",
        carrierReference: carrierResult.data.carrierOrderId ?? carrierResult.data.carrierTrackingId ?? null
      }),
      { ok: false, reason: "wallet_unavailable" as const },
      sideEffectContext
    );
  } else {
    const carrierFallback = await updateShipmentCarrierFields(supabase, shipmentRecord.tracking_id, {
      carrier: "fez",
      carrier_provider: "fez_logistics",
      carrier_tracking_id: shipmentRecord.tracking_id,
      carrier_status: "carrier_sync_failed",
      carrier_error: carrierResult.error,
      carrier_response: {
        error: carrierResult.error,
        status: carrierResult.status ?? null,
        provider: "fez_logistics"
      },
      carrier_raw_response: {
        error: carrierResult.error,
        status: carrierResult.status ?? null,
        provider: "fez_logistics"
      },
      carrier_synced_at: new Date().toISOString(),
      external_tracking_enabled: false
    });

    if (!carrierFallback.error && carrierFallback.data) {
      shipmentRecord = carrierFallback.data;
      const reconciled = await runShipmentSideEffect(
        "automatic FEZ reconciliation after ambiguous create response",
        () => refreshCarrierTrackingForFlyNumber(supabase, shipmentRecord.tracking_id, options.request),
        { data: shipmentRecord, error: null },
        sideEffectContext
      );
      if (!reconciled.error && reconciled.data && String(reconciled.data.carrier_status ?? "").toLowerCase() !== "carrier_sync_failed") {
        shipmentRecord = reconciled.data;
      }
    }

    if (/failed|error/i.test(String(shipmentRecord.carrier_status ?? shipmentRecord.carrier_error ?? ""))) {
      await runShipmentSideEffect(
        "carrier failure operational event",
        () => writeOperationalEvent(supabase, {
          category: "shipment",
          severity: "warning",
          message: "Automatic FEZ fulfilment could not be created; shipment remains trackable and can be retried from admin.",
          entityType: "shipment",
          entityId: shipmentRecord.tracking_id,
          metadata: { provider: "fez_logistics", reason: carrierResult.error, status: carrierResult.status },
          request: options.request
        }),
        undefined,
        sideEffectContext
      );
    }
  }

  await runShipmentSideEffect(
    "paid quote status update",
    () => updateQuoteWithWorkflowFallback(supabase, quote.request_id, {
      status: "CONVERTED_TO_SHIPMENT",
      converted_at: now,
      quote_status_history: nextQuoteHistory(quote, "CONVERTED_TO_SHIPMENT", options.actor ?? null, "Paid booking automatically created a shipment.")
    }, {
      companyId: typeof companyId === "string" ? companyId : null
    }),
    null,
    sideEffectContext
  );

  await runShipmentSideEffect(
    "paid quote status event",
    () => writeQuoteStatusEvent(supabase, {
      requestId: quote.request_id,
      previousStatus: quote.status,
      nextStatus: "CONVERTED_TO_SHIPMENT",
      actor: options.actor ?? null,
      note: "Paid booking automatically created a shipment.",
      metadata: { trackingId, paymentReference: quote.payment_reference }
    }),
    undefined,
    sideEffectContext
  );

  const lifecycleEmail = await runShipmentSideEffect(
    "shipment creation email",
    () => sendShipmentLifecycleEmail(supabase, shipmentRecord, "created", options.request),
    { ok: false, mode: "dashboard_only" as const },
    sideEffectContext
  );
  const adminPaidEmail = await runShipmentSideEffect(
    "admin paid-shipment notification",
    () => notifyAdmin(supabase, {
      title: "Paid shipment created",
      message: `${shipmentRecord.customer_name ?? "A customer"} paid ${paymentAmount} for shipment ${shipmentRecord.tracking_id}.`,
      severity: "info",
      entityType: "shipment",
      entityId: shipmentRecord.tracking_id,
      metadata: {
        trackingId: shipmentRecord.tracking_id,
        paymentAmount,
        paymentReference: quote.payment_reference,
        requestId: quote.request_id
      },
      request: options.request
    }),
    { ok: false, mode: "dashboard_only" as const, whatsapp: null },
    sideEffectContext
  );

  await runShipmentSideEffect(
    "shipment created operational event",
    () => writeOperationalEvent(supabase, {
      category: "shipment",
      message: "Paid quote automatically created a pending pickup shipment.",
      entityType: "shipment",
      entityId: trackingId,
      metadata: { requestId: quote.request_id, paymentReference: quote.payment_reference, lifecycleEmail, adminPaidEmail },
      request: options.request
    }),
    undefined,
    sideEffectContext
  );

  return { shipment: shipmentRecord, created: true, error: null, skippedReason: null };
}
