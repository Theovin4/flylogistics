import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryCategoryValues, pricingUrgencies } from "@/lib/pricing";
import { appendQuoteStatusHistory } from "@/lib/quotes";
import { requireRole, type AuthProfile } from "@/lib/request-auth";
import { shipmentWithDriverSelect } from "@/lib/shipment-data";
import { makeRequestId, type QuoteRequestRecord, type ShipmentRecord } from "@/lib/shipments";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { calculateLogisticsPrice } from "@/server/pricing";
import { quoteAmount } from "@/server/quote-workflow";
import { getWalletOverview, isWalletSchemaMissing } from "@/server/wallets";

export const dynamic = "force-dynamic";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type BusinessAccount = Record<string, unknown> & { id: number | string; account_name?: string | null };
type BusinessMember = Record<string, unknown> & { id: number | string; business_account_id: number | string; user_id?: string | null; role?: string | null; status?: string | null };
type CustomerAddress = Record<string, unknown> & { id: number | string };

const businessAccountSchema = z.object({
  action: z.literal("create_business_account"),
  accountName: z.string().trim().min(2).max(180),
  contactName: z.string().trim().max(160).optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  contactPhone: z.string().trim().max(40).optional(),
  billingEmail: z.string().trim().email().optional().or(z.literal("")),
  billingTerms: z.enum(["prepaid", "weekly", "monthly", "credit"]).default("prepaid"),
  creditLimit: z.coerce.number().min(0).max(1_000_000_000).default(0),
  address: z.string().trim().max(260).optional(),
  registrationNumber: z.string().trim().max(80).optional(),
  website: z.string().trim().max(160).optional()
});

const teamMemberSchema = z.object({
  action: z.literal("add_team_member"),
  accountId: z.coerce.number().int().positive(),
  email: z.string().trim().email(),
  role: z.enum(["owner", "admin", "operations", "finance", "member"]).default("member")
});

const addressSchema = z.object({
  action: z.literal("save_address"),
  accountId: z.coerce.number().int().positive().optional(),
  label: z.string().trim().min(2).max(120),
  addressType: z.enum(["pickup", "delivery", "billing", "warehouse"]).default("delivery"),
  address: z.string().trim().min(4).max(260),
  city: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  isDefault: z.boolean().default(false)
});

const bulkShipmentRowSchema = z.object({
  customerName: z.string().trim().max(160).optional(),
  recipientName: z.string().trim().max(160).optional(),
  pickupPhone: z.string().trim().max(40).optional(),
  deliveryPhone: z.string().trim().max(40).optional(),
  pickupCountry: z.string().trim().max(80).optional(),
  destinationCountry: z.string().trim().max(80).optional(),
  pickupState: z.string().trim().max(80).optional(),
  destinationState: z.string().trim().max(80).optional(),
  pickupAddress: z.string().trim().min(4),
  deliveryAddress: z.string().trim().min(4),
  packageType: z.string().trim().min(2),
  weightKg: z.coerce.number().positive().max(100000),
  urgency: z.enum(pricingUrgencies.map((item) => item.value) as ["standard", "priority", "critical"]).default("standard"),
  deliveryCategory: z.enum(deliveryCategoryValues).default("local_nigeria"),
  notes: z.string().trim().max(1000).optional(),
  businessReference: z.string().trim().max(120).optional()
});

const bulkCreateSchema = z.object({
  action: z.literal("bulk_create_quotes"),
  accountId: z.coerce.number().int().positive(),
  rows: z.array(bulkShipmentRowSchema).min(1).max(100)
});

const invoiceSchema = z.object({
  action: z.literal("generate_invoice"),
  accountId: z.coerce.number().int().positive(),
  requestIds: z.array(z.string().trim().min(3)).max(100).optional()
});

const merchantActionSchema = z.discriminatedUnion("action", [
  businessAccountSchema,
  teamMemberSchema,
  addressSchema,
  bulkCreateSchema,
  invoiceSchema
]);

function isMissingSchema(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "42703" || String(error?.code ?? "").startsWith("PGRST") || message.includes("could not find");
}

function missingColumn(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  if (error?.code === "PGRST204") return message.match(/'([^']+)' column/)?.[1] ?? null;
  return message.match(/column "([^"]+)" of relation/i)?.[1] ?? message.match(/Could not find the '([^']+)' column/i)?.[1] ?? null;
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function monthKey(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-NG", { month: "short", year: "numeric" });
}

function makeBatchId() {
  return `FLY-BATCH-${Date.now().toString(36).toUpperCase()}`;
}

function makeInvoiceNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `FLY-INV-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function requireMerchantAccess(request: Request) {
  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return { response: NextResponse.json({ error: access.error }, { status: access.status }), profile: null };
  if (access.error) return { response: NextResponse.json({ error: access.error }, { status: access.status }), profile: null };
  return { response: null, profile: access.profile };
}

async function findMembership(supabase: SupabaseAdmin, profile: AuthProfile, accountId: number | string) {
  if (profile.role === "admin") return { ok: true, role: "admin", error: null };
  const { data, error } = await supabase
    .from("business_account_members")
    .select("*")
    .eq("business_account_id", accountId)
    .eq("user_id", profile.id)
    .eq("status", "active")
    .maybeSingle();

  if (error) return { ok: false, role: null, error };
  return { ok: Boolean(data), role: String((data as BusinessMember | null)?.role ?? "member"), error: null };
}

async function assertBusinessAccess(supabase: SupabaseAdmin, profile: AuthProfile, accountId: number | string) {
  const membership = await findMembership(supabase, profile, accountId);
  if (membership.error) {
    if (isMissingSchema(membership.error)) return { ok: false, response: NextResponse.json({ error: "Business account storage is not installed yet." }, { status: 503 }), role: null };
    logApiError(membership.error, "Unable to verify merchant business access.", { userId: profile.id, accountId });
    return { ok: false, response: NextResponse.json({ error: "Unable to verify business account access." }, { status: 500 }), role: null };
  }
  if (!membership.ok) return { ok: false, response: NextResponse.json({ error: "You do not have access to this business account." }, { status: 403 }), role: null };
  return { ok: true, response: null, role: membership.role };
}

async function insertWithOptionalColumns(
  table: string,
  supabase: SupabaseAdmin,
  payload: Record<string, unknown>,
  optionalColumns: Set<string>
) {
  const nextPayload = { ...payload };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt <= optionalColumns.size; attempt += 1) {
    const result = await supabase.from(table).insert(nextPayload).select("*").single();
    if (!result.error) return { data: result.data, error: null, removedColumns };

    const column = missingColumn(result.error);
    if (!column || !optionalColumns.has(column) || !(column in nextPayload)) {
      return { data: null, error: result.error, removedColumns };
    }
    delete nextPayload[column];
    removedColumns.push(column);
  }

  return { data: null, error: new Error(`Unable to insert ${table} after schema fallback.`), removedColumns };
}

async function loadMerchantAccounts(supabase: SupabaseAdmin, profile: AuthProfile) {
  const warnings: string[] = [];
  const memberResult = await supabase
    .from("business_account_members")
    .select("*")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (memberResult.error) {
    if (isMissingSchema(memberResult.error)) {
      return { accounts: [] as BusinessAccount[], members: [] as BusinessMember[], warnings: ["Business account storage is not installed yet."] };
    }
    throw memberResult.error;
  }

  let members = (memberResult.data ?? []) as BusinessMember[];

  if (members.length === 0 && profile.email) {
    const contactAccount = await supabase
      .from("business_accounts")
      .select("*")
      .ilike("contact_email", profile.email)
      .limit(1);

    if (!contactAccount.error && contactAccount.data?.[0]) {
      const { data } = await supabase
        .from("business_account_members")
        .upsert({
          business_account_id: contactAccount.data[0].id,
          user_id: profile.id,
          role: "owner",
          status: "active"
        }, { onConflict: "business_account_id,user_id" })
        .select("*")
        .single();
      if (data) members = [data as BusinessMember];
    }
  }

  const accountIds = members.map((member) => member.business_account_id).filter(Boolean);
  if (accountIds.length === 0) return { accounts: [] as BusinessAccount[], members, warnings };

  const accountResult = await supabase
    .from("business_accounts")
    .select("*")
    .in("id", accountIds)
    .order("created_at", { ascending: true });

  if (accountResult.error) throw accountResult.error;
  return { accounts: (accountResult.data ?? []) as BusinessAccount[], members, warnings };
}

async function loadAccountTeam(supabase: SupabaseAdmin, accountId?: number | string | null) {
  if (!accountId) return [];
  const members = await supabase
    .from("business_account_members")
    .select("*")
    .eq("business_account_id", accountId)
    .order("created_at", { ascending: true });
  if (members.error) return [];

  const rows = (members.data ?? []) as BusinessMember[];
  const userIds = rows.map((row) => row.user_id).filter(Boolean) as string[];
  if (userIds.length === 0) return rows;

  const profiles = await supabase
    .from("user_profiles")
    .select("id,email,full_name,company,phone,role")
    .in("id", userIds);
  const profileById = new Map((profiles.data ?? []).map((profile) => [String(profile.id), profile]));
  return rows.map((row) => ({ ...row, profile: row.user_id ? profileById.get(String(row.user_id)) ?? null : null }));
}

async function loadQuotes(supabase: SupabaseAdmin, profile: AuthProfile, accountId?: number | string | null) {
  const byEmail = profile.email
    ? await supabase.from("quote_requests").select("*").ilike("customer_email", profile.email).order("created_at", { ascending: false }).limit(100)
    : { data: [], error: null };
  const byAccount = accountId
    ? await supabase.from("quote_requests").select("*").eq("business_account_id", accountId).order("created_at", { ascending: false }).limit(100)
    : { data: [], error: null };

  if (byEmail.error && !isMissingSchema(byEmail.error)) throw byEmail.error;
  if (byAccount.error && !isMissingSchema(byAccount.error)) throw byAccount.error;

  const merged = new Map<string, QuoteRequestRecord>();
  for (const quote of [...(byAccount.data ?? []), ...(byEmail.data ?? [])] as QuoteRequestRecord[]) {
    merged.set(quote.request_id, quote);
  }
  return [...merged.values()].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

async function loadShipments(supabase: SupabaseAdmin, profile: AuthProfile, accountId?: number | string | null) {
  const byEmail = profile.email
    ? await supabase.from("shipments").select(shipmentWithDriverSelect).ilike("customer_email", profile.email).order("created_at", { ascending: false }).limit(100)
    : { data: [], error: null };
  const byAccount = accountId
    ? await supabase.from("shipments").select(shipmentWithDriverSelect).eq("business_account_id", accountId).order("created_at", { ascending: false }).limit(100)
    : { data: [], error: null };

  if (byEmail.error && !isMissingSchema(byEmail.error)) throw byEmail.error;
  if (byAccount.error && !isMissingSchema(byAccount.error)) throw byAccount.error;

  const merged = new Map<string, ShipmentRecord>();
  for (const shipment of [...(byAccount.data ?? []), ...(byEmail.data ?? [])] as ShipmentRecord[]) {
    merged.set(shipment.tracking_id, shipment);
  }
  return [...merged.values()].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

async function loadAddresses(supabase: SupabaseAdmin, profile: AuthProfile, accountId?: number | string | null) {
  const base = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (base.error && !isMissingSchema(base.error)) throw base.error;

  if (!accountId) return (base.data ?? []) as CustomerAddress[];
  const accountRows = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("business_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (accountRows.error && isMissingSchema(accountRows.error)) return (base.data ?? []) as CustomerAddress[];
  if (accountRows.error) throw accountRows.error;

  const merged = new Map<string, CustomerAddress>();
  for (const address of [...(accountRows.data ?? []), ...(base.data ?? [])] as CustomerAddress[]) merged.set(String(address.id), address);
  return [...merged.values()];
}

async function loadInvoices(supabase: SupabaseAdmin, accountId?: number | string | null) {
  if (!accountId) return { invoices: [], warning: null };
  const result = await supabase
    .from("business_invoices")
    .select("*")
    .eq("business_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (result.error && isMissingSchema(result.error)) return { invoices: [], warning: "Business invoice storage is not installed yet." };
  if (result.error) throw result.error;
  return { invoices: result.data ?? [], warning: null };
}

function analyticsFrom(shipments: ShipmentRecord[], quotes: QuoteRequestRecord[]) {
  const completed = shipments.filter((shipment) => ["DELIVERED", "COMPLETED"].includes(String(shipment.status ?? "").toUpperCase()));
  const paidQuotes = quotes.filter((quote) => String(quote.payment_status ?? "").toUpperCase() === "PAID");
  const monthlyDeliveries = shipments.reduce<Record<string, number>>((current, shipment) => {
    const key = monthKey(shipment.created_at);
    current[key] = (current[key] ?? 0) + 1;
    return current;
  }, {});
  const topDestinations = Object.entries(shipments.reduce<Record<string, number>>((current, shipment) => {
    const key = String(shipment.destination_state ?? shipment.delivery_address ?? "Unknown destination");
    current[key] = (current[key] ?? 0) + 1;
    return current;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return {
    activeShipments: shipments.filter((shipment) => !["DELIVERED", "CANCELLED"].includes(String(shipment.status ?? "").toUpperCase())).length,
    completedShipments: completed.length,
    monthlyDeliveries,
    spending: paidQuotes.reduce((total, quote) => total + quoteAmount(quote), 0) + shipments.reduce((total, shipment) => total + money(shipment.payment_amount), 0),
    topDestinations,
    deliverySuccessRate: shipments.length ? Math.round((completed.length / shipments.length) * 100) : 0,
    unpaidQuotes: quotes.filter((quote) => String(quote.payment_status ?? "UNPAID").toUpperCase() !== "PAID").length
  };
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "merchant-overview", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireMerchantAccess(request);
  if (access.response) return access.response;
  const profile = access.profile!;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Merchant platform is temporarily unavailable." }, { status: 503 });

  try {
    const { searchParams } = new URL(request.url);
    const requestedAccountId = searchParams.get("accountId");
    const accountState = await loadMerchantAccounts(supabase, profile);
    const account = requestedAccountId
      ? accountState.accounts.find((item) => String(item.id) === requestedAccountId) ?? null
      : accountState.accounts[0] ?? null;
    const accountId = account?.id ?? null;
    const [team, quotes, shipments, addresses, walletOverview, invoiceResult] = await Promise.all([
      loadAccountTeam(supabase, accountId),
      loadQuotes(supabase, profile, accountId),
      loadShipments(supabase, profile, accountId),
      loadAddresses(supabase, profile, accountId),
      getWalletOverview(supabase, profile.id),
      loadInvoices(supabase, accountId)
    ]);

    const warnings = [
      ...accountState.warnings,
      walletOverview.error && isWalletSchemaMissing(walletOverview.error) ? "Wallet storage is not installed yet." : null,
      invoiceResult.warning
    ].filter(Boolean);

    return NextResponse.json({
      profile,
      businessAccounts: accountState.accounts,
      activeAccount: account,
      team,
      quoteRequests: quotes,
      shipments,
      addresses,
      wallet: walletOverview.error ? null : walletOverview.wallet,
      walletTransactions: walletOverview.error ? [] : walletOverview.transactions,
      invoices: invoiceResult.invoices,
      analytics: analyticsFrom(shipments, quotes),
      warnings
    });
  } catch (error) {
    logApiError(error, "Unable to load merchant overview.", requestContext(request, { userId: profile.id }));
    return NextResponse.json({ error: "Unable to load merchant platform." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "merchant-actions", { limit: 40, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireMerchantAccess(request);
  if (access.response) return access.response;
  const profile = access.profile!;

  const parsed = await parseJson(request, merchantActionSchema, "Invalid merchant request.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Merchant platform is temporarily unavailable." }, { status: 503 });

  if (parsed.data.action === "create_business_account") {
    const insert = await insertWithOptionalColumns("business_accounts", supabase, {
      account_name: parsed.data.accountName,
      contact_name: parsed.data.contactName || profile.full_name || null,
      contact_email: parsed.data.contactEmail || profile.email || null,
      contact_phone: parsed.data.contactPhone || profile.phone || null,
      billing_email: parsed.data.billingEmail || parsed.data.contactEmail || profile.email || null,
      billing_terms: parsed.data.billingTerms,
      credit_limit: parsed.data.creditLimit,
      address: parsed.data.address || null,
      registration_number: parsed.data.registrationNumber || null,
      website: parsed.data.website || null,
      status: "ACTIVE",
      updated_at: new Date().toISOString()
    }, new Set(["address", "registration_number", "website"]));

    if (insert.error || !insert.data) {
      logApiError(insert.error, "Unable to create merchant business account.", requestContext(request, { userId: profile.id }));
      return NextResponse.json({ error: isMissingSchema(insert.error) ? "Run the latest merchant schema before creating business accounts." : "Unable to create business account." }, { status: isMissingSchema(insert.error) ? 503 : 500 });
    }

    const account = insert.data as BusinessAccount;
    await supabase.from("business_account_members").upsert({
      business_account_id: account.id,
      user_id: profile.id,
      role: "owner",
      status: "active"
    }, { onConflict: "business_account_id,user_id" });

    await writeAuditLog(supabase, { actor: profile, action: "merchant.business_account_create", entityType: "business_account", entityId: String(account.id), metadata: { removedColumns: insert.removedColumns }, request });
    await writeOperationalEvent(supabase, { category: "merchant", message: "Merchant business account created.", entityType: "business_account", entityId: String(account.id), metadata: { accountName: account.account_name }, request });
    return NextResponse.json({ account }, { status: 201 });
  }

  if (parsed.data.action === "add_team_member") {
    const accessCheck = await assertBusinessAccess(supabase, profile, parsed.data.accountId);
    if (accessCheck.response) return accessCheck.response;
    if (!["owner", "admin"].includes(String(accessCheck.role)) && profile.role !== "admin") {
      return NextResponse.json({ error: "Only business owners or admins can add team members." }, { status: 403 });
    }

    const user = await supabase.from("user_profiles").select("id,email,full_name,role").ilike("email", parsed.data.email).maybeSingle();
    if (user.error) return NextResponse.json({ error: "Unable to inspect team member profile." }, { status: 500 });
    if (!user.data) return NextResponse.json({ error: "This team member needs to create a Fly Logistics customer account first." }, { status: 404 });

    const member = await supabase
      .from("business_account_members")
      .upsert({
        business_account_id: parsed.data.accountId,
        user_id: user.data.id,
        role: parsed.data.role,
        status: "active"
      }, { onConflict: "business_account_id,user_id" })
      .select("*")
      .single();
    if (member.error) return NextResponse.json({ error: "Unable to add team member." }, { status: 500 });

    await writeAuditLog(supabase, { actor: profile, action: "merchant.team_member_add", entityType: "business_account", entityId: String(parsed.data.accountId), metadata: { email: parsed.data.email, role: parsed.data.role }, request });
    return NextResponse.json({ member: member.data });
  }

  if (parsed.data.action === "save_address") {
    if (parsed.data.accountId) {
      const accessCheck = await assertBusinessAccess(supabase, profile, parsed.data.accountId);
      if (accessCheck.response) return accessCheck.response;
    }
    const insert = await insertWithOptionalColumns("customer_addresses", supabase, {
      user_id: profile.id,
      business_account_id: parsed.data.accountId ?? null,
      label: parsed.data.label,
      address_type: parsed.data.addressType,
      address: parsed.data.address,
      city: parsed.data.city || null,
      notes: parsed.data.notes || null,
      is_default: parsed.data.isDefault,
      updated_at: new Date().toISOString()
    }, new Set(["business_account_id", "notes", "is_default", "updated_at"]));
    if (insert.error || !insert.data) return NextResponse.json({ error: "Unable to save business address." }, { status: 500 });
    return NextResponse.json({ address: insert.data }, { status: 201 });
  }

  if (parsed.data.action === "bulk_create_quotes") {
    const accessCheck = await assertBusinessAccess(supabase, profile, parsed.data.accountId);
    if (accessCheck.response) return accessCheck.response;
    if (!profile.email) return NextResponse.json({ error: "Your account needs an email before creating merchant shipments." }, { status: 409 });

    const account = await supabase.from("business_accounts").select("*").eq("id", parsed.data.accountId).maybeSingle();
    if (account.error || !account.data) return NextResponse.json({ error: "Business account not found." }, { status: 404 });

    const batchId = makeBatchId();
    const created: QuoteRequestRecord[] = [];
    for (const row of parsed.data.rows) {
      const urgency = row.urgency ?? "standard";
      const deliveryCategory = row.deliveryCategory ?? "local_nigeria";
      const quote = await calculateLogisticsPrice({
        pickupState: row.pickupState,
        destinationState: row.destinationState,
        pickupCountry: row.pickupCountry,
        destinationCountry: row.destinationCountry,
        pickupAddress: row.pickupAddress,
        deliveryAddress: row.deliveryAddress,
        packageType: row.packageType,
        urgency,
        weightKg: row.weightKg,
        deliveryCategory
      }, supabase);
      const now = new Date().toISOString();
      const payload = {
        request_id: makeRequestId(),
        business_account_id: parsed.data.accountId,
        business_reference: row.businessReference || null,
        merchant_batch_id: batchId,
        customer_name: row.customerName || String(account.data.account_name ?? profile.full_name ?? "Business customer"),
        customer_email: profile.email,
        customer_phone: String(account.data.contact_phone ?? profile.phone ?? "") || null,
        recipient_name: row.recipientName || null,
        pickup_phone: row.pickupPhone || String(account.data.contact_phone ?? profile.phone ?? "") || null,
        delivery_phone: row.deliveryPhone || row.pickupPhone || String(account.data.contact_phone ?? profile.phone ?? "") || null,
        pickup_country: row.pickupCountry || (deliveryCategory === "international_import" ? null : "Nigeria"),
        destination_country: row.destinationCountry || (deliveryCategory === "international_export" ? null : "Nigeria"),
        pickup_state: row.pickupState || null,
        destination_state: row.destinationState || null,
        pickup_address: row.pickupAddress,
        delivery_address: row.deliveryAddress,
        package_type: row.packageType,
        weight_kg: row.weightKg,
        urgency,
        delivery_category: deliveryCategory,
        notes: row.notes || null,
        estimated_price: quote.amount,
        estimated_eta_hours: quote.etaHours,
        pricing_breakdown: quote.breakdown,
        vehicle_type: quote.vehicleType,
        delivery_type: quote.deliveryType,
        service_warnings: quote.warnings,
        quoted_price: quote.amount,
        quoted_eta_hours: quote.etaHours,
        quoted_eta_label: quote.etaLabel,
        payment_status: "UNPAID",
        payment_amount: quote.amount,
        payment_provider: "flutterwave",
        status: "QUOTED",
        quote_status_history: appendQuoteStatusHistory(null, {
          status: "QUOTED",
          actor_id: profile.id,
          actor_role: profile.role,
          note: "Merchant bulk upload generated instant delivery price."
        }),
        quote_sent_at: now,
        quote_valid_until: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
      };
      const insert = await insertWithOptionalColumns("quote_requests", supabase, payload, new Set([
        "business_account_id",
        "business_reference",
        "merchant_batch_id",
        "pickup_country",
        "destination_country",
        "pickup_state",
        "destination_state",
        "delivery_category",
        "pricing_breakdown",
        "vehicle_type",
        "delivery_type",
        "service_warnings",
        "recipient_name",
        "pickup_phone",
        "delivery_phone",
        "quoted_price",
        "quoted_eta_hours",
        "quoted_eta_label",
        "quote_sent_at",
        "quote_valid_until",
        "payment_status",
        "payment_amount",
        "payment_provider",
        "quote_status_history"
      ]));
      if (insert.error || !insert.data) throw insert.error ?? new Error("Unable to create one bulk quote.");
      created.push(insert.data as QuoteRequestRecord);
    }

    await writeAuditLog(supabase, { actor: profile, action: "merchant.bulk_quotes_create", entityType: "business_account", entityId: String(parsed.data.accountId), metadata: { batchId, count: created.length }, request });
    await writeOperationalEvent(supabase, { category: "merchant", message: "Merchant bulk shipment quotes created.", entityType: "business_account", entityId: String(parsed.data.accountId), metadata: { batchId, count: created.length }, request });
    return NextResponse.json({ batchId, quotes: created }, { status: 201 });
  }

  if (parsed.data.action === "generate_invoice") {
    const accountId = parsed.data.accountId;
    const accessCheck = await assertBusinessAccess(supabase, profile, accountId);
    if (accessCheck.response) return accessCheck.response;
    const selectedQuotes = parsed.data.requestIds?.length
      ? await supabase.from("quote_requests").select("*").in("request_id", parsed.data.requestIds.map((id) => id.toUpperCase()))
      : await supabase.from("quote_requests").select("*").eq("business_account_id", accountId).neq("payment_status", "PAID").order("created_at", { ascending: false }).limit(100);

    if (selectedQuotes.error) return NextResponse.json({ error: "Unable to load invoice items." }, { status: 500 });
    const quotes = ((selectedQuotes.data ?? []) as QuoteRequestRecord[])
      .filter((quote) => String(quote.business_account_id ?? accountId) === String(accountId) || String(quote.customer_email ?? "").toLowerCase() === String(profile.email ?? "").toLowerCase());
    if (quotes.length === 0) return NextResponse.json({ error: "No invoice-ready shipment quotes were found." }, { status: 404 });

    const invoiceNumber = makeInvoiceNumber();
    const totalAmount = quotes.reduce((total, quote) => total + quoteAmount(quote), 0);
    const invoicePayload = {
      invoice_number: invoiceNumber,
      business_account_id: accountId,
      user_id: profile.id,
      total_amount: totalAmount,
      currency: "NGN",
      status: "ISSUED",
      due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        line_items: quotes.map((quote) => ({
          request_id: quote.request_id,
          pickup_address: quote.pickup_address,
          delivery_address: quote.delivery_address,
          package_type: quote.package_type,
          amount: quoteAmount(quote)
        }))
      },
      updated_at: new Date().toISOString()
    };

    const invoice = await insertWithOptionalColumns("business_invoices", supabase, invoicePayload, new Set(["metadata", "due_at", "updated_at"]));
    if (invoice.error || !invoice.data) {
      if (!isMissingSchema(invoice.error)) return NextResponse.json({ error: "Unable to generate invoice." }, { status: 500 });
      return NextResponse.json({ invoice: { ...invoicePayload, id: "preview" }, warning: "Invoice storage is not installed yet, so this invoice was generated as a preview." });
    }

    await writeAuditLog(supabase, { actor: profile, action: "merchant.invoice_generate", entityType: "business_invoice", entityId: invoiceNumber, metadata: { totalAmount, count: quotes.length }, request });
    return NextResponse.json({ invoice: invoice.data }, { status: 201 });
  }

  return NextResponse.json({ error: "Unsupported merchant action." }, { status: 400 });
}
