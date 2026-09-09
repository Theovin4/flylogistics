import type { NextResponse } from "next/server";

export function applySecurityHeaders(
  response: NextResponse,
  options?: { secure?: boolean; noIndex?: boolean; privateCache?: boolean }
) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self), payment=(self), clipboard-write=(self)");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("Cross-Origin-Resource-Policy", "same-site");
  response.headers.set("Origin-Agent-Cluster", "?1");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set("X-DNS-Prefetch-Control", "on");

  if (options?.noIndex) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  if (options?.privateCache) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  if (options?.secure) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  return response;
}
