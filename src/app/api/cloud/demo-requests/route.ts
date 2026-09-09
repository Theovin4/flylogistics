import { NextResponse } from "next/server";
import { z } from "zod";
import { cloudLeadStatuses } from "@/lib/cloud-sales";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { notifyAdmin } from "@/server/admin-notifications";
import { logApiError, requestContext } from "@/server/monitoring";
import { sendEmailNotification } from "@/server/notifications/email";
import { isTenantSchemaMissing } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const demoRequestSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(160),
  email: z.string().trim().email(),
  phone: z.string().trim().min(5).max(40),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  country: z.string().trim().max(120).optional().or(z.literal("")),
  fleetSize: z.string().trim().max(80).optional().or(z.literal("")),
  monthlyDeliveries: z.string().trim().max(80).optional().or(z.literal("")),
  teamSize: z.string().trim().max(80).optional().or(z.literal("")),
  monthlyShipments: z.string().trim().max(80).optional().or(z.literal("")),
  preferredDemoDate: z.string().trim().max(80).optional().or(z.literal("")),
  message: z.string().trim().max(1200).optional().or(z.literal("")),
  source: z.string().trim().max(120).optional().or(z.literal(""))
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-demo-request", { limit: 10, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await parseJson(request, demoRequestSchema, "Please complete the demo request form.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Demo requests are temporarily unavailable." }, { status: 503 });

  const fleetSize = parsed.data.fleetSize || parsed.data.teamSize || null;
  const monthlyDeliveries = parsed.data.monthlyDeliveries || parsed.data.monthlyShipments || null;
  const payload = {
    company_name: parsed.data.companyName,
    contact_name: parsed.data.contactName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    team_size: fleetSize,
    monthly_shipments: monthlyDeliveries,
    preferred_demo_date: parsed.data.preferredDemoDate || null,
    message: parsed.data.message || null,
    source: parsed.data.source || "cloud-demo",
    status: "new",
    metadata: {
      city: parsed.data.city || null,
      country: parsed.data.country || null,
      fleetSize,
      monthlyDeliveries,
      userAgent: request.headers.get("user-agent") ?? null,
      referrer: request.headers.get("referer") ?? null
    }
  };

  const { data, error } = await supabase.from("cloud_demo_requests").insert(payload).select("id,status,created_at").single();

  if (error && isTenantSchemaMissing(error)) {
    return NextResponse.json({ error: "Demo requests are temporarily unavailable. Please contact our team directly." }, { status: 503 });
  }

  if (error) {
    logApiError(error, "Unable to save Cloud demo request.", requestContext(request, { email: parsed.data.email }));
    return NextResponse.json({ error: "Unable to submit demo request right now." }, { status: 500 });
  }

  let leadId: string | null = null;
  try {
    const leadStatus = cloudLeadStatuses.includes("demo_scheduled") ? "demo_scheduled" : "new";
    const lead = await supabase
      .from("leads")
      .insert({
        company_name: parsed.data.companyName,
        contact_name: parsed.data.contactName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        city: parsed.data.city || null,
        country: parsed.data.country || null,
        fleet_size: fleetSize,
        monthly_deliveries: monthlyDeliveries,
        source: parsed.data.source || "cloud-demo",
        status: leadStatus,
        metadata: {
          cloudDemoRequestId: data.id,
          preferredDemoDate: parsed.data.preferredDemoDate || null,
          message: parsed.data.message || null
        }
      })
      .select("id")
      .single();
    if (!lead.error && lead.data) {
      leadId = lead.data.id;
      await supabase.from("demo_requests").insert({
        lead_id: leadId,
        company_name: parsed.data.companyName,
        contact_name: parsed.data.contactName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        city: parsed.data.city || null,
        fleet_size: fleetSize,
        monthly_deliveries: monthlyDeliveries,
        preferred_demo_date: parsed.data.preferredDemoDate || null,
        message: parsed.data.message || null,
        status: "requested",
        source: parsed.data.source || "cloud-demo",
        metadata: { cloudDemoRequestId: data.id }
      });
      await supabase.from("sales_activities").insert({
        lead_id: leadId,
        activity_type: "demo_request",
        title: "Demo requested",
        notes: parsed.data.message || "Cloud demo requested from website.",
        due_at: parsed.data.preferredDemoDate ? new Date(parsed.data.preferredDemoDate).toISOString() : null,
        metadata: { source: parsed.data.source || "cloud-demo", cloudDemoRequestId: data.id }
      });
    } else if (lead.error && !["42P01", "42703"].includes(lead.error.code ?? "")) {
      throw lead.error;
    }
  } catch (crmError) {
    logApiError(crmError, "Cloud demo request saved but CRM lead sync failed.", requestContext(request, { email: parsed.data.email }));
  }

  try {
    await supabase.from("operational_events").insert({
      severity: "info",
      category: "cloud_growth",
      message: `New Fly Logistics Cloud demo request from ${parsed.data.companyName}.`,
      entity_type: "cloud_demo_request",
      entity_id: data.id,
      metadata: { email: parsed.data.email, phone: parsed.data.phone, leadId }
    });
  } catch {
    // Demo capture must remain available even if optional event logging is unavailable.
  }

  await notifyAdmin(supabase, {
    title: "New Fly Logistics Cloud demo request",
    message: `${parsed.data.contactName} from ${parsed.data.companyName} requested a demo. Fleet size: ${fleetSize ?? "not provided"}. Monthly deliveries: ${monthlyDeliveries ?? "not provided"}.`,
    entityType: leadId ? "lead" : "cloud_demo_request",
    entityId: leadId ?? data.id,
    metadata: { ...payload, leadId },
    request
  });

  await sendEmailNotification({
    emailTo: parsed.data.email,
    workflow: "cloud_demo_requested",
    subject: "Fly Logistics Cloud demo request received",
    title: "Your Fly Logistics Cloud demo request is confirmed",
    message: `Hello ${parsed.data.contactName},\n\nThank you for requesting a Fly Logistics Cloud demo. Our team will review your operation and contact you with next steps shortly.`,
    ctaUrl: "https://flylogistics.com.ng/cloud",
    ctaLabel: "Explore Fly Logistics Cloud",
    entityType: leadId ? "lead" : "cloud_demo_request",
    entityId: leadId ?? data.id,
    metadata: { companyName: parsed.data.companyName, cloudDemoRequestId: data.id }
  });

  return NextResponse.json({
    ok: true,
    request: data,
    leadId,
    message: "Demo request received. Fly Logistics will contact you shortly."
  }, { status: 201 });
}
