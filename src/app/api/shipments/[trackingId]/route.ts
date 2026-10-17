import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isPaymentCleared,
  isShipmentAtLeast,
  shipmentCustomerMessage,
  shipmentStatuses,
  type ShipmentRecord
} from "@/lib/shipments";
import { shipmentMarginPercent, shipmentProfit } from "@/lib/shipment-finance";
import {
  appendTimelineEvent,
  appendStatusProgressionEvents,
  fetchShipmentByTracking,
  makeTimelineEvent,
  shipmentWithDriverSelect
} from "@/lib/shipment-data";
import { whatsappMessages } from "@/lib/whatsapp";
import { buildInternationalOperationsSummary } from "@/lib/international";
import { deliveryCategoryValues, shipmentTypeFromDeliveryCategory } from "@/lib/pricing";
import { carrierProviders } from "@/lib/carriers";
import { requireCloudFeature } from "@/server/tenancy";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logShipmentWorkflowError, requestContext } from "@/server/monitoring";
import { sendCustomerNotification, smsMessages } from "@/server/notifications/service";
import { getCustomerNotificationPreferences } from "@/server/notifications/preferences";
import { estimateShipmentEta } from "@/server/operations-intelligence";
import { writeOperationalEvent } from "@/server/operational-events";
import { sendShipmentLifecycleEmail } from "@/server/shipment-emails";
import { getTenantContextForProfile, isShipmentDriver } from "@/server/tenancy";

const updateShipmentSchema = z.object({
  status: z.enum(shipmentStatuses).optional(),
  driverId: z.string().trim().optional(),
  deliveryCategory: z.enum(deliveryCategoryValues).optional(),
  freightMode: z.enum(["air_freight", "sea_freight"]).optional(),
  quoteCurrency: z.enum(["NGN", "USD", "EUR", "GBP"]).optional(),
  freightClassification: z.enum(["documents", "general_cargo", "ecommerce_goods", "electronics", "fashion", "fragile", "oversized", "restricted_review"]).optional(),
  pickupCountry: z.string().trim().max(120).optional(),
  destinationCountry: z.string().trim().max(120).optional(),
  customsInformation: z.string().trim().max(2000).optional(),
  packageValue: z.coerce.number().min(0).max(1000000000).optional(),
  dutiesTaxesAmount: z.coerce.number().min(0).max(1000000000).optional(),
  exportImportDocuments: z.string().trim().max(2000).optional(),
  pickupState: z.string().trim().max(80).optional(),
  destinationState: z.string().trim().max(80).optional(),
  customerName: z.string().trim().max(160).optional(),
  customerEmail: z.string().trim().email().max(240).or(z.literal("")).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  recipientName: z.string().trim().min(2).max(160).optional(),
  pickupPhone: z.string().trim().max(40).optional(),
  deliveryPhone: z.string().trim().max(40).optional(),
  pickupAddress: z.string().trim().max(500).optional(),
  deliveryAddress: z.string().trim().max(500).optional(),
  packageType: z.string().trim().max(120).optional(),
  weightKg: z.coerce.number().positive().max(100000).optional(),
  urgency: z.string().trim().max(80).optional(),
  paymentAmount: z.coerce.number().min(0).max(1000000000).optional(),
  driverPayoutAmount: z.coerce.number().min(0).max(1000000000).optional(),
  driverPayoutStatus: z.enum(["UNPAID", "PENDING", "PAID", "CANCELLED"]).optional(),
  driverPayoutNotes: z.string().trim().max(1000).optional(),
  carrierCostAmount: z.coerce.number().min(0).max(1000000000).optional(),
  carrierProvider: z.enum(carrierProviders).optional(),
  carrierOrderId: z.string().trim().max(160).optional(),
  carrierTrackingId: z.string().trim().max(160).optional(),
  backdatedAt: z.string().trim().optional(),
  backdateReason: z.string().trim().max(1000).optional(),
  currentLat: z.coerce.number().optional(),
  currentLng: z.coerce.number().optional(),
  eta: z.string().trim().optional(),
  timelineLabel: z.string().trim().min(2).max(120).optional(),
  timelineLocation: z.string().trim().max(160).optional(),
  timelineCompleted: z.boolean().optional(),
  internalNotes: z.string().trim().max(2000).optional()
});

function shipmentStatusNotification(status: string, shipment: Record<string, unknown>) {
  const typedShipment = shipment as Parameters<typeof whatsappMessages.shipmentConfirmed>[0];
  switch (String(status).toUpperCase()) {
    case "CONFIRMED":
      return { workflow: "shipment_accepted", message: whatsappMessages.shipmentAccepted(typedShipment) };
    case "DRIVER_ASSIGNED":
      return { workflow: "driver_assigned", message: whatsappMessages.driverAssigned(typedShipment) };
    case "PICKED_UP":
      return { workflow: "shipment_picked_up", message: whatsappMessages.shipmentPickedUp(typedShipment) };
    case "IN_TRANSIT":
      return { workflow: "in_transit_update", message: whatsappMessages.inTransitUpdate(typedShipment) };
    case "ARRIVED":
      return { workflow: "approaching_destination", message: whatsappMessages.approachingDestination(typedShipment) };
    case "DELIVERED":
      return { workflow: "delivered_confirmation", message: whatsappMessages.deliveredConfirmation(typedShipment) };
    case "CANCELLED":
    case "EXCEPTION":
      return { workflow: "failed_delivery", message: whatsappMessages.failedDelivery(typedShipment) };
    default:
      return { workflow: "shipment_status_update", message: whatsappMessages.deliveryUpdate(typedShipment) };
  }
}

function isOptionalSchemaError(error: { code?: string; message?: string } | null) {
  return Boolean(error && ["42P01", "42703"].includes(error.code ?? ""));
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

function cancellationRefundPatch(nextStatus: string | null | undefined, current: ShipmentRecord, paymentAmount: number) {
  const normalizedNextStatus = String(nextStatus ?? "").toUpperCase();
  const currentRefundStatus = String(current.cancellation_refund_status ?? "").toUpperCase();
  const hasRefundablePayment = isPaymentCleared(current.payment_status) && paymentAmount > 0 && Boolean(current.customer_email);

  if (normalizedNextStatus === "CANCELLED" && currentRefundStatus !== "REFUNDED") {
    if (!hasRefundablePayment) {
      return {
        cancellation_refund_status: "NOT_REQUIRED",
        cancellation_refund_due_at: null,
        cancellation_refunded_at: null,
        cancellation_refund_reference: null,
        cancellation_refund_amount: null
      };
    }

    return {
      cancellation_refund_status: "PENDING",
      cancellation_refund_due_at: current.cancellation_refund_due_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      cancellation_refunded_at: null,
      cancellation_refund_reference: current.cancellation_refund_reference ?? `FLY-REFUND-${current.tracking_id}`,
      cancellation_refund_amount: paymentAmount
    };
  }

  if (String(current.status ?? "").toUpperCase() === "CANCELLED" && currentRefundStatus === "PENDING" && normalizedNextStatus !== "CANCELLED") {
    return {
      cancellation_refund_status: "VOIDED",
      cancellation_refund_due_at: null
    };
  }

  return {};
}

async function deleteRelatedShipmentRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  shipment: { id?: number | string | null; tracking_id?: string | null }
) {
  const trackingId = String(shipment.tracking_id ?? "").toUpperCase();
  const shipmentId = shipment.id;
  const operations = [
    supabase.from("shipment_events").delete().eq("tracking_id", trackingId),
    supabase.from("proof_of_delivery_events").delete().eq("tracking_id", trackingId),
    supabase.from("warehouse_shipments").delete().eq("tracking_id", trackingId),
    supabase.from("notification_messages").delete().eq("entity_type", "shipment").eq("entity_id", trackingId),
    supabase.from("customer_notifications").delete().eq("entity_type", "shipment").eq("entity_id", trackingId)
  ];

  if (shipmentId !== undefined && shipmentId !== null) {
    operations.push(
      supabase.from("shipment_events").delete().eq("shipment_id", shipmentId),
      supabase.from("proof_of_delivery_events").delete().eq("shipment_id", shipmentId),
      supabase.from("warehouse_shipments").delete().eq("shipment_id", shipmentId)
    );
  }

  for (const operation of operations) {
    const { error } = await operation;
    if (error && !isOptionalSchemaError(error)) throw error;
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  const limited = await enforceRateLimit(request, "shipment-update", { limit: 90, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireCloudFeature(request, "operations", ["owner", "admin", "dispatcher", "driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, updateShipmentSchema, "Invalid shipment update.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Shipment updates are temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const current = await fetchShipmentByTracking(supabase, trackingId, {
    companyId: tenant.schemaReady ? tenant.companyId : null
  });
  if (current.error) {
    logShipmentWorkflowError(current.error, "Unable to load shipment before update.", requestContext(request, { trackingId }));
    return NextResponse.json({ error: "Unable to load shipment before update." }, { status: 500 });
  }
  if (!current.data) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  if (isShipmentDriver(access.profile.role, access.tenant?.companyRole)) {
    if (!access.profile.driver_id || String(current.data.driver_id ?? "") !== String(access.profile.driver_id)) {
      return NextResponse.json({ error: "This shipment is not assigned to your driver account." }, { status: 403 });
    }
    if (current.data.assigned_driver?.approval_status !== "approved") {
      return NextResponse.json({ error: "Driver account must be approved before updating shipments." }, { status: 403 });
    }
    if (parsed.data.driverId !== undefined || parsed.data.internalNotes !== undefined) {
      return NextResponse.json({ error: "Drivers cannot reassign shipments or edit internal dispatcher notes." }, { status: 403 });
    }
    if (parsed.data.status && !["PICKED_UP", "IN_TRANSIT", "ARRIVED"].includes(parsed.data.status)) {
      return NextResponse.json({ error: "Use the driver assignment or proof-of-delivery flow for this status change." }, { status: 403 });
    }
  }

  const financialOrBackdateUpdated = [
    parsed.data.driverPayoutAmount,
    parsed.data.driverPayoutStatus,
    parsed.data.driverPayoutNotes,
    parsed.data.carrierCostAmount,
    parsed.data.carrierOrderId,
    parsed.data.carrierTrackingId,
    parsed.data.backdatedAt,
    parsed.data.backdateReason
  ].some((value) => value !== undefined);
  if (financialOrBackdateUpdated && access.profile.role !== "admin") {
    return NextResponse.json({ error: "Only admins can edit payout, carrier cost, or backdate fields." }, { status: 403 });
  }

  const backdatedAt = validDateIso(parsed.data.backdatedAt);
  if (parsed.data.backdatedAt && !backdatedAt) {
    return NextResponse.json({ error: "Backdate must be a valid date and time." }, { status: 400 });
  }

  const detailFields = [
    "customerName",
    "deliveryCategory",
    "freightMode",
    "quoteCurrency",
    "freightClassification",
    "pickupCountry",
    "destinationCountry",
    "customsInformation",
    "packageValue",
    "dutiesTaxesAmount",
    "exportImportDocuments",
    "pickupState",
    "destinationState",
    "customerEmail",
    "customerPhone",
    "recipientName",
    "pickupPhone",
    "deliveryPhone",
    "pickupAddress",
    "deliveryAddress",
    "packageType",
    "weightKg",
    "urgency",
    "paymentAmount"
  ] as const;
  const detailsUpdated = detailFields.some((field) => parsed.data[field] !== undefined);
  const deliveredRecipientCorrection =
    access.profile.role === "admin" &&
    current.data.status === "DELIVERED" &&
    !current.data.recipient_name &&
    Boolean(parsed.data.recipientName) &&
    detailFields.every((field) => field === "recipientName" || parsed.data[field] === undefined);
  if (detailsUpdated && current.data.status === "DELIVERED" && !deliveredRecipientCorrection) {
    return NextResponse.json({ error: "Delivered shipments are locked. Create an admin correction event instead of editing delivery details." }, { status: 409 });
  }

  let verifiedDriverVehicleType: string | null = null;

  if (parsed.data.driverId) {
    let driverQuery = supabase
      .from("drivers")
      .select("id,approval_status,vehicle_type")
      .eq("id", Number(parsed.data.driverId));
    if (tenant.schemaReady && tenant.companyId) {
      driverQuery = driverQuery.eq("company_id", tenant.companyId);
    }
    const driver = await driverQuery.maybeSingle();
    if (driver.error) {
      logShipmentWorkflowError(driver.error, "Unable to verify assigned driver.", requestContext(request, { trackingId, driverId: parsed.data.driverId }));
      return NextResponse.json({ error: "Unable to verify assigned driver." }, { status: 500 });
    }
    if (!driver.data || driver.data.approval_status !== "approved") {
      return NextResponse.json({ error: "Only approved drivers can be assigned to shipments." }, { status: 409 });
    }
    verifiedDriverVehicleType = typeof driver.data.vehicle_type === "string" ? driver.data.vehicle_type : null;
  }

  const nextStatus = parsed.data.status ?? current.data.status;
  const nextDriverId = parsed.data.driverId !== undefined ? parsed.data.driverId : current.data.driver_id ? String(current.data.driver_id) : "";
  const paymentAmount = Number(parsed.data.paymentAmount ?? current.data.payment_amount ?? current.data.quoted_price ?? 0);
  if (isShipmentAtLeast(nextStatus, "CONFIRMED") && paymentAmount > 0 && !isPaymentCleared(current.data.payment_status)) {
    return NextResponse.json({ error: "Payment must be paid before this shipment can be confirmed." }, { status: 409 });
  }
  if (isShipmentAtLeast(nextStatus, "DRIVER_ASSIGNED") && !nextDriverId) {
    return NextResponse.json({ error: "Assign a driver before moving this shipment to driver assigned or beyond." }, { status: 409 });
  }
  if (nextStatus === "DELIVERED" && !current.data.proof_image_url) {
    return NextResponse.json({ error: "Upload proof of delivery before marking this shipment delivered." }, { status: 409 });
  }

  const etaEstimate = estimateShipmentEta({
    pickupState: parsed.data.pickupState ?? current.data.pickup_state,
    destinationState: parsed.data.destinationState ?? current.data.destination_state,
    pickupAddress: current.data.pickup_address,
    deliveryAddress: current.data.delivery_address,
    deliveryCategory: parsed.data.deliveryCategory ?? current.data.delivery_category,
    urgency: current.data.urgency,
    vehicleType: current.data.vehicle_type,
    currentLat: parsed.data.currentLat ?? current.data.current_lat,
    currentLng: parsed.data.currentLng ?? current.data.current_lng
  });
  const nextDeliveryCategory = parsed.data.deliveryCategory ?? current.data.delivery_category;
  const internationalFieldsUpdated = [
    parsed.data.deliveryCategory,
    parsed.data.freightMode,
    parsed.data.quoteCurrency,
    parsed.data.freightClassification,
    parsed.data.customsInformation,
    parsed.data.packageValue,
    parsed.data.exportImportDocuments,
    parsed.data.paymentAmount,
    parsed.data.weightKg
  ].some((value) => value !== undefined);
  const internationalSummary = String(nextDeliveryCategory ?? "").includes("international")
    ? buildInternationalOperationsSummary({
        amountNgn: paymentAmount,
        deliveryCategory: nextDeliveryCategory,
        freightMode: parsed.data.freightMode ?? current.data.freight_mode,
        quoteCurrency: parsed.data.quoteCurrency ?? current.data.quote_currency,
        freightClassification: parsed.data.freightClassification ?? current.data.freight_classification,
        weightKg: parsed.data.weightKg ?? current.data.weight_kg,
        packageValue: parsed.data.packageValue ?? Number(current.data.package_value ?? 0),
        customsInformation: parsed.data.customsInformation ?? current.data.customs_information,
        exportImportDocuments: parsed.data.exportImportDocuments ?? current.data.export_import_documents,
        etaHours: etaEstimate.etaHours
      })
    : null;

  let timeline = current.data.timeline ?? [];
  if (nextStatus && nextStatus !== current.data.status) {
    timeline = appendStatusProgressionEvents(timeline, nextStatus, {
      pickupAddress: current.data.pickup_address,
      deliveryAddress: current.data.delivery_address
    });
  }
  if (parsed.data.driverId !== undefined && String(parsed.data.driverId || "") !== String(current.data.driver_id ?? "")) {
    timeline = appendTimelineEvent(
      timeline,
      makeTimelineEvent(parsed.data.driverId ? "Driver assigned" : "Driver unassigned", current.data.pickup_address)
    );
  }
  if (parsed.data.timelineLabel) {
    timeline = appendTimelineEvent(
      timeline,
      makeTimelineEvent(parsed.data.timelineLabel, parsed.data.timelineLocation, parsed.data.timelineCompleted ?? true)
    );
  }
  if (detailsUpdated) {
    timeline = appendTimelineEvent(
      timeline,
      makeTimelineEvent(deliveredRecipientCorrection ? "Recipient details corrected" : "Shipment details updated", current.data.pickup_address)
    );
  }

  const updates = {
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.driverId !== undefined ? { driver_id: parsed.data.driverId ? Number(parsed.data.driverId) : null } : {}),
    ...(parsed.data.driverId !== undefined && parsed.data.driverId ? { vehicle_type: verifiedDriverVehicleType ?? current.data.vehicle_type ?? null } : {}),
    ...(parsed.data.deliveryCategory !== undefined ? { delivery_category: parsed.data.deliveryCategory || null } : {}),
    ...(parsed.data.deliveryCategory !== undefined ? { shipment_type: shipmentTypeFromDeliveryCategory(parsed.data.deliveryCategory) } : {}),
    ...(internationalFieldsUpdated ? { freight_mode: internationalSummary?.freightMode ?? null } : {}),
    ...(internationalFieldsUpdated ? { quote_currency: internationalSummary?.quoteCurrency ?? parsed.data.quoteCurrency ?? current.data.quote_currency ?? "NGN" } : {}),
    ...(internationalFieldsUpdated ? { freight_classification: internationalSummary?.freightClassification ?? null } : {}),
    ...(internationalFieldsUpdated
      ? {
          commercial_invoice: internationalSummary
            ? {
                required: internationalSummary.commercialInvoiceRequired,
                declared_value: parsed.data.packageValue ?? current.data.package_value ?? null,
                currency: internationalSummary.quoteCurrency,
                documents: internationalSummary.customsDocuments,
                documentation_status: internationalSummary.documentationStatus
              }
            : {}
        }
      : {}),
    ...(internationalFieldsUpdated ? { international_tracking_mode: internationalSummary?.trackingMode ?? null } : {}),
    ...(parsed.data.pickupCountry !== undefined ? { pickup_country: parsed.data.pickupCountry || null } : {}),
    ...(parsed.data.destinationCountry !== undefined ? { destination_country: parsed.data.destinationCountry || null } : {}),
    ...(parsed.data.customsInformation !== undefined ? { customs_information: parsed.data.customsInformation || null } : {}),
    ...(parsed.data.packageValue !== undefined ? { package_value: parsed.data.packageValue } : {}),
    ...(parsed.data.dutiesTaxesAmount !== undefined ? { duties_taxes_amount: parsed.data.dutiesTaxesAmount } : {}),
    ...(parsed.data.exportImportDocuments !== undefined ? { export_import_documents: parsed.data.exportImportDocuments || null } : {}),
    ...(parsed.data.pickupState !== undefined ? { pickup_state: parsed.data.pickupState || null } : {}),
    ...(parsed.data.destinationState !== undefined ? { destination_state: parsed.data.destinationState || null } : {}),
    ...(parsed.data.customerName !== undefined ? { customer_name: parsed.data.customerName || null } : {}),
    ...(parsed.data.customerEmail !== undefined ? { customer_email: parsed.data.customerEmail || null } : {}),
    ...(parsed.data.customerPhone !== undefined ? { customer_phone: parsed.data.customerPhone || null } : {}),
    ...(parsed.data.recipientName !== undefined ? { recipient_name: parsed.data.recipientName || null } : {}),
    ...(parsed.data.pickupPhone !== undefined ? { pickup_phone: parsed.data.pickupPhone || null } : {}),
    ...(parsed.data.deliveryPhone !== undefined ? { delivery_phone: parsed.data.deliveryPhone || null } : {}),
    ...(parsed.data.pickupAddress !== undefined ? { pickup_address: parsed.data.pickupAddress || null } : {}),
    ...(parsed.data.deliveryAddress !== undefined ? { delivery_address: parsed.data.deliveryAddress || null } : {}),
    ...(parsed.data.packageType !== undefined ? { package_type: parsed.data.packageType || null } : {}),
    ...(parsed.data.weightKg !== undefined ? { weight_kg: parsed.data.weightKg } : {}),
    ...(parsed.data.urgency !== undefined ? { urgency: parsed.data.urgency || null } : {}),
    ...(parsed.data.paymentAmount !== undefined ? { payment_amount: parsed.data.paymentAmount } : {}),
    ...(parsed.data.driverPayoutAmount !== undefined ? { driver_payout_amount: parsed.data.driverPayoutAmount || null, driver_payout_updated_at: new Date().toISOString() } : {}),
    ...(parsed.data.driverPayoutStatus !== undefined ? { driver_payout_status: parsed.data.driverPayoutStatus } : {}),
    ...(parsed.data.driverPayoutNotes !== undefined ? { driver_payout_notes: parsed.data.driverPayoutNotes || null, driver_payout_updated_at: new Date().toISOString() } : {}),
    ...(parsed.data.carrierCostAmount !== undefined ? { carrier_cost_amount: parsed.data.carrierCostAmount || null } : {}),
    ...(parsed.data.carrierProvider !== undefined ? {
      carrier_provider: parsed.data.carrierProvider,
      carrier: parsed.data.carrierProvider === "fez_logistics" ? "fez" : parsed.data.carrierProvider
    } : {}),
    ...(parsed.data.carrierOrderId !== undefined ? {
      carrier_order_id: parsed.data.carrierOrderId || null,
      carrier_order_no: parsed.data.carrierOrderId || current.data.carrier_order_no || null,
      carrier_shipment_id: parsed.data.carrierOrderId || current.data.carrier_shipment_id || null,
      carrier_waybill_no: parsed.data.carrierOrderId || current.data.carrier_waybill_no || null
    } : {}),
    ...(parsed.data.carrierTrackingId !== undefined ? {
      carrier_tracking_id: parsed.data.carrierTrackingId || parsed.data.carrierOrderId || null,
      carrier_waybill_no: parsed.data.carrierTrackingId || parsed.data.carrierOrderId || current.data.carrier_waybill_no || null
    } : {}),
    ...(parsed.data.carrierOrderId !== undefined || parsed.data.carrierTrackingId !== undefined || parsed.data.carrierProvider !== undefined ? {
      carrier_status: current.data.carrier_status === "carrier_create_failed" || parsed.data.carrierProvider === "fez_logistics" || parsed.data.carrierProvider === "sendbox"
        ? "manual_carrier_linked"
        : current.data.carrier_status
    } : {}),
    ...(parsed.data.backdatedAt !== undefined && backdatedAt ? { backdated_at: backdatedAt, created_at: backdatedAt } : {}),
    ...(parsed.data.backdateReason !== undefined ? { backdate_reason: parsed.data.backdateReason || null } : {}),
    ...(parsed.data.paymentAmount !== undefined || parsed.data.driverPayoutAmount !== undefined || parsed.data.carrierCostAmount !== undefined
      ? financePatch({
          ...current.data,
          payment_amount: parsed.data.paymentAmount ?? current.data.payment_amount,
          driver_payout_amount: parsed.data.driverPayoutAmount ?? current.data.driver_payout_amount,
          carrier_cost_amount: parsed.data.carrierCostAmount ?? current.data.carrier_cost_amount
        })
      : {}),
    ...(parsed.data.currentLat !== undefined ? { current_lat: parsed.data.currentLat } : {}),
    ...(parsed.data.currentLng !== undefined ? { current_lng: parsed.data.currentLng } : {}),
    ...(parsed.data.eta !== undefined ? { eta: parsed.data.eta } : {}),
    ...(parsed.data.eta === undefined && !current.data.eta && nextStatus !== "DELIVERED" && nextStatus !== "CANCELLED" ? { eta: etaEstimate.etaLabel } : {}),
    ...(parsed.data.internalNotes !== undefined ? { internal_notes: parsed.data.internalNotes || null } : {}),
    ...(nextStatus !== current.data.status ? { customer_status_message: shipmentCustomerMessage(nextStatus) } : {}),
    ...cancellationRefundPatch(nextStatus, current.data, paymentAmount),
    timeline,
    updated_at: new Date().toISOString()
  };

  let updateQuery = supabase
    .from("shipments")
    .update(updates)
    .eq("tracking_id", trackingId.toUpperCase());
  if (tenant.schemaReady && tenant.companyId) updateQuery = updateQuery.eq("company_id", tenant.companyId);
  const { data, error } = await updateQuery.select(shipmentWithDriverSelect).single();

  if (error) {
    logShipmentWorkflowError(error, "Unable to update shipment.", requestContext(request, { trackingId }));
    return NextResponse.json({ error: "Unable to update shipment." }, { status: 500 });
  }

  const driverChanged = parsed.data.driverId !== undefined && String(parsed.data.driverId || "") !== String(current.data.driver_id ?? "");
  let customerNotification: { ok: boolean; provider: string; mode: string } | null = null;
  if ((current.data.customer_phone || current.data.customer_email) && (parsed.data.status && parsed.data.status !== current.data.status || driverChanged && parsed.data.driverId)) {
    try {
      const notification =
        parsed.data.status && parsed.data.status !== current.data.status
          ? shipmentStatusNotification(data.status, data)
          : { workflow: "driver_assigned", message: whatsappMessages.driverAssigned(data) };
      const preferences = await getCustomerNotificationPreferences(supabase, current.data.customer_email);
      const result = await sendCustomerNotification({
        to: current.data.customer_phone,
        message: notification.message,
        workflow: notification.workflow,
        entityType: "shipment",
        entityId: data.tracking_id,
        metadata: { trackingId: data.tracking_id, status: data.status },
        smsFallback: true,
        smsMessage: ["CANCELLED", "EXCEPTION"].includes(String(data.status).toUpperCase())
          ? smsMessages.deliveryFailure(data.tracking_id)
          : smsMessages.criticalShipmentAlert(data.tracking_id, data.status),
        preferences
      });
      customerNotification = {
        ok: result.ok,
        provider: result.results.whatsapp?.provider ?? result.results.sms?.provider ?? "multi_channel",
        mode: result.results.whatsapp?.mode ?? result.results.sms?.mode ?? "failed"
      };
    } catch (notificationError) {
      logShipmentWorkflowError(notificationError, "Unable to prepare shipment status notification.", requestContext(request, { trackingId }));
    }
  }

  const lifecycleEmail =
    parsed.data.status === "DELIVERED" && current.data.status !== "DELIVERED"
      ? await sendShipmentLifecycleEmail(supabase, data as ShipmentRecord, "delivered", request)
      : parsed.data.status === "IN_TRANSIT" && current.data.status !== "IN_TRANSIT"
        ? await sendShipmentLifecycleEmail(supabase, data as ShipmentRecord, "in_transit", request)
        : null;

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "shipment.update",
    entityType: "shipment",
    entityId: trackingId.toUpperCase(),
    metadata: {
      status: parsed.data.status,
      driverId: parsed.data.driverId,
      timelineLabel: parsed.data.timelineLabel,
      detailsUpdated,
      internalNotesUpdated: parsed.data.internalNotes !== undefined,
      financialOrBackdateUpdated,
      customerNotification,
      lifecycleEmail
    },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "shipment",
    message: "Shipment workflow updated.",
    entityType: "shipment",
    entityId: trackingId.toUpperCase(),
    metadata: {
      previousStatus: current.data.status,
      nextStatus: data.status,
      driverId: data.driver_id,
      timelineLabel: parsed.data.timelineLabel,
      detailsUpdated,
      financialOrBackdateUpdated,
      customerNotification,
      lifecycleEmail
    },
    request
  });

  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const limited = await enforceRateLimit(request, "admin-shipment-delete", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const { trackingId } = await params;
  const access = await requireCloudFeature(request, "shipment_management", ["owner", "admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const normalizedTrackingId = trackingId.trim().toUpperCase();
  if (!normalizedTrackingId) return NextResponse.json({ error: "Tracking ID is required." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Shipment deletion is temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const current = await fetchShipmentByTracking(supabase, normalizedTrackingId, {
    companyId: tenant.schemaReady ? tenant.companyId : null
  });
  if (current.error) {
    logShipmentWorkflowError(current.error, "Unable to load shipment before deletion.", requestContext(request, { trackingId: normalizedTrackingId }));
    return NextResponse.json({ error: "Unable to load shipment before deletion." }, { status: 500 });
  }
  if (!current.data) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });

  try {
    await writeAuditLog(supabase, {
      actor: access.profile,
      action: "shipment.delete",
      entityType: "shipment",
      entityId: normalizedTrackingId,
      metadata: {
        status: current.data.status,
        paymentStatus: current.data.payment_status,
        customerName: current.data.customer_name,
        carrierProvider: current.data.carrier_provider
      },
      request
    });

    await deleteRelatedShipmentRows(supabase, current.data);

    let deleteQuery = supabase
      .from("shipments")
      .delete()
      .eq("tracking_id", normalizedTrackingId);
    if (tenant.schemaReady && tenant.companyId) deleteQuery = deleteQuery.eq("company_id", tenant.companyId);
    const deleted = await deleteQuery.select("tracking_id").maybeSingle();

    if (deleted.error) throw deleted.error;

    await writeOperationalEvent(supabase, {
      category: "shipment",
      severity: "warning",
      message: "Shipment deleted by admin.",
      entityType: "shipment",
      entityId: normalizedTrackingId,
      metadata: {
        status: current.data.status,
        carrierProvider: current.data.carrier_provider
      },
      request
    });

    return NextResponse.json({ ok: true, trackingId: normalizedTrackingId });
  } catch (error) {
    logShipmentWorkflowError(error, "Unable to delete shipment.", requestContext(request, { trackingId: normalizedTrackingId }));
    return NextResponse.json({ error: "Unable to delete shipment." }, { status: 500 });
  }
}
