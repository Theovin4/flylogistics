import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { missingDriverColumn, normalizeTransportationType, optionalDriverColumns } from "@/lib/driver-data";
import { normalizeSelfServiceRole } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { logAuthError, requestContext } from "@/server/monitoring";
import { sendCustomerNotification } from "@/server/notifications/service";
import { canKeepSelfServiceRegistrationRole, matchesAuthenticatedRegistrationAccount } from "@/server/self-service-registration";

export const dynamic = "force-dynamic";

const registerProfileSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().trim().email().max(240),
  fullName: z.string().trim().min(2).max(160),
  company: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  vehicleType: z.string().trim().max(80).optional().nullable(),
  role: z.enum(["customer", "driver"])
}).superRefine((data, context) => {
  if (!data.phone?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phone"],
      message: "Account registration requires a verified contact phone number."
    });
  }
  const phoneDigits = data.phone?.replace(/\D/g, "") ?? "";
  if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phone"],
      message: "Enter a valid phone number including country code."
    });
  }
  if (data.role !== "driver") return;
  if (!data.vehicleType?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["vehicleType"],
      message: "Select the rider/driver transportation type."
    });
  }
});

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

async function createLinkedDriverWithSchemaFallback(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  payload: Record<string, unknown>
) {
  const nextPayload = { ...payload };

  for (let attempt = 0; attempt <= optionalDriverColumns.size; attempt += 1) {
    const result = await supabase
      .from("drivers")
      .insert(nextPayload)
      .select("id")
      .single();

    if (!result.error) return result;

    const missingColumn = missingDriverColumn(result.error);
    if (!missingColumn || !optionalDriverColumns.has(missingColumn) || !(missingColumn in nextPayload)) {
      return result;
    }

    delete nextPayload[missingColumn];
  }

  return {
    data: null,
    error: new Error("Unable to create driver profile after retrying schema-compatible payload.")
  };
}

async function resolveRegisteredUser(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  request: Request,
  input: z.infer<typeof registerProfileSchema>
) {
  const token = bearerToken(request);

  if (!token) {
    return { user: null, error: apiError("Sign in to complete your account profile.", { status: 401 }) };
  }

  const tokenUser = await supabase.auth.getUser(token);
  if (!tokenUser.data.user) {
    if (tokenUser.error) {
      logAuthError(tokenUser.error, "Unable to verify account profile session.", requestContext(request, { userId: input.userId }));
    }
    return { user: null, error: apiError("Sign in to complete your account profile.", { status: 401 }) };
  }

  if (!matchesAuthenticatedRegistrationAccount(tokenUser.data.user, input)) {
    return { user: null, error: apiError("The profile details do not match the authenticated account.", { status: 403 }) };
  }

  return { user: tokenUser.data.user as User, error: null };
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "auth-register-profile", { limit: 12, windowSeconds: 300 });
  if (limited) return limited;

  const parsed = await parseJson(request, registerProfileSchema, "Please complete the account profile fields.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Secure account setup is temporarily unavailable.", { status: 503 });

  const resolved = await resolveRegisteredUser(supabase, request, parsed.data);
  if (resolved.error || !resolved.user) return resolved.error ?? apiError("Unable to verify the new account.", { status: 404 });

  const user = resolved.user;
  const userId = user.id;

  const existing = await supabase
    .from("user_profiles")
    .select("id,role,driver_id")
    .eq("id", userId)
    .maybeSingle();

  if (existing.error) {
    logAuthError(existing.error, "Unable to inspect registered user profile.", requestContext(request, { userId }));
    return apiError("Unable to prepare the new account profile.", { status: 500 });
  }

  if (
    existing.data?.role &&
    (!["customer", "driver"].includes(String(existing.data.role).toLowerCase()) ||
      !canKeepSelfServiceRegistrationRole(existing.data.role, parsed.data.role))
  ) {
    return apiError("This email is already registered for another Fly Logistics role. Please use the correct login page.", { status: 409 });
  }

  const role = normalizeSelfServiceRole(parsed.data.role);
  let driverId = role === "driver" ? existing.data?.driver_id ?? null : null;

  if (role === "driver" && !driverId) {
    const linkedDriver = await supabase
      .from("drivers")
      .select("id")
      .eq("account_user_id", userId)
      .maybeSingle();

    let linkedDriverData = linkedDriver.data;
    let linkedDriverError = linkedDriver.error;
    if (missingDriverColumn(linkedDriver.error) === "account_user_id") {
      linkedDriverData = null;
      linkedDriverError = null;
    }

    if (linkedDriverError) {
      logAuthError(linkedDriverError, "Unable to inspect linked driver record.", requestContext(request, { userId }));
      return apiError("Unable to prepare the driver account.", { status: 500 });
    }

    if (linkedDriverData?.id) {
      driverId = linkedDriverData.id;
    } else {
      const { data: createdDriver, error: driverError } = await createLinkedDriverWithSchemaFallback(supabase, {
        name: parsed.data.fullName,
        phone: parsed.data.phone || null,
        status: "offline",
        vehicle_type: normalizeTransportationType(parsed.data.vehicleType),
        latitude: 6.5244,
        longitude: 3.3792,
        approval_status: "pending",
        account_user_id: userId,
        offline_since: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      });

      if (driverError) {
        logAuthError(driverError, "Unable to create linked driver record.", requestContext(request, { userId }));
        return apiError("Unable to create the driver account.", { status: 500 });
      }

      driverId = createdDriver.id;
    }
  }

  const { error: upsertError } = await supabase.from("user_profiles").upsert({
    id: userId,
    email: parsed.data.email,
    full_name: parsed.data.fullName,
    company: parsed.data.company || null,
    phone: parsed.data.phone || null,
    role,
    driver_id: driverId,
    updated_at: new Date().toISOString()
  }, {
    onConflict: "id"
  });

  if (upsertError) {
    logAuthError(upsertError, "Unable to create registered user profile.", requestContext(request, { userId, role }));
    return apiError("Unable to create the account profile.", { status: 500 });
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...user.user_metadata,
      full_name: parsed.data.fullName,
      company: parsed.data.company || null,
      phone: parsed.data.phone || null,
      role,
      vehicle_type: role === "driver" ? normalizeTransportationType(parsed.data.vehicleType) : null,
      driver_id: driverId
    }
  });

  if (updateError) {
    logAuthError(updateError, "Unable to sync registered user metadata.", requestContext(request, { userId, role }));
  }

  if (role === "customer") {
    try {
      await sendCustomerNotification({
        channels: ["in_app", "email", "whatsapp"],
        to: parsed.data.phone,
        emailTo: parsed.data.email,
        message: `Welcome to Fly Logistics, ${parsed.data.fullName}. Your customer account is ready for booking, tracking, wallet payments, and delivery notifications.`,
        workflow: "account_created",
        entityType: "user_profile",
        entityId: userId,
        metadata: { role, source: "self_service_registration" },
        preferences: {
          userId,
          email: parsed.data.email,
          emailEnabled: true,
          whatsappEnabled: true,
          smsEnabled: true
        },
        emailSubject: "Welcome to Fly Logistics",
        emailTitle: "Your Fly Logistics account is ready",
        inAppTitle: "Welcome to Fly Logistics",
        inAppBody: "Your customer account is ready. You can book shipments, track deliveries, fund your wallet, and receive delivery updates from your dashboard.",
        inAppCategory: "account",
        emailCtaLabel: "Open customer dashboard",
        emailCtaUrl: "https://flylogistics.com.ng/customer"
      });
    } catch (notificationError) {
      logAuthError(notificationError, "Unable to send customer account-created notification.", requestContext(request, { userId, role }));
    }
  }

  const response = NextResponse.json({ ok: true, role, userId });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
