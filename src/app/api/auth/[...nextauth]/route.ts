import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function legacyAuthDisabled() {
  return NextResponse.json(
    { error: "Legacy authentication is disabled. Use the Fly Logistics Supabase Auth flow." },
    { status: 404 }
  );
}

export const GET = legacyAuthDisabled;
export const POST = legacyAuthDisabled;
