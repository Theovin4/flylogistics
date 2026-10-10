import { NextResponse } from "next/server";
import { shipmentTypeFromDeliveryCategory } from "@/lib/pricing";
import {
  customerBookingAddress,
  customerBookingDocuments,
  customerBookingNotes,
  customerBookingSchema,
  isInternationalCustomerBooking,
  type CustomerBookingInput
} from "@/lib/customer-booking";
import { appendQuoteStatusHistory } from "@/lib/quotes";
import { estimateQuote, makeRequestId, type QuoteRequestRecord } from "@/lib/shipments";
import { whatsappMessages } from "@/lib/whatsapp";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, handleApiError, parseJson } from "@/server/api";
import { notifyAdmin } from "@/server/admin-notifications";
import { getCustomerNotificationPreferences } from "@/server/notifications/preferences";
import { sendCustomerNotification } from "@/server/notifications/service";
import { writeOperationalEvent } from "@/server/operational-events";
import { calculateLogisticsPrice } from "@/server/pricing";
import { getTenantContextForProfile, withCompanyId } from "@/server/tenancy";

function missingColumn(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return message.match(/column "([^"]+)" of relation/i)?.[1] ?? message.match(/Could not find the '([^']+)' column/i)?.[1] ?? null;
}

async function insertQuoteRequest(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, payload: Record<string, unknown>) {
  const nextPayload = { ...payload };
  const optionalColumns = new Set([
    "pickup_state",
    "destination_state",
    "pickup_country",
    "destination_country",
    "delivery_category",
    "shipment_type",
    "customs_information",
    "package_value",
    "duties_taxes_amount",
    "export_import_documents",
    "pricing_breakdown",
    "vehicle_type",
    "delivery_type",
    "service_warnings",
    "freight_mode",
    "quote_currency",
    "freight_classification",
    "commercial_invoice",
    "international_tracking_mode",
    "recipient_name",
    "pickup_phone",
    "delivery_phone",
    "status",
    "quoted_price",
    "quoted_eta_hours",
    "quoted_eta_label",
    "quote_sent_at",
    "quote_valid_until",
    "payment_status",
    "payment_reference",
    "payment_amount",
    "payment_provider",
    "quote_status_history",
    "company_id"
  ]);

  for (let attempt = 0; attempt <= optionalColumns.size; attempt += 1) {
    const result = await supabase.from("quote_requests").insert(nextPayload).select("*").single();
    if (!result.error) return result;

    const column = missingColumn(result.error);
    if (!column || !optionalColumns.has(column) || !(column in nextPayload)) return result;
    delete nextPayload[column];
  }

  return {
    data: null,
    error: new Error("Unable to store quote request after retrying optional pricing fields.")
  };
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "quote-request", { limit: 12, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: "Create or sign in to a customer account before booking a shipment." }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.profile.email) return NextResponse.json({ error: "Your customer account needs an email before booking a shipment." }, { status: 409 });

  const parsed = await parseJson<CustomerBookingInput>(request, customerBookingSchema, "Please complete the booking form.");
  if (parsed.response) return parsed.response;

  const submittedTooFast = parsed.data.formStartedAt ? Date.now() - parsed.data.formStartedAt < 1500 : false;
  if (parsed.data.website || submittedTooFast) {
    const spamRequestId = makeRequestId();
    const spamQuote = estimateQuote(parsed.data.weightKg, parsed.data.urgency);
    await writeOperationalEvent(getSupabaseAdmin(), {
      category: "quote",
      severity: "warning",
      message: "Blocked suspicious quote request with anti-spam checks.",
      entityType: "quote_request",
      entityId: spamRequestId,
      metadata: { honeypotFilled: Boolean(parsed.data.website), submittedTooFast },
      request
    });
    return NextResponse.json({
      id: "spam-filtered",
      request_id: spamRequestId,
      estimated_price: spamQuote.amount,
      estimated_eta_hours: spamQuote.estimatedEtaHours,
      payment_status: "UNPAID",
      payment_amount: spamQuote.amount,
      payment_provider: "flutterwave",
      status: "PENDING_REVIEW",
      created_at: new Date().toISOString()
    }, { status: 202 });
  }

  const supabase = getSupabaseAdmin();
  const tenant = supabase ? await getTenantContextForProfile(supabase, access.profile) : null;
  const deliveryCategory = parsed.data.deliveryCategory ?? "local_nigeria";
  const internationalReview = isInternationalCustomerBooking(deliveryCategory);
  const pickupAddress = customerBookingAddress(parsed.data.pickupAddress, parsed.data.pickupCity, parsed.data.pickupPostalCode);
  const deliveryAddress = customerBookingAddress(parsed.data.deliveryAddress, parsed.data.deliveryCity, parsed.data.deliveryPostalCode);
  const quote = await calculateLogisticsPrice({
    pickupState: parsed.data.pickupState,
    destinationState: parsed.data.destinationState,
    pickupCountry: parsed.data.pickupCountry,
    destinationCountry: parsed.data.destinationCountry,
    pickupAddress,
    deliveryAddress,
    packageType: parsed.data.packageType,
    urgency: parsed.data.urgency,
    weightKg: parsed.data.weightKg,
    deliveryCategory,
    freightMode: parsed.data.freightMode,
    quoteCurrency: parsed.data.quoteCurrency,
    freightClassification: parsed.data.freightClassification,
    packageValue: parsed.data.packageValue,
    customsInformation: parsed.data.customsInformation,
    exportImportDocuments: customerBookingDocuments(parsed.data)
  }, supabase);
  const now = new Date().toISOString();
  const quoteValidUntil = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const payload = withCompanyId({
    request_id: makeRequestId(),
    customer_name: parsed.data.customerName || access.profile.full_name || "Fly Logistics Customer",
    customer_email: access.profile.email,
    customer_phone: parsed.data.customerPhone || access.profile.phone || null,
    recipient_name: parsed.data.recipientName || null,
    pickup_phone: parsed.data.pickupPhone || parsed.data.customerPhone || access.profile.phone || null,
    delivery_phone: parsed.data.deliveryPhone || parsed.data.customerPhone || access.profile.phone || null,
    pickup_country: parsed.data.pickupCountry || (deliveryCategory === "international_import" ? null : "Nigeria"),
    destination_country: parsed.data.destinationCountry || (deliveryCategory === "international_export" ? null : "Nigeria"),
    pickup_state: parsed.data.pickupState || null,
    destination_state: parsed.data.destinationState || null,
    pickup_address: pickupAddress,
    delivery_address: deliveryAddress,
    package_type: parsed.data.packageType,
    weight_kg: parsed.data.weightKg,
    urgency: parsed.data.urgency,
    delivery_category: deliveryCategory,
    shipment_type: shipmentTypeFromDeliveryCategory(deliveryCategory),
    freight_mode: quote.international?.freightMode ?? parsed.data.freightMode ?? null,
    quote_currency: quote.international?.quoteCurrency ?? parsed.data.quoteCurrency ?? "NGN",
    freight_classification: quote.international?.freightClassification ?? parsed.data.freightClassification ?? null,
    commercial_invoice: quote.international ? {
      required: quote.international.commercialInvoiceRequired,
      declared_value: parsed.data.packageValue ?? null,
      currency: quote.international.quoteCurrency,
      documents: quote.international.customsDocuments,
      documentation_status: quote.international.documentationStatus
    } : {},
    international_tracking_mode: quote.international?.trackingMode ?? null,
    customs_information: parsed.data.customsInformation || null,
    package_value: parsed.data.packageValue ?? null,
    duties_taxes_amount: parsed.data.dutiesTaxesAmount ?? null,
    export_import_documents: customerBookingDocuments(parsed.data) || null,
    notes: customerBookingNotes(parsed.data) || null,
    estimated_price: quote.amount,
    estimated_eta_hours: quote.etaHours,
    pricing_breakdown: quote.breakdown,
    vehicle_type: quote.vehicleType,
    delivery_type: quote.deliveryType,
    service_warnings: quote.warnings,
    quoted_price: internationalReview ? null : quote.amount,
    quoted_eta_hours: internationalReview ? null : quote.etaHours,
    quoted_eta_label: internationalReview ? null : quote.etaLabel,
    payment_status: "UNPAID",
    payment_reference: null,
    payment_amount: internationalReview ? null : quote.amount,
    payment_provider: "flutterwave",
    status: internationalReview ? "PENDING_REVIEW" : "QUOTED",
    quote_status_history: appendQuoteStatusHistory(null, {
      status: internationalReview ? "PENDING_REVIEW" : "QUOTED",
      actor_role: "customer",
      note: internationalReview
        ? "International booking submitted for customs, route, and final price review."
        : "Instant delivery price generated for customer payment."
    }),
    quote_sent_at: internationalReview ? null : now,
    quote_valid_until: internationalReview ? null : quoteValidUntil
  }, tenant?.companyId);

  if (!supabase) {
    return NextResponse.json({
      ...payload,
      id: "local-preview",
      created_at: new Date().toISOString(),
      warning: "Booking storage is temporarily unavailable, so this request was not stored.",
      pricing: internationalReview ? null : quote
    });
  }

  try {
    const { data, error } = await insertQuoteRequest(supabase, payload);
    if (error) throw error;
    let customerNotification: { ok: boolean; provider: string; mode: string } | null = null;
    if (payload.customer_phone || payload.customer_email) {
      const result = await sendCustomerNotification({
        to: payload.customer_phone,
        message: whatsappMessages.quoteReceived(data as QuoteRequestRecord),
        workflow: "quote_received",
        entityType: "quote_request",
        entityId: payload.request_id,
        metadata: { requestId: payload.request_id },
        preferences: await getCustomerNotificationPreferences(supabase, payload.customer_email)
      });
      customerNotification = {
        ok: result.ok,
        provider: result.results.whatsapp?.provider ?? result.results.sms?.provider ?? "multi_channel",
        mode: result.results.whatsapp?.mode ?? result.results.sms?.mode ?? "failed"
      };
    }
    await writeOperationalEvent(supabase, {
      category: "quote",
      message: internationalReview ? "International booking stored for operations review." : "Instant delivery quote stored for customer payment.",
      entityType: "quote_request",
      entityId: payload.request_id,
      metadata: { urgency: payload.urgency, estimatedPrice: payload.estimated_price, deliveryType: quote.deliveryType, customerNotification },
      request
    });
    await notifyAdmin(supabase, {
      title: "New delivery order started",
      message: `${payload.customer_name} created booking ${payload.request_id} from ${payload.pickup_address} to ${payload.delivery_address}. Estimated amount ${payload.estimated_price}.`,
      entityType: "quote_request",
      entityId: payload.request_id,
      metadata: { customerEmail: payload.customer_email, customerPhone: payload.customer_phone, amount: payload.estimated_price },
      request
    });
    return NextResponse.json({
      ...(data as QuoteRequestRecord),
      pricing: internationalReview ? null : quote,
      requiresReview: internationalReview
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error, request, "Unable to store quote request.");
  }
}

export async function GET(request: Request) {
  const access = await requireRole(request, ["admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json([]);
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  let query = supabase
    .from("quote_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  if (tenant.schemaReady && tenant.companyId) query = query.eq("company_id", tenant.companyId);
  const { data, error } = await query;

  if (error) {
    await writeOperationalEvent(supabase, {
      category: "api",
      severity: "error",
      message: "Unable to load quote requests for admin review.",
      entityType: "quote_request",
      metadata: { reason: error.message },
      request
    });
    return NextResponse.json({ error: "Unable to load quote requests." }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
