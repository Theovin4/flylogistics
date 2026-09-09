import { NextResponse } from "next/server";
import { z } from "zod";
import type { CloudBillingPlan } from "@/lib/cloud-plans";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { createCloudSubscriptionCheckout, persistCloudBillingCheckout } from "@/server/cloud-billing";
import { logPaymentError } from "@/server/monitoring";
import { requireCompanyRole } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  plan: z.enum(["starter", "growth", "scale"])
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-billing-checkout", { limit: 12, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireCompanyRole(request, ["owner", "admin"]);
  if (!access.profile || !access.tenant) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, checkoutSchema, "Choose a valid Fly Logistics Cloud plan.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Cloud billing is temporarily unavailable." }, { status: 503 });
  if (!access.tenant.company || !access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });

  try {
    const checkout = await createCloudSubscriptionCheckout({
      company: {
        id: access.tenant.companyId,
        slug: access.tenant.company.slug,
        name: access.tenant.company.name,
        support_email: access.tenant.company.support_email,
        support_phone: access.tenant.company.support_phone
      },
      owner: {
        email: access.profile.email ?? access.tenant.company.support_email ?? "billing@flylogistics.com.ng",
        name: access.profile.full_name,
        phone: access.profile.phone
      },
      plan: parsed.data.plan as CloudBillingPlan
    });

    const saved = await persistCloudBillingCheckout(supabase, access.tenant.companyId, {
      plan: parsed.data.plan as CloudBillingPlan,
      reference: checkout.txRef,
      amount: checkout.amount,
      currency: checkout.currency
    });

    if (saved.error) throw saved.error;

    return NextResponse.json({
      ok: true,
      checkoutUrl: checkout.checkoutUrl,
      reference: checkout.txRef,
      amount: checkout.amount,
      currency: checkout.currency,
      company: saved.data
    });
  } catch (error) {
    logPaymentError(error, "Unable to create Fly Logistics Cloud subscription checkout.", {
      companyId: access.tenant.companyId,
      plan: parsed.data.plan
    });
    return NextResponse.json({ error: "Unable to prepare secure subscription checkout. Please try again shortly." }, { status: 500 });
  }
}
