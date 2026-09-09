import { isExternalCarrierProvider, normalizeCarrierProvider, type CarrierProvider } from "@/lib/carriers";
import { appendStatusProgressionEvents, appendTimelineEvent, fetchShipmentByTracking } from "@/lib/shipment-data";
import { shipmentMarginPercent, shipmentProfit } from "@/lib/shipment-finance";
import type { ShipmentRecord } from "@/lib/shipments";
import { customerTrackingMessageForCarrierStatus, makeFlyTrackingTimelineEvent, mapCarrierStatusToFlyStatus } from "@/lib/tracking-status";
import type { getSupabaseAdmin } from "@/lib/supabase-server";
import { updateShipmentCarrierFields } from "@/server/carrier-storage";
import { syncCarrierShipment } from "@/server/carriers";
import { logWarn, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

function publicCarrierValue(provider: CarrierProvider) {
  return provider === "fez_logistics" ? "fez" : provider;
}

function firstNonFlyReference(...values: Array<string | null | undefined>) {
  return values.find((value) => {
    const text = String(value ?? "").trim();
    return text && !text.toUpperCase().startsWith("FLY-");
  }) ?? null;
}

function trackingEventLocation(shipment: ShipmentRecord, status?: string | null) {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (["PENDING", "PENDING_PICKUP", "CONFIRMED", "DRIVER_ASSIGNED", "PICKED_UP"].includes(normalized)) {
    return shipment.pickup_address;
  }
  return shipment.delivery_address;
}

async function insertCarrierShipmentEvent(
  supabase: SupabaseAdminClient,
  shipment: ShipmentRecord,
  status: string | null | undefined,
  carrierStatus: string | null | undefined,
  source: string,
  rawPayload: unknown
) {
  const event = makeFlyTrackingTimelineEvent(status, trackingEventLocation(shipment, status), carrierStatus);
  const payload = {
    shipment_id: shipment.id,
    tracking_id: shipment.tracking_id,
    label: event.label,
    title: event.title,
    location: event.location,
    completed: true,
    status: status ?? carrierStatus ?? "synced",
    description: event.description,
    source,
    raw_payload: rawPayload,
    metadata: { source, status: status ?? null, carrierStatus: carrierStatus ?? null },
    created_at: new Date().toISOString()
  };

  const { error } = await supabase.from("shipment_events").insert(payload);
  if (error && !["42P01", "42703", "PGRST204"].includes(error.code ?? "")) {
    logWarn("Unable to write carrier shipment event.", {
      trackingId: shipment.tracking_id,
      source,
      status,
      error: error.message,
      code: error.code
    });
  }
}

export async function refreshCarrierTrackingForFlyNumber(
  supabase: SupabaseAdminClient | null,
  trackingId: string,
  request?: Request,
  options: { providerOverride?: unknown } = {}
) {
  if (!supabase) return { data: null as ShipmentRecord | null, error: "Shipment tracking is not configured." };

  const current = await fetchShipmentByTracking(supabase, trackingId);
  if (current.error || !current.data) return current;

  const shipment = current.data;
  const provider = normalizeCarrierProvider(options.providerOverride ?? shipment.carrier_provider ?? shipment.carrier);
  if (!isExternalCarrierProvider(provider)) return current;

  let result;
  try {
    result = await syncCarrierShipment({ ...shipment, carrier_provider: provider });
  } catch (error) {
    logWarn("Carrier tracking refresh threw during Fly Logistics tracking lookup.", request ? requestContext(request, {
      trackingId: shipment.tracking_id,
      provider,
      error: error instanceof Error ? error.message : String(error)
    }) : {
      trackingId: shipment.tracking_id,
      provider,
      error: error instanceof Error ? error.message : String(error)
    });

    await writeOperationalEvent(supabase, {
      category: "shipment",
      severity: "warning",
      message: "Carrier tracking refresh could not complete; serving local Fly Logistics tracking state.",
      entityType: "shipment",
      entityId: shipment.tracking_id,
      metadata: { provider, error: error instanceof Error ? error.message : String(error) },
      request
    });

    return current;
  }

  if (!result.ok) {
    await updateShipmentCarrierFields(supabase, shipment.tracking_id, {
      carrier: publicCarrierValue(provider),
      carrier_provider: provider,
      carrier_order_no: shipment.carrier_order_no ?? shipment.carrier_order_id ?? null,
      carrier_status: shipment.carrier_status ?? "carrier_sync_failed",
      carrier_error: result.error,
      carrier_response: result.rawResponse ?? {},
      carrier_raw_response: result.rawResponse ?? {},
      carrier_synced_at: new Date().toISOString(),
      external_tracking_enabled: false
    });

    await writeOperationalEvent(supabase, {
      category: "shipment",
      severity: "warning",
      message: "Carrier tracking refresh failed during Fly Logistics tracking lookup.",
      entityType: "shipment",
      entityId: shipment.tracking_id,
      metadata: { provider, status: result.status, error: result.error },
      request
    });

    return current;
  }

  const mappedStatus = mapCarrierStatusToFlyStatus(result.data.carrierStatus);
  const carrierReference = firstNonFlyReference(
    result.data.carrierOrderId,
    result.data.carrierTrackingId,
    shipment.carrier_order_no,
    shipment.carrier_order_id,
    shipment.carrier_tracking_id,
    shipment.carrier_waybill_no,
    shipment.carrier_shipment_id
  );
  const progressedTimeline = mappedStatus
    ? appendStatusProgressionEvents(shipment.timeline, mappedStatus, {
        pickupAddress: shipment.pickup_address,
        deliveryAddress: shipment.delivery_address
      })
    : shipment.timeline;
  const nextTimeline = mappedStatus
    ? appendTimelineEvent(
        progressedTimeline,
        makeFlyTrackingTimelineEvent(mappedStatus, trackingEventLocation(shipment, mappedStatus), result.data.carrierStatus)
      )
    : progressedTimeline;
  const carrierRateAmount = Number(result.data.carrierRateAmount ?? 0);
  const carrierFinancePatch = Number.isFinite(carrierRateAmount) && carrierRateAmount > 0
    ? {
        carrier_rate_amount: carrierRateAmount,
        carrier_cost_amount: carrierRateAmount,
        carrier_profit_amount: shipmentProfit({
          ...shipment,
          carrier_provider: provider,
          carrier_rate_amount: carrierRateAmount,
          carrier_cost_amount: carrierRateAmount
        }),
        carrier_margin_percent: shipmentMarginPercent({
          ...shipment,
          carrier_provider: provider,
          carrier_rate_amount: carrierRateAmount,
          carrier_cost_amount: carrierRateAmount
        })
      }
    : {};

  const update = await updateShipmentCarrierFields(supabase, shipment.tracking_id, {
    carrier: publicCarrierValue(provider),
    carrier_provider: provider,
    carrier_tracking_id: provider === "fez_logistics" ? carrierReference ?? shipment.carrier_tracking_id ?? null : result.data.carrierTrackingId ?? shipment.carrier_tracking_id ?? null,
    carrier_order_id: provider === "fez_logistics" ? shipment.carrier_order_id ?? carrierReference ?? null : result.data.carrierOrderId ?? shipment.carrier_order_id ?? null,
    carrier_order_no: provider === "fez_logistics" ? shipment.carrier_order_no ?? shipment.carrier_order_id ?? carrierReference ?? null : shipment.carrier_order_no ?? null,
    carrier_waybill_no: provider === "fez_logistics" ? carrierReference ?? shipment.carrier_waybill_no ?? null : result.data.carrierTrackingId ?? shipment.carrier_waybill_no ?? null,
    carrier_status: result.data.carrierStatus ?? shipment.carrier_status ?? "synced",
    carrier_response: result.data.rawResponse ?? {},
    carrier_error: null,
    carrier_raw_response: result.data.rawResponse ?? {},
    carrier_synced_at: new Date().toISOString(),
    external_tracking_enabled: false,
    ...carrierFinancePatch,
    timeline: nextTimeline,
    ...(mappedStatus ? { status: mappedStatus, customer_status_message: customerTrackingMessageForCarrierStatus(mappedStatus, result.data.carrierStatus) } : {})
  });

  if (update.error || !update.data) {
    logWarn("Unable to persist carrier tracking refresh.", request ? requestContext(request, {
      trackingId: shipment.tracking_id,
      provider,
      error: update.error?.message
    }) : {
      trackingId: shipment.tracking_id,
      provider,
      error: update.error?.message
    });
    return current;
  }

  await insertCarrierShipmentEvent(
    supabase,
    update.data,
    mappedStatus ?? null,
    result.data.carrierStatus ?? null,
    provider === "fez_logistics" ? "fez" : provider,
    result.data.rawResponse ?? {}
  );

  return { data: update.data, error: null };
}
