import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/dashboard") && !request.cookies.get("fly_session")?.value) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
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
