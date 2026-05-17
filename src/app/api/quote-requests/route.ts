import { NextResponse } from "next/server";
import { z } from "zod";
import { estimateQuote, makeRequestId, type QuoteRequestRecord } from "@/lib/shipments";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const quoteRequestSchema = z.object({
  customerName: z.string().trim().min(2),
  customerEmail: z.string().trim().email(),
  customerPhone: z.string().trim().optional(),
  pickupAddress: z.string().trim().min(4),
  deliveryAddress: z.string().trim().min(4),
  packageType: z.string().trim().min(2),
  weightKg: z.coerce.number().positive().max(100000),
  urgency: z.enum(["standard", "priority", "critical"]),
  notes: z.string().trim().max(1000).optional()
});

export async function POST(request: Request) {
  const parsed = quoteRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Please complete the quote request form." }, { status: 400 });
  }

  const quote = estimateQuote(parsed.data.weightKg, parsed.data.urgency);
  const payload = {
    request_id: makeRequestId(),
    customer_name: parsed.data.customerName,
    customer_email: parsed.data.customerEmail,
    customer_phone: parsed.data.customerPhone ?? null,
    pickup_address: parsed.data.pickupAddress,
    delivery_address: parsed.data.deliveryAddress,
    package_type: parsed.data.packageType,
    weight_kg: parsed.data.weightKg,
    urgency: parsed.data.urgency,
    notes: parsed.data.notes ?? null,
    estimated_price: quote.amount,
    estimated_eta_hours: quote.estimatedEtaHours,
    status: "NEW"
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ...payload,
      id: "local-preview",
      created_at: new Date().toISOString(),
      warning: "Supabase service role is not configured, so this request was not stored."
    });
  }

  const { data, error } = await supabase.from("quote_requests").insert(payload).select("*").single();
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to store quote request." }, { status: 500 });
  }

  return NextResponse.json(data as QuoteRequestRecord, { status: 201 });
}

export async function GET(request: Request) {
  const access = await requireRole(request, ["admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("quote_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load quote requests." }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
