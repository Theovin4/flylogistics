import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { apiError, enforceRateLimit } from "@/server/api";
import { googleBusinessOAuthUrl } from "@/server/google-business-profile";
import { logApiError, requestContext } from "@/server/monitoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "google-business-connect", { limit: 10, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const state = crypto.randomUUID();
    const result = googleBusinessOAuthUrl(state);
    if (!result.ok) return apiError(result.error, { status: 428 });

    const response = NextResponse.redirect(result.url);
    response.cookies.set("fly_google_business_oauth_state", state, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  } catch (error) {
    logApiError(error, "Unable to start Google Business Profile OAuth.", requestContext(request));
    return apiError("Unable to start Google Business Profile connection.", { status: 500 });
  }
}
