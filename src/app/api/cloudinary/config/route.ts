import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { cleanEnv } from "@/lib/env";
import { getCloudinaryCloudName } from "@/lib/cloudinary";
import { enforceRateLimit } from "@/server/api";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "cloudinary-config", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "dispatcher", "driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const cloudName = getCloudinaryCloudName();
  const apiKey = cleanEnv(process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY) ?? cleanEnv(process.env.CLOUDINARY_API_KEY);

  if (!cloudName || !apiKey) {
    return NextResponse.json({ error: "Secure media upload configuration is missing." }, { status: 503 });
  }

  const response = NextResponse.json({ cloudName, apiKey });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
