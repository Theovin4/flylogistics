import { NextResponse, type NextRequest } from "next/server";
import { cleanEnv } from "@/lib/env";
import { canAccessRole, normalizeRole, type FlyRole } from "@/lib/roles";

function dashboardRoles(pathname: string): FlyRole[] {
  if (pathname.startsWith("/dashboard/admin")) return ["admin"];
  if (pathname.startsWith("/dashboard/dispatcher")) return ["dispatcher"];
  if (pathname.startsWith("/dashboard/driver")) return ["driver"];
  if (pathname.startsWith("/dashboard/customer")) return ["customer"];
  return ["admin", "dispatcher", "driver", "customer"];
}

async function sessionRole(accessToken: string) {
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
    return normalizeRole(user.user_metadata?.role);
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/dashboard")) {
    const session = request.cookies.get("fly_session")?.value;
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${search}`);

    if (!session) {
      return NextResponse.redirect(loginUrl);
    }

    const role = await sessionRole(session);
    if (!role || !canAccessRole(role, dashboardRoles(pathname))) {
      const response = NextResponse.redirect(loginUrl);
      response.cookies.set("fly_session", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0
      });
      return response;
    }
  }

  const response = NextResponse.next();
  response.headers.set("x-fly-request-id", crypto.randomUUID());
  if (request.headers.get("x-middleware-subrequest")) {
    return new NextResponse(null, { status: 403 });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"]
};
