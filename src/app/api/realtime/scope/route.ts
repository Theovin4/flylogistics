import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getRequestProfile } from "@/lib/request-auth";
import { getDefaultCompany, getTenantContextForProfile } from "@/server/tenancy";
import { logWarn, requestContext } from "@/server/monitoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ companyId: null, scope: "unavailable" }, { status: 503 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("public") === "1") {
    const defaultCompany = await getDefaultCompany(supabase);
    if (defaultCompany.error) {
      logWarn("Unable to resolve public realtime company scope.", requestContext(request, { reason: defaultCompany.error.message }));
    }

    return NextResponse.json(
      {
        companyId: defaultCompany.company?.id ?? null,
        companySlug: defaultCompany.company?.slug ?? "fly-logistics",
        scope: "public"
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  }

  const access = await getRequestProfile(request);
  if (!access.profile) {
    return NextResponse.json({ error: access.error ?? "Authentication required." }, { status: access.status ?? 401 });
  }

  const tenant = await getTenantContextForProfile(supabase, access.profile);
  return NextResponse.json(
    {
      companyId: tenant.companyId,
      companySlug: tenant.company?.slug ?? null,
      role: access.profile.role,
      companyRole: tenant.companyRole,
      scope: "authenticated"
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
