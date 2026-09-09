import { NextResponse } from "next/server";
import { z } from "zod";
import { nigerianStates } from "@/lib/pricing";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { defaultVehicleTypes } from "@/server/pricing";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const adjustmentSchema = z.object({
  type: z.literal("adjustments"),
  globalMultiplier: z.coerce.number().min(0.5).max(3),
  fuelSurchargePercent: z.coerce.number().min(0).max(100),
  holidaySurgePercent: z.coerce.number().min(0).max(100),
  promotionalDiscountPercent: z.coerce.number().min(0).max(80)
});

const routeSchema = z.object({
  type: z.literal("route"),
  pickupStateCode: z.string().trim().min(2).max(4),
  destinationStateCode: z.string().trim().min(2).max(4),
  basePrice: z.coerce.number().min(0).max(100000000),
  pricePerKg: z.coerce.number().min(0).max(1000000),
  estimatedEtaHours: z.coerce.number().int().min(1).max(720),
  vehicleTypeCode: z.string().trim().min(2).max(40).default("van"),
  overridePrice: z.coerce.number().min(0).max(100000000).optional().default(0),
  isActive: z.boolean().default(true)
});

const pricingUpdateSchema = z.discriminatedUnion("type", [adjustmentSchema, routeSchema]);

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type RoutePayload = {
  pickup_state_code: string;
  destination_state_code: string;
  base_price: number;
  price_per_kg: number;
  estimated_eta_hours: number;
  vehicle_type_code: string | null;
  override_price: number | null;
  is_active: boolean;
  route_type: string;
  updated_at: string;
};

function isMissingPricingTable(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "42703" || String(error?.code ?? "").startsWith("PGRST") || message.includes("could not find");
}

function isDuplicateRoute(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "23505" || message.includes("duplicate key");
}

function isForeignKeyIssue(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "23503" || message.includes("foreign key");
}

function fallbackPricingConfig(warning?: string) {
  return {
    states: nigerianStates,
    vehicleTypes: defaultVehicleTypes,
    deliverySpeeds: [
      { code: "same_day", name: "Same-day", multiplier: 1.7 },
      { code: "next_day", name: "Next-day", multiplier: 1 },
      { code: "interstate_eta", name: "ETA-based interstate", multiplier: 1.25 }
    ],
    routes: [],
    adjustments: {
      globalMultiplier: 1,
      fuelSurchargePercent: 0,
      holidaySurgePercent: 0,
      promotionalDiscountPercent: 0
    },
    warning
  };
}

async function requireAdmin(request: Request) {
  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return { response: NextResponse.json({ error: access.error }, { status: access.status }), profile: null };
  if (access.error) return { response: NextResponse.json({ error: access.error }, { status: access.status }), profile: null };
  return { response: null, profile: access.profile };
}

async function ensurePricingReferenceRows(supabase: SupabaseAdminClient, payload: RoutePayload) {
  const involvedStates = nigerianStates.filter((state) =>
    [payload.pickup_state_code, payload.destination_state_code].includes(state.code)
  );

  if (involvedStates.length) {
    const states = await supabase
      .from("nigerian_states")
      .upsert(
        involvedStates.map((state) => ({
          code: state.code,
          name: state.name,
          zone: state.zone,
          is_active: true
        })),
        { onConflict: "code" }
      );
    if (states.error && !isMissingPricingTable(states.error)) return states.error;
  }

  const vehicles = await supabase
    .from("vehicle_types")
    .upsert(
      defaultVehicleTypes.map((vehicle, index) => ({
        code: vehicle.code,
        name: vehicle.name,
        max_weight_kg: vehicle.maxWeightKg,
        sort_order: index + 1,
        is_active: true
      })),
      { onConflict: "code" }
    );
  if (vehicles.error && !isMissingPricingTable(vehicles.error)) return vehicles.error;

  return null;
}

async function persistPricingRoute(supabase: SupabaseAdminClient, payload: RoutePayload) {
  const referenceError = await ensurePricingReferenceRows(supabase, payload);
  if (referenceError) return { data: null, error: referenceError };

  const update = await supabase
    .from("logistics_routes")
    .update(payload)
    .eq("pickup_state_code", payload.pickup_state_code)
    .eq("destination_state_code", payload.destination_state_code)
    .select("*");

  if (!update.error && update.data?.length) {
    return { data: update.data[0], error: null };
  }

  if (update.error && !isMissingPricingTable(update.error)) {
    return { data: null, error: update.error };
  }

  const insert = await supabase
    .from("logistics_routes")
    .insert(payload)
    .select("*")
    .single();

  if (!insert.error) return { data: insert.data, error: null };

  if (isDuplicateRoute(insert.error)) {
    const retry = await supabase
      .from("logistics_routes")
      .update(payload)
      .eq("pickup_state_code", payload.pickup_state_code)
      .eq("destination_state_code", payload.destination_state_code)
      .select("*");
    return {
      data: retry.data?.[0] ?? null,
      error: retry.error ?? (retry.data?.length ? null : insert.error)
    };
  }

  if (payload.vehicle_type_code && isForeignKeyIssue(insert.error)) {
    const withoutVehicle = { ...payload, vehicle_type_code: null };
    const retry = await supabase
      .from("logistics_routes")
      .insert(withoutVehicle)
      .select("*")
      .single();
    return { data: retry.data, error: retry.error };
  }

  return { data: null, error: insert.error };
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-pricing", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const admin = await requireAdmin(request);
  if (admin.response) return admin.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(fallbackPricingConfig("Pricing storage is temporarily unavailable."));

  const [routes, adjustments, fuel, vehicleTypes, speeds] = await Promise.all([
    supabase.from("logistics_routes").select("*").order("pickup_state_code", { ascending: true }).limit(250),
    supabase.from("pricing_adjustments").select("*").order("key", { ascending: true }),
    supabase.from("fuel_surcharges").select("*").order("effective_from", { ascending: false }).limit(10),
    supabase.from("vehicle_types").select("*").order("sort_order", { ascending: true }),
    supabase.from("delivery_speeds").select("*").order("sort_order", { ascending: true })
  ]);

  if (isMissingPricingTable(routes.error) || isMissingPricingTable(adjustments.error)) {
    return NextResponse.json(fallbackPricingConfig("Run the latest Fly Logistics pricing schema to unlock admin pricing controls."));
  }

  for (const result of [routes, adjustments, fuel, vehicleTypes, speeds]) {
    if (result.error && !isMissingPricingTable(result.error)) {
      logApiError(result.error, "Unable to load admin pricing data.", requestContext(request));
      return apiError("Unable to load pricing controls.", { status: 500 });
    }
  }

  const adjustmentRows = adjustments.data ?? [];
  const fuelRow = (fuel.data ?? []).find((item) => item.is_active);
  return NextResponse.json({
    states: nigerianStates,
    vehicleTypes: vehicleTypes.data?.length ? vehicleTypes.data : defaultVehicleTypes,
    deliverySpeeds: speeds.data ?? [],
    routes: routes.data ?? [],
    adjustments: {
      globalMultiplier: Number(adjustmentRows.find((item) => item.key === "global_multiplier")?.value ?? 1),
      fuelSurchargePercent: Number(fuelRow?.percentage ?? adjustmentRows.find((item) => item.key === "fuel_surcharge")?.value ?? 0),
      holidaySurgePercent: Number(adjustmentRows.find((item) => item.key === "holiday_surge")?.value ?? 0),
      promotionalDiscountPercent: Number(adjustmentRows.find((item) => item.key === "promotional_discount")?.value ?? 0)
    }
  });
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "admin-pricing-update", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const admin = await requireAdmin(request);
  if (admin.response) return admin.response;

  const parsed = await parseJson(request, pricingUpdateSchema, "A valid pricing update is required.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Pricing controls are temporarily unavailable.", { status: 503 });

  if (parsed.data.type === "adjustments") {
    const rows = [
      { key: "global_multiplier", label: "Global pricing multiplier", adjustment_type: "global_multiplier", value: parsed.data.globalMultiplier, is_active: true },
      { key: "fuel_surcharge", label: "Fuel surcharge", adjustment_type: "fuel_surcharge", value: parsed.data.fuelSurchargePercent, is_active: true },
      { key: "holiday_surge", label: "Holiday surge", adjustment_type: "holiday_surge", value: parsed.data.holidaySurgePercent, is_active: parsed.data.holidaySurgePercent > 0 },
      { key: "promotional_discount", label: "Promotional discount", adjustment_type: "promotional_discount", value: parsed.data.promotionalDiscountPercent, is_active: parsed.data.promotionalDiscountPercent > 0 }
    ];

    const updated = await supabase.from("pricing_adjustments").upsert(rows, { onConflict: "key" }).select("*");
    if (updated.error) {
      logApiError(updated.error, "Unable to update pricing adjustments.", requestContext(request));
      return apiError("Unable to update pricing adjustments.", { status: 500 });
    }

    const fuel = await supabase.from("fuel_surcharges").insert({
      label: "Admin fuel surcharge",
      percentage: parsed.data.fuelSurchargePercent,
      is_active: true,
      effective_from: new Date().toISOString()
    });
    if (fuel.error && !isMissingPricingTable(fuel.error)) {
      logApiError(fuel.error, "Unable to store fuel surcharge.", requestContext(request));
    }

    await writeAuditLog(supabase, { actor: admin.profile, action: "pricing.adjustments_update", entityType: "pricing_adjustments", metadata: parsed.data, request });
    await writeOperationalEvent(supabase, { category: "system", message: "Pricing adjustments updated by admin.", entityType: "pricing_adjustments", metadata: parsed.data, request });
    return NextResponse.json({ ok: true, adjustments: parsed.data });
  }

  const routePayload: RoutePayload = {
    pickup_state_code: parsed.data.pickupStateCode.toUpperCase(),
    destination_state_code: parsed.data.destinationStateCode.toUpperCase(),
    base_price: parsed.data.basePrice,
    price_per_kg: parsed.data.pricePerKg,
    estimated_eta_hours: parsed.data.estimatedEtaHours,
    vehicle_type_code: parsed.data.vehicleTypeCode || null,
    override_price: parsed.data.overridePrice || null,
    is_active: parsed.data.isActive ?? true,
    route_type: parsed.data.pickupStateCode.toUpperCase() === parsed.data.destinationStateCode.toUpperCase() ? "same_state" : "interstate",
    updated_at: new Date().toISOString()
  };

  const route = await persistPricingRoute(supabase, routePayload);

  if (route.error) {
    logApiError(route.error, "Unable to update pricing route.", requestContext(request));
    if (isMissingPricingTable(route.error)) {
      return apiError("Run the latest Fly Logistics pricing schema, then try saving this route again.", { status: 409 });
    }
    return apiError("Unable to update pricing route. Check the route states and vehicle type, then try again.", { status: 500 });
  }

  await writeAuditLog(supabase, { actor: admin.profile, action: "pricing.route_update", entityType: "logistics_route", entityId: String(route.data?.id ?? `${routePayload.pickup_state_code}-${routePayload.destination_state_code}`), metadata: parsed.data, request });
  await writeOperationalEvent(supabase, { category: "system", message: "Route pricing updated by admin.", entityType: "logistics_route", entityId: String(route.data?.id ?? `${routePayload.pickup_state_code}-${routePayload.destination_state_code}`), metadata: parsed.data, request });
  return NextResponse.json({ ok: true, route: route.data });
}
