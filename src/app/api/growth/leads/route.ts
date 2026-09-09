import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { notifyAdmin } from "@/server/admin-notifications";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const leadSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email(),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(180).optional(),
  leadType: z.enum(["customer", "merchant", "business", "whatsapp", "referral"]).default("customer"),
  source: z.string().trim().max(120).optional(),
  medium: z.string().trim().max(120).optional(),
  campaign: z.string().trim().max(180).optional(),
  message: z.string().trim().max(2000).optional(),
  website: z.string().trim().max(160).optional()
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "growth-lead", { limit: 10, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await parseJson(request, leadSchema, "Please complete the lead form.");
  if (parsed.response) return parsed.response;

  if (parsed.data.website) {
    return NextResponse.json({ ok: true, message: "Thanks. Fly Logistics will review your request." }, { status: 202 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Lead capture is temporarily unavailable." }, { status: 503 });

  try {
    const payload = {
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      company: parsed.data.company ?? null,
      lead_type: parsed.data.leadType,
      status: "new",
      source: parsed.data.source ?? "website",
      medium: parsed.data.medium ?? null,
      campaign: parsed.data.campaign ?? null,
      message: parsed.data.message ?? null,
      metadata: {
        userAgent: request.headers.get("user-agent"),
        referrer: request.headers.get("referer")
      }
    };
    const { data, error } = await supabase.from("growth_leads").insert(payload).select("id").single();
    if (error) throw error;

    await writeOperationalEvent(supabase, {
      category: "system",
      message: "Growth lead captured.",
      entityType: "growth_lead",
      entityId: data?.id,
      metadata: { leadType: payload.lead_type, source: payload.source, campaign: payload.campaign },
      request
    });
    await notifyAdmin(supabase, {
      title: "New growth lead",
      message: `${payload.full_name} submitted a ${payload.lead_type} lead from ${payload.source}.`,
      entityType: "growth_lead",
      entityId: data?.id,
      metadata: payload,
      request
    });

    return NextResponse.json({ ok: true, id: data?.id, message: "Thanks. Fly Logistics will contact you shortly." }, { status: 201 });
  } catch (error) {
    logApiError(error, "Unable to capture growth lead.", requestContext(request));
    return NextResponse.json({ error: "Unable to submit lead right now." }, { status: 500 });
  }
}
