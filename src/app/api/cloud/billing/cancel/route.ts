import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/server/api";
import { cancelCloudSubscription } from "@/server/cloud-billing";
import { logPaymentError } from "@/server/monitoring";
import { requireCompanyRole } from "@/server/tenancy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-billing-cancel", { limit: 8, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireCompanyRole(request, ["owner", "admin"]);
  if (!access.profile || !access.tenant) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Cloud billing cancellation is temporarily unavailable." }, { status: 503 });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });

  try {
    const result = await cancelCloudSubscription({ supabase, companyId: access.tenant.companyId });
    return NextResponse.json(result);
  } catch (error) {
    logPaymentError(error, "Unable to cancel Fly Logistics Cloud subscription.", {
      companyId: access.tenant.companyId
    });
    return NextResponse.json({ error: "Unable to cancel the subscription right now. Please retry shortly." }, { status: 500 });
  }
}
