import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const proofSchema = z.object({
  proofImageUrl: z.string().url()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  const parsed = proofSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "A valid proof image URL is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 503 });

  const { data, error } = await supabase
    .from("shipments")
    .update({
      proof_image_url: parsed.data.proofImageUrl,
      status: "DELIVERED",
      timeline: [
        { label: "Shipment created", completed: true },
        { label: "Proof of delivery uploaded", completed: true }
      ]
    })
    .eq("tracking_id", trackingId.toUpperCase())
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to save proof of delivery." }, { status: 500 });
  }

  return NextResponse.json(data);
}
