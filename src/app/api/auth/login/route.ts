import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveFreshProfileFromAccessToken } from "@/lib/auth-profile";
import { cleanEnv } from "@/lib/env";
import { isInternalAdminRole, normalizeRole, roleLabels, type FlyRole } from "@/lib/roles";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { logAuthError, requestContext } from "@/server/monitoring";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().email().max(240),
  password: z.string().min(1).max(256),
  expectedRole: z.enum(["admin", "customer", "driver", "dispatcher"]).optional()
});

function getSupabaseAuthClient() {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function roleLoginName(role: FlyRole) {
  if (role === "admin") return "admin login";
  if (role === "customer") return "customer login";
  if (role === "driver") return "driver/rider login";
  if (role === "dispatcher") return "dispatcher login";
  if (isInternalAdminRole(role)) return "private staff login";
  return `${roleLabels[role]} login`;
}

function canUseExpectedLogin(expectedRole: "admin" | "customer" | "driver" | "dispatcher" | undefined, resolvedRole: FlyRole) {
  if (!expectedRole) return true;
  return normalizeRole(expectedRole) === resolvedRole;
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "auth-login", { limit: 10, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await parseJson(request, loginSchema, "A valid email and password are required.");
  if (parsed.response) return parsed.response;

  const emailLimit = await rateLimit(`auth-login-email:${parsed.data.email.toLowerCase()}`, { limit: 8, windowSeconds: 300 });
  if (!emailLimit.ok) {
    return apiError("Too many login attempts for this email. Please wait a few minutes and try again.", {
      status: 429,
      headers: { "Retry-After": String(emailLimit.retryAfterSeconds ?? 300) }
    });
  }

  const supabase = getSupabaseAuthClient();
  if (!supabase) return apiError("Secure sign-in is temporarily unavailable.", { status: 503 });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password
  });

  if (error || !data.session?.access_token || !data.session.refresh_token) {
    logAuthError(error ?? new Error("Supabase returned no session."), "Supabase login failed.", requestContext(request, { email: parsed.data.email }));
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const { profile, error: profileError } = await resolveFreshProfileFromAccessToken(data.session.access_token, "login");
  if (!profile) {
    logAuthError(new Error(profileError ?? "No user profile found."), "Unable to resolve login profile from authenticated user token.", requestContext(request, { userId: data.user.id }));
    return NextResponse.json({ error: "Unable to resolve your account role. Please contact Fly Logistics support." }, { status: 403 });
  }

  if (!canUseExpectedLogin(parsed.data.expectedRole, profile.role)) {
    return NextResponse.json(
      {
        error: `This login is for ${parsed.data.expectedRole} accounts. Your account is ${roleLabels[profile.role]}. Please use the ${roleLoginName(profile.role)}.`
      },
      { status: 403 }
    );
  }

  const response = NextResponse.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
    role: profile.role
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
