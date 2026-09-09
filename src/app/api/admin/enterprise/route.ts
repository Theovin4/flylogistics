import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const businessAccountSchema = z.object({
  action: z.literal("create_business_account"),
  accountName: z.string().trim().min(2).max(180),
  contactName: z.string().trim().max(160).optional().nullable(),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  contactPhone: z.string().trim().max(40).optional().nullable(),
  billingEmail: z.string().trim().email().optional().or(z.literal("")),
  billingTerms: z.enum(["prepaid", "weekly", "monthly", "credit"]).default("prepaid"),
  creditLimit: z.coerce.number().min(0).max(1_000_000_000).default(0)
});

const warehouseSchema = z.object({
  action: z.literal("create_warehouse"),
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(180),
  stateCode: z.string().trim().min(2).max(4).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  managerName: z.string().trim().max(160).optional().nullable(),
  managerPhone: z.string().trim().max(40).optional().nullable(),
  capacityNotes: z.string().trim().max(500).optional().nullable()
});

const kycReviewSchema = z.object({
  action: z.literal("review_kyc"),
  submissionId: z.coerce.number().int().positive(),
  status: z.enum(["APPROVED", "REJECTED", "NEEDS_REVIEW"]),
  reviewNotes: z.string().trim().max(1000).optional().nullable()
});

const codReconcileSchema = z.object({
  action: z.literal("reconcile_cod"),
  trackingId: z.string().trim().min(3).max(80),
  status: z.enum(["COLLECTED", "PARTIALLY_REMITTED", "REMITTED", "DISPUTED"]),
  remittedAmount: z.coerce.number().min(0).max(1_000_000_000).default(0),
  remittanceReference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable()
});

const supportResolveSchema = z.object({
  action: z.literal("resolve_support"),
  ticketId: z.string().trim().min(3).max(80),
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "REFUND_REQUESTED", "REFUNDED", "CLOSED"]),
  adminReply: z.string().trim().max(2000).optional().nullable(),
  resolutionNotes: z.string().trim().max(2000).optional().nullable(),
  refundAmount: z.coerce.number().min(0).max(1_000_000_000).default(0)
});

const inventorySchema = z.object({
  action: z.literal("upsert_inventory_item"),
  warehouseId: z.string().trim().optional().nullable(),
  sku: z.string().trim().min(2).max(80),
  itemName: z.string().trim().min(2).max(180),
  quantityOnHand: z.coerce.number().min(0).max(1_000_000_000).default(0),
  reorderLevel: z.coerce.number().min(0).max(1_000_000_000).default(0),
  unit: z.string().trim().max(40).default("unit"),
  notes: z.string().trim().max(500).optional().nullable()
});

const fleetMaintenanceSchema = z.object({
  action: z.literal("log_fleet_maintenance"),
  driverId: z.string().trim().optional().nullable(),
  vehicleIdentifier: z.string().trim().min(2).max(120),
  serviceType: z.string().trim().min(2).max(160),
  status: z.enum(["OPEN", "SCHEDULED", "COMPLETED", "CANCELLED"]).default("OPEN"),
  costAmount: z.coerce.number().min(0).max(1_000_000_000).default(0),
  dueAt: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable()
});

const fleetFuelSchema = z.object({
  action: z.literal("log_fleet_fuel"),
  driverId: z.string().trim().optional().nullable(),
  vehicleIdentifier: z.string().trim().min(2).max(120),
  liters: z.coerce.number().min(0).max(100000).default(0),
  amount: z.coerce.number().min(0).max(1_000_000_000).default(0),
  odometer: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
  fuelDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable()
});

const enterpriseActionSchema = z.discriminatedUnion("action", [
  businessAccountSchema,
  warehouseSchema,
  kycReviewSchema,
  codReconcileSchema,
  supportResolveSchema,
  inventorySchema,
  fleetMaintenanceSchema,
  fleetFuelSchema
]);

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "42703" || String(error?.code ?? "").startsWith("PGRST") || message.includes("could not find");
}

async function safeRows<T>(
  request: Request,
  resultPromise: PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>,
  label: string
) {
  const result = await resultPromise;
  if (result.error) {
    if (isMissingTable(result.error)) return [] as T[];
    logApiError(result.error, `Unable to load ${label}.`, requestContext(request));
    return [] as T[];
  }
  return (result.data ?? []) as T[];
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function optionalBigint(value: string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function requireEnterpriseAccess(request: Request) {
  const access = await requireRole(request, ["admin", "dispatcher", "finance", "warehouse", "customer_care"]);
  if (!access.profile) return { response: NextResponse.json({ error: access.error }, { status: access.status }), profile: null };
  if (access.error) return { response: NextResponse.json({ error: access.error }, { status: access.status }), profile: null };
  return { response: null, profile: access.profile };
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-enterprise", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireEnterpriseAccess(request);
  if (access.response) return access.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Enterprise operations are temporarily unavailable.", { status: 503 });

  const [businessAccounts, codShipments, kycSubmissions, supportTickets, warehouses, inventoryItems, maintenanceLogs, fuelLogs] = await Promise.all([
    safeRows<Record<string, unknown>>(
      request,
      supabase.from("business_accounts").select("*").order("created_at", { ascending: false }).limit(50),
      "business accounts"
    ),
    safeRows<Record<string, unknown>>(
      request,
      supabase
        .from("shipments")
        .select("id,tracking_id,customer_name,customer_phone,cod_amount,cod_status,cod_remittance_reference,cod_collected_at,cod_remitted_at,status,driver_id,created_at")
        .gt("cod_amount", 0)
        .order("created_at", { ascending: false })
        .limit(80),
      "COD shipments"
    ),
    safeRows<Record<string, unknown>>(
      request,
      supabase
        .from("driver_kyc_submissions")
        .select("*, driver:drivers(id,name,phone,status,approval_status)")
        .order("created_at", { ascending: false })
        .limit(80),
      "driver KYC submissions"
    ),
    safeRows<Record<string, unknown>>(
      request,
      supabase
        .from("customer_support_tickets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80),
      "support tickets"
    ),
    safeRows<Record<string, unknown>>(
      request,
      supabase.from("warehouses").select("*").order("created_at", { ascending: false }).limit(50),
      "warehouses"
    ),
    safeRows<Record<string, unknown>>(
      request,
      supabase
        .from("warehouse_inventory")
        .select("*, warehouse:warehouses(code,name)")
        .order("updated_at", { ascending: false })
        .limit(120),
      "warehouse inventory"
    ),
    safeRows<Record<string, unknown>>(
      request,
      supabase
        .from("fleet_maintenance_logs")
        .select("*, driver:drivers(id,name,phone,vehicle_type)")
        .order("created_at", { ascending: false })
        .limit(120),
      "fleet maintenance logs"
    ),
    safeRows<Record<string, unknown>>(
      request,
      supabase
        .from("fleet_fuel_logs")
        .select("*, driver:drivers(id,name,phone,vehicle_type)")
        .order("fuel_date", { ascending: false })
        .limit(120),
      "fleet fuel logs"
    )
  ]);

  const codPending = codShipments.filter((shipment) => !["REMITTED", "NOT_APPLICABLE"].includes(String(shipment.cod_status ?? "").toUpperCase()));
  const supportOpen = supportTickets.filter((ticket) => !["RESOLVED", "CLOSED", "REFUNDED"].includes(String(ticket.status ?? "").toUpperCase()));
  const kycPending = kycSubmissions.filter((submission) => ["PENDING", "NEEDS_REVIEW"].includes(String(submission.status ?? "PENDING").toUpperCase()));
  const lowStockItems = inventoryItems.filter((item) => money(item.quantity_on_hand) <= money(item.reorder_level));
  const maintenanceOpen = maintenanceLogs.filter((log) => !["COMPLETED", "CANCELLED"].includes(String(log.status ?? "OPEN").toUpperCase()));
  const fuelSpend = fuelLogs.reduce((total, log) => total + money(log.amount), 0);

  return NextResponse.json({
    businessAccounts,
    codShipments,
    kycSubmissions,
    supportTickets,
    warehouses,
    inventoryItems,
    maintenanceLogs,
    fuelLogs,
    metrics: {
      businessAccounts: businessAccounts.length,
      codOutstanding: codPending.reduce((total, shipment) => total + money(shipment.cod_amount), 0),
      codPending: codPending.length,
      kycPending: kycPending.length,
      supportOpen: supportOpen.length,
      warehouses: warehouses.length,
      inventoryItems: inventoryItems.length,
      lowStockItems: lowStockItems.length,
      maintenanceOpen: maintenanceOpen.length,
      fuelSpend
    }
  });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "admin-enterprise-create", { limit: 40, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireEnterpriseAccess(request);
  if (access.response) return access.response;

  const parsed = await parseJson(request, enterpriseActionSchema, "Invalid enterprise operations request.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Enterprise operations are temporarily unavailable.", { status: 503 });

  if (parsed.data.action === "create_business_account") {
    const { data, error } = await supabase
      .from("business_accounts")
      .insert({
        account_name: parsed.data.accountName,
        contact_name: parsed.data.contactName || null,
        contact_email: parsed.data.contactEmail || null,
        contact_phone: parsed.data.contactPhone || null,
        billing_email: parsed.data.billingEmail || parsed.data.contactEmail || null,
        billing_terms: parsed.data.billingTerms,
        credit_limit: parsed.data.creditLimit,
        status: "ACTIVE",
        updated_at: new Date().toISOString()
      })
      .select("*")
      .single();

    if (error) {
      logApiError(error, "Unable to create business account.", requestContext(request));
      return apiError(isMissingTable(error) ? "Run the latest enterprise schema before creating business accounts." : "Unable to create business account.", { status: isMissingTable(error) ? 409 : 500 });
    }

    await writeAuditLog(supabase, { actor: access.profile, action: "enterprise.business_account_create", entityType: "business_account", entityId: String(data.id), metadata: parsed.data, request });
    await writeOperationalEvent(supabase, { category: "enterprise", message: "Business account created.", entityType: "business_account", entityId: String(data.id), metadata: parsed.data, request });
    return NextResponse.json(data, { status: 201 });
  }

  if (parsed.data.action === "create_warehouse") {
    const { data, error } = await supabase
      .from("warehouses")
      .upsert({
        code: parsed.data.code.toUpperCase(),
        name: parsed.data.name,
        state_code: parsed.data.stateCode?.toUpperCase() || null,
        address: parsed.data.address || null,
        manager_name: parsed.data.managerName || null,
        manager_phone: parsed.data.managerPhone || null,
        capacity_notes: parsed.data.capacityNotes || null,
        status: "ACTIVE",
        updated_at: new Date().toISOString()
      }, { onConflict: "code" })
      .select("*")
      .single();

    if (error) {
      logApiError(error, "Unable to create warehouse.", requestContext(request));
      return apiError(isMissingTable(error) ? "Run the latest enterprise schema before creating warehouses." : "Unable to create warehouse.", { status: isMissingTable(error) ? 409 : 500 });
    }

    await writeAuditLog(supabase, { actor: access.profile, action: "enterprise.warehouse_upsert", entityType: "warehouse", entityId: String(data.id), metadata: parsed.data, request });
    await writeOperationalEvent(supabase, { category: "warehouse", message: "Warehouse profile created or updated.", entityType: "warehouse", entityId: String(data.id), metadata: parsed.data, request });
    return NextResponse.json(data, { status: 201 });
  }

  if (parsed.data.action === "upsert_inventory_item") {
    const now = new Date().toISOString();
    const quantityOnHand = Number(parsed.data.quantityOnHand ?? 0);
    const reorderLevel = Number(parsed.data.reorderLevel ?? 0);
    const { data, error } = await supabase
      .from("warehouse_inventory")
      .upsert({
        warehouse_id: optionalBigint(parsed.data.warehouseId),
        sku: parsed.data.sku.toUpperCase(),
        item_name: parsed.data.itemName,
        quantity_on_hand: quantityOnHand,
        reorder_level: reorderLevel,
        unit: parsed.data.unit || "unit",
        notes: parsed.data.notes || null,
        status: quantityOnHand <= reorderLevel ? "LOW_STOCK" : "ACTIVE",
        updated_at: now
      }, { onConflict: "sku" })
      .select("*")
      .single();

    if (error) {
      logApiError(error, "Unable to save inventory item.", requestContext(request));
      return apiError(isMissingTable(error) ? "Run the latest enterprise schema before managing inventory." : "Unable to save inventory item.", { status: isMissingTable(error) ? 409 : 500 });
    }

    await writeAuditLog(supabase, { actor: access.profile, action: "enterprise.inventory_upsert", entityType: "warehouse_inventory", entityId: String(data.id), metadata: parsed.data, request });
    await writeOperationalEvent(supabase, { category: "warehouse", message: "Warehouse inventory item saved.", entityType: "warehouse_inventory", entityId: String(data.id), metadata: parsed.data, request });
    return NextResponse.json(data, { status: 201 });
  }

  if (parsed.data.action === "log_fleet_maintenance") {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("fleet_maintenance_logs")
      .insert({
        driver_id: optionalBigint(parsed.data.driverId),
        vehicle_identifier: parsed.data.vehicleIdentifier,
        service_type: parsed.data.serviceType,
        status: parsed.data.status,
        cost_amount: parsed.data.costAmount,
        due_at: parsed.data.dueAt || null,
        completed_at: parsed.data.status === "COMPLETED" ? now : null,
        notes: parsed.data.notes || null,
        updated_at: now
      })
      .select("*")
      .single();

    if (error) {
      logApiError(error, "Unable to log fleet maintenance.", requestContext(request));
      return apiError(isMissingTable(error) ? "Run the latest enterprise schema before managing fleet maintenance." : "Unable to log fleet maintenance.", { status: isMissingTable(error) ? 409 : 500 });
    }

    await writeAuditLog(supabase, { actor: access.profile, action: "enterprise.fleet_maintenance_log", entityType: "fleet_maintenance", entityId: String(data.id), metadata: parsed.data, request });
    await writeOperationalEvent(supabase, { category: "driver", message: "Fleet maintenance log created.", entityType: "fleet_maintenance", entityId: String(data.id), metadata: parsed.data, request });
    return NextResponse.json(data, { status: 201 });
  }

  if (parsed.data.action === "log_fleet_fuel") {
    const { data, error } = await supabase
      .from("fleet_fuel_logs")
      .insert({
        driver_id: optionalBigint(parsed.data.driverId),
        vehicle_identifier: parsed.data.vehicleIdentifier,
        liters: parsed.data.liters,
        amount: parsed.data.amount,
        odometer: parsed.data.odometer ?? null,
        fuel_date: parsed.data.fuelDate || new Date().toISOString(),
        notes: parsed.data.notes || null
      })
      .select("*")
      .single();

    if (error) {
      logApiError(error, "Unable to log fleet fuel.", requestContext(request));
      return apiError(isMissingTable(error) ? "Run the latest enterprise schema before managing fleet fuel." : "Unable to log fleet fuel.", { status: isMissingTable(error) ? 409 : 500 });
    }

    await writeAuditLog(supabase, { actor: access.profile, action: "enterprise.fleet_fuel_log", entityType: "fleet_fuel", entityId: String(data.id), metadata: parsed.data, request });
    await writeOperationalEvent(supabase, { category: "driver", message: "Fleet fuel log created.", entityType: "fleet_fuel", entityId: String(data.id), metadata: parsed.data, request });
    return NextResponse.json(data, { status: 201 });
  }

  if (parsed.data.action === "review_kyc") {
    const reviewedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("driver_kyc_submissions")
      .update({
        status: parsed.data.status,
        review_notes: parsed.data.reviewNotes || null,
        reviewed_by: access.profile?.id ?? null,
        reviewed_at: reviewedAt,
        updated_at: reviewedAt
      })
      .eq("id", parsed.data.submissionId)
      .select("*")
      .single();

    if (error) {
      logApiError(error, "Unable to review driver KYC.", requestContext(request, { submissionId: parsed.data.submissionId }));
      return apiError("Unable to update driver KYC review.", { status: 500 });
    }

    if (data.driver_id) {
      await supabase
        .from("drivers")
        .update({
          kyc_status: parsed.data.status.toLowerCase(),
          approval_status: parsed.data.status === "APPROVED" ? "approved" : parsed.data.status === "REJECTED" ? "rejected" : "pending",
          updated_at: reviewedAt
        })
        .eq("id", data.driver_id);
    }

    await writeAuditLog(supabase, { actor: access.profile, action: "enterprise.driver_kyc_review", entityType: "driver_kyc_submission", entityId: String(parsed.data.submissionId), metadata: parsed.data, request });
    return NextResponse.json(data);
  }

  if (parsed.data.action === "reconcile_cod") {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("shipments")
      .update({
        cod_status: parsed.data.status,
        cod_remitted_at: parsed.data.status === "REMITTED" ? now : null,
        cod_remittance_reference: parsed.data.remittanceReference || null,
        updated_at: now
      })
      .eq("tracking_id", parsed.data.trackingId.toUpperCase())
      .select("id,tracking_id,driver_id,cod_amount,cod_status")
      .single();

    if (error) {
      logApiError(error, "Unable to reconcile COD shipment.", requestContext(request, { trackingId: parsed.data.trackingId }));
      return apiError("Unable to reconcile COD shipment.", { status: 500 });
    }

    await supabase.from("cod_settlements").insert({
      settlement_id: `COD-${Date.now()}`,
      shipment_id: data.id,
      tracking_id: data.tracking_id,
      driver_id: data.driver_id,
      amount: data.cod_amount ?? 0,
      remitted_amount: parsed.data.remittedAmount,
      status: parsed.data.status,
      remittance_reference: parsed.data.remittanceReference || null,
      notes: parsed.data.notes || null,
      remitted_at: parsed.data.status === "REMITTED" ? now : null,
      reconciled_by: access.profile?.id ?? null,
      updated_at: now
    });

    await writeAuditLog(supabase, { actor: access.profile, action: "enterprise.cod_reconcile", entityType: "shipment", entityId: data.tracking_id, metadata: parsed.data, request });
    return NextResponse.json(data);
  }

  const resolvedAt = ["RESOLVED", "CLOSED", "REFUNDED"].includes(parsed.data.status) ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from("customer_support_tickets")
    .update({
      status: parsed.data.status,
      admin_reply: parsed.data.adminReply || null,
      resolution_status: parsed.data.status,
      resolution_notes: parsed.data.resolutionNotes || null,
      refund_amount: parsed.data.refundAmount,
      resolved_at: resolvedAt,
      updated_at: new Date().toISOString()
    })
    .eq("ticket_id", parsed.data.ticketId)
    .select("*")
    .single();

  if (error) {
    logApiError(error, "Unable to resolve support ticket.", requestContext(request, { ticketId: parsed.data.ticketId }));
    return apiError("Unable to update support ticket.", { status: 500 });
  }

  await writeAuditLog(supabase, { actor: access.profile, action: "enterprise.support_resolve", entityType: "support_ticket", entityId: parsed.data.ticketId, metadata: parsed.data, request });
  return NextResponse.json(data);
}
