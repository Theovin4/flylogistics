import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { notifyAdmin } from "@/server/admin-notifications";
import { sendEmailNotification } from "@/server/notifications/email";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { getTenantContextForProfile } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const ticketSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  ticketType: z.enum(["support", "dispute", "failed_delivery", "refund"]).default("support"),
  disputeCategory: z.string().trim().max(120).optional().nullable(),
  refundAmount: z.coerce.number().min(0).max(1_000_000_000).default(0),
  trackingId: z.string().trim().max(80).optional().nullable(),
  businessAccountId: z.coerce.number().int().positive().optional().nullable(),
  portal: z.enum(["customer", "merchant", "cloud", "driver", "dispatcher"]).default("customer"),
  message: z.string().trim().min(8).max(2000)
});

function makeTicketId() {
  return `SUP-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function isMissingSupportTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "42703" || error.message?.includes("customer_support_tickets");
}

const optionalSupportColumns = new Set([
  "ticket_type",
  "dispute_category",
  "refund_amount",
  "resolution_status",
  "company_id",
  "business_account_id"
]);

async function verifyBusinessAccount(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  businessAccountId?: number | null
) {
  if (!businessAccountId) return { ok: true, businessAccountId: null };
  const membership = await supabase
    .from("business_account_members")
    .select("id")
    .eq("business_account_id", businessAccountId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (membership.error) return { ok: false, businessAccountId: null };
  return { ok: Boolean(membership.data), businessAccountId: membership.data ? businessAccountId : null };
}

function missingColumnFromPostgrest(error: { code?: string; message?: string } | null | undefined) {
  if (!error?.message) return null;
  const postgrestMatch = error.message.match(/'([^']+)' column/i);
  if (postgrestMatch?.[1]) return postgrestMatch[1];
  const postgresMatch = error.message.match(/column\s+(?:\w+\.)?"?([a-zA-Z_][\w]*)"?\s+does not exist/i);
  return postgresMatch?.[1] ?? null;
}

async function insertSupportTicketWithFallback(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  payload: Record<string, unknown>
) {
  const nextPayload = { ...payload };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt <= optionalSupportColumns.size; attempt += 1) {
    const result = await supabase
      .from("customer_support_tickets")
      .insert(nextPayload)
      .select("*")
      .single();

    if (!result.error) return { ...result, removedColumns };

    const missingColumn = missingColumnFromPostgrest(result.error);
    if (!missingColumn || !optionalSupportColumns.has(missingColumn) || !(missingColumn in nextPayload)) {
      return { ...result, removedColumns };
    }

    delete nextPayload[missingColumn];
    removedColumns.push(missingColumn);
  }

  return {
    data: null,
    error: new Error("Unable to create support ticket after retrying schema-compatible payload."),
    removedColumns
  };
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "customer-support", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer", "driver", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Customer support is temporarily unavailable.", { status: 503 });

  const { data, error } = await supabase
    .from("customer_support_tickets")
    .select("*")
    .eq("user_id", access.profile.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    if (isMissingSupportTable(error)) return NextResponse.json({ tickets: [], warning: "Customer support history is being prepared by Fly Logistics operations." });
    logApiError(error, "Unable to load customer support tickets.", requestContext(request, { userId: access.profile.id }));
    return apiError("Unable to load support tickets.", { status: 500 });
  }

  return NextResponse.json({ tickets: data ?? [] });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "customer-support-create", { limit: 12, windowSeconds: 300 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer", "driver", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, ticketSchema, "Please complete the support ticket fields.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Customer support is temporarily unavailable.", { status: 503 });

  const businessAccess = await verifyBusinessAccount(supabase, access.profile.id, parsed.data.businessAccountId ?? null);
  if (!businessAccess.ok) return apiError("You do not have access to this business account.", { status: 403 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const ticketId = makeTicketId();
  const { data, error, removedColumns } = await insertSupportTicketWithFallback(supabase, {
    ticket_id: ticketId,
    user_id: access.profile.id,
    company_id: tenant.companyId,
    business_account_id: businessAccess.businessAccountId,
    tracking_id: parsed.data.trackingId || null,
    subject: parsed.data.subject,
    priority: parsed.data.priority,
    status: "OPEN",
    ticket_type: parsed.data.ticketType,
    dispute_category: parsed.data.disputeCategory || null,
    refund_amount: parsed.data.refundAmount,
    resolution_status: "OPEN",
    message: parsed.data.message
  });

  if (error) {
    if (isMissingSupportTable(error)) return apiError("Customer support history is being prepared by Fly Logistics operations.", { status: 503 });
    logApiError(error, "Unable to create customer support ticket.", requestContext(request, { userId: access.profile.id }));
    return apiError("Unable to create your support ticket.", { status: 500 });
  }

  await supabase.from("customer_notifications").insert({
    user_id: access.profile.id,
    title: "Support ticket opened",
    body: `Ticket ${ticketId} is now open. Customer care will review it soon.`,
    category: "support",
    entity_type: "support_ticket",
    entity_id: ticketId
  });

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "customer.support_ticket_create",
    entityType: "support_ticket",
    entityId: ticketId,
    metadata: { priority: parsed.data.priority, ticketType: parsed.data.ticketType, trackingId: parsed.data.trackingId || null, companyId: tenant.companyId, businessAccountId: businessAccess.businessAccountId, removedColumns },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "api",
    message: "Customer opened a support ticket.",
    entityType: "support_ticket",
    entityId: ticketId,
    metadata: { priority: parsed.data.priority, ticketType: parsed.data.ticketType, trackingId: parsed.data.trackingId || null, companyId: tenant.companyId, businessAccountId: businessAccess.businessAccountId, removedColumns },
    request
  });

  await notifyAdmin(supabase, {
    title: "New customer support ticket",
    message: `${access.profile.email ?? "A customer"} opened ${ticketId}: ${parsed.data.subject}. Priority ${parsed.data.priority}.`,
    severity: parsed.data.priority === "URGENT" ? "warning" : "info",
    entityType: "support_ticket",
    entityId: ticketId,
    metadata: { userId: access.profile.id, trackingId: parsed.data.trackingId || null, ticketType: parsed.data.ticketType },
    request
  });

  if (access.profile.email) {
    const supportPath = parsed.data.portal === "cloud"
      ? "/cloud/support"
      : parsed.data.portal === "merchant"
        ? "/merchant/dashboard#merchant-support"
        : parsed.data.portal === "driver"
          ? "/driver#driver-support"
          : parsed.data.portal === "dispatcher"
            ? "/dispatcher#dispatcher-support"
            : "/customer#customer-support";
    await sendEmailNotification({
      emailTo: access.profile.email,
      workflow: "support_ticket_opened",
      entityType: "support_ticket",
      entityId: ticketId,
      subject: `Fly Logistics support ticket ${ticketId}`,
      title: "Your support ticket is open",
      message: `We received your request: ${parsed.data.subject}. Our support team will reply in your Fly Logistics account and notify you by email.`,
      ctaLabel: "Open support center",
      ctaUrl: `${new URL(request.url).origin}${supportPath}`,
      metadata: { portal: parsed.data.portal }
    });
  }

  return NextResponse.json(data, { status: 201 });
}
