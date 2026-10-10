import { NextResponse } from "next/server";
import { z } from "zod";
import { canConvertQuote, normalizeQuoteStatus } from "@/lib/quotes";
import {
  isPaymentCleared,
  isShipmentAtLeast,
  makeTrackingId,
  shipmentCustomerMessage,
  shipmentStatuses,
  type QuoteRequestRecord,
  type ShipmentRecord
} from "@/lib/shipments";
import { missingDriverColumn } from "@/lib/driver-data";
import { makeTimelineEvent, shipmentWithDriverSelect, statusTimelineEvent } from "@/lib/shipment-data";
import { whatsappMessages } from "@/lib/whatsapp";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logShipmentWorkflowError, requestContext } from "@/server/monitoring";
import { getCustomerNotificationPreferences } from "@/server/notifications/preferences";
import { sendCustomerNotification, smsMessages } from "@/server/notifications/service";
import { writeOperationalEvent } from "@/server/operational-events";
import { nextQuoteHistory, quoteAmount, updateQuoteWithWorkflowFallback, writeQuoteStatusEvent } from "@/server/quote-workflow";
import { getTenantContextForProfile, withCompanyId } from "@/server/tenancy";

const convertQuoteSchema = z.object({
  trackingId: z.string().trim().optional(),
  driverId: z.string().trim().optional(),
  status: z.enum(shipmentStatuses).optional(),
  eta: z.string().trim().optional(),
  internalNotes: z.string().trim().max(2000).optional(),
  adminOverride: z.boolean().optional()
});

const optionalConvertedShipmentColumns = new Set([
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
  "vehicle_type",
  "delivery_type",
  "service_warnings",
  "pickup_phone",
  "delivery_phone",
  "carrier_provider",
  "carrier_shipment_id",
  "carrier_tracking_id",
  "carrier_label_url",
  "carrier_rate_amount",
  "carrier_status",
  "carrier_raw_response",
  "business_account_id",
  "business_reference",
  "merchant_batch_id",
  "standard_price",
  "discountable_amount",
  "discount_rate",
  "discount_amount",
  "final_price",
  "pricing_rule_version",
  "company_id"
]);

function missingColumnFromPostgrest(error: { code?: string; message?: string } | null) {
  if (error?.code !== "PGRST204") return null;
  return error.message?.match(/'([^']+)' column/)?.[1] ?? null;
}

async function insertConvertedShipment(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  payload: Record<string, unknown>
) {
  const nextPayload = { ...payload };
  for (let attempt = 0; attempt <= optionalConvertedShipmentColumns.size; attempt += 1) {
    const result = await supabase
      .from("shipments")
      .insert(nextPayload)
      .select(shipmentWithDriverSelect)
      .single();

    if (!result.error) return result;

    const missingColumn = missingColumnFromPostgrest(result.error);
    if (!missingColumn || !optionalConvertedShipmentColumns.has(missingColumn) || !(missingColumn in nextPayload)) return result;
    delete nextPayload[missingColumn];
  }

  return {
    data: null,
    error: new Error("Unable to create shipment after retrying optional pricing fields.")
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const access = await requireRole(request, ["admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, convertQuoteSchema, "Invalid quote conversion request.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Quote conversion is temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const normalizedRequestId = requestId.trim().toUpperCase();
  let quoteQuery = supabase
    .from("quote_requests")
    .select("*")
    .eq("request_id", normalizedRequestId);
  if (tenant.schemaReady && tenant.companyId) quoteQuery = quoteQuery.eq("company_id", tenant.companyId);
  const { data: quote, error: quoteError } = await quoteQuery.maybeSingle();

  if (quoteError) {
    logShipmentWorkflowError(quoteError, "Unable to load quote request for conversion.", requestContext(request, { requestId: normalizedRequestId }));
    return NextResponse.json({ error: "Unable to load quote request." }, { status: 500 });
  }

  if (!quote) {
    return NextResponse.json({ error: "Quote request not found." }, { status: 404 });
  }

  const quoteRequest = quote as QuoteRequestRecord;
  const quoteStatus = normalizeQuoteStatus(quoteRequest.status);
  const adminOverride = parsed.data.adminOverride === true && access.profile.role === "admin";
  if (quoteStatus === "CONVERTED_TO_SHIPMENT") {
    return NextResponse.json({ error: "This quote request has already been converted." }, { status: 409 });
  }
  if ((quoteStatus === "DECLINED" || quoteStatus === "EXPIRED") && !adminOverride) {
    return NextResponse.json({ error: "Declined or expired quote requests cannot be converted without an admin override." }, { status: 409 });
  }
  if (!canConvertQuote(quoteRequest.status, quoteRequest.payment_status, adminOverride)) {
    return NextResponse.json({ error: "Quote must be accepted and paid before conversion. Admins can use override for exceptional operations cases." }, { status: 409 });
  }

  if (parsed.data.driverId) {
    let driverQuery = supabase
      .from("drivers")
      .select("id,approval_status")
      .eq("id", Number(parsed.data.driverId));
    if (tenant.schemaReady && tenant.companyId) driverQuery = driverQuery.eq("company_id", tenant.companyId);
    let driver = await driverQuery.maybeSingle();

    if (missingDriverColumn(driver.error) === "approval_status") {
      let fallbackDriverQuery = supabase
        .from("drivers")
        .select("id")
        .eq("id", Number(parsed.data.driverId));
      if (tenant.schemaReady && tenant.companyId) fallbackDriverQuery = fallbackDriverQuery.eq("company_id", tenant.companyId);
      driver = await fallbackDriverQuery.maybeSingle();
    }

    if (driver.error) {
      logShipmentWorkflowError(driver.error, "Unable to verify quote conversion driver.", requestContext(request, { requestId: normalizedRequestId, driverId: parsed.data.driverId }));
      return NextResponse.json({ error: "Unable to verify assigned driver." }, { status: 500 });
    }
    if (!driver.data || ("approval_status" in driver.data && driver.data.approval_status !== "approved")) {
      return NextResponse.json({ error: "Only approved drivers can be assigned to shipments." }, { status: 409 });
    }
  }

  const trackingId = parsed.data.trackingId?.toUpperCase() || makeTrackingId();
  const paymentAmount = quoteAmount(quoteRequest);
  const paymentOk = adminOverride || paymentAmount <= 0 || isPaymentCleared(quoteRequest.payment_status);
  const selectedStatus = parsed.data.status ?? (paymentOk ? (parsed.data.driverId ? "DRIVER_ASSIGNED" : "CONFIRMED") : "PENDING");
  if (isShipmentAtLeast(selectedStatus, "CONFIRMED") && !paymentOk) {
    return NextResponse.json({ error: "Payment must be paid before confirming this shipment. Convert it as pending first." }, { status: 409 });
  }
  if (isShipmentAtLeast(selectedStatus, "DRIVER_ASSIGNED") && !parsed.data.driverId) {
    return NextResponse.json({ error: "Assign a driver before creating a driver-assigned shipment." }, { status: 409 });
  }
  const eta = parsed.data.eta || quoteRequest.quoted_eta_label || `${quoteRequest.quoted_eta_hours ?? quoteRequest.estimated_eta_hours}h`;
  const timeline = [
    makeTimelineEvent("Quote request converted", quoteRequest.pickup_address),
    makeTimelineEvent("Shipment created", quoteRequest.pickup_address),
    ...(parsed.data.driverId ? [makeTimelineEvent("Driver assigned", quoteRequest.pickup_address)] : []),
    ...(selectedStatus !== "PENDING" ? [statusTimelineEvent(selectedStatus, quoteRequest.delivery_address)] : [])
  ];

  const payload = withCompanyId({
    tracking_id: trackingId,
    customer_name: quoteRequest.customer_name,
    customer_email: quoteRequest.customer_email,
    customer_phone: quoteRequest.customer_phone ?? null,
    pickup_phone: quoteRequest.pickup_phone ?? quoteRequest.customer_phone ?? null,
    delivery_phone: quoteRequest.delivery_phone ?? quoteRequest.customer_phone ?? null,
    pickup_address: quoteRequest.pickup_address,
    delivery_address: quoteRequest.delivery_address,
    package_type: quoteRequest.package_type,
    weight_kg: quoteRequest.weight_kg,
    urgency: quoteRequest.urgency,
    pickup_state: quoteRequest.pickup_state ?? null,
    destination_state: quoteRequest.destination_state ?? null,
    pickup_country: quoteRequest.pickup_country ?? null,
    destination_country: quoteRequest.destination_country ?? null,
    delivery_category: quoteRequest.delivery_category ?? null,
    shipment_type: quoteRequest.shipment_type ?? null,
    freight_mode: quoteRequest.freight_mode ?? null,
    quote_currency: quoteRequest.quote_currency ?? "NGN",
    freight_classification: quoteRequest.freight_classification ?? null,
    commercial_invoice: quoteRequest.commercial_invoice ?? {},
    international_tracking_mode: quoteRequest.international_tracking_mode ?? null,
    customs_information: quoteRequest.customs_information ?? null,
    package_value: quoteRequest.package_value ?? null,
    duties_taxes_amount: quoteRequest.duties_taxes_amount ?? null,
    export_import_documents: quoteRequest.export_import_documents ?? null,
    pricing_breakdown: quoteRequest.pricing_breakdown ?? null,
    vehicle_type: quoteRequest.vehicle_type ?? null,
    delivery_type: quoteRequest.delivery_type ?? null,
    service_warnings: quoteRequest.service_warnings ?? null,
    quoted_price: quoteRequest.quoted_price ?? quoteRequest.estimated_price,
    business_account_id: quoteRequest.business_account_id ?? null,
    business_reference: quoteRequest.business_reference ?? null,
    merchant_batch_id: quoteRequest.merchant_batch_id ?? null,
    standard_price: quoteRequest.standard_price ?? null,
    discountable_amount: quoteRequest.discountable_amount ?? null,
    discount_rate: quoteRequest.discount_rate ?? null,
    discount_amount: quoteRequest.discount_amount ?? null,
    final_price: quoteRequest.final_price ?? paymentAmount,
    pricing_rule_version: quoteRequest.pricing_rule_version ?? null,
    payment_status: quoteRequest.payment_status ?? "UNPAID",
    payment_reference: quoteRequest.payment_reference ?? null,
    payment_amount: paymentAmount,
    payment_provider: quoteRequest.payment_provider ?? "flutterwave",
    carrier_provider: "internal_fly_logistics",
    carrier_shipment_id: null,
    carrier_tracking_id: trackingId,
    carrier_label_url: null,
    carrier_rate_amount: null,
    carrier_status: "internal",
    carrier_raw_response: {},
    status: selectedStatus,
    driver_id: parsed.data.driverId ? Number(parsed.data.driverId) : null,
    eta,
    internal_notes: parsed.data.internalNotes || null,
    customer_status_message: shipmentCustomerMessage(selectedStatus),
    timeline
  }, tenant.companyId);

  const { data: shipment, error: shipmentError } = await insertConvertedShipment(supabase, payload);

  if (shipmentError) {
    logShipmentWorkflowError(shipmentError, "Unable to create shipment from quote request.", requestContext(request, { requestId: normalizedRequestId, trackingId }));
    return NextResponse.json({ error: "Unable to create shipment from quote request." }, { status: 500 });
  }

  const { error: updateError } = await updateQuoteWithWorkflowFallback(supabase, normalizedRequestId, {
    status: "CONVERTED_TO_SHIPMENT",
    converted_at: new Date().toISOString(),
    reviewed_at: new Date().toISOString(),
    reviewed_by: access.profile.id,
    quote_status_history: nextQuoteHistory(quoteRequest, "CONVERTED_TO_SHIPMENT", access.profile, "Quote converted into a shipment.")
  }, {
    companyId: tenant.schemaReady ? tenant.companyId : null
  });

  if (updateError) {
    logShipmentWorkflowError(updateError, "Converted shipment but quote request status update failed.", requestContext(request, { requestId: normalizedRequestId, trackingId }));
  } else {
    await writeQuoteStatusEvent(supabase, {
      requestId: normalizedRequestId,
      previousStatus: quoteRequest.status,
      nextStatus: "CONVERTED_TO_SHIPMENT",
      actor: access.profile,
      note: "Quote converted into a shipment.",
      metadata: { trackingId, adminOverride }
    });
  }

  let customerNotification: { ok: boolean; provider: string; mode: string } | null = null;
  if (quoteRequest.customer_phone || quoteRequest.customer_email) {
    try {
      const result = await sendCustomerNotification({
        to: quoteRequest.customer_phone,
        message: whatsappMessages.quoteConverted(shipment as ShipmentRecord),
        workflow: "shipment_confirmed",
        entityType: "shipment",
        entityId: trackingId,
        metadata: { requestId: normalizedRequestId, trackingId, source: "quote_conversion" },
        preferences: await getCustomerNotificationPreferences(supabase, quoteRequest.customer_email),
        smsFallback: true,
        smsMessage: smsMessages.criticalShipmentAlert(trackingId, selectedStatus)
      });
      customerNotification = {
        ok: result.ok,
        provider: result.results.whatsapp?.provider ?? result.results.sms?.provider ?? "multi_channel",
        mode: result.results.whatsapp?.mode ?? result.results.sms?.mode ?? "failed"
      };
    } catch (notificationError) {
      logShipmentWorkflowError(notificationError, "Unable to prepare quote conversion notification.", requestContext(request, { requestId: normalizedRequestId, trackingId }));
    }
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "quote.convert_to_shipment",
    entityType: "quote_request",
    entityId: normalizedRequestId,
    metadata: { trackingId, driverId: parsed.data.driverId, status: selectedStatus, adminOverride, customerNotification },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "shipment",
    message: "Quote request converted into a shipment.",
    entityType: "shipment",
    entityId: trackingId,
    metadata: {
      requestId: normalizedRequestId,
      driverId: parsed.data.driverId,
      status: selectedStatus,
      adminOverride,
      customerNotification
    },
    request
  });

  return NextResponse.json({ shipment: shipment as ShipmentRecord, quote: { ...quoteRequest, status: "CONVERTED_TO_SHIPMENT" } }, { status: 201 });
}
