import { appendQuoteStatusHistory, normalizeQuoteStatus, type QuoteStatus } from "@/lib/quotes";
import type { AuthProfile } from "@/lib/request-auth";
import type { QuoteRequestRecord } from "@/lib/shipments";
import type { getSupabaseAdmin } from "@/lib/supabase-server";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export const optionalQuoteWorkflowColumns = new Set([
  "status",
  "quoted_price",
  "quoted_eta_hours",
  "quoted_eta_label",
  "quote_notes",
  "quote_valid_until",
  "review_notes",
  "reviewed_at",
  "reviewed_by",
  "quote_sent_at",
  "accepted_at",
  "declined_at",
  "paid_at",
  "converted_at",
  "payment_status",
  "payment_reference",
  "payment_amount",
  "payment_provider",
  "quote_status_history",
  "standard_price",
  "discountable_amount",
  "discount_rate",
  "discount_amount",
  "final_price",
  "pricing_rule_version",
  "company_id"
]);

function missingColumnFromPostgrest(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";
  if (error?.code === "PGRST204") return message.match(/'([^']+)' column/)?.[1] ?? null;
  return message.match(/column "([^"]+)" of relation/i)?.[1] ?? message.match(/Could not find the '([^']+)' column/i)?.[1] ?? null;
}

export function quoteAmount(quote: QuoteRequestRecord) {
  const amount = Number(quote.final_price ?? quote.quoted_price ?? quote.payment_amount ?? quote.estimated_price ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function quoteEtaHours(quote: QuoteRequestRecord) {
  const eta = Number(quote.quoted_eta_hours ?? quote.estimated_eta_hours ?? 0);
  return Number.isFinite(eta) ? eta : 0;
}

export function nextQuoteHistory(
  quote: QuoteRequestRecord,
  status: QuoteStatus | string,
  actor?: AuthProfile | null,
  note?: string | null
) {
  return appendQuoteStatusHistory(quote.quote_status_history as Parameters<typeof appendQuoteStatusHistory>[0], {
    status: normalizeQuoteStatus(status),
    actor_id: actor?.id ?? null,
    actor_role: actor?.role ?? null,
    note: note ?? null
  });
}

export async function writeQuoteStatusEvent(
  supabase: SupabaseAdminClient,
  input: {
    requestId: string;
    previousStatus?: string | null;
    nextStatus: QuoteStatus | string;
    actor?: AuthProfile | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("quote_status_events").insert({
    request_id: input.requestId.toUpperCase(),
    previous_status: input.previousStatus ? normalizeQuoteStatus(input.previousStatus) : null,
    next_status: normalizeQuoteStatus(input.nextStatus),
    note: input.note ?? null,
    actor_id: input.actor?.id ?? null,
    actor_email: input.actor?.email ?? null,
    actor_role: input.actor?.role ?? null,
    metadata: input.metadata ?? {}
  });

  if (error && error.code !== "42P01") {
    return { error };
  }

  return { error: null };
}

export async function updateQuoteWithWorkflowFallback(
  supabase: SupabaseAdminClient,
  requestId: string,
  updates: Record<string, unknown>,
  options: { companyId?: string | null } = {}
) {
  const nextPayload = { ...updates };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt <= optionalQuoteWorkflowColumns.size; attempt += 1) {
    let query = supabase
      .from("quote_requests")
      .update(nextPayload)
      .eq("request_id", requestId.toUpperCase());
    if (options.companyId) query = query.eq("company_id", options.companyId);
    const result = await query.select("*").single();

    if (!result.error) {
      return { data: result.data as QuoteRequestRecord, error: null, removedColumns };
    }

    const missingColumn = missingColumnFromPostgrest(result.error);
    if (!missingColumn || !optionalQuoteWorkflowColumns.has(missingColumn) || !(missingColumn in nextPayload)) {
      return { data: null, error: result.error, removedColumns };
    }

    delete nextPayload[missingColumn];
    removedColumns.push(missingColumn);
  }

  return {
    data: null,
    error: {
      code: "SCHEMA_FALLBACK_EXHAUSTED",
      message: "Unable to update quote because optional quote workflow fallback was exhausted."
    },
    removedColumns
  };
}
