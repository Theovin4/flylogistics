import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { cleanEnv } from "@/lib/env";
import { resolveFreshProfileFromAccessToken } from "@/lib/auth-profile";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { logAuthError, requestContext } from "@/server/monitoring";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const dispatcherLoginSchema = z.object({
  userId: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(5).max(40)
});

type DispatcherProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
};

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

function digitsOnly(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function samePhone(left: string | null | undefined, right: string | null | undefined) {
  const leftDigits = digitsOnly(left);
  const rightDigits = digitsOnly(right);
  if (leftDigits.length < 5 || rightDigits.length < 5) return false;
  return leftDigits === rightDigits || leftDigits.slice(-10) === rightDigits.slice(-10);
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function escapeIlike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function findDispatcherCandidates(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string
) {
  const candidates = new Map<string, DispatcherProfileRow>();
  const trimmed = userId.trim();

  if (looksLikeUuid(trimmed)) {
    const byId = await supabase
      .from("user_profiles")
      .select("id,email,full_name,phone,role")
      .eq("id", trimmed)
      .maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) candidates.set(byId.data.id, byId.data as DispatcherProfileRow);
  }

  const byName = await supabase
    .from("user_profiles")
    .select("id,email,full_name,phone,role")
    .eq("role", "dispatcher")
    .ilike("full_name", escapeIlike(trimmed))
    .limit(10);

  if (byName.error) throw byName.error;
  for (const profile of (byName.data ?? []) as DispatcherProfileRow[]) {
    candidates.set(profile.id, profile);
  }

  return [...candidates.values()].filter((profile) => String(profile.role ?? "").toLowerCase() === "dispatcher");
}

async function getDispatcherEmail(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  profile: DispatcherProfileRow
) {
  if (profile.email) return profile.email;

  const authUser = await supabase.auth.admin.getUserById(profile.id);
  if (authUser.error || !authUser.data.user?.email) return null;

  return authUser.data.user.email;
}

async function ensureDispatcherPassword(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  profile: DispatcherProfileRow,
  phone: string
) {
  const authUser = await supabase.auth.admin.getUserById(profile.id);
  if (authUser.error || !authUser.data.user) throw authUser.error ?? new Error("Dispatcher auth account was not found.");

  const email = profile.email ?? authUser.data.user.email ?? null;
  if (!email) throw new Error("Dispatcher account has no email record.");

  const updated = await supabase.auth.admin.updateUserById(profile.id, {
    password: phone,
    user_metadata: {
      ...authUser.data.user.user_metadata,
      role: "dispatcher",
      full_name: profile.full_name,
      phone: profile.phone
    }
  });
  if (updated.error) throw updated.error;

  return email;
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "dispatcher-login", { limit: 12, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await parseJson(request, dispatcherLoginSchema, "Enter your dispatcher name or user ID and phone number.");
  if (parsed.response) return parsed.response;

  const identifierLimit = await rateLimit(`dispatcher-login-id:${parsed.data.userId.toLowerCase()}`, { limit: 8, windowSeconds: 300 });
  if (!identifierLimit.ok) {
    return apiError("Too many login attempts. Please wait a few minutes and try again.", {
      status: 429,
      headers: { "Retry-After": String(identifierLimit.retryAfterSeconds ?? 300) }
    });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return apiError("Dispatcher sign-in is temporarily unavailable.", { status: 503 });

  const supabaseAuth = getSupabaseAuthClient();
  if (!supabaseAuth) return apiError("Secure sign-in is temporarily unavailable.", { status: 503 });

  let profiles: DispatcherProfileRow[] = [];
  try {
    profiles = await findDispatcherCandidates(supabaseAdmin, parsed.data.userId);
  } catch (error) {
    logAuthError(error, "Unable to inspect dispatcher login record.", requestContext(request, { userId: parsed.data.userId }));
    return apiError("Unable to verify dispatcher login details.", { status: 500 });
  }

  if (!profiles.length) {
    return NextResponse.json({ error: "Dispatcher name/user ID and password do not match any Fly Logistics dispatcher profile." }, { status: 401 });
  }

  let profile: DispatcherProfileRow | null = null;
  let sessionData: {
    session: { access_token: string; refresh_token: string; expires_in?: number } | null;
    user: { id: string };
  } | null = null;

  for (const candidate of profiles) {
    let email: string | null = null;
    try {
      email = await getDispatcherEmail(supabaseAdmin, candidate);
    } catch (error) {
      logAuthError(error, "Unable to inspect dispatcher auth account during login.", requestContext(request, { userId: candidate.id }));
    }

    if (!email) continue;

    const authAttempt = await supabaseAuth.auth.signInWithPassword({
      email,
      password: parsed.data.phone
    });

    if (authAttempt.error || !authAttempt.data.session?.access_token || !authAttempt.data.session.refresh_token) continue;

    profile = candidate;
    sessionData = authAttempt.data;
    break;
  }

  if (!profile || !sessionData) {
    profile = profiles.find((candidate) => samePhone(candidate.phone, parsed.data.phone)) ?? null;
    if (!profile) {
      return NextResponse.json({ error: "Dispatcher name/user ID and password do not match any Fly Logistics dispatcher profile." }, { status: 401 });
    }

    let email: string;
    try {
      email = await ensureDispatcherPassword(supabaseAdmin, profile, parsed.data.phone);
    } catch (error) {
      logAuthError(error, "Unable to prepare dispatcher Supabase login account.", requestContext(request, { userId: profile.id }));
      return apiError("Unable to prepare this dispatcher login. Please confirm the dispatcher phone number in admin.", { status: 500 });
    }

    const phoneAttempt = await supabaseAuth.auth.signInWithPassword({
      email,
      password: parsed.data.phone
    });

    if (phoneAttempt.error || !phoneAttempt.data.session?.access_token || !phoneAttempt.data.session.refresh_token) {
      logAuthError(phoneAttempt.error ?? new Error("Supabase returned no dispatcher session."), "Dispatcher Supabase login failed.", requestContext(request, { userId: profile.id }));
      return NextResponse.json({ error: "Invalid dispatcher login details." }, { status: 401 });
    }

    sessionData = phoneAttempt.data;
  }

  const session = sessionData.session;
  if (!session?.access_token || !session.refresh_token) {
    logAuthError(new Error("Supabase returned no dispatcher session."), "Dispatcher Supabase login failed.", requestContext(request, { userId: profile.id }));
    return NextResponse.json({ error: "Invalid dispatcher login details." }, { status: 401 });
  }

  const resolved = await resolveFreshProfileFromAccessToken(session.access_token, "dispatcher-login");
  if (!resolved.profile || resolved.profile.role !== "dispatcher") {
    logAuthError(new Error(resolved.error ?? "Dispatcher profile role was not resolved."), "Unable to resolve dispatcher profile after login.", requestContext(request, { userId: sessionData.user.id }));
    return NextResponse.json({ error: "Unable to open the dispatcher portal for this account." }, { status: 403 });
  }

  const response = NextResponse.json({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
    role: resolved.profile.role
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
