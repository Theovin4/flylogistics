import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAuditLog } from "@/server/audit";
import { enqueueBackgroundJob } from "@/server/background-jobs";
import { logApiError, requestContext } from "@/server/monitoring";

export const dynamic = "force-dynamic";

type WorkbookRow = Record<string, unknown>;

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeRows(rows: WorkbookRow[], columns: string[]) {
  return rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? ""])));
}

function worksheet(name: string, rows: WorkbookRow[]) {
  const columns = rows.length ? Object.keys(rows[0]) : ["message"];
  const header = `<Row>${columns.map((column) => `<Cell><Data ss:Type="String">${xml(column)}</Data></Cell>`).join("")}</Row>`;
  const body = rows.length
    ? rows.map((row) => `<Row>${columns.map((column) => `<Cell><Data ss:Type="String">${xml(row[column])}</Data></Cell>`).join("")}</Row>`).join("")
    : `<Row><Cell><Data ss:Type="String">No records found</Data></Cell></Row>`;

  return `<Worksheet ss:Name="${xml(name).slice(0, 31)}"><Table>${header}${body}</Table></Worksheet>`;
}

async function safeRows(query: PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>) {
  const result = await query;
  if (result.error) return { rows: [] as WorkbookRow[], error: result.error };
  return { rows: (result.data ?? []) as WorkbookRow[], error: null };
}

export async function GET(request: Request) {
  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Admin export is temporarily unavailable." }, { status: 503 });

  const url = new URL(request.url);
  if (url.searchParams.get("async") === "1") {
    const queued = await enqueueBackgroundJob(supabase, {
      jobType: "admin_export_workbook",
      entityType: "analysis_workbook",
      entityId: new Date().toISOString().slice(0, 10),
      companyId: (access.profile as { company_id?: string | null }).company_id ?? null,
      payload: { requestedBy: access.profile.id, requestedAt: new Date().toISOString() }
    });

    await writeAuditLog(supabase, {
      actor: access.profile,
      action: "admin.export_workbook_queued",
      entityType: "analysis_workbook",
      entityId: queued.jobId ?? new Date().toISOString().slice(0, 10),
      metadata: { jobId: queued.jobId },
      request
    });

    return NextResponse.json({ queued: true, jobId: queued.jobId }, { status: 202, headers: { "Cache-Control": "no-store" } });
  }

  const [shipments, quotes, drivers, wallets, walletTransactions, auditLogs, operationalEvents] = await Promise.all([
    safeRows(supabase.from("shipments").select("*").order("created_at", { ascending: false }).limit(500)),
    safeRows(supabase.from("quote_requests").select("*").order("created_at", { ascending: false }).limit(500)),
    safeRows(supabase.from("drivers").select("*").order("created_at", { ascending: false }).limit(500)),
    safeRows(supabase.from("customer_wallets").select("*").order("updated_at", { ascending: false }).limit(500)),
    safeRows(supabase.from("wallet_transactions").select("*").order("created_at", { ascending: false }).limit(500)),
    safeRows(supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500)),
    safeRows(supabase.from("operational_events").select("*").order("created_at", { ascending: false }).limit(500))
  ]);

  const errors = [shipments, quotes, drivers, wallets, walletTransactions, auditLogs, operationalEvents]
    .map((result) => result.error?.message)
    .filter(Boolean);

  if (errors.length) {
    logApiError(new Error(errors.join(" | ")), "Some admin export worksheets could not be loaded.", requestContext(request));
  }

  const shipmentRows = normalizeRows(shipments.rows, ["tracking_id", "status", "payment_status", "payment_amount", "driver_payout_amount", "driver_payout_status", "carrier_provider", "carrier_rate_amount", "carrier_cost_amount", "carrier_profit_amount", "carrier_margin_percent", "carrier_status", "customer_name", "customer_email", "pickup_address", "delivery_address", "assigned_driver_id", "backdated_at", "created_at"]);
  const quoteRows = normalizeRows(quotes.rows, ["request_id", "status", "payment_status", "payment_amount", "customer_name", "customer_email", "pickup_address", "delivery_address", "package_type", "weight_kg", "created_at"]);
  const driverRows = normalizeRows(drivers.rows, ["id", "name", "status", "approval_status", "vehicle_type", "is_online", "active_deliveries", "completed_deliveries", "created_at"]);
  const walletRows = normalizeRows(wallets.rows, ["id", "user_id", "balance", "currency", "status", "updated_at"]);
  const transactionRows = normalizeRows(walletTransactions.rows, ["id", "user_id", "transaction_type", "amount", "currency", "reference", "status", "payment_provider", "created_at"]);
  const auditRows = normalizeRows(auditLogs.rows, ["id", "action", "entity_type", "entity_id", "actor_id", "actor_role", "created_at"]);
  const eventRows = normalizeRows(operationalEvents.rows, ["id", "severity", "category", "message", "entity_type", "entity_id", "created_at"]);

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  ${worksheet("Shipments", shipmentRows)}
  ${worksheet("Quote Requests", quoteRows)}
  ${worksheet("Drivers", driverRows)}
  ${worksheet("Wallets", walletRows)}
  ${worksheet("Wallet Transactions", transactionRows)}
  ${worksheet("Audit Logs", auditRows)}
  ${worksheet("Operational Events", eventRows)}
</Workbook>`;

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "admin.export_workbook",
    entityType: "analysis_workbook",
    entityId: new Date().toISOString().slice(0, 10),
    metadata: { worksheetErrors: errors },
    request
  });

  return new NextResponse(workbook, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="fly-logistics-analysis-${new Date().toISOString().slice(0, 10)}.xls"`,
      "Cache-Control": "no-store"
    }
  });
}
