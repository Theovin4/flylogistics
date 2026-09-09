import type { getSupabaseAdmin } from "@/lib/supabase-server";
import { shipmentWithDriverSelect } from "@/lib/shipment-data";
import type { ShipmentRecord } from "@/lib/shipments";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const optionalCarrierColumns = new Set([
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
  "external_tracking_enabled"
]);

function missingColumnFromPostgrest(error: { code?: string; message?: string } | null) {
  if (error?.code !== "PGRST204") return null;
  return error.message?.match(/'([^']+)' column/)?.[1] ?? null;
}

export async function updateShipmentCarrierFields(
  supabase: SupabaseAdminClient,
  trackingId: string,
  updates: Record<string, unknown>
) {
  const nextPayload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt <= optionalCarrierColumns.size; attempt += 1) {
    const result = await supabase
      .from("shipments")
      .update(nextPayload)
      .eq("tracking_id", trackingId.toUpperCase())
      .select(shipmentWithDriverSelect)
      .single();

    if (!result.error) return { data: result.data as ShipmentRecord, error: null, removedColumns };

    const missingColumn = missingColumnFromPostgrest(result.error);
    if (!missingColumn || !optionalCarrierColumns.has(missingColumn) || !(missingColumn in nextPayload)) {
      return { data: null, error: result.error, removedColumns };
    }

    delete nextPayload[missingColumn];
    removedColumns.push(missingColumn);
  }

  return {
    data: null,
    error: {
      code: "SCHEMA_FALLBACK_EXHAUSTED",
      message: "Unable to save carrier fields because optional schema fallback was exhausted."
    },
    removedColumns
  };
}
