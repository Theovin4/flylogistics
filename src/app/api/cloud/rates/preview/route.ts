import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { calculateTenantRate } from "@/server/tenant-pricing";
import { requireCloudFeature } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const previewSchema = z.object({
  serviceType: z.enum(["local_nigeria", "international_import", "international_export"]),
  pickupZone: z.string().trim().min(1).max(120),
  destinationZone: z.string().trim().min(1).max(120),
  weightKg: z.coerce.number().positive().max(100_000)
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-rates-preview", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireCloudFeature(request, "rates", ["owner", "admin", "dispatcher"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = await parseJson(request, previewSchema, "Enter a pickup, destination, service, and valid weight.");
  if (parsed.response) return parsed.response;
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Company pricing is temporarily unavailable." }, { status: 503 });

  const quote = await calculateTenantRate(supabase, { companyId: access.tenant.companyId, ...parsed.data });
  if (!quote) return NextResponse.json({ automaticPrice: false, message: "No active rate covers this route. Price review is required." });
  return NextResponse.json({ automaticPrice: true, quote });
}
