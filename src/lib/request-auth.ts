import type { User } from "@supabase/supabase-js";
import { normalizeRole, type FlyRole } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export type AuthProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  company: string | null;
  role: FlyRole;
};

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

function profileFromUser(user: User): AuthProfile {
  return {
    id: user.id,
    email: user.email ?? null,
    full_name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
    company: typeof user.user_metadata?.company === "string" ? user.user_metadata.company : null,
    role: normalizeRole(user.user_metadata?.role)
  };
}

export async function getRequestProfile(request: Request) {
  const supabase = getSupabaseAdmin();
  const token = bearerToken(request);
  if (!supabase || !token) return { profile: null, status: 401, error: "Authentication is required." };

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    if (userError) console.error(userError);
    return { profile: null, status: 401, error: "Invalid or expired session." };
  }

  const fallbackProfile = profileFromUser(userData.user);
  const existing = await supabase
    .from("user_profiles")
    .select("id,email,full_name,company,role")
    .eq("id", fallbackProfile.id)
    .maybeSingle();

  if (existing.data) {
    return {
      profile: {
        ...existing.data,
        role: normalizeRole(existing.data.role)
      } as AuthProfile,
      status: 200,
      error: null
    };
  }

  if (existing.error) console.error(existing.error);

  const { data, error } = await supabase
    .from("user_profiles")
    .insert(
      {
        id: fallbackProfile.id,
        email: fallbackProfile.email,
        full_name: fallbackProfile.full_name,
        company: fallbackProfile.company,
        role: fallbackProfile.role
      }
    )
    .select("id,email,full_name,company,role")
    .single();

  if (error) {
    console.error(error);
    return { profile: fallbackProfile, status: 200, error: null };
  }

  return {
    profile: {
      ...data,
      role: normalizeRole(data.role)
    } as AuthProfile,
    status: 200,
    error: null
  };
}

export async function requireRole(request: Request, allowedRoles: FlyRole[]) {
  const result = await getRequestProfile(request);
  if (!result.profile) return result;
  if (result.profile.role === "admin" || allowedRoles.includes(result.profile.role)) return result;
  return { profile: result.profile, status: 403, error: "Your role does not have access to this operation." };
}
