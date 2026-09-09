import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { canonicalSiteUrl } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  exchangeGoogleBusinessCode,
  listAccounts,
  listAccountsWithRefreshToken,
  listLocations,
  listLocationsWithRefreshToken,
  saveGoogleBusinessConnection
} from "@/server/google-business-profile";
import { writeAuditLog } from "@/server/audit";
import { writeOperationalEvent } from "@/server/operational-events";
import { logApiError, requestContext } from "@/server/monitoring";

export const dynamic = "force-dynamic";

function redirectUrl(_request: Request, params: Record<string, string>) {
  const url = new URL("/admin/integrations/google-business", canonicalSiteUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return "";
  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstAccountName(value: unknown) {
  const accounts = Array.isArray((value as { accounts?: unknown[] })?.accounts) ? (value as { accounts?: unknown[] }).accounts ?? [] : [];
  const first = accounts.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  return stringValue(first?.name);
}

function firstLocationName(value: unknown) {
  const locations = Array.isArray((value as { locations?: unknown[] })?.locations) ? (value as { locations?: unknown[] }).locations ?? [] : [];
  const first = locations.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  return stringValue(first?.name);
}

export async function GET(request: Request) {
  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.redirect(redirectUrl(request, { googleBusiness: "auth_required" }));

  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const expectedState = cookieValue(request, "fly_google_business_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    const response = NextResponse.redirect(redirectUrl(request, { googleBusiness: "invalid_state" }));
    response.cookies.delete("fly_google_business_oauth_state");
    return response;
  }

  const supabase = getSupabaseAdmin();
  try {
    const exchanged = await exchangeGoogleBusinessCode(code);
    if (!exchanged.ok) {
      const response = NextResponse.redirect(redirectUrl(request, { googleBusiness: "oauth_failed" }));
      response.cookies.delete("fly_google_business_oauth_state");
      return response;
    }

    if (!exchanged.refreshToken && !process.env.GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN?.trim()) {
      const response = NextResponse.redirect(redirectUrl(request, { googleBusiness: "no_refresh_token" }));
      response.cookies.delete("fly_google_business_oauth_state");
      return response;
    }

    let accountName = process.env.GOOGLE_BUSINESS_PROFILE_ACCOUNT_NAME?.trim() ?? "";
    let locationName = process.env.GOOGLE_BUSINESS_PROFILE_LOCATION_NAME?.trim() ?? "";

    const saved = await saveGoogleBusinessConnection(supabase, {
      refreshToken: exchanged.refreshToken || null,
      accountName: accountName || null,
      locationName: locationName || null
    });
    if (!saved.ok) {
      const response = NextResponse.redirect(redirectUrl(request, { googleBusiness: "storage_failed" }));
      response.cookies.delete("fly_google_business_oauth_state");
      return response;
    }

    if (!accountName) {
      const accounts = exchanged.refreshToken ? await listAccountsWithRefreshToken(exchanged.refreshToken) : supabase ? await listAccounts(supabase) : null;
      if (accounts?.ok) accountName = firstAccountName(accounts.data);
    }
    if (accountName && !locationName) {
      const locations = exchanged.refreshToken ? await listLocationsWithRefreshToken(exchanged.refreshToken, accountName) : supabase ? await listLocations(supabase, accountName) : null;
      if (locations?.ok) locationName = firstLocationName(locations.data);
    }

    await saveGoogleBusinessConnection(supabase, {
      refreshToken: exchanged.refreshToken || null,
      accountName: accountName || null,
      locationName: locationName || null
    });

    await writeAuditLog(supabase, {
      action: "google_business_profile.connect",
      actor: access.profile,
      entityType: "google_business_profile",
      entityId: locationName || accountName || "connected",
      metadata: { scope: exchanged.scope, tokenType: exchanged.tokenType },
      request
    });
    await writeOperationalEvent(supabase, {
      category: "system",
      message: "Google Business Profile connected.",
      entityType: "google_business_profile",
      entityId: locationName || accountName || "connected",
      metadata: { accountSelected: Boolean(accountName), locationSelected: Boolean(locationName) },
      request
    });

    const response = NextResponse.redirect(redirectUrl(request, { googleBusiness: "connected" }));
    response.cookies.delete("fly_google_business_oauth_state");
    return response;
  } catch (error) {
    logApiError(error, "Google Business Profile OAuth callback failed.", requestContext(request));
    const response = NextResponse.redirect(redirectUrl(request, { googleBusiness: "callback_failed" }));
    response.cookies.delete("fly_google_business_oauth_state");
    return response;
  }
}
