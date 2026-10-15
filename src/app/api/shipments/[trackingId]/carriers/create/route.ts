import { NextResponse } from "next/server";
import { z } from "zod";
import { carrierProviders, carrierProviderLabels, isExternalCarrierProvider } from "@/lib/carriers";
import { shipmentMarginPercent, shipmentProfit } from "@/lib/shipment-finance";
import { fetchShipmentByTracking } from "@/lib/shipment-data";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { handleApiError, parseJson } from "@/server/api";
import { debitAdminWalletForCarrier } from "@/server/admin-wallet";
import { writeAuditLog } from "@/server/audit";
import { enqueueBackgroundJob } from "@/server/background-jobs";
import { updateShipmentCarrierFields } from "@/server/carrier-storage";
import { refreshCarrierTrackingForFlyNumber } from "@/server/carrier-tracking";
import { createCarrierShipment, getCarrierRates } from "@/server/carriers";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { requireCloudFeature } from "@/server/tenancy";

const createCarrierSchema = z.object({
  provider: z.enum(carrierProviders),
  rateId: z.string().trim().optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  try {
    const { trackingId } = await params;
    const access = await requireCloudFeature(request, "operations", ["owner", "admin", "dispatcher"]);
    if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

    const parsed = await parseJson(request, createCarrierSchema, "Invalid carrier fulfilment request.");
    if (parsed.response) return parsed.response;

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Carrier fulfilment is temporarily unavailable." }, { status: 503 });

    const current = await fetchShipmentByTracking(supabase, trackingId);
    if (current.error) {
      logApiError(current.error, "Unable to load shipment for carrier fulfilment.", requestContext(request, { trackingId }));
      return NextResponse.json({ error: "Unable to load shipment for carrier fulfilment." }, { status: 500 });
    }
    if (!current.data) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
    if (access.tenant?.schemaReady && access.tenant.companyId && (current.data as { company_id?: string | null }).company_id !== access.tenant.companyId) {
      return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
    }

    let shipmentForCarrier = current.data;
    let carrierCostEstimate: number | null = null;
    if (isExternalCarrierProvider(parsed.data.provider)) {
      const rateResult = await getCarrierRates(current.data, [parsed.data.provider]);
      const rate = rateResult.rates.find((item) => item.provider === parsed.data.provider && Number.isFinite(Number(item.amount)));
      carrierCostEstimate = rate?.amount !== null && rate?.amount !== undefined ? Number(rate.amount) : null;
      if (carrierCostEstimate !== null) {
        shipmentForCarrier = {
          ...current.data,
          carrier_provider: parsed.data.provider,
          carrier_rate_amount: carrierCostEstimate,
          carrier_cost_amount: carrierCostEstimate
        };
      }
    }

    const result = await createCarrierShipment(shipmentForCarrier, parsed.data.provider, parsed.data.rateId);
    if (!result.ok) {
      const estimatedCarrierUpdates = carrierCostEstimate !== null
        ? {
            carrier_rate_amount: carrierCostEstimate,
            carrier_cost_amount: carrierCostEstimate,
            carrier_profit_amount: shipmentProfit({
              ...current.data,
              carrier_provider: parsed.data.provider,
              carrier_rate_amount: carrierCostEstimate,
              carrier_cost_amount: carrierCostEstimate
            }),
            carrier_margin_percent: shipmentMarginPercent({
              ...current.data,
              carrier_provider: parsed.data.provider,
              carrier_rate_amount: carrierCostEstimate,
              carrier_cost_amount: carrierCostEstimate
            })
          }
        : {};
      const existingExternalReference = [
        current.data.carrier_order_no,
        current.data.carrier_order_id,
        current.data.carrier_tracking_id,
        current.data.carrier_waybill_no,
        current.data.carrier_shipment_id
      ].find((value) => {
        const text = String(value ?? "").trim();
        return text && !text.toUpperCase().startsWith("FLY-");
      }) ?? null;
      const fallback = await updateShipmentCarrierFields(supabase, current.data.tracking_id, {
        carrier_provider: parsed.data.provider,
        carrier: parsed.data.provider === "fez_logistics" ? "fez" : parsed.data.provider,
        carrier_tracking_id: existingExternalReference,
        carrier_order_id: existingExternalReference,
        carrier_order_no: existingExternalReference,
        carrier_shipment_id: existingExternalReference,
        carrier_waybill_no: existingExternalReference,
        carrier_status: "carrier_create_failed",
        ...estimatedCarrierUpdates,
        carrier_error: result.error,
        carrier_response: {
          error: result.error,
          status: result.status ?? null,
          provider: parsed.data.provider
        },
        carrier_raw_response: {
          error: result.error,
          status: result.status ?? null,
          provider: parsed.data.provider
        },
        carrier_synced_at: new Date().toISOString(),
        external_tracking_enabled: false
      });

      if (fallback.error) {
        logApiError(fallback.error, "Carrier creation failed and fallback carrier status could not be saved.", requestContext(request, { trackingId, provider: parsed.data.provider }));
      }

      if (parsed.data.provider === "fez_logistics" && fallback.data) {
        const reconciled = await refreshCarrierTrackingForFlyNumber(supabase, fallback.data.tracking_id, request);
        if (!reconciled.error && reconciled.data && String(reconciled.data.carrier_status ?? "").toLowerCase() !== "carrier_create_failed") {
          await writeAuditLog(supabase, {
            actor: access.profile,
            action: "shipment.carrier_reconciled_after_create_warning",
            entityType: "shipment",
            entityId: current.data.tracking_id,
            metadata: { provider: parsed.data.provider, originalError: result.error },
            request
          });

          await writeOperationalEvent(supabase, {
            category: "shipment",
            message: "FEZ fulfilment was reconciled after an ambiguous create response.",
            entityType: "shipment",
            entityId: current.data.tracking_id,
            metadata: { provider: parsed.data.provider, originalError: result.error, status: reconciled.data.carrier_status },
            request
          });

          return NextResponse.json({
            shipment: reconciled.data,
            carrier: {
              provider: "fez_logistics",
              carrierStatus: reconciled.data.carrier_status,
              carrierTrackingId: reconciled.data.carrier_tracking_id,
              carrierOrderId: reconciled.data.carrier_order_no ?? reconciled.data.carrier_order_id
            },
            reconciled: true
          });
        }
      }

      await writeOperationalEvent(supabase, {
        category: "shipment",
        severity: "warning",
        message: "Carrier shipment creation failed; carrier selection saved for retry.",
        entityType: "shipment",
        entityId: current.data.tracking_id,
        metadata: { provider: parsed.data.provider, error: result.error, status: result.status },
        request
      });
      await enqueueBackgroundJob(supabase, {
        jobType: "carrier_sync",
        entityType: "shipment",
        entityId: current.data.tracking_id,
        companyId: (current.data as { company_id?: string | null }).company_id ?? null,
        payload: {
          trackingId: current.data.tracking_id,
          provider: parsed.data.provider,
          source: "manual_carrier_create_retry_after_failure"
        },
        runAt: new Date(Date.now() + 120_000).toISOString()
      });
      return NextResponse.json({
        error: result.error,
        fallback: "Shipment remains managed by Fly Logistics.",
        shipment: fallback.data,
        provider: parsed.data.provider
      }, { status: result.status && result.status >= 400 ? 502 : 409 });
    }

    const carrierOrderReference =
      result.data.carrierOrderId ??
      result.data.carrierShipmentId ??
      result.data.carrierTrackingId ??
      null;
    const carrierTrackingReference =
      result.data.carrierTrackingId ??
      result.data.carrierOrderId ??
      result.data.carrierShipmentId ??
      null;

    const { data: initialShipment, error, removedColumns } = await updateShipmentCarrierFields(supabase, current.data.tracking_id, {
      carrier_provider: result.data.provider,
      carrier: result.data.provider === "fez_logistics" ? "fez" : result.data.provider,
      carrier_shipment_id: result.data.carrierShipmentId ?? carrierOrderReference,
      carrier_tracking_id: carrierTrackingReference,
      carrier_order_id: carrierOrderReference,
      carrier_order_no: carrierOrderReference,
      carrier_waybill_no: carrierTrackingReference,
      carrier_label_url: result.data.carrierLabelUrl ?? null,
      carrier_rate_amount: result.data.carrierRateAmount ?? carrierCostEstimate ?? current.data.carrier_rate_amount ?? null,
      carrier_cost_amount: result.data.carrierRateAmount ?? carrierCostEstimate ?? current.data.carrier_cost_amount ?? null,
      carrier_profit_amount: shipmentProfit({
        ...current.data,
        carrier_provider: result.data.provider,
        carrier_rate_amount: result.data.carrierRateAmount ?? carrierCostEstimate ?? current.data.carrier_rate_amount ?? null,
        carrier_cost_amount: result.data.carrierRateAmount ?? carrierCostEstimate ?? current.data.carrier_cost_amount ?? null
      }),
      carrier_margin_percent: shipmentMarginPercent({
        ...current.data,
        carrier_provider: result.data.provider,
        carrier_rate_amount: result.data.carrierRateAmount ?? carrierCostEstimate ?? current.data.carrier_rate_amount ?? null,
        carrier_cost_amount: result.data.carrierRateAmount ?? carrierCostEstimate ?? current.data.carrier_cost_amount ?? null
      }),
      carrier_status: result.data.carrierStatus ?? "created",
      carrier_response: result.data.rawResponse ?? {},
      carrier_error: null,
      carrier_raw_response: result.data.rawResponse ?? {},
      carrier_synced_at: new Date().toISOString(),
      external_tracking_enabled: false
    });

    if (error) {
      logApiError(error, "Carrier shipment was created but could not be saved.", requestContext(request, { trackingId, provider: parsed.data.provider }));
      return NextResponse.json({ error: "Carrier shipment was created, but Fly Logistics could not save the carrier details." }, { status: 500 });
    }

    let shipment = initialShipment;
    if (result.data.provider === "fez_logistics" && initialShipment) {
      const synced = await refreshCarrierTrackingForFlyNumber(supabase, initialShipment.tracking_id, request);
      if (!synced.error && synced.data) shipment = synced.data;
    }

    const adminWalletDebit = isExternalCarrierProvider(result.data.provider)
      ? await debitAdminWalletForCarrier(supabase, {
          amount: result.data.carrierRateAmount ?? carrierCostEstimate,
          trackingId: current.data.tracking_id,
          provider: result.data.provider,
          carrierReference: result.data.carrierOrderId ?? result.data.carrierTrackingId ?? null
        })
      : null;

    await writeAuditLog(supabase, {
      actor: access.profile,
      action: "shipment.carrier_create",
      entityType: "shipment",
      entityId: current.data.tracking_id,
      metadata: { provider: result.data.provider, carrierTrackingId: result.data.carrierTrackingId, adminWalletDebit, removedColumns },
      request
    });

    await writeOperationalEvent(supabase, {
      category: "shipment",
      message: `Shipment fulfilment provider set to ${carrierProviderLabels[result.data.provider]}.`,
      entityType: "shipment",
      entityId: current.data.tracking_id,
      metadata: { provider: result.data.provider, carrierStatus: result.data.carrierStatus, adminWalletDebit, removedColumns },
      request
    });

    await enqueueBackgroundJob(supabase, {
      jobType: "carrier_sync",
      entityType: "shipment",
      entityId: current.data.tracking_id,
      companyId: (current.data as { company_id?: string | null }).company_id ?? null,
      payload: {
        trackingId: current.data.tracking_id,
        provider: result.data.provider,
        source: "manual_carrier_create"
      },
      runAt: new Date(Date.now() + 120_000).toISOString()
    });

    return NextResponse.json({ shipment, carrier: result.data, adminWalletDebit });
  } catch (error) {
    return handleApiError(error, request, "Unable to create carrier fulfilment. Check the carrier diagnostics and retry.");
  }
}
