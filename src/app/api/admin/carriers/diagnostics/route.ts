import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { checkFezHealth, checkSendboxHealth, getFezConfig, getSendboxConfig } from "@/server/carrier-config";
import { logApiError, requestContext } from "@/server/monitoring";

export const dynamic = "force-dynamic";

type OperationalEventRow = {
  created_at?: string | null;
  message?: string | null;
  severity?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ShipmentCarrierRow = {
  tracking_id?: string | null;
  carrier_status?: string | null;
  updated_at?: string | null;
  carrier_synced_at?: string | null;
};

function isProviderEvent(row: OperationalEventRow, provider: string) {
  const metadata = row.metadata ?? {};
  return String(metadata.provider ?? "").toLowerCase() === provider || String(row.message ?? "").toLowerCase().includes(provider.replace("_", " "));
}

function eventError(row: OperationalEventRow | null) {
  const metadata = row?.metadata ?? {};
  const error = metadata.error ?? metadata.message ?? metadata.description;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (typeof error === "number") return String(error);
  return null;
}

function eventStatus(row: OperationalEventRow | null) {
  const metadata = row?.metadata ?? {};
  const status = metadata.status ?? metadata.statusCode ?? metadata.httpStatus;
  if (typeof status === "string" && status.trim()) return status.trim();
  if (typeof status === "number") return status;
  return null;
}

export async function GET(request: Request) {
  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const config = getSendboxConfig("admin_diagnostics");
  const fezConfig = getFezConfig("admin_diagnostics");
  const health = await checkSendboxHealth();
  const fezHealth = await checkFezHealth();
  const supabase = getSupabaseAdmin();

  let lastEvent: OperationalEventRow | null = null;
  let lastShipmentSync: ShipmentCarrierRow | null = null;
  let lastFezEvent: OperationalEventRow | null = null;
  let lastFezShipmentSync: ShipmentCarrierRow | null = null;

  if (supabase) {
    const [events, shipments, fezShipments] = await Promise.all([
      supabase
        .from("operational_events")
        .select("created_at,severity,message,metadata")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("shipments")
        .select("tracking_id,carrier_status,updated_at,carrier_synced_at")
        .eq("carrier_provider", "sendbox")
        .order("updated_at", { ascending: false })
        .limit(1),
      supabase
        .from("shipments")
        .select("tracking_id,carrier_status,updated_at,carrier_synced_at")
        .eq("carrier_provider", "fez_logistics")
        .order("updated_at", { ascending: false })
        .limit(1)
    ]);

    if (events.error) {
      logApiError(events.error, "Unable to load carrier operational diagnostics.", requestContext(request));
    } else {
      const rows = (events.data ?? []) as OperationalEventRow[];
      lastEvent = rows.find((row) => isProviderEvent(row, "sendbox")) ?? null;
      lastFezEvent = rows.find((row) => isProviderEvent(row, "fez_logistics") || isProviderEvent(row, "fez")) ?? null;
    }

    if (shipments.error) {
      logApiError(shipments.error, "Unable to load latest Sendbox shipment sync.", requestContext(request));
    } else {
      lastShipmentSync = ((shipments.data ?? []) as ShipmentCarrierRow[])[0] ?? null;
    }

    if (fezShipments.error) {
      logApiError(fezShipments.error, "Unable to load latest FEZ shipment sync.", requestContext(request));
    } else {
      lastFezShipmentSync = ((fezShipments.data ?? []) as ShipmentCarrierRow[])[0] ?? null;
    }
  }

  return NextResponse.json({
    sendbox: {
      environment: config.environment,
      configured: config.configured,
      missing: config.missing,
      baseUrl: config.baseUrl,
      connectionStatus: health.connectionStatus,
      healthStatus: health.healthStatus,
      statusCode: "statusCode" in health ? health.statusCode : null,
      lastSyncAt: lastShipmentSync?.carrier_synced_at ?? lastShipmentSync?.updated_at ?? lastEvent?.created_at ?? null,
      lastCarrierStatus: lastShipmentSync?.carrier_status ?? null,
      lastTrackingId: lastShipmentSync?.tracking_id ?? null,
      lastEvent: lastEvent
        ? {
            createdAt: lastEvent.created_at,
            severity: lastEvent.severity,
            message: lastEvent.message,
            error: eventError(lastEvent),
            status: eventStatus(lastEvent)
          }
        : null
    },
    fez: {
      environment: fezConfig.environment,
      configured: fezConfig.configured,
      missing: fezConfig.missing,
      baseUrl: fezConfig.baseUrl,
      webhookSecretConfigured: fezConfig.webhookSecretConfigured,
      connectionStatus: fezHealth.connectionStatus,
      healthStatus: fezHealth.healthStatus,
      statusCode: "statusCode" in fezHealth ? fezHealth.statusCode : null,
      lastSyncAt: lastFezShipmentSync?.carrier_synced_at ?? lastFezShipmentSync?.updated_at ?? lastFezEvent?.created_at ?? null,
      lastCarrierStatus: lastFezShipmentSync?.carrier_status ?? null,
      lastTrackingId: lastFezShipmentSync?.tracking_id ?? null,
      lastEvent: lastFezEvent
        ? {
            createdAt: lastFezEvent.created_at,
            severity: lastFezEvent.severity,
            message: lastFezEvent.message,
            error: eventError(lastFezEvent),
            status: eventStatus(lastFezEvent)
          }
        : null
    }
  });
}
