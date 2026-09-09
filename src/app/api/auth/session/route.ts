import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveFreshProfileFromAccessToken } from "@/lib/auth-profile";
import { enforceRateLimit, parseJson } from "@/server/api";
import { logAuthError, requestContext } from "@/server/monitoring";

const sessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.coerce.number().int().positive().optional().nullable()
});

function secureCookie(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const url = new URL(request.url);
  return forwardedProto === "https" || url.protocol === "https:" || process.env.VERCEL === "1";
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "auth-session", { limit: 40, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await parseJson(request, sessionSchema, "Invalid session payload. Please refresh and sign in again.");
  if (parsed.response) return parsed.response;

  const resolved = await resolveFreshProfileFromAccessToken(parsed.data.accessToken, "session");
  if (!resolved.user) {
    logAuthError(new Error(resolved.error ?? "Invalid or expired session."), "Invalid Supabase session token.", requestContext(request));
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const { profile } = resolved;
  if (!profile) {
    logAuthError(new Error(resolved.error ?? "No user profile found."), "Unable to resolve session profile role.", requestContext(request, { userId: resolved.user.id }));
    return NextResponse.json({ error: "Unable to resolve account role." }, { status: 403 });
  }

  const role = profile.role;
  const maxAge = Math.min(parsed.data.expiresIn ?? 60 * 60, 60 * 60 * 24 * 7);
  const secure = secureCookie(request);
  const response = NextResponse.json({ ok: true, role });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set("fly_session", parsed.data.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge
  });
  response.cookies.set("fly_role", "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0
  });

  return response;
}

export async function DELETE(request: Request) {
  const limited = await enforceRateLimit(request, "auth-session-delete", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const secure = secureCookie(request);
  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set("fly_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0
  });
  response.cookies.set("fly_role", "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0
  });
  return response;
}
