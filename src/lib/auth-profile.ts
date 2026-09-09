import { createClient, type User } from "@supabase/supabase-js";
import { missingDriverColumn } from "@/lib/driver-data";
import { cleanEnv } from "@/lib/env";
import { normalizeRole, portalForRole, type FlyRole } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export type FreshAuthProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  company: string | null;
  company_id?: string | null;
  phone: string | null;
  role: FlyRole;
  driver_id: number | string | null;
};

const profileSelect = "id,email,full_name,company,company_id,phone,role,driver_id";

function debugAuth(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production" || cleanEnv(process.env.FLY_AUTH_DEBUG) !== "1") return;
  console.info(`[fly-auth-debug] ${event}`, details);
}

function debugAuthError(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production" || cleanEnv(process.env.FLY_AUTH_DEBUG) !== "1") return;
  console.error(`[fly-auth-debug] ${event}`, details);
}

export function sanitizeProfile(profile: FreshAuthProfile | null) {
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    driver_id: profile.driver_id ?? null,
    company_id: profile.company_id ?? null
  };
}

async function createSelfServiceProfileForConfirmedUser(user: User, source: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const role: FlyRole = "customer";
  const driverId = null;

  const { error } = await supabase.from("user_profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: user.user_metadata?.full_name ?? null,
      company: user.user_metadata?.company ?? null,
      phone: user.user_metadata?.phone ?? null,
      role,
      driver_id: driverId,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (error) {
    debugAuthError(`${source}:self-service-profile-create-failed`, {
      userId: user.id,
      role,
      code: error.code,
      message: error.message
    });
    return false;
  }

  debugAuth(`${source}:self-service-profile-created`, {
    userId: user.id,
      role,
      driverId
  });
  return true;
}

async function linkDriverAccount(userId: string, driverId: number | string | null, source: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !driverId) return;

  const linked = await supabase
    .from("drivers")
    .update({ account_user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", Number(driverId))
    .is("account_user_id", null)
    .select("id")
    .maybeSingle();

  if (missingDriverColumn(linked.error) === "account_user_id") return;

  if (linked.error) {
    debugAuthError(`${source}:driver-account-link-failed`, {
      userId,
      driverId,
      code: linked.error.code,
      message: linked.error.message
    });
  }
}

async function findLinkedDriverId(userId: string, source: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const linkedDriver = await supabase
    .from("drivers")
    .select("id")
    .eq("account_user_id", userId)
    .maybeSingle();

  if (missingDriverColumn(linkedDriver.error) === "account_user_id") return null;

  if (linkedDriver.error) {
    debugAuthError(`${source}:driver-link-query-failed`, {
      userId,
      code: linkedDriver.error.code,
      message: linkedDriver.error.message,
      details: linkedDriver.error.details,
      hint: linkedDriver.error.hint
    });
    return null;
  }

  const driverId = linkedDriver.data?.id ?? null;
  if (!driverId) return null;

  const profileLink = await supabase
    .from("user_profiles")
    .update({ driver_id: driverId, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (profileLink.error?.code !== "42703" && profileLink.error) {
    debugAuthError(`${source}:profile-driver-link-failed`, {
      userId,
      driverId,
      code: profileLink.error.code,
      message: profileLink.error.message
    });
  }

  return driverId as number | string;
}

export async function resolveFreshProfileFromAccessToken(accessToken: string, source: string) {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    debugAuthError(`${source}:missing-env`, {
      hasSupabaseUrl: Boolean(url),
      hasAnonKey: Boolean(anonKey)
    });
    return { user: null as User | null, profile: null as FreshAuthProfile | null, error: "Secure sign-in is temporarily unavailable." };
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });

  const userResult = await supabase.auth.getUser(accessToken);
  if (userResult.error || !userResult.data.user) {
    debugAuthError(`${source}:session-validation-failed`, {
      error: userResult.error?.message ?? "No authenticated user"
    });
    return { user: null as User | null, profile: null as FreshAuthProfile | null, error: userResult.error?.message ?? "Invalid or expired session." };
  }

  const user = userResult.data.user;
  debugAuth(`${source}:authenticated-user`, {
    userId: user.id
  });

  let profileResult = await supabase
    .from("user_profiles")
    .select(profileSelect)
    .eq("id", user.id)
    .maybeSingle();

  const profileSelectMissingColumn = profileResult.error?.code === "42703" || missingDriverColumn(profileResult.error);
  if (profileResult.error && profileSelectMissingColumn) {
    debugAuthError(`${source}:profile-optional-columns-missing`, {
      userId: user.id,
      code: profileResult.error.code,
      message: profileResult.error.message
    });
    profileResult = await supabase
      .from("user_profiles")
      .select("id,email,role")
      .eq("id", user.id)
      .maybeSingle();
  }

  if (profileResult.error) {
    debugAuthError(`${source}:profile-query-failed`, {
      userId: user.id,
      code: profileResult.error.code,
      message: profileResult.error.message,
      details: profileResult.error.details,
      hint: profileResult.error.hint
    });
    return { user, profile: null as FreshAuthProfile | null, error: profileResult.error.message };
  }

  if (!profileResult.data) {
    debugAuth(`${source}:profile-missing`, {
      userId: user.id
    });

    const created = await createSelfServiceProfileForConfirmedUser(user, source);
    if (created) {
      profileResult = await supabase
        .from("user_profiles")
        .select(profileSelect)
        .eq("id", user.id)
        .maybeSingle();
    }

    if (!created || !profileResult.data) {
      return { user, profile: null as FreshAuthProfile | null, error: "No user profile found." };
    }
  }

  const profileDriverId =
    "driver_id" in profileResult.data ? (profileResult.data.driver_id as number | string | null) ?? null : null;

  const profile = {
    id: profileResult.data.id,
    email: profileResult.data.email,
    full_name: "full_name" in profileResult.data ? profileResult.data.full_name ?? null : null,
    company: "company" in profileResult.data ? profileResult.data.company ?? null : null,
    company_id: "company_id" in profileResult.data ? profileResult.data.company_id ?? null : null,
    phone: "phone" in profileResult.data ? profileResult.data.phone ?? null : null,
    driver_id: profileDriverId,
    role: normalizeRole(profileResult.data.role)
  } as FreshAuthProfile;

  if (profile.role === "driver") {
    if (profile.driver_id) {
      await linkDriverAccount(user.id, profile.driver_id, source);
    } else {
      profile.driver_id = await findLinkedDriverId(user.id, source);
    }
  }

  debugAuth(`${source}:profile-resolved`, {
    userId: user.id,
    profile: sanitizeProfile(profile),
    resolvedRole: profile.role,
    redirectTarget: portalForRole(profile.role)
  });

  return { user, profile, error: null as string | null };
}
