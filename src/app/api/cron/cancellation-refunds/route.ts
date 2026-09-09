import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { logError, requestContext } from "@/server/monitoring";
import { processDueCancellationRefunds } from "@/server/cancellation-refunds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = cleanEnv(process.env.CRON_SECRET);
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Refund processing is temporarily unavailable." }, { status: 503 });

  try {
    const result = await processDueCancellationRefunds(supabase);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    logError(error, "Cancellation refund cron failed.", requestContext(request));
    return NextResponse.json({ error: "Cancellation refund processing could not complete." }, { status: 500 });
  }
}
