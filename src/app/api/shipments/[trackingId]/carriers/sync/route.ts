import { NextResponse } from "next/server";
import { z } from "zod";
import { carrierProviders, isExternalCarrierProvider, normalizeCarrierProvider } from "@/lib/carriers";
import { fetchShipmentByTracking } from "@/lib/shipment-data";
import { shipmentMarginPercent, shipmentProfit } from "@/lib/shipment-finance";
import { requireRole } from "@/lib/request-auth";
import { customerTrackingMessageForCarrierStatus, mapCarrierStatusToFlyStatus } from "@/lib/tracking-status";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { handleApiError, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { updateShipmentCarrierFields } from "@/server/carrier-storage";
import { refreshCarrierTrackingForFlyNumber } from "@/server/carrier-tracking";
import { syncCarrierShipment } from "@/server/carriers";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

const syncCarrierSchema = z.object({
  provider: z.enum(carrierProviders).optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  try {
    const { trackingId } = await params;
    const access = await requireRole(request, ["admin", "dispatcher"]);
    if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

    const parsed = await parseJson(request, syncCarrierSchema, "Invalid carrier sync request.");
    if (parsed.response) return parsed.response;

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Carrier tracking sync is temporarily unavailable." }, { status: 503 });

    const current = await fetchShipmentByTracking(supabase, trackingId);
    if (current.error) {
      logApiError(current.error, "Unable to load shipment for carrier sync.", requestContext(request, { trackingId }));
      return NextResponse.json({ error: "Unable to load shipment for carrier sync." }, { status: 500 });
    }
    if (!current.data) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });

    const shipmentForSync = parsed.data.provider ? { ...current.data, carrier_provider: parsed.data.provider } : current.data;
    const selectedProvider = normalizeCarrierProvider(shipmentForSync.carrier_provider ?? shipmentForSync.carrier);
    if (isExternalCarrierProvider(selectedProvider)) {
      const refreshed = await refreshCarrierTrackingForFlyNumber(supabase, current.data.tracking_id, request, {
        providerOverride: selectedProvider
      });
      if (refreshed.error || !refreshed.data) {
        return NextResponse.json({ error: refreshed.error ?? "Unable to refresh carrier status." }, { status: 502 });
      }

      await writeAuditLog(supabase, {
        actor: access.profile,
        action: "shipment.carrier_sync",
        entityType: "shipment",
        entityId: current.data.tracking_id,
        metadata: { provider: selectedProvider, carrierStatus: refreshed.data.carrier_status },
        request
      });

      await writeOperationalEvent(supabase, {
        category: "shipment",
        message: "Carrier tracking status synced.",
        entityType: "shipment",
        entityId: current.data.tracking_id,
        metadata: { provider: selectedProvider, carrierStatus: refreshed.data.carrier_status },
        request
      });

      return NextResponse.json({
        shipment: refreshed.data,
        carrier: {
          provider: selectedProvider,
          carrierStatus: refreshed.data.carrier_status,
          carrierTrackingId: refreshed.data.carrier_tracking_id,
          carrierOrderId: refreshed.data.carrier_order_no ?? refreshed.data.carrier_order_id
        }
      });
    }

    const result = await syncCarrierShipment(shipmentForSync);
    if (!result.ok) {
      await writeOperationalEvent(supabase, {
        category: "shipment",
        severity: "warning",
        message: "Carrier tracking sync failed.",
        entityType: "shipment",
        entityId: current.data.tracking_id,
        metadata: { provider: shipmentForSync.carrier_provider, error: result.error, status: result.status },
        request
      });
      return NextResponse.json({ error: result.error }, { status: result.status && result.status >= 400 ? 502 : 409 });
    }

    const mappedStatus = mapCarrierStatusToFlyStatus(result.data.carrierStatus);
    const carrierReference =
      result.data.provider === "fez_logistics"
        ? [
            current.data.carrier_order_no,
            current.data.carrier_order_id,
            result.data.carrierOrderId,
            result.data.carrierTrackingId,
            current.data.carrier_tracking_id,
            current.data.carrier_waybill_no,
            current.data.carrier_shipment_id
          ].find((value) => {
            const text = String(value ?? "").trim();
            return text && !text.toUpperCase().startsWith("FLY-");
          }) ?? null
        : null;
    const carrierRateAmount = Number(result.data.carrierRateAmount ?? 0);
    const carrierFinancePatch = Number.isFinite(carrierRateAmount) && carrierRateAmount > 0
      ? {
          carrier_rate_amount: carrierRateAmount,
          carrier_cost_amount: carrierRateAmount,
          carrier_profit_amount: shipmentProfit({
            ...current.data,
            carrier_provider: result.data.provider,
            carrier_rate_amount: carrierRateAmount,
            carrier_cost_amount: carrierRateAmount
          }),
          carrier_margin_percent: shipmentMarginPercent({
            ...current.data,
            carrier_provider: result.data.provider,
            carrier_rate_amount: carrierRateAmount,
            carrier_cost_amount: carrierRateAmount
          })
        }
      : {};
    const { data: shipment, error, removedColumns } = await updateShipmentCarrierFields(supabase, current.data.tracking_id, {
      carrier_provider: result.data.provider,
      carrier: result.data.provider === "fez_logistics" ? "fez" : result.data.provider,
      carrier_tracking_id: result.data.provider === "fez_logistics" ? carrierReference : result.data.carrierTrackingId ?? current.data.carrier_tracking_id ?? null,
      carrier_order_id: result.data.provider === "fez_logistics" ? carrierReference : current.data.carrier_order_id ?? null,
      carrier_order_no: result.data.provider === "fez_logistics" ? carrierReference : current.data.carrier_order_no ?? null,
      carrier_waybill_no: result.data.provider === "fez_logistics" ? result.data.carrierTrackingId ?? carrierReference : result.data.carrierTrackingId ?? current.data.carrier_waybill_no ?? null,
      carrier_status: result.data.carrierStatus ?? current.data.carrier_status ?? "synced",
      carrier_response: result.data.rawResponse ?? {},
      carrier_error: null,
      carrier_raw_response: result.data.rawResponse ?? {},
      carrier_synced_at: new Date().toISOString(),
      external_tracking_enabled: false,
      ...carrierFinancePatch,
      ...(mappedStatus ? { status: mappedStatus, customer_status_message: customerTrackingMessageForCarrierStatus(mappedStatus, result.data.carrierStatus) } : {})
    });

    if (error) {
      logApiError(error, "Unable to save carrier sync result.", requestContext(request, { trackingId }));
      return NextResponse.json({ error: "Unable to save carrier sync result." }, { status: 500 });
    }

    await writeAuditLog(supabase, {
      actor: access.profile,
      action: "shipment.carrier_sync",
      entityType: "shipment",
      entityId: current.data.tracking_id,
      metadata: { provider: result.data.provider, carrierStatus: result.data.carrierStatus, removedColumns },
      request
    });

    await writeOperationalEvent(supabase, {
      category: "shipment",
      message: "Carrier tracking status synced.",
      entityType: "shipment",
      entityId: current.data.tracking_id,
      metadata: { provider: result.data.provider, carrierStatus: result.data.carrierStatus, removedColumns },
      request
    });

    return NextResponse.json({ shipment, carrier: result.data });
  } catch (error) {
    return handleApiError(error, request, "Unable to refresh carrier status. Check carrier diagnostics and retry.");
  }
}
