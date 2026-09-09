import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import {
  createPost,
  deleteMedia,
  deletePost,
  deleteReviewReply,
  disconnectGoogleBusinessProfile,
  getGoogleBusinessAccessToken,
  getGoogleBusinessSettings,
  googleBusinessProfileHealth,
  googleBusinessProfileSelection,
  listAccounts,
  listAccountsWithRefreshToken,
  listLocations,
  listLocationsWithRefreshToken,
  listMedia,
  listPosts,
  listReviews,
  replyToReview,
  saveGoogleBusinessConnection,
  syncBusinessInfo,
  syncGoogleBusinessProfile,
  updatePost,
  uploadMedia
} from "@/server/google-business-profile";
import { logApiError, logWarn, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

type DbError = { code?: string; message?: string };

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync_now") }),
  z.object({ action: z.literal("sync_business_info") }),
  z.object({ action: z.literal("disconnect") }),
  z.object({ action: z.literal("test_access_token") }),
  z.object({ action: z.literal("show_resource_names"), accountName: z.string().trim().min(3).max(240).optional().or(z.literal("")) }),
  z.object({ action: z.literal("list_accounts") }),
  z.object({ action: z.literal("list_locations"), accountName: z.string().trim().min(1).optional() }),
  z.object({
    action: z.literal("select_location"),
    accountName: z.string().trim().min(3).max(240),
    locationName: z.string().trim().min(3).max(240),
    profileUrl: z.string().trim().url().optional().or(z.literal(""))
  }),
  z.object({ action: z.literal("refresh_reviews") }),
  z.object({
    action: z.literal("reply_review"),
    reviewName: z.string().trim().min(8).max(500),
    comment: z.string().trim().min(2).max(4096)
  }),
  z.object({
    action: z.literal("delete_review_reply"),
    reviewName: z.string().trim().min(8).max(500)
  }),
  z.object({ action: z.literal("refresh_posts") }),
  z.object({
    action: z.literal("create_post"),
    title: z.string().trim().max(120).optional().or(z.literal("")),
    summary: z.string().trim().min(5).max(1500),
    ctaUrl: z.string().trim().url().optional().or(z.literal("")),
    ctaLabel: z.string().trim().max(80).optional().or(z.literal(""))
  }),
  z.object({
    action: z.literal("update_post"),
    postName: z.string().trim().min(8).max(500),
    summary: z.string().trim().min(5).max(1500),
    ctaUrl: z.string().trim().url().optional().or(z.literal(""))
  }),
  z.object({
    action: z.literal("delete_post"),
    postName: z.string().trim().min(8).max(500)
  }),
  z.object({ action: z.literal("refresh_media") }),
  z.object({
    action: z.literal("upload_media"),
    sourceUrl: z.string().trim().url(),
    category: z.string().trim().max(80).optional().or(z.literal("")),
    description: z.string().trim().max(500).optional().or(z.literal(""))
  }),
  z.object({
    action: z.literal("delete_media"),
    mediaName: z.string().trim().min(8).max(500)
  })
]);

function optionalTable(error: DbError | null | undefined) {
  return error?.code === "42P01" || error?.code === "42703";
}

async function safeRows<T>(query: PromiseLike<{ data: T[] | null; error: DbError | null }>, label: string) {
  const { data, error } = await query;
  if (optionalTable(error)) return [] as T[];
  if (error) {
    logApiError(error, `Unable to load Google Business Profile ${label}.`);
    return [] as T[];
  }
  return data ?? [];
}

function ratingToNumber(value: unknown) {
  const text = String(value ?? "").toUpperCase();
  return { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[text] ?? 0;
}

function normalizeAccountName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("accounts/") ? trimmed : `accounts/${trimmed}`;
}

function normalizeLocationName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("accounts/") || trimmed.startsWith("locations/") ? trimmed : `locations/${trimmed}`;
}

function safeGoogleErrorDetails(result: { error?: string; status?: number; data?: unknown; retryAfterSeconds?: number; retryAt?: string }) {
  const record = result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? result.data as Record<string, unknown>
    : {};
  const googleError = record.error && typeof record.error === "object" && !Array.isArray(record.error)
    ? record.error as Record<string, unknown>
    : {};

  return {
    status: result.status ?? null,
    message: typeof googleError.message === "string" ? googleError.message : result.error ?? "Google Business Profile request failed.",
    code: googleError.code ?? null,
    googleStatus: googleError.status ?? null,
    retryAfterSeconds: result.retryAfterSeconds ?? null,
    retryAt: result.retryAt ?? null
  };
}

function requiresSavedLocation(action: z.infer<typeof actionSchema>["action"]) {
  return new Set([
    "sync_now",
    "sync_business_info",
    "refresh_reviews",
    "reply_review",
    "delete_review_reply",
    "refresh_posts",
    "create_post",
    "update_post",
    "delete_post",
    "refresh_media",
    "upload_media",
    "delete_media"
  ]).has(action);
}

async function blockUntilLocationSelected(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const selection = await googleBusinessProfileSelection(supabase);
  if (selection.selected) return null;

  return apiError("Select and save a Google Business Profile account and location before using this action.", {
    status: 409,
    details: {
      accountName: selection.accountName,
      locationName: selection.locationName
    }
  });
}

async function cachedGoogleBusinessData(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const [settingsRows, reviews, posts, media, syncs] = await Promise.all([
    safeRows<Record<string, unknown>>(
      supabase.from("google_business_profile_settings").select("id,account_name,location_name,profile_url,connected_email,business_name,business_phone,business_website,business_address,business_hours,business_categories,last_sync_at,connected_at,updated_at").eq("id", "default").limit(1),
      "settings"
    ),
    safeRows<Record<string, unknown>>(
      supabase.from("google_business_profile_reviews").select("*").order("review_created_at", { ascending: false }).limit(100),
      "reviews"
    ),
    safeRows<Record<string, unknown>>(
      supabase.from("google_business_profile_posts").select("*").order("synced_at", { ascending: false }).limit(50),
      "posts"
    ),
    safeRows<Record<string, unknown>>(
      supabase.from("google_business_profile_media").select("*").order("synced_at", { ascending: false }).limit(50),
      "media"
    ),
    safeRows<Record<string, unknown>>(
      supabase.from("google_business_profile_syncs").select("id,status,sync_type,error_message,synced_at,created_at").order("created_at", { ascending: false }).limit(10),
      "sync history"
    )
  ]);

  return {
    settings: settingsRows[0] ?? null,
    reviews,
    posts,
    media,
    syncs,
    stats: {
      reviews: reviews.length,
      averageRating: reviews.length
        ? Number((reviews.reduce((sum, review) => sum + Number(review.rating_value ?? ratingToNumber(review.star_rating)), 0) / reviews.length).toFixed(1))
        : 0,
      unreplied: reviews.filter((review) => !String(review.reply_comment ?? "").trim()).length,
      posts: posts.length,
      media: media.length
    }
  };
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-google-business", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Google Business Profile dashboard is temporarily unavailable.", { status: 503 });

  try {
    const [health, cached] = await Promise.all([
      googleBusinessProfileHealth(supabase),
      cachedGoogleBusinessData(supabase)
    ]);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      health,
      ...cached
    });
  } catch (error) {
    logApiError(error, "Unable to load Google Business Profile dashboard.", requestContext(request));
    return apiError("Unable to load Google Business Profile dashboard.", { status: 500 });
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "admin-google-business-write", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, actionSchema, "Invalid Google Business Profile request.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Google Business Profile dashboard is temporarily unavailable.", { status: 503 });

  try {
    const action = parsed.data;

    if (requiresSavedLocation(action.action)) {
      const blocked = await blockUntilLocationSelected(supabase);
      if (blocked) return blocked;
    }

    if (action.action === "sync_now") {
      const result = await syncGoogleBusinessProfile(supabase, request, access.profile);
      return NextResponse.json({ ok: result.ok, result });
    }

    if (action.action === "sync_business_info") {
      const result = await syncBusinessInfo(supabase, request, access.profile);
      if (!result.ok) return apiError(result.error, { status: result.status });
      return NextResponse.json({ ok: true, businessInfo: result.data });
    }

    if (action.action === "disconnect") {
      const result = await disconnectGoogleBusinessProfile(supabase, request, access.profile);
      if (!result.ok) return apiError(result.error, { status: result.status });
      return NextResponse.json({ ok: true });
    }

    if (action.action === "test_access_token") {
      const result = await getGoogleBusinessAccessToken(supabase);
      if (!result.ok) {
        return apiError(`Google access token test failed. ${result.error}`, { status: result.status });
      }
      await writeAuditLog(supabase, {
        action: "google_business_profile.test_access_token",
        actor: access.profile,
        entityType: "google_business_profile",
        entityId: "default",
        metadata: {
          expiresIn: result.data.expiresIn,
          status: result.status
        },
        request
      });
      return NextResponse.json({
        ok: true,
        message: "Google refresh token successfully generated a valid access token.",
        expiresIn: result.data.expiresIn,
        status: result.status
      });
    }

    if (action.action === "show_resource_names") {
      const settings = await getGoogleBusinessSettings(supabase);
      if (!settings.refreshToken) {
        return apiError("Google Business Profile refresh token is not stored. Connect Google again first.", { status: 428 });
      }

      const token = await getGoogleBusinessAccessToken(supabase);
      if (!token.ok) {
        return NextResponse.json({
          error: token.error,
          googleError: safeGoogleErrorDetails(token)
        }, { status: token.status });
      }

      const accountResult = await listAccountsWithRefreshToken(settings.refreshToken);
      let accountError: ReturnType<typeof safeGoogleErrorDetails> | null = null;
      const accounts = accountResult.ok ? accountResult.data.accounts ?? [] : [];
      if (!accountResult.ok) accountError = safeGoogleErrorDetails(accountResult);

      const requestedAccount = normalizeAccountName(action.accountName || settings.accountName || "");
      const accountNames = [
        requestedAccount,
        ...accounts.map((account) => typeof account.name === "string" ? account.name : "")
      ].filter((value, index, list) => value && list.indexOf(value) === index);

      const resources: {
        accountName: string;
        accountDisplayName: string;
        locations: {
          locationName: string;
          businessName: string;
          profileUrl: string | null;
        }[];
        locationError?: ReturnType<typeof safeGoogleErrorDetails> | null;
      }[] = [];
      let firstLocationError: ReturnType<typeof safeGoogleErrorDetails> | null = null;

      for (const accountName of accountNames.slice(0, 6)) {
        const account = accounts.find((item) => item.name === accountName);
        const locationResult = await listLocationsWithRefreshToken(settings.refreshToken, accountName);
        if (!locationResult.ok) {
          const details = safeGoogleErrorDetails(locationResult);
          firstLocationError ??= details;
          resources.push({
            accountName,
            accountDisplayName: typeof account?.accountName === "string" ? account.accountName : accountName,
            locations: [],
            locationError: details
          });
          continue;
        }

        resources.push({
          accountName,
          accountDisplayName: typeof account?.accountName === "string" ? account.accountName : accountName,
          locations: (locationResult.data.locations ?? []).map((location) => {
            const metadata = location.metadata && typeof location.metadata === "object" && !Array.isArray(location.metadata)
              ? location.metadata as Record<string, unknown>
              : {};
            return {
              locationName: typeof location.name === "string" ? location.name : "",
              businessName: typeof location.title === "string" ? location.title : "Unnamed business location",
              profileUrl: typeof metadata.mapsUri === "string"
                ? metadata.mapsUri
                : typeof metadata.newReviewUri === "string"
                  ? metadata.newReviewUri
                  : typeof location.websiteUri === "string"
                    ? location.websiteUri
                    : null
            };
          }).filter((location) => location.locationName)
        });
      }

      await writeAuditLog(supabase, {
        action: "google_business_profile.show_resource_names",
        actor: access.profile,
        entityType: "google_business_profile",
        entityId: "resource_names",
        metadata: {
          accountCount: accounts.length,
          resourceCount: resources.length,
          accountError,
          locationError: firstLocationError
        },
        request
      });

      if (!accountResult.ok && !resources.some((resource) => resource.locations.length)) {
        return NextResponse.json({
          error: accountResult.error,
          googleError: accountError,
          retryAfterSeconds: accountResult.retryAfterSeconds ?? null,
          retryAt: accountResult.retryAt ?? null,
          resources: []
        }, { status: accountResult.status });
      }

      return NextResponse.json({
        ok: true,
        message: resources.some((resource) => resource.locations.length)
          ? "Google Business resource names loaded."
          : "Google account was checked, but no locations were returned. Use manual mode if you already have the resource names.",
        accessToken: {
          generated: true,
          expiresIn: token.data.expiresIn
        },
        accountError,
        locationError: firstLocationError,
        resources
      });
    }

    if (action.action === "list_accounts") {
      const result = await listAccounts(supabase);
      if (!result.ok) {
        return NextResponse.json({
          error: result.error,
          retryAfterSeconds: result.retryAfterSeconds ?? null,
          retryAt: result.retryAt ?? null
        }, { status: result.status });
      }
      const accounts = result.data.accounts ?? [];
      if (!accounts.length) {
        logWarn("Google Business Profile account list returned no accounts.", {
          status: result.status,
          action: "list_accounts"
        });
        return apiError(
          "Google returned no Business Profile accounts for this connected user. Confirm this Google account owns or manages the Fly Logistics profile, then retry.",
          { status: 404 }
        );
      }
      return NextResponse.json({
        ok: true,
        accounts,
        cached: Boolean(result.cached),
        cachedAt: result.cachedAt ?? null
      });
    }

    if (action.action === "list_locations") {
      const result = await listLocations(supabase, action.accountName);
      if (!result.ok) {
        return NextResponse.json({
          error: result.error,
          retryAfterSeconds: result.retryAfterSeconds ?? null,
          retryAt: result.retryAt ?? null
        }, { status: result.status });
      }
      const locations = result.data.locations ?? [];
      if (!locations.length) {
        logWarn("Google Business Profile location list returned no locations.", {
          status: result.status,
          action: "list_locations",
          accountName: normalizeAccountName(action.accountName ?? "")
        });
        return apiError(
          "Google returned no Business Profile locations under this account. Choose the correct account or confirm the Fly Logistics location is verified and managed by this Google user.",
          { status: 404 }
        );
      }
      return NextResponse.json({
        ok: true,
        locations,
        cached: Boolean(result.cached),
        cachedAt: result.cachedAt ?? null
      });
    }

    if (action.action === "select_location") {
      const accountName = normalizeAccountName(action.accountName);
      const locationName = normalizeLocationName(action.locationName);
      const result = await saveGoogleBusinessConnection(supabase, {
        accountName,
        locationName,
        profileUrl: action.profileUrl || null
      });
      if (!result.ok) return apiError(result.error, { status: result.status });
      await writeAuditLog(supabase, {
        action: "google_business_profile.select_location",
        actor: access.profile,
        entityType: "google_business_profile",
        entityId: locationName,
        metadata: { accountName },
        request
      });
      const [health, cached] = await Promise.all([
        googleBusinessProfileHealth(supabase),
        cachedGoogleBusinessData(supabase)
      ]);
      return NextResponse.json({
        ok: true,
        health,
        settings: cached.settings,
        saved: {
          accountName,
          locationName,
          profileUrl: action.profileUrl || null
        }
      });
    }

    if (action.action === "refresh_reviews") {
      const result = await listReviews(supabase);
      if (!result.ok) return apiError(result.error, { status: result.status });
      await syncGoogleBusinessProfile(supabase, request, access.profile);
      return NextResponse.json({ ok: true, reviews: result.data.reviews ?? [] });
    }

    if (action.action === "reply_review") {
      const result = await replyToReview(supabase, action.reviewName, action.comment);
      if (!result.ok) return apiError(result.error, { status: result.status });
      await writeAuditLog(supabase, {
        action: "google_business_profile.reply_review",
        actor: access.profile,
        entityType: "google_review",
        entityId: action.reviewName,
        request
      });
      await writeOperationalEvent(supabase, {
        category: "system",
        message: "Google review reply sent.",
        entityType: "google_review",
        entityId: action.reviewName,
        request
      });
      return NextResponse.json({ ok: true, reply: result.data });
    }

    if (action.action === "delete_review_reply") {
      const result = await deleteReviewReply(supabase, action.reviewName);
      if (!result.ok) return apiError(result.error, { status: result.status });
      await writeAuditLog(supabase, {
        action: "google_business_profile.delete_review_reply",
        actor: access.profile,
        entityType: "google_review",
        entityId: action.reviewName,
        request
      });
      return NextResponse.json({ ok: true });
    }

    if (action.action === "refresh_posts") {
      const result = await listPosts(supabase);
      if (!result.ok) return apiError(result.error, { status: result.status });
      await syncGoogleBusinessProfile(supabase, request, access.profile);
      return NextResponse.json({ ok: true, posts: result.data.localPosts ?? [] });
    }

    if (action.action === "create_post") {
      const result = await createPost(supabase, action);
      if (!result.ok) return apiError(result.error, { status: result.status });
      await writeAuditLog(supabase, {
        action: "google_business_profile.create_post",
        actor: access.profile,
        entityType: "google_post",
        entityId: String((result.data as Record<string, unknown>).name ?? "created"),
        request
      });
      return NextResponse.json({ ok: true, post: result.data });
    }

    if (action.action === "update_post") {
      const result = await updatePost(supabase, action.postName, action);
      if (!result.ok) return apiError(result.error, { status: result.status });
      await writeAuditLog(supabase, {
        action: "google_business_profile.update_post",
        actor: access.profile,
        entityType: "google_post",
        entityId: action.postName,
        request
      });
      return NextResponse.json({ ok: true, post: result.data });
    }

    if (action.action === "delete_post") {
      const result = await deletePost(supabase, action.postName);
      if (!result.ok) return apiError(result.error, { status: result.status });
      await writeAuditLog(supabase, {
        action: "google_business_profile.delete_post",
        actor: access.profile,
        entityType: "google_post",
        entityId: action.postName,
        request
      });
      return NextResponse.json({ ok: true });
    }

    if (action.action === "refresh_media") {
      const result = await listMedia(supabase);
      if (!result.ok) return apiError(result.error, { status: result.status });
      await syncGoogleBusinessProfile(supabase, request, access.profile);
      return NextResponse.json({ ok: true, media: result.data.mediaItems ?? [] });
    }

    if (action.action === "upload_media") {
      const result = await uploadMedia(supabase, action);
      if (!result.ok) return apiError(result.error, { status: result.status });
      await writeAuditLog(supabase, {
        action: "google_business_profile.upload_media",
        actor: access.profile,
        entityType: "google_media",
        entityId: String((result.data as Record<string, unknown>).name ?? "uploaded"),
        request
      });
      return NextResponse.json({ ok: true, media: result.data });
    }

    if (action.action === "delete_media") {
      const result = await deleteMedia(supabase, action.mediaName);
      if (!result.ok) return apiError(result.error, { status: result.status });
      await writeAuditLog(supabase, {
        action: "google_business_profile.delete_media",
        actor: access.profile,
        entityType: "google_media",
        entityId: action.mediaName,
        request
      });
      return NextResponse.json({ ok: true });
    }

    return apiError("Unsupported Google Business Profile action.", { status: 400 });
  } catch (error) {
    logApiError(error, "Unable to complete Google Business Profile action.", requestContext(request));
    return apiError("Unable to complete Google Business Profile action.", { status: 500 });
  }
}
