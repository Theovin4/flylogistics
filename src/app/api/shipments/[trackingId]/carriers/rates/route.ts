import { NextResponse } from "next/server";
import { z } from "zod";
import { carrierProviders, isExternalCarrierProvider, normalizeCarrierProvider } from "@/lib/carriers";
import { shipmentMarginPercent, shipmentProfit } from "@/lib/shipment-finance";
import { fetchShipmentByTracking } from "@/lib/shipment-data";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { handleApiError, parseJson } from "@/server/api";
import { updateShipmentCarrierFields } from "@/server/carrier-storage";
import { getCarrierRates } from "@/server/carriers";
import { logApiError, requestContext } from "@/server/monitoring";
import { requireCloudFeature } from "@/server/tenancy";

const carrierRatesSchema = z.object({
  provider: z.enum(carrierProviders).optional(),
  providers: z.array(z.enum(carrierProviders)).optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  try {
    const { trackingId } = await params;
    const access = await requireCloudFeature(request, "operations", ["owner", "admin", "dispatcher"]);
    if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

    const parsed = await parseJson(request, carrierRatesSchema, "Invalid carrier rate request.");
    if (parsed.response) return parsed.response;

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Carrier rates are temporarily unavailable." }, { status: 503 });

    const current = await fetchShipmentByTracking(supabase, trackingId);
    if (current.error) {
      logApiError(current.error, "Unable to load shipment for carrier rates.", requestContext(request, { trackingId }));
      return NextResponse.json({ error: "Unable to load shipment for carrier rates." }, { status: 500 });
    }
    if (!current.data) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
    if (access.tenant?.schemaReady && access.tenant.companyId && (current.data as { company_id?: string | null }).company_id !== access.tenant.companyId) {
      return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
    }

    const providers = parsed.data.providers ?? (parsed.data.provider ? [parsed.data.provider] : undefined);
    const result = await getCarrierRates(current.data, providers);
    const selectedProvider = providers?.map(normalizeCarrierProvider).find(isExternalCarrierProvider) ?? null;
    const selectedRate = selectedProvider
      ? result.rates.find((rate) => rate.provider === selectedProvider && Number.isFinite(Number(rate.amount)))
      : null;
    let shipment = current.data;

    if (selectedProvider && selectedRate?.amount !== null && selectedRate?.amount !== undefined) {
      const amount = Number(selectedRate.amount);
      const updated = await updateShipmentCarrierFields(supabase, current.data.tracking_id, {
        carrier_provider: selectedProvider,
        carrier_rate_amount: amount,
        carrier_cost_amount: amount,
        carrier_profit_amount: shipmentProfit({
          ...current.data,
          carrier_provider: selectedProvider,
          carrier_rate_amount: amount,
          carrier_cost_amount: amount
        }),
        carrier_margin_percent: shipmentMarginPercent({
          ...current.data,
          carrier_provider: selectedProvider,
          carrier_rate_amount: amount,
          carrier_cost_amount: amount
        }),
        carrier_status: current.data.carrier_status ?? "rate_quoted",
        carrier_synced_at: new Date().toISOString()
      });
      if (updated.error) {
        logApiError(updated.error, "Unable to save carrier rate estimate.", requestContext(request, { trackingId, provider: selectedProvider }));
      } else if (updated.data) {
        shipment = updated.data;
      }
    }

    return NextResponse.json({
      rates: result.rates,
      errors: result.errors,
      shipment
    });
  } catch (error) {
    return handleApiError(error, request, "Unable to compare carrier rates. Check carrier diagnostics and retry.");
  }
}
