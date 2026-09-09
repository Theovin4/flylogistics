import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { missingDriverColumn } from "@/lib/driver-data";
import { cleanEnv } from "@/lib/env";
import { resolveFreshProfileFromAccessToken } from "@/lib/auth-profile";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { logAuthError, logWarn, requestContext } from "@/server/monitoring";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const driverLoginSchema = z.object({
  userId: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(5).max(40)
});

type DriverLoginRow = {
  id: number | string;
  name: string | null;
  phone: string | null;
  status?: string | null;
  approval_status?: string | null;
  account_user_id?: string | null;
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

function escapeIlike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function generatedDriverEmail(driverId: number | string) {
  return `driver-${String(driverId).trim().toLowerCase()}@flylogistics.com.ng`;
}

function driverIsBlocked(driver: DriverLoginRow) {
  const approval = String(driver.approval_status ?? "approved").toLowerCase();
  const status = String(driver.status ?? "").toLowerCase();
  return ["rejected", "suspended"].includes(approval) || status.includes("suspended") || status.includes("rejected");
}

async function findAuthUserByEmail(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  email: string
) {
  const normalizedEmail = email.trim().toLowerCase();
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (found) return found;
    if (!data.nextPage) break;
  }
  return null;
}

async function findDriverCandidatesByNameOrId(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string
) {
  const candidates = new Map<string, DriverLoginRow>();
  const trimmed = userId.trim();
  const numericId = Number(trimmed);

  if (Number.isInteger(numericId) && numericId > 0) {
    const byId = await supabase.from("drivers").select("*").eq("id", numericId).maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) candidates.set(String(byId.data.id), byId.data as DriverLoginRow);
  }

  const byName = await supabase
    .from("drivers")
    .select("*")
    .ilike("name", escapeIlike(trimmed))
    .limit(10);

  if (byName.error) throw byName.error;
  for (const driver of (byName.data ?? []) as DriverLoginRow[]) {
    candidates.set(String(driver.id), driver);
  }

  return [...candidates.values()];
}

async function ensureDriverAuthAccount(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  driver: DriverLoginRow,
  phone: string,
  request: Request
) {
  let authUserId = driver.account_user_id ?? null;
  let email: string | null = null;
  const driverId = driver.id;
  const metadata = {
    role: "driver",
    full_name: driver.name ?? `Driver ${driverId}`,
    phone: driver.phone ?? null,
    driver_id: driverId
  };

  if (authUserId) {
    const authUser = await supabase.auth.admin.getUserById(authUserId);
    if (!authUser.error && authUser.data.user) {
      email = authUser.data.user.email ?? null;
      const updated = await supabase.auth.admin.updateUserById(authUserId, {
        password: phone,
        user_metadata: {
          ...authUser.data.user.user_metadata,
          ...metadata
        }
      });
      if (updated.error) throw updated.error;
    } else {
      logWarn("Linked driver auth user was missing; a new login account will be prepared.", requestContext(request, { driverId }));
      authUserId = null;
    }
  }

  if (!authUserId) {
    email = generatedDriverEmail(driverId);
    const existing = await findAuthUserByEmail(supabase, email);

    if (existing) {
      authUserId = existing.id;
      const updated = await supabase.auth.admin.updateUserById(existing.id, {
        password: phone,
        user_metadata: {
          ...existing.user_metadata,
          ...metadata
        }
      });
      if (updated.error) throw updated.error;
    } else {
      const created = await supabase.auth.admin.createUser({
        email,
        password: phone,
        email_confirm: true,
        user_metadata: metadata
      });
      if (created.error || !created.data.user) throw created.error ?? new Error("Unable to prepare driver login account.");
      authUserId = created.data.user.id;
    }

    const linked = await supabase
      .from("drivers")
      .update({ account_user_id: authUserId, updated_at: new Date().toISOString() })
      .eq("id", Number(driverId))
      .select("id")
      .maybeSingle();

    if (linked.error && missingDriverColumn(linked.error) !== "account_user_id") {
      throw linked.error;
    }
  }

  if (!authUserId || !email) throw new Error("Unable to prepare driver login account.");

  const profile = await supabase.from("user_profiles").upsert(
    {
      id: authUserId,
      email,
      full_name: driver.name ?? `Driver ${driverId}`,
      phone: driver.phone ?? null,
      role: "driver",
      driver_id: Number(driverId),
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (profile.error) throw profile.error;

  return { email, authUserId };
}

async function getExistingDriverAuthEmail(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  driver: DriverLoginRow
) {
  if (driver.account_user_id) {
    const authUser = await supabase.auth.admin.getUserById(driver.account_user_id);
    if (!authUser.error && authUser.data.user?.email) {
      return { email: authUser.data.user.email, authUserId: authUser.data.user.id };
    }
  }

  const existing = await findAuthUserByEmail(supabase, generatedDriverEmail(driver.id));
  if (existing?.email) return { email: existing.email, authUserId: existing.id };

  return null;
}

async function ensureDriverProfileLink(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  driver: DriverLoginRow,
  authUserId: string,
  email: string
) {
  const driverId = driver.id;

  const linked = await supabase
    .from("drivers")
    .update({ account_user_id: authUserId, updated_at: new Date().toISOString() })
    .eq("id", Number(driverId))
    .select("id")
    .maybeSingle();

  if (linked.error && missingDriverColumn(linked.error) !== "account_user_id") {
    throw linked.error;
  }

  const profile = await supabase.from("user_profiles").upsert(
    {
      id: authUserId,
      email,
      full_name: driver.name ?? `Driver ${driverId}`,
      phone: driver.phone ?? null,
      role: "driver",
      driver_id: Number(driverId),
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (profile.error) throw profile.error;
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "driver-login", { limit: 12, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await parseJson(request, driverLoginSchema, "Enter your driver name or user ID and phone number.");
  if (parsed.response) return parsed.response;

  const identifierLimit = await rateLimit(`driver-login-id:${parsed.data.userId.toLowerCase()}`, { limit: 8, windowSeconds: 300 });
  if (!identifierLimit.ok) {
    return apiError("Too many login attempts. Please wait a few minutes and try again.", {
      status: 429,
      headers: { "Retry-After": String(identifierLimit.retryAfterSeconds ?? 300) }
    });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return apiError("Driver sign-in is temporarily unavailable.", { status: 503 });

  const supabaseAuth = getSupabaseAuthClient();
  if (!supabaseAuth) return apiError("Secure sign-in is temporarily unavailable.", { status: 503 });

  let drivers: DriverLoginRow[] = [];
  try {
    drivers = await findDriverCandidatesByNameOrId(supabaseAdmin, parsed.data.userId);
  } catch (error) {
    logAuthError(error, "Unable to inspect driver login record.", requestContext(request, { userId: parsed.data.userId }));
    return apiError("Unable to verify driver login details.", { status: 500 });
  }

  if (!drivers.length) {
    return NextResponse.json({ error: "Driver name/user ID and password do not match any Fly Logistics rider profile." }, { status: 401 });
  }

  let driver: DriverLoginRow | null = null;
  let sessionData: {
    session: { access_token: string; refresh_token: string; expires_in?: number } | null;
    user: { id: string };
  } | null = null;

  for (const candidate of drivers) {
    if (driverIsBlocked(candidate)) continue;

    let existing: Awaited<ReturnType<typeof getExistingDriverAuthEmail>> = null;
    try {
      existing = await getExistingDriverAuthEmail(supabaseAdmin, candidate);
    } catch {
      logWarn("Unable to inspect existing driver auth account during login.", requestContext(request, { driverId: candidate.id }));
    }

    if (!existing?.email) continue;

    const authAttempt = await supabaseAuth.auth.signInWithPassword({
      email: existing.email,
      password: parsed.data.phone
    });

    if (authAttempt.error || !authAttempt.data.session?.access_token || !authAttempt.data.session.refresh_token) continue;

    try {
      await ensureDriverProfileLink(supabaseAdmin, candidate, authAttempt.data.user.id, existing.email);
    } catch (error) {
      logAuthError(error, "Unable to refresh driver profile link after password login.", requestContext(request, { driverId: candidate.id }));
      return apiError("Unable to open this rider account. Please contact Fly Logistics operations.", { status: 500 });
    }

    driver = candidate;
    sessionData = authAttempt.data;
    break;
  }

  if (!driver || !sessionData) {
    driver = drivers.find((candidate) => samePhone(candidate.phone, parsed.data.phone)) ?? null;
    if (!driver) {
      return NextResponse.json({ error: "Driver name/user ID and password do not match any Fly Logistics rider profile." }, { status: 401 });
    }

    if (driverIsBlocked(driver)) {
      return NextResponse.json({ error: "This rider profile is not allowed to sign in. Please contact Fly Logistics operations." }, { status: 403 });
    }

    let email: string;
    try {
      ({ email } = await ensureDriverAuthAccount(supabaseAdmin, driver, parsed.data.phone, request));
    } catch (error) {
      logAuthError(error, "Unable to prepare driver Supabase login account.", requestContext(request, { driverId: driver.id }));
      return apiError("Unable to prepare this rider login. Please confirm the driver phone number in admin.", { status: 500 });
    }

    const phoneAttempt = await supabaseAuth.auth.signInWithPassword({
      email,
      password: parsed.data.phone
    });

    if (phoneAttempt.error || !phoneAttempt.data.session?.access_token || !phoneAttempt.data.session.refresh_token) {
      logAuthError(phoneAttempt.error ?? new Error("Supabase returned no driver session."), "Driver Supabase login failed.", requestContext(request, { driverId: driver.id }));
      return NextResponse.json({ error: "Invalid rider login details." }, { status: 401 });
    }

    sessionData = phoneAttempt.data;
  }

  const session = sessionData.session;
  if (!session?.access_token || !session.refresh_token) {
    logAuthError(new Error("Supabase returned no driver session."), "Driver Supabase login failed.", requestContext(request, { driverId: driver.id }));
    return NextResponse.json({ error: "Invalid rider login details." }, { status: 401 });
  }

  const { profile, error: profileError } = await resolveFreshProfileFromAccessToken(session.access_token, "driver-login");
  if (!profile || profile.role !== "driver") {
    logAuthError(new Error(profileError ?? "Driver profile role was not resolved."), "Unable to resolve driver profile after login.", requestContext(request, { driverId: driver.id, userId: sessionData.user.id }));
    return NextResponse.json({ error: "Unable to open the driver portal for this account." }, { status: 403 });
  }

  const response = NextResponse.json({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
    role: profile.role,
    driverId: profile.driver_id ?? driver.id
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
