import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { logPaymentError } from "@/server/monitoring";
import { requireCompanyRole } from "@/server/tenancy";
import { verifyCloudSubscriptionPayment } from "@/server/cloud-billing";

export const dynamic = "force-dynamic";

const verifySchema = z.object({
  txRef: z.string().trim().min(6).max(180),
  transactionId: z.string().trim().min(1).max(120).optional().nullable()
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-billing-verify", { limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireCompanyRole(request, ["owner", "admin"]);
  if (!access.profile || !access.tenant) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, verifySchema, "Unable to verify Cloud billing payment.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Cloud billing verification is temporarily unavailable." }, { status: 503 });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });

  try {
    const result = await verifyCloudSubscriptionPayment({
      supabase,
      companyId: access.tenant.companyId,
      txRef: parsed.data.txRef,
      transactionId: parsed.data.transactionId
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    logPaymentError(error, "Unable to verify Fly Logistics Cloud subscription payment.", {
      companyId: access.tenant.companyId,
      txRef: parsed.data.txRef
    });
    return NextResponse.json({ error: "Unable to verify the subscription payment right now. Please retry shortly." }, { status: 500 });
  }
}
