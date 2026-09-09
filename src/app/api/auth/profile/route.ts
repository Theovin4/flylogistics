import { NextResponse } from "next/server";
import { getRequestProfile } from "@/lib/request-auth";
import { enforceRateLimit } from "@/server/api";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "auth-profile", { limit: 120, windowSeconds: 60 });
  if (limited) return limited;

  const { profile, status, error } = await getRequestProfile(request);
  if (!profile) return NextResponse.json({ error }, { status });
  const response = NextResponse.json(profile);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
