import { cleanEnv } from "@/lib/env";
import { cloudPlanDefinitions, legacyNgnCloudPlanPrices, getCloudBillingPlanKey, type CloudBillingPlan } from "@/lib/cloud-plans";
import { cloudBillingSnapshotMatchesTransaction } from "@/lib/cloud-billing-security";
import { formatMoney, normalizeTenantLocale } from "@/lib/tenant-locale";
import { siteConfig } from "@/lib/site";
import type { getSupabaseAdmin } from "@/lib/supabase-server";
import { createFlutterwaveCheckout, verifyFlutterwaveTransaction } from "@/server/payments/flutterwave";
import { logPaymentError, logWarn } from "@/server/monitoring";
import { sendEmailNotification } from "@/server/notifications/email";
import { writeOperationalEvent } from "@/server/operational-events";
import { resolveCloudPlanPrice } from "@/server/cloud-plan-prices";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type DbError = { code?: string; message?: string } | null | undefined;

type CloudBillingStatus =
  | "pending"
  | "trialing"
  | "active"
  | "past_due"
  | "payment_failed"
  | "cancelled"
  | "expired";

type CloudSubscriptionUpsert = {
  companyId: string;
  plan: CloudBillingPlan;
  status: CloudBillingStatus;
  amount?: number | string | null;
  currency?: string | null;
  paymentReference?: string | null;
  flutterwaveCustomerId?: string | number | null;
  flutterwaveSubscriptionId?: string | number | null;
  startedAt?: string | null;
  renewalDate?: string | null;
  cancelledAt?: string | null;
  metadata?: Record<string, unknown>;
  priceVersion?: string | null;
  provider?: string | null;
  providerPlanId?: string | null;
  billingInterval?: string | null;
  providerTransactionId?: string | null;
};

type CloudBillingSnapshot = {
  company_id: string;
  plan: CloudBillingPlan;
  status: string | null;
  amount: number | string;
  currency: string;
  payment_reference: string;
  price_version: string | null;
  provider: string | null;
  provider_plan_id: string | null;
  billing_interval: string | null;
  provider_transaction_id: string | null;
  flutterwave_subscription_id?: string | null;
};

export type CloudBillingWebhookInput = {
  eventType?: string | null;
  transactionId?: string | null;
  txRef?: string | null;
  callbackStatus?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  flutterwaveCustomerId?: string | number | null;
  flutterwaveSubscriptionId?: string | number | null;
};

function tableMissing(error: DbError) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST204" || message.includes("could not find");
}

function addOneMonth(date = new Date()) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function planFromReference(txRef?: string | null) {
  const match = String(txRef ?? "").match(/^FLY-CLOUD-[A-Z0-9-]+-(STARTER|GROWTH|SCALE)-\d+$/i);
  return match ? getCloudBillingPlanKey(match[1].toLowerCase()) : null;
}

export function isCloudBillingReference(txRef?: string | null) {
  return /^FLY-CLOUD-/i.test(String(txRef ?? ""));
}

export function makeCloudBillingReference(companySlug: string, plan: CloudBillingPlan) {
  const safeSlug = companySlug.replace(/[^a-z0-9-]+/gi, "-").toUpperCase();
  return `FLY-CLOUD-${safeSlug}-${plan.toUpperCase()}-${Date.now()}`;
}

function normalizeWebhookStatus(input: CloudBillingWebhookInput): CloudBillingStatus {
  const text = `${input.eventType ?? ""} ${input.callbackStatus ?? ""}`.toLowerCase();
  if (text.includes("cancel")) return "cancelled";
  if (text.includes("expire")) return "expired";
  if (text.includes("fail") || text.includes("unsuccessful")) return "payment_failed";
  if (text.includes("past_due")) return "past_due";
  if (text.includes("created") || text.includes("successful") || text.includes("renew") || text.includes("active")) return "active";
  return "pending";
}

function statusForCompany(status: CloudBillingStatus) {
  if (status === "payment_failed") return "past_due";
  return status;
}

function subscriptionIdFromTransaction(transaction: Awaited<ReturnType<typeof verifyFlutterwaveTransaction>>, txRef: string) {
  const direct = transaction.subscription_id ?? transaction.subscription?.id;
  if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct);
  return txRef;
}

function customerIdFromTransaction(transaction: Awaited<ReturnType<typeof verifyFlutterwaveTransaction>>) {
  const id = transaction.customer?.id;
  return id === undefined || id === null ? null : String(id);
}

function providerPlanIdFromTransaction(transaction: Awaited<ReturnType<typeof verifyFlutterwaveTransaction>>) {
  const plan = transaction.plan;
  if (plan === undefined || plan === null) return null;
  if (typeof plan === "object") return plan.id === undefined || plan.id === null ? null : String(plan.id);
  return String(plan);
}

function snapshotMatchesTransaction(
  snapshot: Pick<CloudBillingSnapshot, "amount" | "currency" | "payment_reference" | "price_version" | "provider" | "provider_plan_id">,
  transaction: Awaited<ReturnType<typeof verifyFlutterwaveTransaction>>
) {
  return cloudBillingSnapshotMatchesTransaction({
    amount: snapshot.amount,
    currency: snapshot.currency,
    paymentReference: snapshot.payment_reference,
    priceVersion: snapshot.price_version,
    provider: snapshot.provider,
    providerPlanId: snapshot.provider_plan_id
  }, {
    status: transaction.status,
    transactionReference: transaction.tx_ref,
    amount: transaction.amount,
    currency: transaction.currency,
    providerPlanId: providerPlanIdFromTransaction(transaction)
  });
}

async function sendCloudBillingEmail(input: {
  company?: { name?: string | null; support_email?: string | null; billing_email?: string | null; locale?: string | null } | null;
  workflow: string;
  status: CloudBillingStatus;
  plan: CloudBillingPlan;
  amount?: number | string | null;
  currency?: string | null;
  reference?: string | null;
}) {
  const emailTo = input.company?.billing_email ?? input.company?.support_email;
  if (!emailTo) return null;

  const plan = cloudPlanDefinitions[input.plan];
  const fallbackPrice = legacyNgnCloudPlanPrices[input.plan];
  const amount = formatMoney(input.amount ?? fallbackPrice.amount, input.currency ?? fallbackPrice.currency, normalizeTenantLocale(input.company?.locale));
  const statusLabel = input.status.replaceAll("_", " ");

  return sendEmailNotification({
    emailTo,
    to: emailTo,
    workflow: input.workflow,
    entityType: "cloud_subscription",
    entityId: input.reference ?? input.company?.name ?? input.plan,
    subject: `Fly Logistics Cloud: ${plan.name} subscription ${statusLabel}`,
    title: `${plan.name} subscription ${statusLabel}`,
    message: `${input.company?.name ?? "Your company"} is on the ${plan.name} monthly plan. Billing amount: ${amount}. Status: ${statusLabel}.`,
    ctaUrl: `${siteConfig.url}/cloud/billing`,
    ctaLabel: "Open billing"
  });
}

async function upsertCloudSubscription(supabase: SupabaseAdminClient, input: CloudSubscriptionUpsert) {
  const now = new Date().toISOString();
  const payload = {
    company_id: input.companyId,
    plan: input.plan,
    status: input.status,
    amount: input.amount ?? legacyNgnCloudPlanPrices[input.plan].amount,
    currency: input.currency ?? legacyNgnCloudPlanPrices[input.plan].currency,
    payment_reference: input.paymentReference ?? null,
    flutterwave_customer_id: input.flutterwaveCustomerId === undefined || input.flutterwaveCustomerId === null ? null : String(input.flutterwaveCustomerId),
    flutterwave_subscription_id: input.flutterwaveSubscriptionId === undefined || input.flutterwaveSubscriptionId === null ? null : String(input.flutterwaveSubscriptionId),
    started_at: input.startedAt ?? null,
    renewal_date: input.renewalDate ?? null,
    cancelled_at: input.cancelledAt ?? null,
    metadata: input.metadata ?? {},
    ...(input.priceVersion !== undefined ? { price_version: input.priceVersion } : {}),
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.providerPlanId !== undefined ? { provider_plan_id: input.providerPlanId } : {}),
    ...(input.billingInterval !== undefined ? { billing_interval: input.billingInterval } : {}),
    ...(input.providerTransactionId !== undefined ? { provider_transaction_id: input.providerTransactionId } : {}),
    updated_at: now
  };

  const result = await supabase
    .from("subscriptions")
    .upsert(payload, { onConflict: "payment_reference" })
    .select("*")
    .single();

  if (tableMissing(result.error)) {
    logWarn("Cloud subscriptions table is not installed; company billing status was still updated.", {
      companyId: input.companyId,
      plan: input.plan,
      status: input.status
    });
    return { data: null, error: null, missing: true };
  }

  return { data: result.data, error: result.error, missing: false };
}

export async function createCloudSubscriptionCheckout(input: {
  supabase: SupabaseAdminClient;
  company: {
    id: string;
    slug: string;
    name: string;
    support_email?: string | null;
    support_phone?: string | null;
    billing_currency?: string | null;
    locale?: string | null;
  };
  owner: {
    email: string;
    name?: string | null;
    phone?: string | null;
  };
  plan: CloudBillingPlan;
  redirectPath?: string;
}) {
  const plan = cloudPlanDefinitions[input.plan];
  const resolved = await resolveCloudPlanPrice(input.supabase, {
    plan: input.plan,
    requestedCurrency: input.company.billing_currency
  });
  const price = resolved.price;
  if (!price.configured || !price.providerPlanId) {
    throw new Error(`Subscription billing is not configured for ${resolved.requestedCurrency}.`);
  }
  const appUrl = (cleanEnv(process.env.NEXT_PUBLIC_APP_URL) ?? siteConfig.url).replace(/\/$/, "");
  const reference = makeCloudBillingReference(input.company.slug, input.plan);

  const saved = await persistCloudBillingCheckout(input.supabase, input.company.id, {
    plan: input.plan,
    reference,
    amount: price.amount,
    currency: price.currency,
    priceVersion: price.priceVersion,
    provider: price.provider,
    providerPlanId: price.providerPlanId,
    billingInterval: price.billingInterval
  });
  if (saved.error) throw saved.error;

  const checkout = await createFlutterwaveCheckout({
    txRef: reference,
    amount: price.amount,
    currency: price.currency,
    redirectUrl: `${appUrl}${input.redirectPath ?? "/cloud/billing"}?billing=processing&tx_ref=${encodeURIComponent(reference)}`,
    customer: {
      email: input.owner.email,
      name: input.owner.name || input.company.name,
      phone: input.owner.phone ?? input.company.support_phone
    },
    description: `Fly Logistics Cloud ${plan.name} monthly subscription`,
    paymentPurpose: "merchant",
    paymentPlanId: price.providerPlanId,
    metadata: {
      product: "fly_logistics_cloud",
      company_id: input.company.id,
      company_slug: input.company.slug,
      cloud_plan: input.plan,
      billing_currency: price.currency,
      billing_amount: price.amount,
      price_version: price.priceVersion,
      provider: price.provider,
      provider_plan_id: price.providerPlanId,
      billing_interval: price.billingInterval,
      recurring_configured: true
    }
  });

  return { ...checkout, priceVersion: price.priceVersion, provider: price.provider, providerPlanId: price.providerPlanId, requestedCurrency: resolved.requestedCurrency, fallbackCurrency: resolved.fallback, company: saved.data };
}

export async function persistCloudBillingCheckout(
  supabase: SupabaseAdminClient,
  companyId: string,
  input: {
    plan: CloudBillingPlan;
    reference: string;
    amount: number;
    currency: string;
    priceVersion: string;
    provider: "flutterwave";
    providerPlanId: string;
    billingInterval: "monthly";
  }
) {
  const subscription = await upsertCloudSubscription(supabase, {
    companyId,
    plan: input.plan,
    status: "pending",
    amount: input.amount,
    currency: input.currency,
    paymentReference: input.reference,
    metadata: { source: "checkout_created" },
    priceVersion: input.priceVersion,
    provider: input.provider,
    providerPlanId: input.providerPlanId,
    billingInterval: input.billingInterval
  });
  if (subscription.error) {
    logPaymentError(subscription.error, "Unable to persist pending Cloud subscription.", { companyId, txRef: input.reference });
    return { data: null, error: subscription.error };
  }

  // A checkout attempt must not change the active plan, amount, or currency.
  // Those company facts are updated only after the provider transaction matches
  // this immutable pending snapshot.
  const saved = await supabase
    .from("companies")
    .update({
      last_billing_reference: input.reference,
      last_billing_status: "PENDING",
      updated_at: new Date().toISOString()
    })
    .eq("id", companyId)
    .select("id,name,slug,subscription_status,subscription_plan,trial_ends_at,billing_amount,billing_currency,last_billing_reference,last_billing_status,updated_at")
    .single();

  if (saved.error && subscription.data?.id) {
    const rollback = await supabase.from("subscriptions").delete().eq("id", subscription.data.id).eq("status", "pending");
    if (rollback.error) logPaymentError(rollback.error, "Unable to roll back an incomplete Cloud billing snapshot.", { companyId, txRef: input.reference });
  }
  return saved;
}

export async function verifyCloudSubscriptionPayment(input: {
  supabase: SupabaseAdminClient;
  companyId: string;
  txRef: string;
  transactionId?: string | null;
}) {
  const { data: company, error: companyError } = await input.supabase
    .from("companies")
    .select("id,name,slug,support_email,billing_email,locale,subscription_plan,billing_amount,billing_currency,last_billing_reference")
    .eq("id", input.companyId)
    .maybeSingle();

  if (companyError) throw companyError;
  if (!company) throw new Error("Company billing record was not found.");
  if (company.last_billing_reference !== input.txRef) throw new Error("Billing reference does not match this workspace.");
  if (!input.transactionId) throw new Error("Flutterwave transaction ID is required to verify this subscription payment.");

  const pendingResult = await input.supabase
    .from("subscriptions")
    .select("company_id,plan,status,amount,currency,payment_reference,price_version,provider,provider_plan_id,billing_interval,provider_transaction_id,flutterwave_subscription_id")
    .eq("company_id", input.companyId)
    .eq("payment_reference", input.txRef)
    .maybeSingle();
  if (pendingResult.error) throw pendingResult.error;
  if (!pendingResult.data) throw new Error("Pending subscription price snapshot was not found.");
  const snapshot = pendingResult.data as CloudBillingSnapshot;
  if (snapshot.status === "active") {
    return { ok: true, duplicate: true, company, message: "This subscription payment was already activated." };
  }

  const transaction = await verifyFlutterwaveTransaction(input.transactionId);
  const planKey = getCloudBillingPlanKey(snapshot.plan);
  const paidAmount = Number(transaction.amount ?? 0);
  const expectedAmount = Number(snapshot.amount);
  const isSuccessful = snapshotMatchesTransaction(snapshot, transaction);

  if (!isSuccessful) {
    const failed = await input.supabase
      .from("companies")
      .update({
        subscription_status: "past_due",
        last_billing_status: "FAILED",
        updated_at: new Date().toISOString()
      })
      .eq("id", input.companyId)
      .select("id,name,slug,subscription_status,subscription_plan,trial_ends_at,billing_amount,billing_currency,last_billing_reference,last_billing_status")
      .single();

    const subscription = await upsertCloudSubscription(input.supabase, {
      companyId: input.companyId,
      plan: planKey,
      status: "payment_failed",
      amount: transaction.amount ?? expectedAmount,
      currency: transaction.currency ?? snapshot.currency,
      paymentReference: input.txRef,
      flutterwaveCustomerId: customerIdFromTransaction(transaction),
      flutterwaveSubscriptionId: subscriptionIdFromTransaction(transaction, input.txRef),
      metadata: { transactionId: input.transactionId, source: "callback_verify" },
      priceVersion: snapshot.price_version,
      provider: snapshot.provider,
      providerPlanId: snapshot.provider_plan_id,
      billingInterval: snapshot.billing_interval,
      providerTransactionId: input.transactionId
    });
    if (subscription.error) logPaymentError(subscription.error, "Unable to persist failed Cloud subscription verification.", { companyId: input.companyId, txRef: input.txRef });
    await sendCloudBillingEmail({ company, workflow: "cloud_subscription_payment_failed", status: "payment_failed", plan: planKey, amount: transaction.amount ?? expectedAmount, currency: transaction.currency ?? snapshot.currency, reference: input.txRef });

    return {
      ok: false,
      company: failed.data,
      message: "We could not confirm this subscription payment yet."
    };
  }

  const now = new Date();
  const renewsAt = addOneMonth(now);
  const subscriptionId = subscriptionIdFromTransaction(transaction, input.txRef);
  const customerId = customerIdFromTransaction(transaction);

  const updated = await input.supabase
    .from("companies")
    .update({
      subscription_status: "active",
      subscription_plan: planKey,
      billing_amount: expectedAmount,
      billing_currency: snapshot.currency,
      flutterwave_subscription_reference: input.txRef,
      flutterwave_subscription_id: subscriptionId,
      flutterwave_customer_id: customerId,
      subscription_started_at: now.toISOString(),
      subscription_renews_at: renewsAt.toISOString(),
      last_billing_status: "PAID",
      updated_at: now.toISOString()
    })
    .eq("id", input.companyId)
    .select("id,name,slug,subscription_status,subscription_plan,trial_ends_at,billing_amount,billing_currency,last_billing_reference,last_billing_status,subscription_started_at,subscription_renews_at")
    .single();

  if (updated.error) throw updated.error;

  const subscription = await upsertCloudSubscription(input.supabase, {
    companyId: input.companyId,
    plan: planKey,
    status: "active",
    amount: paidAmount,
    currency: snapshot.currency,
    paymentReference: input.txRef,
    flutterwaveCustomerId: customerId,
    flutterwaveSubscriptionId: subscriptionId,
    startedAt: now.toISOString(),
    renewalDate: renewsAt.toISOString(),
    metadata: { transactionId: input.transactionId, source: "callback_verify" },
    priceVersion: snapshot.price_version,
    provider: snapshot.provider,
    providerPlanId: snapshot.provider_plan_id,
    billingInterval: snapshot.billing_interval,
    providerTransactionId: input.transactionId
  });
  if (subscription.error) logPaymentError(subscription.error, "Unable to persist active Cloud subscription.", { companyId: input.companyId, txRef: input.txRef });

  await sendCloudBillingEmail({ company, workflow: "cloud_subscription_activated", status: "active", plan: planKey, amount: paidAmount, currency: snapshot.currency, reference: input.txRef });

  return {
    ok: true,
    company: updated.data,
    message: "Fly Logistics Cloud subscription is active."
  };
}

export async function processCloudBillingWebhook(supabase: SupabaseAdminClient, input: CloudBillingWebhookInput) {
  if (!isCloudBillingReference(input.txRef) && !input.flutterwaveSubscriptionId) return { handled: false };

  const txRef = input.txRef ?? null;
  const status = normalizeWebhookStatus(input);
  const now = new Date();
  const renewalDate = status === "active" ? addOneMonth(now).toISOString() : null;

  let snapshotQuery = supabase
    .from("subscriptions")
    .select("company_id,plan,status,amount,currency,payment_reference,price_version,provider,provider_plan_id,billing_interval,provider_transaction_id,flutterwave_subscription_id")
    .limit(1);
  snapshotQuery = txRef
    ? snapshotQuery.eq("payment_reference", txRef)
    : snapshotQuery.eq("flutterwave_subscription_id", String(input.flutterwaveSubscriptionId));
  const snapshotResult = await snapshotQuery.maybeSingle();
  if (snapshotResult.error) throw snapshotResult.error;
  const snapshot = snapshotResult.data as CloudBillingSnapshot | null;
  if (!snapshot) {
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: "warning",
      message: "Flutterwave Cloud subscription webhook did not match an immutable billing snapshot.",
      entityType: "cloud_subscription",
      entityId: txRef ?? String(input.flutterwaveSubscriptionId ?? ""),
      metadata: { eventType: input.eventType, status: input.callbackStatus }
    });
    return { handled: true, ok: false, message: "Cloud subscription price snapshot not found." };
  }

  const companyQuery = supabase
    .from("companies")
    .select("id,name,slug,support_email,billing_email,locale,subscription_plan,billing_amount,billing_currency,last_billing_reference")
    .eq("id", snapshot.company_id)
    .limit(1);

  const { data: companies, error: companyError } = await companyQuery;
  if (companyError) throw companyError;
  const company = companies?.[0];

  if (!company) {
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: "warning",
      message: "Flutterwave Cloud subscription webhook did not match a company.",
      entityType: "cloud_subscription",
      entityId: txRef ?? String(input.flutterwaveSubscriptionId ?? ""),
      metadata: { eventType: input.eventType, status: input.callbackStatus }
    });
    return { handled: true, ok: false, message: "Cloud subscription company not found." };
  }

  const storedPlan = getCloudBillingPlanKey(snapshot.plan);
  const referencePlan = txRef ? planFromReference(txRef) : null;
  if (txRef && (!referencePlan || referencePlan !== storedPlan)) {
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: "warning",
      message: "Rejected a Cloud subscription webhook with a mismatched plan reference.",
      entityType: "cloud_subscription",
      entityId: txRef,
      metadata: { eventType: input.eventType, storedPlan }
    });
    return { handled: true, ok: false, message: "Cloud subscription plan reference did not match the pending company plan." };
  }
  const planKey = referencePlan ?? storedPlan;
  let verifiedAmount = input.amount;
  let verifiedCurrency = input.currency;
  if (status === "active") {
    if (!input.transactionId || !txRef) {
      await writeOperationalEvent(supabase, {
        category: "payment",
        severity: "warning",
        message: "Rejected an unverifiable active Cloud subscription webhook.",
        entityType: "cloud_subscription",
        entityId: txRef ?? String(input.flutterwaveSubscriptionId ?? company.id),
        metadata: { eventType: input.eventType, reason: "missing_transaction_or_reference" }
      });
      return { handled: true, ok: false, message: "Active subscription event requires transaction verification." };
    }
    const transaction = await verifyFlutterwaveTransaction(input.transactionId);
    if (!snapshotMatchesTransaction(snapshot, transaction)) {
      await writeOperationalEvent(supabase, {
        category: "payment",
        severity: "warning",
        message: "Rejected a Cloud subscription webhook with mismatched verified payment facts.",
        entityType: "cloud_subscription",
        entityId: txRef,
        metadata: { eventType: input.eventType, plan: planKey }
      });
      return { handled: true, ok: false, message: "Cloud subscription payment verification failed." };
    }
    verifiedAmount = transaction.amount;
    verifiedCurrency = transaction.currency;
  }

  const existing = txRef
    ? await supabase.from("subscriptions").select("id,status,payment_reference").eq("payment_reference", txRef).maybeSingle()
    : { data: null, error: null };
  if (!existing.error && existing.data?.status === status) {
    return { handled: true, ok: true, duplicate: true, status };
  }
  const subscription = await upsertCloudSubscription(supabase, {
    companyId: company.id,
    plan: planKey,
    status,
    amount: verifiedAmount ?? snapshot.amount,
    currency: verifiedCurrency ?? snapshot.currency,
    paymentReference: txRef,
    flutterwaveCustomerId: input.flutterwaveCustomerId,
    flutterwaveSubscriptionId: input.flutterwaveSubscriptionId ?? txRef,
    startedAt: status === "active" ? now.toISOString() : null,
    renewalDate,
    cancelledAt: status === "cancelled" || status === "expired" ? now.toISOString() : null,
    metadata: { eventType: input.eventType, callbackStatus: input.callbackStatus, source: "webhook" },
    priceVersion: snapshot.price_version,
    provider: snapshot.provider,
    providerPlanId: snapshot.provider_plan_id,
    billingInterval: snapshot.billing_interval,
    providerTransactionId: input.transactionId ?? snapshot.provider_transaction_id
  });
  if (subscription.error) throw subscription.error;

  const companyUpdate = await supabase
    .from("companies")
    .update({
      subscription_status: statusForCompany(status),
      subscription_plan: planKey,
      billing_amount: verifiedAmount ?? snapshot.amount,
      billing_currency: verifiedCurrency ?? snapshot.currency,
      flutterwave_subscription_id: input.flutterwaveSubscriptionId === undefined || input.flutterwaveSubscriptionId === null ? undefined : String(input.flutterwaveSubscriptionId),
      subscription_renews_at: renewalDate,
      last_billing_status: status === "active" ? "PAID" : status.toUpperCase(),
      updated_at: now.toISOString()
    })
    .eq("id", company.id)
    .select("id,name,slug,subscription_status,subscription_plan,billing_amount,billing_currency,subscription_renews_at,last_billing_status")
    .single();

  if (companyUpdate.error) throw companyUpdate.error;

  await writeOperationalEvent(supabase, {
    category: "payment",
    severity: status === "payment_failed" ? "warning" : "info",
    message: "Processed Flutterwave Cloud subscription webhook.",
    entityType: "cloud_subscription",
    entityId: txRef ?? String(input.flutterwaveSubscriptionId ?? company.id),
    metadata: { eventType: input.eventType, status, plan: planKey }
  });

  const workflow =
    status === "payment_failed" ? "cloud_subscription_payment_failed"
      : status === "cancelled" ? "cloud_subscription_cancelled"
        : status === "expired" ? "cloud_subscription_expired"
          : "cloud_subscription_renewed";
  await sendCloudBillingEmail({ company, workflow, status, plan: planKey, amount: verifiedAmount ?? snapshot.amount, currency: verifiedCurrency ?? snapshot.currency, reference: txRef });

  return { handled: true, ok: true, company: companyUpdate.data, status };
}

export async function cancelCloudSubscription(input: {
  supabase: SupabaseAdminClient;
  companyId: string;
}) {
  const now = new Date().toISOString();
  const { data: company, error: companyError } = await input.supabase
    .from("companies")
    .select("id,name,slug,support_email,billing_email,locale,subscription_plan,billing_amount,billing_currency,last_billing_reference,flutterwave_subscription_id")
    .eq("id", input.companyId)
    .maybeSingle();

  if (companyError) throw companyError;
  if (!company) throw new Error("Company billing record was not found.");

  const planKey = getCloudBillingPlanKey(company.subscription_plan);
  const subscription = await upsertCloudSubscription(input.supabase, {
    companyId: input.companyId,
    plan: planKey,
    status: "cancelled",
    amount: company.billing_amount ?? legacyNgnCloudPlanPrices[planKey].amount,
    currency: company.billing_currency ?? "NGN",
    paymentReference: company.last_billing_reference,
    flutterwaveSubscriptionId: company.flutterwave_subscription_id ?? company.last_billing_reference,
    cancelledAt: now,
    metadata: { source: "cloud_billing_page" }
  });
  if (subscription.error) throw subscription.error;

  const updated = await input.supabase
    .from("companies")
    .update({
      subscription_status: "cancelled",
      subscription_renews_at: null,
      last_billing_status: "CANCELLED",
      updated_at: now
    })
    .eq("id", input.companyId)
    .select("id,name,slug,subscription_status,subscription_plan,trial_ends_at,billing_amount,billing_currency,last_billing_reference,last_billing_status,subscription_started_at,subscription_renews_at")
    .single();

  if (updated.error) throw updated.error;

  await sendCloudBillingEmail({ company, workflow: "cloud_subscription_cancelled", status: "cancelled", plan: planKey, amount: company.billing_amount, currency: company.billing_currency, reference: company.last_billing_reference });

  return { ok: true, company: updated.data, message: "Cloud subscription cancellation was recorded." };
}
