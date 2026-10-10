import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/server/api";
import { logApiError, requestContext } from "@/server/monitoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "merchant-access", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Merchant access is temporarily unavailable." }, { status: 503 });

  try {
    const memberships = await supabase
      .from("business_account_members")
      .select("id,business_account_id,role,status,created_at")
      .eq("user_id", access.profile.id)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (memberships.error) throw memberships.error;
    const accountIds = (memberships.data ?? []).map((membership) => membership.business_account_id).filter(Boolean);
    if (accountIds.length === 0) {
      return NextResponse.json({ hasMerchantAccess: false, memberships: [], accounts: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const accounts = await supabase
      .from("business_accounts")
      .select("id,account_name,status,verification_status,onboarding_completed_at,contact_email")
      .in("id", accountIds)
      .order("created_at", { ascending: true });
    if (accounts.error) throw accounts.error;

    const allAccounts = accounts.data ?? [];
    const activeAccounts = allAccounts.filter((account) => String(account.status ?? "").toUpperCase() === "ACTIVE");
    return NextResponse.json({
      hasMerchantAccess: activeAccounts.length > 0,
      merchantAccessBlocked: allAccounts.length > 0 && activeAccounts.length === 0,
      memberships: memberships.data ?? [],
      accounts: activeAccounts
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logApiError(error, "Unable to resolve merchant membership.", requestContext(request, { userId: access.profile.id }));
    return NextResponse.json({ error: "Unable to verify merchant access." }, { status: 500 });
  }
}
