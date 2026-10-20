import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { normalizeIntegrationEndpoint, normalizeIntegrationEvents } from "@/server/cloud-scale-features";
import { requireCloudFeature } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const integrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  endpointUrl: z.string().trim().url().max(2048),
  eventTypes: z.array(z.string()).min(1).max(10)
});

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-integrations", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireCloudFeature(request, "custom_integrations", ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Custom integrations are unavailable." }, { status: 503 });
  const result = await supabase.from("cloud_custom_integrations").select("id,name,endpoint_url,event_types,created_at,updated_at").eq("company_id", access.tenant.companyId).order("created_at", { ascending: false });
  if (result.error) return NextResponse.json({ error: "Unable to load custom integrations." }, { status: 500 });
  return NextResponse.json({ integrations: result.data ?? [], deliveryEnabled: false });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-integrations-create", { limit: 10, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireCloudFeature(request, "custom_integrations", ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });
  const parsed = await parseJson(request, integrationSchema, "Enter a valid integration configuration.");
  if (parsed.response) return parsed.response;
  const endpointUrl = normalizeIntegrationEndpoint(parsed.data.endpointUrl);
  const eventTypes = normalizeIntegrationEvents(parsed.data.eventTypes);
  if (!endpointUrl || !eventTypes) return NextResponse.json({ error: "Use a public HTTPS endpoint and supported shipment events." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Custom integrations are unavailable." }, { status: 503 });
  const result = await supabase.from("cloud_custom_integrations").insert({
    company_id: access.tenant.companyId,
    name: parsed.data.name,
    endpoint_url: endpointUrl,
    event_types: eventTypes
  }).select("id,name,endpoint_url,event_types,created_at,updated_at").single();
  if (result.error) {
    if (result.error.code === "23505") return NextResponse.json({ error: "An integration with this name already exists." }, { status: 409 });
    return NextResponse.json({ error: "Unable to save custom integration." }, { status: 500 });
  }
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.integration.create", entityType: "cloud_custom_integration", entityId: result.data.id, request });
  return NextResponse.json({ integration: result.data, deliveryEnabled: false }, { status: 201 });
}
