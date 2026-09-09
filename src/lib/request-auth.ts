import { resolveFreshProfileFromAccessToken } from "@/lib/auth-profile";
import type { FlyRole } from "@/lib/roles";
import { logAuthError } from "@/server/monitoring";

export type AuthProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  company: string | null;
  company_id?: string | null;
  phone?: string | null;
  role: FlyRole;
  driver_id?: number | string | null;
};

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

function isUnsafeMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function sameOriginRequest(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const originHeader = request.headers.get("origin") ?? request.headers.get("referer");

  if (!originHeader) return process.env.NODE_ENV !== "production";
  if (!host) return false;

  try {
    const origin = new URL(originHeader);
    return origin.host === host;
  } catch {
    return false;
  }
}

function cookieToken(request: Request) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("fly_session="));

  if (!match) return null;

  try {
    return decodeURIComponent(match.slice("fly_session=".length));
  } catch {
    return match.slice("fly_session=".length);
  }
}

export async function getRequestProfile(request: Request) {
  const bearer = bearerToken(request);
  if (!bearer && isUnsafeMethod(request.method) && !sameOriginRequest(request)) {
    logAuthError(new Error("Rejected cross-site cookie-authenticated request."), "Rejected cross-site cookie-authenticated request.");
    return { profile: null, status: 403, error: "Security check failed. Please refresh and try again." };
  }

  const token = bearer ?? cookieToken(request);
  if (!token) return { profile: null, status: 401, error: "Authentication is required." };

  const resolved = await resolveFreshProfileFromAccessToken(token, "profile");
  if (!resolved.user) {
    logAuthError(new Error(resolved.error ?? "Invalid request session token."), "Invalid request session token.");
    return { profile: null, status: 401, error: "Invalid or expired session." };
  }

  if (!resolved.profile) {
    logAuthError(new Error(resolved.error ?? "No user profile found."), "Unable to load request user profile.", { userId: resolved.user.id });
    return { profile: null, status: 403, error: "Unable to resolve account role." };
  }

  return { profile: resolved.profile as AuthProfile, status: 200, error: null };
}

export async function requireRole(request: Request, allowedRoles: FlyRole[]) {
  const result = await getRequestProfile(request);
  if (!result.profile) return result;
  if (result.profile.role === "admin" || allowedRoles.includes(result.profile.role)) return result;
  return { profile: result.profile, status: 403, error: "Your role does not have access to this operation." };
}
