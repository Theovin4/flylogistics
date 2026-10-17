import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isShipmentAtLeast,
  makeTrackingId,
  shipmentCustomerMessage,
  shipmentStatuses,
  type ShipmentRecord
} from "@/lib/shipments";
import {
  carrierProviders,
  carrierProviderLabels,
  isExternalCarrierProvider,
  normalizeCarrierProvider
} from "@/lib/carriers";
import { missingDriverColumn } from "@/lib/driver-data";
import {
  buildInternationalOperationsSummary
} from "@/lib/international";
import { deliveryCategoryValues, shipmentTypeFromDeliveryCategory, type DeliveryCategory, type PricingUrgency } from "@/lib/pricing";
import { shipmentMarginPercent, shipmentProfit } from "@/lib/shipment-finance";
import { makeTimelineEvent, shipmentWithDriverSelect, statusTimelineEvent } from "@/lib/shipment-data";
import { whatsappMessages } from "@/lib/whatsapp";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { handleApiError, parseJson } from "@/server/api";
import { notifyAdmin } from "@/server/admin-notifications";
import { writeAuditLog } from "@/server/audit";
import { adjustAdminWalletForShipmentFee, debitAdminWalletForCarrier } from "@/server/admin-wallet";
import { enqueueBackgroundJob } from "@/server/background-jobs";
import { updateShipmentCarrierFields } from "@/server/carrier-storage";
import { refreshCarrierTrackingForFlyNumber } from "@/server/carrier-tracking";
import { createCarrierShipment, getCarrierRates } from "@/server/carriers";
import { logApiError, requestContext } from "@/server/monitoring";
import { getCustomerNotificationPreferences } from "@/server/notifications/preferences";
import { sendCustomerNotification, smsMessages } from "@/server/notifications/service";
import { estimateShipmentEta } from "@/server/operations-intelligence";
import { writeOperationalEvent } from "@/server/operational-events";
import { calculateLogisticsPrice } from "@/server/pricing";
import { calculateTenantRate } from "@/server/tenant-pricing";
import { sendShipmentLifecycleEmail } from "@/server/shipment-emails";
import { canActorSelectShipmentTenant, resolveShipmentOwnership, shipmentOwnershipErrorStatus, shipmentOwnershipSourceForActor } from "@/server/shipment-ownership";
import { getTenantContextForProfile, requireCloudFeature, requireCompanyRole, withCompanyId } from "@/server/tenancy";

const shipmentSchema = z.object({
  trackingId: z.string().trim().optional(),
  deliveryCategory: z.enum(deliveryCategoryValues).default("local_nigeria"),
  freightMode: z.enum(["air_freight", "sea_freight"]).optional(),
  quoteCurrency: z.enum(["NGN", "USD", "EUR", "GBP"]).default("NGN"),
  freightClassification: z.enum(["documents", "general_cargo", "ecommerce_goods", "electronics", "fashion", "fragile", "oversized", "restricted_review"]).default("general_cargo"),
  pickupCountry: z.string().trim().max(120).optional(),
  destinationCountry: z.string().trim().max(120).optional(),
  customsInformation: z.string().trim().max(2000).optional(),
  packageValue: z.coerce.number().min(0).max(1_000_000_000).optional(),
  dutiesTaxesAmount: z.coerce.number().min(0).max(1_000_000_000).optional(),
  exportImportDocuments: z.string().trim().max(2000).optional(),
  pickupState: z.string().trim().max(80).optional(),
  destinationState: z.string().trim().max(80).optional(),
  customerName: z.string().trim().min(2),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  customerPhone: z.string().trim().min(5).max(40),
  recipientName: z.string().trim().min(2).max(160),
  pickupPhone: z.string().trim().optional(),
  deliveryPhone: z.string().trim().min(5).max(40),
  pickupAddress: z.string().trim().min(8),
  deliveryAddress: z.string().trim().min(8),
  packageType: z.string().trim().min(2),
  weightKg: z.coerce.number().positive().optional(),
  urgency: z.string().trim().default("standard"),
  status: z.enum(shipmentStatuses).default("PENDING"),
  driverId: z.string().trim().optional(),
  currentLat: z.coerce.number().optional(),
  currentLng: z.coerce.number().optional(),
  eta: z.string().trim().optional(),
  internalNotes: z.string().trim().max(2000).optional(),
  businessReference: z.string().trim().max(120).optional(),
  codAmount: z.coerce.number().min(0).max(1_000_000_000).default(0),
  codStatus: z.enum(["NOT_APPLICABLE", "PENDING", "COLLECTED", "PARTIALLY_REMITTED", "REMITTED", "DISPUTED"]).default("NOT_APPLICABLE"),
  carrierProvider: z.enum(carrierProviders).default("fez_logistics"),
  paymentAmount: z.coerce.number().min(0).max(1_000_000_000).default(0),
  driverPayoutAmount: z.coerce.number().min(0).max(1_000_000_000).optional(),
  driverPayoutStatus: z.enum(["UNPAID", "PENDING", "PAID", "CANCELLED"]).default("UNPAID"),
  driverPayoutNotes: z.string().trim().max(1000).optional(),
  carrierCostAmount: z.coerce.number().min(0).max(1_000_000_000).optional(),
  backdatedAt: z.string().trim().optional(),
  backdateReason: z.string().trim().max(1000).optional(),
  walletAdjustmentType: z.enum(["credit", "debit", "none"]).default("credit"),
  walletAdjustmentAmount: z.coerce.number().min(0).max(1_000_000_000).optional(),
  tenantCompanyId: z.string().uuid().optional()
}).superRefine((data, context) => {
  if (data.deliveryCategory !== "international_import" && !data.pickupState?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupState"], message: "Select the pickup state." });
  }
  if (data.deliveryCategory !== "international_export" && !data.destinationState?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationState"], message: "Select the destination state." });
  }
});

const optionalShipmentInsertColumns = new Set([
  "weight_kg",
  "urgency",
  "current_lat",
  "current_lng",
  "eta",
  "payment_status",
  "payment_reference",
  "payment_amount",
  "payment_provider",
  "quoted_price",
  "internal_notes",
  "customer_status_message",
  "timeline",
  "eta_hours",
  "eta_confidence",
  "route_distance_km",
  "traffic_assumption",
  "delivery_type",
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
  "vehicle_type",
  "pickup_phone",
  "delivery_phone",
  "recipient_name",
  "pickup_country",
  "destination_country",
  "pickup_state",
  "destination_state",
  "business_reference",
  "cod_amount",
  "cod_status",
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
  "driver_payout_amount",
  "driver_payout_status",
  "driver_payout_notes",
  "driver_payout_updated_at",
  "backdated_at",
  "backdate_reason",
  "company_id"
]);

function missingColumnFromPostgrest(error: { code?: string; message?: string } | null) {
  if (error?.code !== "PGRST204") return null;
  return error.message?.match(/'([^']+)' column/)?.[1] ?? null;
}

function validDateIso(value?: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function financePatch(shipment: ShipmentRecord) {
  return {
    carrier_profit_amount: shipmentProfit(shipment),
    carrier_margin_percent: shipmentMarginPercent(shipment)
  };
}

function sideEffectMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown post-create side-effect error.";
}

function isInternationalCategory(category?: string | null) {
  return String(category ?? "").includes("international");
}

function pricingUrgency(value?: string | null): PricingUrgency {
  return value === "priority" || value === "critical" ? value : "standard";
}

async function insertShipmentWithSchemaFallback(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  payload: Record<string, unknown>
) {
  const nextPayload = { ...payload };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt <= optionalShipmentInsertColumns.size; attempt += 1) {
    const result = await supabase
      .from("shipments")
      .insert(nextPayload)
      .select(shipmentWithDriverSelect)
      .single();

    if (!result.error) return { ...result, removedColumns };

    const missingColumn = missingColumnFromPostgrest(result.error);
    if (!missingColumn || !optionalShipmentInsertColumns.has(missingColumn) || !(missingColumn in nextPayload)) {
      return { ...result, removedColumns };
    }

    delete nextPayload[missingColumn];
    removedColumns.push(missingColumn);
  }

  return {
    data: null,
    error: {
      code: "SCHEMA_FALLBACK_EXHAUSTED",
      message: "Unable to create shipment because optional schema fallback was exhausted."
    },
    removedColumns
  };
}

export async function GET(request: Request) {
  const access = await requireCompanyRole(request, ["owner", "admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json([]);
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  let query = supabase
    .from("shipments")
    .select(shipmentWithDriverSelect)
    .order("created_at", { ascending: false })
    .limit(25);
  if (tenant.schemaReady && tenant.companyId) query = query.eq("company_id", tenant.companyId);
  const { data, error } = await query;

  if (error) {
    logApiError(error, "Unable to load shipments.", requestContext(request));
    return NextResponse.json({ error: "Unable to load shipments.", details: error.message, code: error.code }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  try {
    let access = await requireCompanyRole(request, ["owner", "admin", "dispatcher"]);
    if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

    if (shipmentOwnershipSourceForActor(access.profile) === "cloud_tenant") {
      access = await requireCloudFeature(request, "shipment_management", ["owner", "admin", "dispatcher"]);
      if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
      if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const parsed = await parseJson(request, shipmentSchema, "Please complete the shipment form.");
    if (parsed.response) return parsed.response;
    if (parsed.data.tenantCompanyId && !canActorSelectShipmentTenant(access.profile)) {
      return NextResponse.json(
        { error: "Only Fly Logistics administrators can select a tenant workspace explicitly." },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Shipment operations are temporarily unavailable." }, { status: 503 });
    }
    const tenant = access.tenant ?? await getTenantContextForProfile(supabase, access.profile);
    const ownership = await resolveShipmentOwnership({
      supabase,
      actor: access.profile,
      tenant,
      explicitlySelectedTenantId: parsed.data.tenantCompanyId
    });

  let verifiedDriverVehicleType: string | null = null;

  if (parsed.data.driverId) {
    let driver = supabase
      .from("drivers")
      .select("id,approval_status,vehicle_type")
      .eq("id", Number(parsed.data.driverId));
    driver = driver.eq("company_id", ownership.companyId);
    let driverResult = await driver.maybeSingle();

    if (missingDriverColumn(driverResult.error) === "approval_status") {
      let fallbackDriver = supabase
        .from("drivers")
        .select("id,vehicle_type")
        .eq("id", Number(parsed.data.driverId));
      fallbackDriver = fallbackDriver.eq("company_id", ownership.companyId);
      driverResult = await fallbackDriver.maybeSingle();
    }

    if (driverResult.error) {
      logApiError(driverResult.error, "Unable to verify assigned driver.", requestContext(request, { driverId: parsed.data.driverId }));
      return NextResponse.json({ error: "Unable to verify assigned driver." }, { status: 500 });
    }
    if (!driverResult.data || ("approval_status" in driverResult.data && driverResult.data.approval_status !== "approved")) {
      return NextResponse.json({ error: "Only approved drivers can be assigned to shipments." }, { status: 409 });
    }
    verifiedDriverVehicleType = typeof driverResult.data.vehicle_type === "string" ? driverResult.data.vehicle_type : null;
  }

  const status = parsed.data.status ?? "PENDING";
  const codAmount = parsed.data.codAmount ?? 0;
  const codStatus = parsed.data.codStatus ?? "NOT_APPLICABLE";
  const requestedCarrier = normalizeCarrierProvider(parsed.data.carrierProvider);
  const deliveryCategory: DeliveryCategory = parsed.data.deliveryCategory ?? "local_nigeria";
  const urgency = pricingUrgency(parsed.data.urgency);
  const pricingQuote = await calculateLogisticsPrice({
    pickupState: parsed.data.pickupState,
    destinationState: parsed.data.destinationState,
    pickupCountry: parsed.data.pickupCountry,
    destinationCountry: parsed.data.destinationCountry,
    pickupAddress: parsed.data.pickupAddress,
    deliveryAddress: parsed.data.deliveryAddress,
    packageType: parsed.data.packageType,
    urgency,
    weightKg: parsed.data.weightKg ?? 1,
    deliveryCategory,
    freightMode: parsed.data.freightMode,
    quoteCurrency: parsed.data.quoteCurrency,
    freightClassification: parsed.data.freightClassification,
    packageValue: parsed.data.packageValue,
    customsInformation: parsed.data.customsInformation,
    exportImportDocuments: parsed.data.exportImportDocuments
  }, supabase);
  const tenantRate = ownership.source === "cloud_tenant"
    ? await calculateTenantRate(supabase, {
        companyId: ownership.companyId,
        serviceType: deliveryCategory,
        pickupZone: parsed.data.pickupState ?? parsed.data.pickupCountry,
        destinationZone: parsed.data.destinationState ?? parsed.data.destinationCountry,
        weightKg: parsed.data.weightKg ?? 1
      })
    : null;
  const effectivePrice = tenantRate?.amount ?? Number(pricingQuote.amount ?? 0);
  const paymentAmount = Number(effectivePrice);
  const driverPayoutAmount = Number(parsed.data.driverPayoutAmount ?? 0);
  const carrierCostAmount = Number(parsed.data.carrierCostAmount ?? 0);
  const backdatedAt = validDateIso(parsed.data.backdatedAt);
  if (parsed.data.backdatedAt && !backdatedAt) {
    return NextResponse.json({ error: "Backdate must be a valid date and time." }, { status: 400 });
  }
  const walletAdjustmentAmount = Number(parsed.data.walletAdjustmentAmount ?? 0) > 0
    ? Number(parsed.data.walletAdjustmentAmount)
    : paymentAmount;
  const walletAdjustmentType = parsed.data.walletAdjustmentType ?? "credit";
  if (isShipmentAtLeast(status, "DRIVER_ASSIGNED") && !parsed.data.driverId) {
    return NextResponse.json({ error: "Assign a driver before moving shipment to driver assigned or beyond." }, { status: 409 });
  }
  const trackingId = parsed.data.trackingId?.toUpperCase() || makeTrackingId();
  const paymentReference = paymentAmount > 0 ? `FLY-ADMIN-SHIPMENT-${trackingId}-${Date.now()}` : null;
  const etaEstimate = estimateShipmentEta({
    pickupState: parsed.data.pickupState,
    destinationState: parsed.data.destinationState,
    pickupAddress: parsed.data.pickupAddress,
    deliveryAddress: parsed.data.deliveryAddress,
    deliveryCategory,
    urgency,
    vehicleType: verifiedDriverVehicleType ?? pricingQuote.vehicleType
  });
  const pickupState = parsed.data.pickupState || (deliveryCategory === "international_import" ? null : etaEstimate.pickupStateCode);
  const destinationState = parsed.data.destinationState || (deliveryCategory === "international_export" ? null : etaEstimate.destinationStateCode);
  const timeline = [
    makeTimelineEvent("Shipment created", parsed.data.pickupAddress),
    ...(parsed.data.driverId ? [makeTimelineEvent("Driver assigned", parsed.data.pickupAddress)] : []),
    ...(status !== "PENDING" ? [statusTimelineEvent(status, parsed.data.deliveryAddress)] : [])
  ];
  const internationalSummary = isInternationalCategory(deliveryCategory)
    ? buildInternationalOperationsSummary({
        amountNgn: paymentAmount,
        deliveryCategory,
        freightMode: parsed.data.freightMode,
        quoteCurrency: parsed.data.quoteCurrency,
        freightClassification: parsed.data.freightClassification,
        weightKg: parsed.data.weightKg,
        packageValue: parsed.data.packageValue,
        customsInformation: parsed.data.customsInformation,
        exportImportDocuments: parsed.data.exportImportDocuments,
        etaHours: etaEstimate.etaHours
      })
    : null;
  const financeSeed = {
    payment_amount: paymentAmount || null,
    quoted_price: paymentAmount || null,
    driver_payout_amount: driverPayoutAmount || null,
    carrier_provider: requestedCarrier,
    carrier_cost_amount: carrierCostAmount || null,
    carrier_rate_amount: null
  } as ShipmentRecord;
  const externalCarrierRequested = isExternalCarrierProvider(requestedCarrier);

  const payload = withCompanyId({
    tracking_id: trackingId,
    customer_name: parsed.data.customerName,
    customer_email: parsed.data.customerEmail || null,
    customer_phone: parsed.data.customerPhone || null,
    recipient_name: parsed.data.recipientName || null,
    pickup_phone: parsed.data.pickupPhone || parsed.data.customerPhone || null,
    delivery_phone: parsed.data.deliveryPhone || parsed.data.customerPhone || null,
    pickup_country: parsed.data.pickupCountry || (deliveryCategory === "international_import" ? null : "Nigeria"),
    destination_country: parsed.data.destinationCountry || (deliveryCategory === "international_export" ? null : "Nigeria"),
    pickup_address: parsed.data.pickupAddress,
    delivery_address: parsed.data.deliveryAddress,
    delivery_category: deliveryCategory,
    shipment_type: shipmentTypeFromDeliveryCategory(deliveryCategory),
    freight_mode: internationalSummary?.freightMode ?? parsed.data.freightMode ?? null,
    quote_currency: internationalSummary?.quoteCurrency ?? parsed.data.quoteCurrency ?? "NGN",
    freight_classification: internationalSummary?.freightClassification ?? parsed.data.freightClassification ?? null,
    commercial_invoice: internationalSummary
      ? {
          required: internationalSummary.commercialInvoiceRequired,
          declared_value: parsed.data.packageValue ?? null,
          currency: internationalSummary.quoteCurrency,
          documents: internationalSummary.customsDocuments,
          documentation_status: internationalSummary.documentationStatus
        }
      : {},
    international_tracking_mode: internationalSummary?.trackingMode ?? null,
    customs_information: parsed.data.customsInformation || null,
    package_value: parsed.data.packageValue ?? null,
    duties_taxes_amount: parsed.data.dutiesTaxesAmount ?? null,
    export_import_documents: parsed.data.exportImportDocuments || null,
    package_type: parsed.data.packageType,
    weight_kg: parsed.data.weightKg ?? null,
    urgency,
    status,
    driver_id: parsed.data.driverId ? Number(parsed.data.driverId) : null,
    current_lat: parsed.data.currentLat ?? null,
    current_lng: parsed.data.currentLng ?? null,
    eta: parsed.data.eta || tenantRate?.etaLabel || pricingQuote.etaLabel || etaEstimate.etaLabel,
    eta_hours: tenantRate?.etaHours || pricingQuote.etaHours || etaEstimate.etaHours,
    eta_confidence: etaEstimate.confidence,
    route_distance_km: etaEstimate.distanceKm,
    traffic_assumption: etaEstimate.trafficAssumption,
    pickup_state: pickupState,
    destination_state: destinationState,
    delivery_type: pricingQuote.deliveryType || etaEstimate.deliveryType,
    vehicle_type: verifiedDriverVehicleType ?? pricingQuote.vehicleType ?? etaEstimate.vehicleType,
    quoted_price: paymentAmount || null,
    payment_status: paymentAmount > 0 ? "PAID" : "UNPAID",
    payment_reference: paymentReference,
    payment_amount: paymentAmount || null,
    payment_provider: paymentAmount > 0 ? "admin" : "flutterwave",
    carrier: requestedCarrier === "fez_logistics"
      ? "fez"
      : requestedCarrier === "sendbox"
        ? "sendbox"
        : "fly",
    carrier_provider: requestedCarrier,
    carrier_shipment_id: null,
    carrier_tracking_id: externalCarrierRequested ? null : trackingId,
    carrier_order_id: null,
    carrier_order_no: null,
    carrier_waybill_no: null,
    carrier_label_url: null,
    carrier_rate_amount: null,
    carrier_cost_amount: carrierCostAmount || null,
    ...financePatch(financeSeed),
    carrier_status: externalCarrierRequested ? "pending_carrier_sync" : "internal",
    carrier_payload: {},
    carrier_response: {},
    carrier_error: null,
    carrier_raw_response: {},
    external_tracking_enabled: false,
    driver_payout_amount: driverPayoutAmount || null,
    driver_payout_status: driverPayoutAmount > 0 ? parsed.data.driverPayoutStatus : "UNPAID",
    driver_payout_notes: parsed.data.driverPayoutNotes || null,
    driver_payout_updated_at: driverPayoutAmount > 0 || parsed.data.driverPayoutNotes ? new Date().toISOString() : null,
    backdated_at: backdatedAt,
    backdate_reason: backdatedAt ? parsed.data.backdateReason || "Admin backdated shipment." : null,
    business_reference: parsed.data.businessReference || null,
    cod_amount: codAmount || null,
    cod_status: codAmount > 0 ? codStatus === "NOT_APPLICABLE" ? "PENDING" : codStatus : "NOT_APPLICABLE",
    internal_notes: parsed.data.internalNotes || null,
    customer_status_message: shipmentCustomerMessage(status),
    timeline,
    ...(backdatedAt ? { created_at: backdatedAt } : {})
  }, ownership.companyId);

  const { data, error, removedColumns } = await insertShipmentWithSchemaFallback(supabase, payload);
  if (error) {
    logApiError(error, "Unable to create shipment.", requestContext(request, { trackingId }));
    return NextResponse.json({ error: "Unable to create shipment.", details: error.message, code: error.code }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Unable to create shipment." }, { status: 500 });
  }

  let shipmentRecord = data as ShipmentRecord;
  let adminWalletFeeAdjustment: Record<string, unknown> | null = null;
  let carrierAutomation: Record<string, unknown> | null = null;
  const postCreateWarnings: Array<{ step: string; message: string }> = [];

  const runPostCreateStep = async <T,>(
    step: string,
    task: () => Promise<T>,
    fallback: T
  ): Promise<T> => {
    try {
      return await task();
    } catch (error) {
      const message = sideEffectMessage(error);
      postCreateWarnings.push({ step, message });
      logApiError(error, `Shipment created but ${step} failed.`, requestContext(request, { trackingId: shipmentRecord.tracking_id }));
      return fallback;
    }
  };

  if (walletAdjustmentType !== "none" && walletAdjustmentAmount > 0) {
    adminWalletFeeAdjustment = await runPostCreateStep(
      "admin wallet shipment-fee adjustment",
      () => adjustAdminWalletForShipmentFee(supabase, {
        amount: walletAdjustmentAmount,
        trackingId: shipmentRecord.tracking_id,
        transactionType: walletAdjustmentType,
        description: `${walletAdjustmentType === "credit" ? "Shipment fee received" : "Shipment fee adjusted"} for ${shipmentRecord.tracking_id}`,
        metadata: {
          requestedCarrier,
          paymentAmount,
          pricingEngineAmount: pricingQuote.amount,
          pricingEngineEta: pricingQuote.etaLabel,
          paymentReference,
          manualAdjustmentAmount: walletAdjustmentAmount
        }
      }),
      { ok: false, reason: "wallet_unavailable" as const }
    );
  }

  if (isExternalCarrierProvider(requestedCarrier)) {
    let carrierCostEstimate: number | null = null;
    const rateResult = await runPostCreateStep(
      "carrier cost estimate",
      () => getCarrierRates(shipmentRecord, [requestedCarrier]),
      { rates: [], errors: {} }
    );
    const selectedRate = rateResult.rates.find((item) => item.provider === requestedCarrier && Number.isFinite(Number(item.amount)));
    if (selectedRate?.amount !== null && selectedRate?.amount !== undefined) {
      carrierCostEstimate = Number(selectedRate.amount);
      shipmentRecord = {
        ...shipmentRecord,
        carrier_rate_amount: carrierCostEstimate,
        carrier_cost_amount: carrierCostEstimate
      };
    }

    const carrierResult = await runPostCreateStep(
      "carrier order creation",
      () => createCarrierShipment(shipmentRecord, requestedCarrier),
      {
        ok: false,
        error: "Carrier order creation could not complete. Retry from the shipment carrier controls.",
        status: 503
      } as const
    );

    if (carrierResult.ok) {
      const carrierOrderReference =
        carrierResult.data.carrierOrderId ??
        carrierResult.data.carrierShipmentId ??
        carrierResult.data.carrierTrackingId ??
        null;
      const carrierTrackingReference =
        carrierResult.data.carrierTrackingId ??
        carrierResult.data.carrierOrderId ??
        carrierResult.data.carrierShipmentId ??
        null;
      const carrierUpdate = await updateShipmentCarrierFields(supabase, shipmentRecord.tracking_id, {
        carrier_provider: carrierResult.data.provider,
        carrier: carrierResult.data.provider === "fez_logistics" ? "fez" : carrierResult.data.provider,
        carrier_shipment_id: carrierResult.data.carrierShipmentId ?? carrierOrderReference,
        carrier_tracking_id: carrierTrackingReference,
        carrier_order_id: carrierOrderReference,
        carrier_order_no: carrierOrderReference,
        carrier_waybill_no: carrierTrackingReference,
        carrier_label_url: carrierResult.data.carrierLabelUrl ?? null,
        carrier_rate_amount: carrierResult.data.carrierRateAmount ?? carrierCostEstimate ?? null,
        carrier_cost_amount: carrierResult.data.carrierRateAmount ?? carrierCostEstimate ?? shipmentRecord.carrier_cost_amount ?? null,
        ...financePatch({
          ...shipmentRecord,
          carrier_provider: carrierResult.data.provider,
          carrier_rate_amount: carrierResult.data.carrierRateAmount ?? carrierCostEstimate ?? shipmentRecord.carrier_rate_amount ?? null,
          carrier_cost_amount: carrierResult.data.carrierRateAmount ?? carrierCostEstimate ?? shipmentRecord.carrier_cost_amount ?? null
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
        if (carrierResult.data.provider === "fez_logistics") {
          const synced = await runPostCreateStep(
            "automatic FEZ tracking sync",
            () => refreshCarrierTrackingForFlyNumber(supabase, shipmentRecord.tracking_id, request),
            { data: shipmentRecord, error: null },
          );
          if (!synced.error && synced.data) shipmentRecord = synced.data;
        }
      } else if (carrierUpdate.error) {
        logApiError(carrierUpdate.error, "Carrier shipment created but carrier details could not be saved.", requestContext(request, { trackingId, requestedCarrier }));
      }

      const adminWalletDebit = await runPostCreateStep(
        "admin wallet carrier debit",
        () => debitAdminWalletForCarrier(supabase, {
          amount: carrierResult.data.carrierRateAmount ?? carrierCostEstimate,
          trackingId: shipmentRecord.tracking_id,
          provider: carrierResult.data.provider,
          carrierReference: carrierResult.data.carrierOrderId ?? carrierResult.data.carrierTrackingId ?? null
        }),
        { ok: false, reason: "wallet_unavailable" as const }
      );

      carrierAutomation = {
        ok: true,
        provider: carrierResult.data.provider,
        providerLabel: carrierProviderLabels[carrierResult.data.provider],
        carrierOrderId: carrierResult.data.carrierOrderId ?? carrierResult.data.carrierShipmentId ?? null,
        carrierTrackingId: carrierResult.data.carrierTrackingId ?? null,
        adminWalletDebit
      };
    } else {
      const existingExternalReference = [
        shipmentRecord.carrier_order_no,
        shipmentRecord.carrier_order_id,
        shipmentRecord.carrier_tracking_id,
        shipmentRecord.carrier_waybill_no,
        shipmentRecord.carrier_shipment_id
      ].find((value) => {
        const text = String(value ?? "").trim();
        return text && !text.toUpperCase().startsWith("FLY-");
      }) ?? null;
      const carrierFallback = await updateShipmentCarrierFields(supabase, shipmentRecord.tracking_id, {
        carrier_provider: requestedCarrier,
        carrier: requestedCarrier === "fez_logistics" ? "fez" : requestedCarrier,
        carrier_tracking_id: existingExternalReference,
        carrier_order_id: existingExternalReference,
        carrier_order_no: existingExternalReference,
        carrier_shipment_id: existingExternalReference,
        carrier_waybill_no: existingExternalReference,
        carrier_status: "carrier_create_failed",
        ...(carrierCostEstimate !== null
          ? {
              carrier_rate_amount: carrierCostEstimate,
              carrier_cost_amount: carrierCostEstimate,
              ...financePatch({
                ...shipmentRecord,
                carrier_provider: requestedCarrier,
                carrier_rate_amount: carrierCostEstimate,
                carrier_cost_amount: carrierCostEstimate
              })
            }
          : {}),
        carrier_error: carrierResult.error,
        carrier_response: {
          error: carrierResult.error,
          status: carrierResult.status ?? null,
          provider: requestedCarrier
        },
        carrier_raw_response: {
          error: carrierResult.error,
          status: carrierResult.status ?? null,
          provider: requestedCarrier
        },
        carrier_synced_at: new Date().toISOString(),
        external_tracking_enabled: false
      });

      if (!carrierFallback.error && carrierFallback.data) {
        shipmentRecord = carrierFallback.data;
        if (requestedCarrier === "fez_logistics") {
          const reconciled = await runPostCreateStep(
            "automatic FEZ reconciliation after ambiguous create response",
            () => refreshCarrierTrackingForFlyNumber(supabase, shipmentRecord.tracking_id, request),
            { data: shipmentRecord, error: null }
          );
          if (!reconciled.error && reconciled.data && String(reconciled.data.carrier_status ?? "").toLowerCase() !== "carrier_create_failed") {
            shipmentRecord = reconciled.data;
            carrierAutomation = {
              ok: true,
              reconciled: true,
              provider: "fez_logistics",
              providerLabel: carrierProviderLabels.fez_logistics,
              carrierOrderId: shipmentRecord.carrier_order_no ?? shipmentRecord.carrier_order_id ?? null,
              carrierTrackingId: shipmentRecord.carrier_tracking_id ?? null,
              originalError: carrierResult.error
            };
          }
        }
      } else if (carrierFallback.error) {
        logApiError(carrierFallback.error, "Carrier creation failed and fallback carrier status could not be saved.", requestContext(request, { trackingId, requestedCarrier }));
      }

      if (!carrierAutomation?.ok) {
        carrierAutomation = {
          ok: false,
          provider: requestedCarrier,
          providerLabel: carrierProviderLabels[requestedCarrier],
          error: carrierResult.error
        };

        await runPostCreateStep(
          "carrier failure operational event",
          () => writeOperationalEvent(supabase, {
            category: "shipment",
            severity: "warning",
            message: "Automatic carrier fulfilment could not be created for admin-created shipment; shipment remains internally managed.",
            entityType: "shipment",
            entityId: shipmentRecord.tracking_id,
            metadata: { provider: requestedCarrier, error: carrierResult.error, status: carrierResult.status },
            request
          }),
          undefined
        );
      }
    }
  }

  if (externalCarrierRequested) {
    await runPostCreateStep(
      "queued carrier follow-up sync",
      () =>
        enqueueBackgroundJob(supabase, {
          jobType: "carrier_sync",
          entityType: "shipment",
          entityId: shipmentRecord.tracking_id,
          companyId: ownership.companyId,
          payload: {
            trackingId: shipmentRecord.tracking_id,
            provider: requestedCarrier,
            source: "admin_shipment_create"
          },
          runAt: new Date(Date.now() + 120_000).toISOString()
        }),
      { jobId: null, error: null }
    );
  }

  const lifecycleEmail = await runPostCreateStep(
    "shipment creation email",
    () => sendShipmentLifecycleEmail(supabase, shipmentRecord, "created", request),
    { ok: false, mode: "dashboard_only" as const }
  );
  let adminPaidEmail: Awaited<ReturnType<typeof notifyAdmin>> | null = null;
  if (paymentAmount > 0) {
    adminPaidEmail = await runPostCreateStep(
      "admin paid-shipment notification",
      () => notifyAdmin(supabase, {
        title: "Paid shipment created",
        message: `${shipmentRecord.customer_name ?? "A customer"} paid ${paymentAmount} for shipment ${shipmentRecord.tracking_id}. Carrier: ${carrierProviderLabels[normalizeCarrierProvider(shipmentRecord.carrier_provider)]}.`,
        severity: "info",
        entityType: "shipment",
        entityId: shipmentRecord.tracking_id,
        metadata: {
          trackingId: shipmentRecord.tracking_id,
          paymentAmount,
          paymentReference,
          carrierProvider: shipmentRecord.carrier_provider
        },
        request
      }),
      { ok: false, mode: "dashboard_only" as const, whatsapp: null }
    );
  }

  await runPostCreateStep(
    "shipment create audit log",
    () => writeAuditLog(supabase, {
      actor: access.profile,
      action: "shipment.create",
      entityType: "shipment",
      entityId: shipmentRecord.tracking_id,
      metadata: { status: shipmentRecord.status, driverId: shipmentRecord.driver_id, paymentAmount, pricingEngineAmount: pricingQuote.amount, driverPayoutAmount, carrierCostAmount, lifecycleEmail, adminPaidEmail, adminWalletFeeAdjustment, requestedCarrier, carrierAutomation, removedColumns, ownershipSource: ownership.source, explicitlySelectedTenant: ownership.explicitlySelectedTenant },
      request
    }),
    undefined
  );

  let customerNotification: { ok: boolean; provider: string; mode: string } | null = null;
  if ((shipmentRecord.customer_phone || shipmentRecord.customer_email) && status !== "PENDING") {
    const notification =
      status === "DRIVER_ASSIGNED"
        ? { workflow: "driver_assigned", message: whatsappMessages.driverAssigned(shipmentRecord) }
        : { workflow: "shipment_confirmed", message: whatsappMessages.shipmentConfirmed(shipmentRecord) };
    const preferences = await runPostCreateStep(
      "customer notification preferences lookup",
      () => getCustomerNotificationPreferences(supabase, shipmentRecord.customer_email),
      { email: shipmentRecord.customer_email, emailEnabled: true, whatsappEnabled: true, smsEnabled: true }
    );
    const result = await runPostCreateStep(
      "customer shipment notification",
      () => sendCustomerNotification({
        to: shipmentRecord.customer_phone,
        message: notification.message,
        workflow: notification.workflow,
        entityType: "shipment",
        entityId: shipmentRecord.tracking_id,
        metadata: { status: shipmentRecord.status, source: "shipment_create" },
        preferences,
        smsFallback: true,
        smsMessage: smsMessages.criticalShipmentAlert(shipmentRecord.tracking_id, shipmentRecord.status)
      }),
      { ok: false, results: {} }
    );
    customerNotification = {
      ok: result.ok,
      provider: result.results.whatsapp?.provider ?? result.results.sms?.provider ?? "multi_channel",
      mode: result.results.whatsapp?.mode ?? result.results.sms?.mode ?? "failed"
    };
  }

  await runPostCreateStep(
    "shipment created operational event",
    () => writeOperationalEvent(supabase, {
      category: "shipment",
      severity: postCreateWarnings.length ? "warning" : "info",
      message: postCreateWarnings.length ? "Shipment created by operations with post-create warnings." : "Shipment created by operations.",
      entityType: "shipment",
      entityId: shipmentRecord.tracking_id,
      metadata: { status: shipmentRecord.status, driverId: shipmentRecord.driver_id, paymentAmount, pricingEngineAmount: pricingQuote.amount, driverPayoutAmount, carrierCostAmount, lifecycleEmail, adminPaidEmail, adminWalletFeeAdjustment, requestedCarrier, carrierAutomation, customerNotification, removedColumns, postCreateWarnings, ownershipSource: ownership.source, explicitlySelectedTenant: ownership.explicitlySelectedTenant },
      request
    }),
    undefined
  );

    return NextResponse.json(
      carrierAutomation || adminWalletFeeAdjustment || postCreateWarnings.length
        ? { ...shipmentRecord, carrier_automation: carrierAutomation, admin_wallet_fee_adjustment: adminWalletFeeAdjustment, post_create_warnings: postCreateWarnings }
        : shipmentRecord,
      { status: 201 }
    );
  } catch (error) {
    const ownershipErrorStatus = shipmentOwnershipErrorStatus(error);
    if (ownershipErrorStatus && error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: ownershipErrorStatus });
    }
    return handleApiError(error, request, "Unable to create shipment. Please try again or choose Fly Logistics Internal fulfilment.");
  }
}
