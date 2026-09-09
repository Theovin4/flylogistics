import { NextResponse, type NextRequest } from "next/server";
import { adminLoginPath } from "@/lib/admin-access";
import { cleanEnv } from "@/lib/env";
import { canAccessRole, flyRoles, normalizeRole, type FlyRole } from "@/lib/roles";
import { applySecurityHeaders } from "@/lib/security-headers";

const noIndexPrefixes = [
  "/admin",
  "/api",
  "/auth",
  "/customer",
  "/dashboard",
  "/dispatcher",
  "/driver",
  "/fly-admin-ops",
  "/login",
  "/merchant/dashboard",
  "/payment",
  "/register",
  "/rider"
] as const;

const privateCloudPrefixes = [
  "/cloud/analytics",
  "/cloud/billing",
  "/cloud/customers",
  "/cloud/dashboard",
  "/cloud/drivers",
  "/cloud/login",
  "/cloud/settings",
  "/cloud/shipments",
  "/cloud/signup"
] as const;

function isNoIndexRoute(pathname: string) {
  return (
    noIndexPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    privateCloudPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

function secureResponse(response: NextResponse, request: NextRequest) {
  const noIndex = isNoIndexRoute(request.nextUrl.pathname);
  return applySecurityHeaders(response, {
    secure: process.env.NODE_ENV === "production",
    noIndex,
    privateCache: noIndex
  });
}

function dashboardRoles(pathname: string): FlyRole[] {
  if (pathname === "/dashboard") return ["admin"];
  if (pathname.startsWith("/dashboard/admin")) return ["admin"];
  if (pathname.startsWith("/dashboard/dispatcher")) return ["dispatcher"];
  if (pathname.startsWith("/dashboard/driver")) return ["driver"];
  if (pathname.startsWith("/dashboard/customer")) return ["customer"];
  return ["admin", "dispatcher", "driver", "customer"];
}

function protectedRoles(pathname: string): FlyRole[] | null {
  if (pathname === adminLoginPath || pathname === "/admin/login") return null;
  if (pathname === "/customer/login" || pathname === "/customer/signup" || pathname === "/customer/register") return null;
  if (pathname === "/driver/login" || pathname === "/driver/register") return null;
  if (pathname === "/dispatcher/login") return null;
  if (pathname === "/cloud" || pathname === "/cloud/login" || pathname === "/cloud/signup") return null;
  if (pathname.startsWith("/cloud")) return [...flyRoles];
  if (pathname.startsWith("/merchant/dashboard")) return ["customer"];
  if (pathname.startsWith("/customer")) return ["customer"];
  if (pathname.startsWith("/driver")) return ["driver"];
  if (pathname.startsWith("/dispatcher")) return ["dispatcher"];
  if (pathname.startsWith("/dashboard")) return dashboardRoles(pathname);
  return null;
}

function loginPathFor(pathname: string) {
  if (pathname.startsWith("/customer")) return "/customer/login";
  if (pathname.startsWith("/merchant/dashboard")) return "/customer/login";
  if (pathname.startsWith("/dashboard/customer")) return "/customer/login";
  if (pathname.startsWith("/driver") || pathname.startsWith("/dashboard/driver")) return "/driver/login";
  if (pathname.startsWith("/dispatcher") || pathname.startsWith("/dashboard/dispatcher")) return "/dispatcher/login";
  if (pathname.startsWith("/dashboard/admin") || pathname === "/dashboard") return adminLoginPath;
  if (pathname.startsWith("/cloud")) return "/cloud/login";
  return "/login";
}

function authDebug(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production" || cleanEnv(process.env.FLY_AUTH_DEBUG) !== "1") return;
  console.info(`[fly-auth-debug] ${event}`, details);
}

function authDebugError(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production" || cleanEnv(process.env.FLY_AUTH_DEBUG) !== "1") return;
  console.error(`[fly-auth-debug] ${event}`, details);
}

async function sessionRole(accessToken: string, pathname: string) {
  const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });

    if (!response.ok) return null;
    const user = await response.json();
    authDebug("proxy:authenticated-user", { pathname, userId: user.id });

    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/user_profiles?select=role&id=eq.${encodeURIComponent(user.id)}&limit=1`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (profileResponse.ok) {
      const profiles = await profileResponse.json();
      const profileRole = Array.isArray(profiles) ? profiles[0]?.role : null;
      const resolvedRole = profileRole ? normalizeRole(profileRole) : null;
      authDebug("proxy:profile-resolved", {
        pathname,
        userId: user.id,
        fetchedProfile: Array.isArray(profiles) ? profiles[0] ?? null : null,
        resolvedRole
      });
      if (resolvedRole) return resolvedRole;
    } else {
      authDebugError("proxy:profile-query-failed", {
        pathname,
        userId: user.id,
        status: profileResponse.status,
        statusText: profileResponse.statusText
      });
    }

    return null;
  } catch (error) {
    authDebugError("proxy:role-resolution-error", { pathname, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (request.headers.get("x-middleware-subrequest")) {
    return new NextResponse(null, { status: 403 });
  }

  const roles = protectedRoles(pathname);
  if (roles) {
    const session = request.cookies.get("fly_session")?.value;
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = loginPathFor(pathname);
    loginUrl.searchParams.set("next", `${pathname}${search}`);

    if (!session) {
      return secureResponse(NextResponse.redirect(loginUrl), request);
    }

    const role = await sessionRole(session, pathname);
    if (!role || !canAccessRole(role, roles)) {
      const response = NextResponse.redirect(loginUrl);
      authDebug("proxy:redirecting-for-role", {
        pathname,
        resolvedRole: role,
        requiredRoles: roles,
        redirectTarget: loginUrl.pathname
      });
      response.cookies.set("fly_session", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0
      });
      response.cookies.set("fly_role", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0
      });
      return applySecurityHeaders(response, {
        secure: process.env.NODE_ENV === "production",
        noIndex: true,
        privateCache: true
      });
    }
  }

  const response = NextResponse.next();
  response.headers.set("x-fly-request-id", crypto.randomUUID());
  return secureResponse(response, request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"]
};
