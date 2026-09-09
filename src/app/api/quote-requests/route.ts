import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryCategoryValues, pricingUrgencies, shipmentTypeFromDeliveryCategory } from "@/lib/pricing";
import { freightClassificationOptions, freightModeOptions, supportedCurrencies } from "@/lib/international";
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

const quoteRequestSchema = z.object({
  customerName: z.string().trim().min(2),
  customerEmail: z.string().trim().email(),
  customerPhone: z.string().trim().min(5).max(40),
  recipientName: z.string().trim().min(2).max(160),
  pickupPhone: z.string().trim().min(5).max(40).optional(),
  deliveryPhone: z.string().trim().min(5).max(40).optional(),
  pickupCountry: z.string().trim().min(2).max(80).optional().nullable(),
  destinationCountry: z.string().trim().min(2).max(80).optional().nullable(),
  pickupState: z.string().trim().min(2).max(80).optional().nullable(),
  destinationState: z.string().trim().min(2).max(80).optional().nullable(),
  pickupAddress: z.string().trim().min(4),
  deliveryAddress: z.string().trim().min(4),
  packageType: z.string().trim().min(2),
  weightKg: z.coerce.number().positive().max(100000),
  urgency: z.enum(pricingUrgencies.map((item) => item.value) as ["standard", "priority", "critical"]),
  deliveryCategory: z.enum(deliveryCategoryValues).default("local_nigeria"),
  freightMode: z.enum(freightModeOptions.map((item) => item.value) as ["air_freight", "sea_freight"]).optional(),
  quoteCurrency: z.enum(supportedCurrencies).default("NGN"),
  freightClassification: z.enum(freightClassificationOptions.map((item) => item.value) as ["documents", "general_cargo", "ecommerce_goods", "electronics", "fashion", "fragile", "oversized", "restricted_review"]).optional(),
  customsInformation: z.string().trim().max(2000).optional(),
  packageValue: z.coerce.number().min(0).max(1_000_000_000).optional(),
  dutiesTaxesAmount: z.coerce.number().min(0).max(1_000_000_000).optional(),
  exportImportDocuments: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(1000).optional(),
  website: z.string().trim().max(160).optional(),
  formStartedAt: z.coerce.number().int().positive().optional()
}).superRefine((data, context) => {
  if (data.pickupAddress.trim().length < 8) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupAddress"], message: "Enter a full pickup address with street, area, city, and state." });
  }
  if (data.deliveryAddress.trim().length < 8) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryAddress"], message: "Enter a full delivery address with street, area, city, and state." });
  }
  if (!data.pickupPhone?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupPhone"], message: "Enter the pickup contact phone number." });
  }
  if (!data.deliveryPhone?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryPhone"], message: "Enter the receiver phone number." });
  }
  if (data.deliveryCategory !== "international_import" && !data.pickupState?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupState"], message: "Select the pickup state." });
  }
  if (data.deliveryCategory !== "international_export" && !data.destinationState?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationState"], message: "Select the destination state." });
  }
});

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

  const parsed = await parseJson(request, quoteRequestSchema, "Please complete the quote request form.");
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
  const quote = await calculateLogisticsPrice({
    pickupState: parsed.data.pickupState,
    destinationState: parsed.data.destinationState,
    pickupCountry: parsed.data.pickupCountry,
    destinationCountry: parsed.data.destinationCountry,
    pickupAddress: parsed.data.pickupAddress,
    deliveryAddress: parsed.data.deliveryAddress,
    packageType: parsed.data.packageType,
    urgency: parsed.data.urgency,
    weightKg: parsed.data.weightKg,
    deliveryCategory,
    freightMode: parsed.data.freightMode,
    quoteCurrency: parsed.data.quoteCurrency,
    freightClassification: parsed.data.freightClassification,
    packageValue: parsed.data.packageValue,
    customsInformation: parsed.data.customsInformation,
    exportImportDocuments: parsed.data.exportImportDocuments
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
    pickup_address: parsed.data.pickupAddress,
    delivery_address: parsed.data.deliveryAddress,
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
    export_import_documents: parsed.data.exportImportDocuments || null,
    notes: parsed.data.notes || null,
    estimated_price: quote.amount,
    estimated_eta_hours: quote.etaHours,
    pricing_breakdown: quote.breakdown,
    vehicle_type: quote.vehicleType,
    delivery_type: quote.deliveryType,
    service_warnings: quote.warnings,
    quoted_price: quote.amount,
    quoted_eta_hours: quote.etaHours,
    quoted_eta_label: quote.etaLabel,
    payment_status: "UNPAID",
    payment_reference: null,
    payment_amount: quote.amount,
    payment_provider: "flutterwave",
    status: "QUOTED",
    quote_status_history: appendQuoteStatusHistory(null, {
      status: "QUOTED",
      actor_role: "customer",
      note: "Instant delivery price generated for customer payment."
    }),
    quote_sent_at: now,
    quote_valid_until: quoteValidUntil
  }, tenant?.companyId);

  if (!supabase) {
    return NextResponse.json({
      ...payload,
      id: "local-preview",
      created_at: new Date().toISOString(),
      warning: "Booking storage is temporarily unavailable, so this request was not stored.",
      pricing: quote
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
      message: "Instant delivery quote stored for customer payment.",
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
    return NextResponse.json({ ...(data as QuoteRequestRecord), pricing: quote }, { status: 201 });
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
