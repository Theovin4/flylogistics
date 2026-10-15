import { NextResponse } from "next/server";
import { canManageRoles, normalizeRole } from "@/lib/roles";
import { requireRole } from "@/lib/request-auth";
import { normalizeShipmentStatus } from "@/lib/shipments";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  email: string | null;
  role: string | null;
  driver_id?: number | string | null;
};

type DriverRow = {
  id: number | string;
  name?: string | null;
  account_user_id?: string | null;
};

const completedShipmentStatuses = new Set(["DELIVERED", "CANCELLED"]);

function isMissingAuthUser(error: { status?: number; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.status === 404 || message.includes("user not found") || message.includes("not found");
}

function isMissingSchema(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "42703" || String(error?.code ?? "").startsWith("PGRST") || message.includes("could not find");
}

async function deleteRowsIfPresent(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  table: string,
  column: string,
  value: string | number
) {
  const result = await supabase.from(table).delete().eq(column, value);
  if (result.error && !isMissingSchema(result.error)) return result.error;
  return null;
}

async function loadProfileForDeletion(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string
) {
  const fullProfile = await supabase
    .from("user_profiles")
    .select("id,email,role,driver_id")
    .eq("id", userId)
    .maybeSingle();

  if (!fullProfile.error) return { data: fullProfile.data as ProfileRow | null, error: null };

  if (!isMissingSchema(fullProfile.error)) return { data: null, error: fullProfile.error };

  const fallbackProfile = await supabase
    .from("user_profiles")
    .select("id,email,role")
    .eq("id", userId)
    .maybeSingle();

  if (!fallbackProfile.error) {
    const profile = fallbackProfile.data as Omit<ProfileRow, "driver_id"> | null;
    return {
      data: profile ? { ...profile, driver_id: null } : null,
      error: null
    };
  }

  if (isMissingSchema(fallbackProfile.error)) {
    return { data: null, error: null };
  }

  return { data: null, error: fallbackProfile.error };
}

async function loadLinkedDriver(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  profileDriverId?: number | string | null
) {
  if (profileDriverId) {
    const byProfile = await supabase
      .from("drivers")
      .select("id,name,account_user_id")
      .eq("id", Number(profileDriverId))
      .maybeSingle();

    if (!byProfile.error && byProfile.data) return byProfile.data as DriverRow;
    if (byProfile.error && !isMissingSchema(byProfile.error)) return null;
  }

  const byAccount = await supabase
    .from("drivers")
    .select("id,name,account_user_id")
    .eq("account_user_id", userId)
    .maybeSingle();

  if (byAccount.error) return null;
  return (byAccount.data as DriverRow | null) ?? null;
}

async function activeShipmentsForDriver(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, driverId: number | string) {
  const result = await supabase
    .from("shipments")
    .select("tracking_id,status")
    .eq("driver_id", Number(driverId))
    .limit(100);

  if (result.error) return { data: null, error: result.error };

  return {
    data: (result.data ?? []).filter((shipment) => !completedShipmentStatuses.has(normalizeShipmentStatus(shipment.status))),
    error: null
  };
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const limited = await enforceRateLimit(request, "admin-users-delete", { limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!canManageRoles(access.profile.role)) return apiError("Only admins can delete accounts.", { status: 403 });

  const { userId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return apiError("Invalid user ID.", { status: 400 });
  }

  if (userId === access.profile.id) {
    return apiError("You cannot delete your own active admin account.", { status: 409 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Admin user management is temporarily unavailable.", { status: 503 });

  const [authUser, profileResult] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    loadProfileForDeletion(supabase, userId)
  ]);

  if (authUser.error && !isMissingAuthUser(authUser.error)) {
    logApiError(authUser.error, "Unable to inspect auth user before account deletion.", requestContext(request, { userId }));
    return apiError("Unable to inspect the authentication account before deletion.", { status: 500 });
  }

  if (profileResult.error) {
    logApiError(profileResult.error, "Unable to inspect profile before account deletion.", requestContext(request, { userId }));
    return apiError("Unable to inspect the user profile. Refresh the admin user list and try again.", { status: 500 });
  }

  const profile = profileResult.data as ProfileRow | null;
  const authRecord = authUser.error ? null : authUser.data.user;
  const email = profile?.email ?? authRecord?.email ?? null;
  const role = profile?.role ? normalizeRole(profile.role) : null;

  if (!profile && !authRecord) {
    return apiError("Account not found.", { status: 404 });
  }

  if (role === "admin") {
    const adminCount = await supabase
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (adminCount.error) {
      logApiError(adminCount.error, "Unable to verify administrator count before account deletion.", requestContext(request, { userId }));
      return apiError("Unable to verify administrator coverage before deleting this account.", { status: 500 });
    }
    if ((adminCount.count ?? 0) <= 1) {
      return apiError("The final administrator account cannot be deleted.", { status: 409 });
    }
  }

  const linkedDriver = await loadLinkedDriver(supabase, userId, profile?.driver_id);
  if (linkedDriver?.id) {
    const activeShipments = await activeShipmentsForDriver(supabase, linkedDriver.id);
    if (activeShipments.error) {
      logApiError(activeShipments.error, "Unable to inspect linked driver shipments before account deletion.", requestContext(request, { userId, driverId: linkedDriver.id }));
      return apiError("Unable to inspect linked driver shipments before deletion.", { status: 500 });
    }

    if ((activeShipments.data ?? []).length > 0) {
      return NextResponse.json({
        error: "This user has a linked driver profile with active shipments. Reassign, deliver, or cancel those shipments before deleting the account.",
        activeShipments: activeShipments.data
      }, { status: 409 });
    }
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "user.delete",
    entityType: "user_profile",
    entityId: userId,
    metadata: { email, role, hadAuthUser: Boolean(authRecord), driverId: linkedDriver?.id ?? profile?.driver_id ?? null },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "auth",
    severity: role === "admin" ? "warning" : "info",
    message: "User account deleted by admin.",
    entityType: "user_profile",
    entityId: userId,
    metadata: { email, role, hadAuthUser: Boolean(authRecord), driverId: linkedDriver?.id ?? profile?.driver_id ?? null },
    request
  });

  for (const table of ["customer_notifications", "customer_support_tickets", "customer_addresses"]) {
    const cleanupError = await deleteRowsIfPresent(supabase, table, "user_id", userId);
    if (cleanupError) {
      logApiError(cleanupError, `Unable to delete ${table} rows before account deletion.`, requestContext(request, { userId }));
      return apiError("Unable to delete linked customer records.", { status: 500 });
    }
  }

  if (linkedDriver?.id) {
    const detachShipments = await supabase.from("shipments").update({ driver_id: null }).eq("driver_id", Number(linkedDriver.id));
    if (detachShipments.error && !isMissingSchema(detachShipments.error)) {
      logApiError(detachShipments.error, "Unable to detach completed shipments before linked driver deletion.", requestContext(request, { userId, driverId: linkedDriver.id }));
      return apiError("Unable to detach completed shipments before deleting the linked driver.", { status: 500 });
    }
  }

  if (authRecord) {
    const deleted = await supabase.auth.admin.deleteUser(userId);
    if (deleted.error) {
      logApiError(deleted.error, "Unable to delete Supabase Auth user.", requestContext(request, { userId }));
      return apiError("Unable to delete the authentication account.", { status: 500 });
    }
  }

  const deletedProfile = await supabase.from("user_profiles").delete().eq("id", userId);
  if (deletedProfile.error && !isMissingSchema(deletedProfile.error)) {
    logApiError(deletedProfile.error, "Unable to delete orphan user profile.", requestContext(request, { userId }));
    return apiError("Unable to delete the user profile.", { status: 500 });
  }

  if (linkedDriver?.id) {
    await supabase.from("user_profiles").update({ driver_id: null }).eq("driver_id", Number(linkedDriver.id));
    const deletedDriver = await supabase.from("drivers").delete().eq("id", Number(linkedDriver.id));
    if (deletedDriver.error && !isMissingSchema(deletedDriver.error)) {
      logApiError(deletedDriver.error, "Unable to delete linked driver profile after account deletion.", requestContext(request, { userId, driverId: linkedDriver.id }));
      return apiError("The user login was deleted, but the linked driver profile could not be deleted.", { status: 500 });
    }
  }

  const response = NextResponse.json({ ok: true, userId, email, role, deletedDriverId: linkedDriver?.id ?? null });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
