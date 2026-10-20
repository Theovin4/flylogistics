import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { normalizeIntegrationEndpoint, normalizeIntegrationEvents } from "@/server/cloud-scale-features";
import { requireCloudFeature } from "@/server/tenancy";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  endpointUrl: z.string().trim().url().max(2048).optional(),
  eventTypes: z.array(z.string()).min(1).max(10).optional()
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, { params }: { params: Promise<{ integrationId: string }> }) {
  const access = await requireCloudFeature(request, "custom_integrations", ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });
  const parsed = await parseJson(request, updateSchema, "Enter valid integration settings.");
  if (parsed.response) return parsed.response;
  const endpointUrl = parsed.data.endpointUrl === undefined ? undefined : normalizeIntegrationEndpoint(parsed.data.endpointUrl);
  const eventTypes = parsed.data.eventTypes === undefined ? undefined : normalizeIntegrationEvents(parsed.data.eventTypes);
  if (endpointUrl === null || eventTypes === null) return NextResponse.json({ error: "Use a public HTTPS endpoint and supported shipment events." }, { status: 400 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Custom integrations are unavailable." }, { status: 503 });
  const { integrationId } = await params;
  const result = await supabase.from("cloud_custom_integrations").update({
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(endpointUrl !== undefined ? { endpoint_url: endpointUrl } : {}),
    ...(eventTypes !== undefined ? { event_types: eventTypes } : {}),
    updated_at: new Date().toISOString()
  }).eq("id", integrationId).eq("company_id", access.tenant.companyId).select("id,name,endpoint_url,event_types,created_at,updated_at").maybeSingle();
  if (result.error) {
    if (result.error.code === "23505") return NextResponse.json({ error: "An integration with this name already exists." }, { status: 409 });
    return NextResponse.json({ error: "Unable to update custom integration." }, { status: 500 });
  }
  if (!result.data) return NextResponse.json({ error: "Integration not found." }, { status: 404 });
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.integration.update", entityType: "cloud_custom_integration", entityId: integrationId, request });
  return NextResponse.json({ integration: result.data, deliveryEnabled: false });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ integrationId: string }> }) {
  const access = await requireCloudFeature(request, "custom_integrations", ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Custom integrations are unavailable." }, { status: 503 });
  const { integrationId } = await params;
  const result = await supabase.from("cloud_custom_integrations").delete().eq("id", integrationId).eq("company_id", access.tenant.companyId).select("id").maybeSingle();
  if (result.error) return NextResponse.json({ error: "Unable to delete custom integration." }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Integration not found." }, { status: 404 });
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.integration.delete", entityType: "cloud_custom_integration", entityId: integrationId, request });
  return NextResponse.json({ ok: true });
}
