import { NextResponse } from "next/server";
import { getRequestProfile } from "@/lib/request-auth";

export async function GET(request: Request) {
  const { profile, status, error } = await getRequestProfile(request);
  if (!profile) return NextResponse.json({ error }, { status });
  return NextResponse.json(profile);
}
