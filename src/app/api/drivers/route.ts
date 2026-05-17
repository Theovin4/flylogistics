import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const driverSelect = "id,name,status,phone,photo_url,latitude,longitude";

export async function GET(request: Request) {
  const access = await requireRole(request, ["admin", "dispatcher", "driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 503 });

  let query = supabase.from("drivers").select(driverSelect).order("id", { ascending: true });

  if (access.profile.role === "driver") {
    if (!access.profile.driver_id) {
      return NextResponse.json({ error: "Driver account is not linked to a driver record." }, { status: 403 });
    }
    query = query.eq("id", Number(access.profile.driver_id));
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load drivers." }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
