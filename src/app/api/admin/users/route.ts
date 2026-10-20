import { NextResponse } from "next/server";
import { z } from "zod";
import { missingDriverColumn, normalizeTransportationType, optionalDriverColumns } from "@/lib/driver-data";
import { assignableFlyRoles, canManageRoles, normalizeRole } from "@/lib/roles";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const updateUserRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(assignableFlyRoles)
});

const createUserSchema = z.object({
  email: z.string().trim().email().max(240),
  password: z.string().min(8).max(256),
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).optional().nullable(),
  company: z.string().trim().max(160).optional().nullable(),
  vehicleType: z.string().trim().max(80).optional().nullable(),
  role: z.enum(assignableFlyRoles)
});

type ProfileRow = {
  id: string;
  email: string | null;
  role: string | null;
};

function safeRole(value: unknown) {
  return normalizeRole(value);
}

async function loadAuthUsers(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users;
}

async function findAuthUserByEmail(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === normalizedEmail);
    if (user) return user;
    if (!data.nextPage) break;
  }
  return null;
}

async function createDriverForAdminAccount(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  payload: Record<string, unknown>
) {
  const nextPayload = { ...payload };
  for (let attempt = 0; attempt <= optionalDriverColumns.size; attempt += 1) {
    const result = await supabase.from("drivers").insert(nextPayload).select("id").single();
    if (!result.error) return result;

    const missingColumn = missingDriverColumn(result.error);
    if (!missingColumn || !optionalDriverColumns.has(missingColumn) || !(missingColumn in nextPayload)) return result;
    delete nextPayload[missingColumn];
  }
  return { data: null, error: new Error("Unable to create linked driver profile.") };
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "admin-users-create", { limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!canManageRoles(access.profile.role)) return NextResponse.json({ error: "Only admins can create accounts." }, { status: 403 });

  const parsed = await parseJson(request, createUserSchema, "Complete the account details and password.");
  if (parsed.response) return parsed.response;

  if (parsed.data.role === "admin") {
    return apiError("Admin accounts must be created or promoted privately outside public self-service flows.", { status: 403 });
  }

  if ((parsed.data.role === "driver" || parsed.data.role === "dispatcher") && !parsed.data.phone?.trim()) {
    return apiError("Drivers, riders, and dispatchers need a phone number because it is their portal password.", { status: 400 });
  }

  if (parsed.data.role === "driver" && !parsed.data.vehicleType?.trim()) {
    return apiError("Select the driver's transportation type before creating the account.", { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Admin account creation is temporarily unavailable.", { status: 503 });

  const email = parsed.data.email.trim().toLowerCase();
  let authUser = await findAuthUserByEmail(supabase, email);
  if (authUser) {
    const updated = await supabase.auth.admin.updateUserById(authUser.id, {
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        ...authUser.user_metadata,
        full_name: parsed.data.fullName,
        company: parsed.data.company || null,
        phone: parsed.data.phone || null,
        vehicle_type: parsed.data.role === "driver" ? normalizeTransportationType(parsed.data.vehicleType) : null
      },
      app_metadata: { ...authUser.app_metadata, role: parsed.data.role }
    });
    if (updated.error || !updated.data.user) {
      logApiError(updated.error ?? new Error("No auth user returned."), "Unable to update admin-created auth account.", requestContext(request, { email }));
      return apiError("Unable to prepare login details for that account.", { status: 500 });
    }
    authUser = updated.data.user;
  } else {
    const created = await supabase.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.data.fullName,
        company: parsed.data.company || null,
        phone: parsed.data.phone || null,
        vehicle_type: parsed.data.role === "driver" ? normalizeTransportationType(parsed.data.vehicleType) : null
      },
      app_metadata: { role: parsed.data.role }
    });
    if (created.error || !created.data.user) {
      logApiError(created.error ?? new Error("No auth user returned."), "Unable to create admin-managed auth account.", requestContext(request, { email, role: parsed.data.role }));
      return apiError("Unable to create the account login.", { status: 500 });
    }
    authUser = created.data.user;
  }

  let driverId: number | string | null = null;
  if (parsed.data.role === "driver") {
    const existingDriver = await supabase.from("drivers").select("id").eq("account_user_id", authUser.id).maybeSingle();
    if (existingDriver.error && missingDriverColumn(existingDriver.error) !== "account_user_id") {
      logApiError(existingDriver.error, "Unable to inspect linked driver profile.", requestContext(request, { userId: authUser.id }));
      return apiError("Unable to inspect linked driver profile.", { status: 500 });
    }

    if (existingDriver.data?.id) {
      driverId = existingDriver.data.id;
    } else {
      const now = new Date().toISOString();
      const createdDriver = await createDriverForAdminAccount(supabase, {
        name: parsed.data.fullName,
        phone: parsed.data.phone || null,
        status: "offline",
        vehicle_type: normalizeTransportationType(parsed.data.vehicleType),
        latitude: 6.5244,
        longitude: 3.3792,
        approval_status: "approved",
        account_user_id: authUser.id,
        offline_since: now,
        last_seen_at: now,
        created_at: now,
        updated_at: now
      });
      if (createdDriver.error || !createdDriver.data?.id) {
        logApiError(createdDriver.error ?? new Error("Driver profile was not created."), "Unable to create driver profile for admin-managed account.", requestContext(request, { userId: authUser.id }));
        return apiError("Account login was created, but the driver profile could not be linked.", { status: 500 });
      }
      driverId = createdDriver.data.id;
    }
  }

  const profile = await supabase
    .from("user_profiles")
    .upsert({
      id: authUser.id,
      email,
      full_name: parsed.data.fullName,
      company: parsed.data.company || null,
      phone: parsed.data.phone || null,
      role: parsed.data.role,
      driver_id: driverId,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" })
    .select("id,email,role,driver_id")
    .single();

  if (profile.error) {
    logApiError(profile.error, "Unable to create admin-managed user profile.", requestContext(request, { userId: authUser.id, role: parsed.data.role }));
    return apiError("Account login was created, but the profile could not be saved.", { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "user.create",
    entityType: "user_profile",
    entityId: authUser.id,
    metadata: { email, role: parsed.data.role, driverId, emailConfirmed: true },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "auth",
    message: "Login-ready account created by admin.",
    entityType: "user_profile",
    entityId: authUser.id,
    metadata: { email, role: parsed.data.role, driverId, emailConfirmed: true },
    request
  });

  const response = NextResponse.json({
    id: authUser.id,
    email,
    role: normalizeRole(profile.data.role),
    hasProfile: true,
    createdAt: authUser.created_at ?? null,
    lastSignInAt: authUser.last_sign_in_at ?? null,
    driverId,
    emailConfirmed: true
  }, { status: 201 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-users", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!canManageRoles(access.profile.role)) return NextResponse.json({ error: "Only admins can manage account roles." }, { status: 403 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Admin user management is temporarily unavailable.", { status: 503 });

  const [authUsersResult, profilesResult] = await Promise.allSettled([
    loadAuthUsers(supabase),
    supabase.from("user_profiles").select("id,email,role").order("email", { ascending: true })
  ]);

  if (authUsersResult.status === "rejected" && profilesResult.status === "rejected") {
    logApiError(authUsersResult.reason, "Unable to load auth users.", requestContext(request));
    logApiError(profilesResult.reason, "Unable to load user profiles.", requestContext(request));
    return apiError("Unable to load user accounts.", { status: 500 });
  }

  if (profilesResult.status === "fulfilled" && profilesResult.value.error) {
    logApiError(profilesResult.value.error, "Unable to load user profiles.", requestContext(request));
  }

  const profiles = new Map<string, ProfileRow>();
  if (profilesResult.status === "fulfilled" && !profilesResult.value.error) {
    for (const profile of (profilesResult.value.data ?? []) as ProfileRow[]) {
      profiles.set(profile.id, profile);
    }
  }

  const users = new Map<string, {
    id: string;
    email: string | null;
    role: ReturnType<typeof safeRole> | null;
    hasProfile: boolean;
    createdAt: string | null;
    lastSignInAt: string | null;
  }>();

  if (authUsersResult.status === "fulfilled") {
    for (const user of authUsersResult.value) {
      const profile = profiles.get(user.id);
      users.set(user.id, {
        id: user.id,
        email: profile?.email ?? user.email ?? null,
        role: profile?.role ? safeRole(profile.role) : null,
        hasProfile: Boolean(profile),
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null
      });
    }
  }

  for (const profile of profiles.values()) {
    if (users.has(profile.id)) continue;
    users.set(profile.id, {
      id: profile.id,
      email: profile.email,
      role: profile.role ? safeRole(profile.role) : null,
      hasProfile: true,
      createdAt: null,
      lastSignInAt: null
    });
  }

  const response = NextResponse.json({
    users: [...users.values()].sort((left, right) => String(left.email ?? "").localeCompare(String(right.email ?? ""))),
    roles: assignableFlyRoles
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "admin-users-update", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!canManageRoles(access.profile.role)) return NextResponse.json({ error: "Only admins can manage account roles." }, { status: 403 });

  const parsed = await parseJson(request, updateUserRoleSchema, "A valid user and role are required.");
  if (parsed.response) return parsed.response;

  const { userId, role } = parsed.data;
  if (userId === access.profile.id && role !== "admin") {
    return apiError("You cannot remove admin access from your own active session.", { status: 409 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Admin user management is temporarily unavailable.", { status: 503 });

  const authUser = await supabase.auth.admin.getUserById(userId);
  if (authUser.error || !authUser.data.user) {
    logApiError(authUser.error ?? new Error("Auth user not found."), "Unable to inspect auth user before role update.", requestContext(request, { userId }));
    return apiError("Unable to find that authentication account.", { status: 404 });
  }

  const existing = await supabase
    .from("user_profiles")
    .select("id,email,role")
    .eq("id", userId)
    .maybeSingle();

  if (existing.error) {
    logApiError(existing.error, "Unable to inspect profile before role update.", requestContext(request, { userId }));
    return apiError("Unable to inspect the user profile.", { status: 500 });
  }

  const previousRole = existing.data?.role ? safeRole(existing.data.role) : null;
  const email = existing.data?.email ?? authUser.data.user.email ?? null;

  if (previousRole === "admin" && role !== "admin") {
    const adminCount = await supabase
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (adminCount.error) {
      logApiError(adminCount.error, "Unable to verify administrator count before role update.", requestContext(request, { userId }));
      return apiError("Unable to verify administrator coverage before changing this role.", { status: 500 });
    }
    if ((adminCount.count ?? 0) <= 1) {
      return apiError("The final administrator cannot be demoted. Promote another trusted account first.", { status: 409 });
    }
  }

  const updated = await supabase
    .from("user_profiles")
    .upsert(
      {
        id: userId,
        email,
        role
      },
      { onConflict: "id" }
    )
    .select("id,email,role")
    .single();

  if (updated.error) {
    logApiError(updated.error, "Unable to update user role.", requestContext(request, { userId, role }));
    return apiError("Unable to update the user role.", { status: 500 });
  }

  await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...authUser.data.user.app_metadata,
      role
    }
  });

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "user.role_update",
    entityType: "user_profile",
    entityId: userId,
    metadata: { previousRole, nextRole: role, email },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "auth",
    message: "User role updated by admin.",
    entityType: "user_profile",
    entityId: userId,
    metadata: { previousRole, nextRole: role, email },
    request
  });

  const response = NextResponse.json({
    id: updated.data.id,
    email: updated.data.email,
    role: safeRole(updated.data.role),
    hasProfile: true,
    createdAt: authUser.data.user.created_at ?? null,
    lastSignInAt: authUser.data.user.last_sign_in_at ?? null
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
