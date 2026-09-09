"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Copy, ExternalLink, ImagePlus, KeyRound, Loader2, MapPin, MessageSquareReply, RefreshCw, Search, Send, Star, Store, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getSupabaseBrowser } from "@/lib/supabase";

type GoogleBusinessRow = Record<string, unknown>;

type GoogleBusinessResponse = {
  generatedAt: string;
  health: {
    configured: boolean;
    accountName?: string | null;
    connectedEmail?: string | null;
    lastSyncAt?: string | null;
    locationName?: string | null;
    missing?: string[];
    profileUrl?: string | null;
    refreshTokenConfigured?: boolean;
    status?: string;
  };
  settings: GoogleBusinessRow | null;
  reviews: GoogleBusinessRow[];
  posts: GoogleBusinessRow[];
  media: GoogleBusinessRow[];
  syncs: GoogleBusinessRow[];
  stats: {
    reviews: number;
    averageRating: number;
    unreplied: number;
    posts: number;
    media: number;
  };
};

type GoogleAccount = {
  name?: string;
  accountName?: string;
  type?: string;
};

type GoogleLocation = {
  name?: string;
  title?: string;
  websiteUri?: string;
  metadata?: {
    mapsUri?: string;
    newReviewUri?: string;
  };
};

type GoogleResourceDiscovery = {
  resources?: {
    accountName: string;
    accountDisplayName?: string;
    locations: {
      locationName: string;
      businessName: string;
      profileUrl?: string | null;
    }[];
    locationError?: {
      status?: number | null;
      message?: string | null;
      googleStatus?: unknown;
      retryAfterSeconds?: number | null;
      retryAt?: string | null;
    } | null;
  }[];
  accountError?: {
    status?: number | null;
    message?: string | null;
    googleStatus?: unknown;
    retryAfterSeconds?: number | null;
    retryAt?: string | null;
  } | null;
  locationError?: {
    status?: number | null;
    message?: string | null;
    googleStatus?: unknown;
    retryAfterSeconds?: number | null;
    retryAt?: string | null;
  } | null;
  accessToken?: {
    generated?: boolean;
    expiresIn?: number;
  };
};

const postInitial = {
  title: "",
  summary: "",
  ctaUrl: "https://flylogistics.com.ng",
  ctaLabel: "Open Fly Logistics"
};

const mediaInitial = {
  sourceUrl: "",
  category: "ADDITIONAL",
  description: ""
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "Not synced yet";
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : raw;
}

function badgeTone(ok: boolean) {
  return ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary";
}

function starText(value: unknown) {
  const raw = text(value).toUpperCase();
  const map: Record<string, string> = { ONE: "1", TWO: "2", THREE: "3", FOUR: "4", FIVE: "5" };
  return map[raw] ?? String(numberValue(value) || "0");
}

function formatCooldown(seconds: number) {
  if (seconds <= 0) return "now";
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function futureRetryDate(value?: string | null) {
  const raw = text(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return "";
  return formatDate(raw);
}

function isQuotaMessage(value?: string | null) {
  const message = text(value).toLowerCase();
  return message.includes("429") || message.includes("quota") || message.includes("rate limit") || message.includes("resource_exhausted");
}

export function AdminGoogleBusinessPanel() {
  const searchParams = useSearchParams();
  const [report, setReport] = useState<GoogleBusinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [locations, setLocations] = useState<GoogleLocation[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [replyFilter, setReplyFilter] = useState("all");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [postForm, setPostForm] = useState(postInitial);
  const [mediaForm, setMediaForm] = useState(mediaInitial);
  const [cooldowns, setCooldowns] = useState<{ accountsUntil?: number; locationsUntil?: number }>({});
  const [now, setNow] = useState(Date.now());
  const [resourceDiscovery, setResourceDiscovery] = useState<GoogleResourceDiscovery | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const authorizedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const supabase = getSupabaseBrowser();
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, cache: "no-store" });
  }, []);

  const loadPanel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authorizedFetch("/api/admin/google-business");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load Google Business Profile.");
      setReport(data);
      setSelectedAccount(text(data.health?.accountName));
      setSelectedLocation(text(data.health?.locationName));
      setProfileUrl(text(data.health?.profileUrl ?? data.settings?.profile_url));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Google Business Profile.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  useEffect(() => {
    if (!cooldowns.accountsUntil && !cooldowns.locationsUntil) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [cooldowns.accountsUntil, cooldowns.locationsUntil]);

  useEffect(() => {
    const result = searchParams.get("googleBusiness");
    if (!result) return;
    const messages: Record<string, string> = {
      connected: "Google Business Profile connected successfully.",
      auth_required: "Please sign in as an admin before connecting Google Business Profile.",
      invalid_state: "Google connection security check failed. Please try again.",
      oauth_failed: "Google did not complete the OAuth connection. Please try again.",
      no_refresh_token: "Google did not return a refresh token. Try Connect Google again and approve offline access.",
      storage_failed: "Google connected, but Fly Logistics could not save the connection. Run the Google Business SQL schema and try again.",
      callback_failed: "Google Business Profile callback failed. Please try again."
    };
    if (messages[result]) {
      if (result === "connected") setMessage(messages[result]);
      else setError(messages[result]);
    }
  }, [searchParams]);

  const postAction = useCallback(async (body: Record<string, unknown>, success: string, key: string) => {
    setActionLoading(key);
    setError(null);
    setMessage(null);
    try {
      const response = await authorizedFetch("/api/admin/google-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) {
        const retryAfter = Number(payload.retryAfterSeconds ?? 0);
        if (retryAfter > 0 && (body.action === "list_accounts" || body.action === "list_locations")) {
          const until = Date.now() + retryAfter * 1000;
          setCooldowns((current) => ({
            ...current,
            ...(body.action === "list_accounts" ? { accountsUntil: until } : { locationsUntil: until })
          }));
        }
        throw new Error(payload.error ?? "Unable to complete Google Business Profile action.");
      }
      setMessage(text(payload.message, success));
      if (body.action === "select_location" && payload?.health) {
        setReport((current) => current ? {
          ...current,
          health: payload.health,
          settings: payload.settings ?? current.settings
        } : current);
        setSelectedAccount(text(payload.saved?.accountName ?? payload.health?.accountName));
        setSelectedLocation(text(payload.saved?.locationName ?? payload.health?.locationName));
        setProfileUrl(text(payload.saved?.profileUrl ?? payload.health?.profileUrl));
      }
      await loadPanel();
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete Google Business Profile action.");
      return null;
    } finally {
      setActionLoading(null);
    }
  }, [authorizedFetch, loadPanel]);

  async function copyText(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setError(`Unable to copy ${label.toLowerCase()}. You can still select and copy it manually.`);
    }
  }

  function googleErrorLine(details: GoogleResourceDiscovery["accountError"]) {
    if (!details) return "";
    const retryAt = futureRetryDate(details.retryAt);
    const parts = [
      details.status ? `HTTP ${details.status}` : "",
      details.googleStatus ? String(details.googleStatus) : "",
      details.message || "",
      details.retryAfterSeconds ? `Try again in ${formatCooldown(details.retryAfterSeconds)}.` : "",
      retryAt ? `Retry after ${retryAt}.` : ""
    ].filter(Boolean);
    return parts.join(" - ");
  }

  async function showResourceNames() {
    setActionLoading("show-resource-names");
    setError(null);
    setMessage(null);
    setResourceError(null);
    setResourceDiscovery(null);
    try {
      const response = await authorizedFetch("/api/admin/google-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "show_resource_names", accountName: selectedAccount })
      });
      const payload = await response.json();
      setResourceDiscovery(payload);
      if (!response.ok) {
        const details = googleErrorLine(payload.googleError ?? payload.accountError);
        setResourceError(details || payload.error || "Google Business resource lookup failed.");
        return;
      }

      const discovered = (payload.resources ?? []) as NonNullable<GoogleResourceDiscovery["resources"]>;
      const firstResource = discovered.find((resource) => resource.accountName);
      const firstLocation = discovered.flatMap((resource) => resource.locations.map((location) => ({ ...location, accountName: resource.accountName })))[0];
      if (discovered.length) {
        setAccounts(discovered.map((resource) => ({
          name: resource.accountName,
          accountName: resource.accountDisplayName || resource.accountName
        })));
      }
      if (firstResource?.accountName) setSelectedAccount(firstResource.accountName);
      if (firstLocation?.accountName) {
        setLocations(discovered
          .filter((resource) => resource.accountName === firstLocation.accountName)
          .flatMap((resource) => resource.locations.map((location) => ({
            name: location.locationName,
            title: location.businessName,
            metadata: location.profileUrl ? { mapsUri: location.profileUrl } : undefined
          }))));
      }
      if (firstLocation?.locationName) setSelectedLocation(firstLocation.locationName);
      if (firstLocation?.profileUrl && !profileUrl) setProfileUrl(firstLocation.profileUrl);
      setMessage(payload.message || "Google Business resource names loaded.");
    } catch (err) {
      setResourceError(err instanceof Error ? err.message : "Unable to load Google Business resource names.");
    } finally {
      setActionLoading(null);
    }
  }

  async function loadAccounts() {
    const payload = await postAction({ action: "list_accounts" }, "Google accounts loaded.", "accounts");
    if (!payload) return;
    const nextAccounts = (payload?.accounts ?? []) as GoogleAccount[];
    setAccounts(nextAccounts);
    setCooldowns((current) => ({ ...current, accountsUntil: undefined }));
    if (payload.cached) {
      setMessage(`Google accounts loaded from cache${payload.cachedAt ? ` (${formatDate(payload.cachedAt)})` : ""}.`);
    }
    if (!nextAccounts.length) {
      setError("Google returned no Business Profile accounts for this connected user.");
      return;
    }
    if (!selectedAccount && nextAccounts.length === 1 && nextAccounts[0]?.name) {
      setSelectedAccount(nextAccounts[0].name);
      setMessage("Google account found. Click Locations to load business locations for this account.");
    }
  }

  async function loadLocations(accountName = selectedAccount) {
    if (!accountName) {
      setError("Select a Google account first.");
      return;
    }
    const payload = await postAction({ action: "list_locations", accountName }, "Google locations loaded.", "locations");
    if (!payload) return;
    const nextLocations = (payload?.locations ?? []) as GoogleLocation[];
    setLocations(nextLocations);
    setCooldowns((current) => ({ ...current, locationsUntil: undefined }));
    if (payload.cached) {
      setMessage(`Google locations loaded from cache${payload.cachedAt ? ` (${formatDate(payload.cachedAt)})` : ""}.`);
    }
    if (!nextLocations.length) {
      setError("Google returned no Business Profile locations for the selected account.");
      return;
    }
    if (!selectedLocation && nextLocations.length === 1 && nextLocations[0]?.name) {
      setSelectedLocation(nextLocations[0].name);
      const url = nextLocations[0].metadata?.mapsUri || nextLocations[0].metadata?.newReviewUri || nextLocations[0].websiteUri || "";
      if (url && !profileUrl) setProfileUrl(url);
    }
  }

  async function saveLocation() {
    if (!selectedAccount || !selectedLocation) {
      setError("Select both a Google account and location.");
      return;
    }
    const location = locations.find((item) => item.name === selectedLocation);
    const saved = await postAction(
      {
        action: "select_location",
        accountName: selectedAccount,
        locationName: selectedLocation,
        profileUrl: profileUrl || location?.metadata?.mapsUri || location?.metadata?.newReviewUri || ""
      },
      "Google Business Profile location saved.",
      "select-location"
    );
    if (saved?.saved) {
      setSelectedAccount(text(saved.saved.accountName));
      setSelectedLocation(text(saved.saved.locationName));
      setProfileUrl(text(saved.saved.profileUrl));
    }
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUseGoogleBusiness) {
      setError("Select and save a Google Business Profile account and location before creating posts.");
      return;
    }
    const created = await postAction({ action: "create_post", ...postForm }, "Google Business Profile post created.", "create-post");
    if (created) setPostForm(postInitial);
  }

  async function submitMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUseGoogleBusiness) {
      setError("Select and save a Google Business Profile account and location before uploading photos.");
      return;
    }
    const uploaded = await postAction({ action: "upload_media", ...mediaForm }, "Google Business Profile media uploaded.", "upload-media");
    if (uploaded) setMediaForm(mediaInitial);
  }

  const filteredReviews = useMemo(() => {
    const reviews = report?.reviews ?? [];
    return reviews.filter((review) => {
      const rating = starText(review.star_rating);
      const hasReply = Boolean(text(review.reply_comment));
      const ratingOk = ratingFilter === "all" || rating === ratingFilter;
      const replyOk = replyFilter === "all" || (replyFilter === "replied" ? hasReply : !hasReply);
      return ratingOk && replyOk;
    });
  }, [ratingFilter, replyFilter, report?.reviews]);

  const health = report?.health;
  const savedAccountName = text(health?.accountName ?? report?.settings?.account_name);
  const savedLocationName = text(health?.locationName ?? report?.settings?.location_name);
  const hasGoogleConnection = Boolean(health?.refreshTokenConfigured);
  const hasSavedLocation = Boolean(savedAccountName && savedLocationName);
  const canUseGoogleBusiness = hasGoogleConnection && hasSavedLocation;
  const selectedAccountReady = selectedAccount.trim().startsWith("accounts/");
  const selectedLocationReady = selectedLocation.trim().startsWith("locations/") || selectedLocation.trim().startsWith("accounts/");
  const accountsCooldownSeconds = Math.max(0, Math.ceil(((cooldowns.accountsUntil ?? 0) - now) / 1000));
  const locationsCooldownSeconds = Math.max(0, Math.ceil(((cooldowns.locationsUntil ?? 0) - now) / 1000));
  const accountsCoolingDown = accountsCooldownSeconds > 0;
  const locationsCoolingDown = locationsCooldownSeconds > 0;
  const setupWarning = hasGoogleConnection && !hasSavedLocation
    ? "Connected. Next: click Accounts, choose the Fly Logistics account, click Locations, choose the business location, then save location. If Google is rate-limiting, paste the account and location resource names manually and save."
    : "";

  return (
    <section className="grid gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Google Business Profile</Badge>
          <h2 className="mt-3 text-2xl font-black tracking-normal sm:text-3xl">Reviews, posts, business info, and media</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Admin-only tools for your verified Google profile. Tokens stay server-side and customer-facing pages never receive Google credentials.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <a href="/api/integrations/google-business/connect">
              <Store />
              Connect Google
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={() => void postAction({ action: "sync_now" }, "Google Business Profile synced.", "sync")}
            disabled={actionLoading === "sync" || !canUseGoogleBusiness}
            title={!canUseGoogleBusiness ? "Save a Google account and location first." : undefined}
          >
            {actionLoading === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Sync now
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      {message && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-500">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-md" />)
          : [
              ["Connection", health?.configured ? "Connected" : "Setup needed", health?.configured ?? false],
              ["Reviews", String(report?.stats.reviews ?? 0), true],
              ["Average rating", `${report?.stats.averageRating ?? 0}`, true],
              ["Unreplied", String(report?.stats.unreplied ?? 0), (report?.stats.unreplied ?? 0) === 0]
            ].map(([label, value, ok]) => (
              <Card key={String(label)} className="glass">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
                    <Badge className={badgeTone(Boolean(ok))}>{Boolean(ok) ? "OK" : "Needs work"}</Badge>
                  </div>
                  <div className="mt-3 text-2xl font-black">{value}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-5 text-primary" />
            Connection and location
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border bg-background/45 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Saved account name</p>
              <p className="mt-2 break-all font-semibold">{savedAccountName || "Not selected"}</p>
            </div>
            <div className="rounded-md border bg-background/45 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Saved location name</p>
              <p className="mt-2 break-all font-semibold">{savedLocationName || "Not selected"}</p>
            </div>
            <div className="rounded-md border bg-background/45 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Refresh token</p>
              <p className="mt-2 font-semibold">{health?.refreshTokenConfigured ? "Stored server-side" : "Not connected"}</p>
            </div>
            <div className="rounded-md border bg-background/45 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Last sync</p>
              <p className="mt-2 font-semibold">{formatDate(health?.lastSyncAt ?? report?.settings?.last_sync_at)}</p>
            </div>
          </div>

          {health?.missing?.length ? (
            <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
              Missing setup: {health.missing.join(", ")}
            </div>
          ) : null}
          {setupWarning ? (
            <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
              {setupWarning}
            </div>
          ) : null}
          {(accountsCoolingDown || locationsCoolingDown) ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
              Google is rate-limiting requests. {accountsCoolingDown ? `Accounts: try again in ${formatCooldown(accountsCooldownSeconds)}. ` : ""}
              {locationsCoolingDown ? `Locations: try again in ${formatCooldown(locationsCooldownSeconds)}. ` : ""}
              Manual mode is still available.
            </div>
          ) : null}

          <div className="grid gap-4 rounded-md border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <Badge className="border-primary/40 bg-primary/10 text-primary">Admin setup helper</Badge>
                <h3 className="mt-2 text-lg font-bold">Show Google Business Resource Names</h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Uses the stored server-side refresh token to generate a fresh access token, then attempts to load account and location resource names. If Google is rate-limiting, use the manual fields below.
                </p>
              </div>
              <Button onClick={() => void showResourceNames()} disabled={actionLoading === "show-resource-names" || !hasGoogleConnection}>
                {actionLoading === "show-resource-names" ? <Loader2 className="animate-spin" /> : <KeyRound />}
                Show resource names
              </Button>
            </div>

            {resourceError ? (
              <div className={`rounded-md border p-3 text-sm ${isQuotaMessage(resourceError) ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                {resourceError}
              </div>
            ) : null}

            {resourceDiscovery?.accountError ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                Accounts API: {googleErrorLine(resourceDiscovery.accountError)}
              </div>
            ) : null}
            {resourceDiscovery?.locationError ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                Locations API: {googleErrorLine(resourceDiscovery.locationError)}
              </div>
            ) : null}

            {resourceDiscovery?.resources?.length ? (
              <div className="grid gap-3">
                {resourceDiscovery.resources.map((resource) => (
                  <div key={resource.accountName} className="grid gap-3 rounded-md border bg-background/60 p-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account Resource Name</p>
                        <div className="mt-2 flex items-center gap-2">
                          <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 text-sm">{resource.accountName}</code>
                          <Button size="sm" variant="outline" onClick={() => void copyText(resource.accountName, "Account resource name")}>
                            <Copy />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Google Account</p>
                        <p className="mt-2 break-words text-sm font-semibold">{resource.accountDisplayName || resource.accountName}</p>
                      </div>
                    </div>
                    {resource.locationError ? (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                        Location lookup: {googleErrorLine(resource.locationError)}
                      </div>
                    ) : null}
                    {resource.locations.length ? resource.locations.map((location) => (
                      <div key={location.locationName} className="grid gap-3 rounded-md border bg-background/45 p-3 md:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Location Resource Name</p>
                          <div className="mt-2 flex items-center gap-2">
                            <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 text-sm">{location.locationName}</code>
                            <Button size="sm" variant="outline" onClick={() => void copyText(location.locationName, "Location resource name")}>
                              <Copy />
                            </Button>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Business Name</p>
                          <p className="mt-2 break-words text-sm font-semibold">{location.businessName || "Business location"}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Profile URL</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{location.profileUrl || "Not returned"}</span>
                            {location.profileUrl ? (
                              <Button size="sm" variant="outline" onClick={() => void copyText(location.profileUrl || "", "Business Profile URL")}>
                                <Copy />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )) : (
                      <p className="rounded-md border bg-background/45 p-3 text-sm text-muted-foreground">
                        No locations were returned for this account. Use the manual fields below if you already have the location resource name.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 rounded-md border bg-background/45 p-4 lg:grid-cols-[1fr_1fr_auto]">
            <div className="lg:col-span-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-primary/40 bg-primary/10 text-primary">Manual mode available</Badge>
                <span className="text-xs text-muted-foreground">
                  Paste account/location names directly when Google account loading is rate-limited.
                </span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Google account</Label>
              <select
                value={selectedAccount}
                onChange={(event) => {
                  setSelectedAccount(event.target.value);
                  setSelectedLocation("");
                }}
                className="h-10 rounded-md border bg-background/70 px-3 text-sm"
              >
                <option value="">{accounts.length ? "Choose account" : "Load accounts to select"}</option>
                {selectedAccount && !accounts.some((account) => account.name === selectedAccount) ? (
                  <option value={selectedAccount}>{selectedAccount}</option>
                ) : null}
                {accounts.map((account) => (
                  <option key={account.name} value={account.name}>{account.accountName || account.name}</option>
                ))}
              </select>
              <Input
                value={selectedAccount}
                onChange={(event) => setSelectedAccount(event.target.value)}
                placeholder="accounts/123456789"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Required format: accounts/123456789.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Business location</Label>
              <select value={selectedLocation} onChange={(event) => setSelectedLocation(event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                <option value="">{locations.length ? "Choose location" : "Load locations to select"}</option>
                {selectedLocation && !locations.some((location) => location.name === selectedLocation) ? (
                  <option value={selectedLocation}>{selectedLocation}</option>
                ) : null}
                {locations.map((location) => (
                  <option key={location.name} value={location.name}>{location.title || location.name}</option>
                ))}
              </select>
              <Input
                value={selectedLocation}
                onChange={(event) => setSelectedLocation(event.target.value)}
                placeholder="locations/123456789"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Required format: locations/123456789. Fly Logistics combines it with the account internally when needed.
              </p>
            </div>
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="gbpProfileUrl">Business Profile URL</Label>
              <Input
                id="gbpProfileUrl"
                value={profileUrl}
                onChange={(event) => setProfileUrl(event.target.value)}
                placeholder="https://www.google.com/maps/place/..."
              />
            </div>
            <div className="flex flex-col gap-2 lg:justify-end">
              <Button
                variant="outline"
                onClick={() => void postAction({ action: "test_access_token" }, "Google access token is valid.", "test-token")}
                disabled={actionLoading === "test-token" || !hasGoogleConnection}
              >
                {actionLoading === "test-token" ? <Loader2 className="animate-spin" /> : <KeyRound />}
                Test token
              </Button>
              <Button variant="outline" onClick={() => void loadAccounts()} disabled={actionLoading === "accounts" || accountsCoolingDown}>
                {actionLoading === "accounts" ? <Loader2 className="animate-spin" /> : <Search />}
                {accountsCoolingDown ? `Accounts (${formatCooldown(accountsCooldownSeconds)})` : "Accounts"}
              </Button>
              <Button variant="outline" onClick={() => void loadLocations()} disabled={actionLoading === "locations" || !selectedAccountReady || locationsCoolingDown}>
                {actionLoading === "locations" ? <Loader2 className="animate-spin" /> : <MapPin />}
                {locationsCoolingDown ? `Locations (${formatCooldown(locationsCooldownSeconds)})` : "Locations"}
              </Button>
              <Button onClick={() => void saveLocation()} disabled={actionLoading === "select-location" || !selectedAccountReady || !selectedLocationReady}>
                Save location
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => void postAction({ action: "sync_business_info" }, "Business information synced.", "business-info")}
              disabled={!canUseGoogleBusiness || actionLoading === "business-info"}
              title={!canUseGoogleBusiness ? "Save a Google account and location first." : undefined}
            >
              <RefreshCw />
              Sync business info
            </Button>
            {health?.profileUrl && (
              <Button asChild variant="outline">
                <a href={health.profileUrl} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Open profile
                </a>
              </Button>
            )}
            <Button variant="destructive" onClick={() => void postAction({ action: "disconnect" }, "Google Business Profile disconnected.", "disconnect")}>
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Star className="size-5 text-primary" />
              Reviews
            </CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                <option value="all">All ratings</option>
                {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={String(rating)}>{rating} stars</option>)}
              </select>
              <select value={replyFilter} onChange={(event) => setReplyFilter(event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                <option value="all">All replies</option>
                <option value="unreplied">Unreplied</option>
                <option value="replied">Replied</option>
              </select>
              <Button
                variant="outline"
                onClick={() => void postAction({ action: "refresh_reviews" }, "Reviews refreshed.", "reviews")}
                disabled={!canUseGoogleBusiness || actionLoading === "reviews"}
                title={!canUseGoogleBusiness ? "Save a Google account and location first." : undefined}
              >
                <RefreshCw />
                Refresh reviews
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading ? <Skeleton className="h-48 rounded-md" /> : filteredReviews.length ? filteredReviews.map((review) => {
            const reviewName = text(review.review_name);
            return (
              <div key={reviewName} className="rounded-md border bg-background/45 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{text(review.reviewer_name, "Google reviewer")}</h3>
                      <Badge className="border-primary/40 bg-primary/10 text-primary">{starText(review.star_rating)} stars</Badge>
                      {text(review.reply_comment) ? <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Replied</Badge> : <Badge className="border-border bg-background text-muted-foreground">Needs reply</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(review.review_created_at)}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{text(review.comment, "No review text provided.")}</p>
                {text(review.reply_comment) && (
                  <div className="mt-3 rounded-md border bg-background/60 p-3 text-sm">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current reply</p>
                    <p className="mt-2">{text(review.reply_comment)}</p>
                  </div>
                )}
                <div className="mt-3 grid gap-2">
                  <Label htmlFor={`reply-${reviewName}`}>Reply</Label>
                  <textarea
                    id={`reply-${reviewName}`}
                    value={replyDrafts[reviewName] ?? text(review.reply_comment)}
                    onChange={(event) => setReplyDrafts((current) => ({ ...current, [reviewName]: event.target.value }))}
                    className="min-h-24 rounded-md border bg-background/70 p-3 text-sm"
                    placeholder="Write a professional Fly Logistics reply..."
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      onClick={() => void postAction({ action: "reply_review", reviewName, comment: replyDrafts[reviewName] ?? text(review.reply_comment) }, "Review reply sent.", `reply-${reviewName}`)}
                      disabled={!canUseGoogleBusiness || actionLoading === `reply-${reviewName}`}
                    >
                      {actionLoading === `reply-${reviewName}` ? <Loader2 className="animate-spin" /> : <MessageSquareReply />}
                      Send reply
                    </Button>
                    {text(review.reply_comment) && (
                      <Button
                        variant="outline"
                        onClick={() => void postAction({ action: "delete_review_reply", reviewName }, "Review reply deleted.", `delete-reply-${reviewName}`)}
                        disabled={!canUseGoogleBusiness}
                      >
                        <Trash2 />
                        Delete reply
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          }) : <p className="rounded-md border bg-background/45 p-4 text-sm text-muted-foreground">No Google reviews synced yet.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-5 text-primary" />
              Google posts
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form className="grid gap-3 rounded-md border bg-background/45 p-4" onSubmit={submitPost}>
              <div className="grid gap-2">
                <Label htmlFor="gbpPostTitle">Title</Label>
                <Input id="gbpPostTitle" value={postForm.title} onChange={(event) => setPostForm((current) => ({ ...current, title: event.target.value }))} placeholder="Same-day delivery now available" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gbpPostSummary">Content</Label>
                <textarea id="gbpPostSummary" value={postForm.summary} onChange={(event) => setPostForm((current) => ({ ...current, summary: event.target.value }))} className="min-h-28 rounded-md border bg-background/70 p-3 text-sm" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gbpPostCta">CTA link</Label>
                <Input id="gbpPostCta" value={postForm.ctaUrl} onChange={(event) => setPostForm((current) => ({ ...current, ctaUrl: event.target.value }))} />
              </div>
              <Button disabled={!canUseGoogleBusiness || actionLoading === "create-post"}>
                {actionLoading === "create-post" ? <Loader2 className="animate-spin" /> : <Send />}
                Create Google post
              </Button>
            </form>
            <div className="grid gap-3">
              {(report?.posts ?? []).slice(0, 8).map((post) => (
                <div key={text(post.post_name)} className="rounded-md border bg-background/45 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{text(post.summary, "Google post").slice(0, 120)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{text(post.state, "Unknown status")} - {formatDate(post.synced_at)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void postAction({ action: "delete_post", postName: text(post.post_name) }, "Google post deleted.", `delete-post-${text(post.post_name)}`)}
                      disabled={!canUseGoogleBusiness}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImagePlus className="size-5 text-primary" />
              Business photos
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form className="grid gap-3 rounded-md border bg-background/45 p-4" onSubmit={submitMedia}>
              <div className="grid gap-2">
                <Label htmlFor="gbpMediaUrl">Image URL</Label>
                <Input id="gbpMediaUrl" value={mediaForm.sourceUrl} onChange={(event) => setMediaForm((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder="https://..." required />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="gbpMediaCategory">Category</Label>
                  <select id="gbpMediaCategory" value={mediaForm.category} onChange={(event) => setMediaForm((current) => ({ ...current, category: event.target.value }))} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                    {["ADDITIONAL", "EXTERIOR", "INTERIOR", "PRODUCT", "AT_WORK", "TEAM"].map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="gbpMediaDescription">Description</Label>
                  <Input id="gbpMediaDescription" value={mediaForm.description} onChange={(event) => setMediaForm((current) => ({ ...current, description: event.target.value }))} />
                </div>
              </div>
              <Button disabled={!canUseGoogleBusiness || actionLoading === "upload-media"}>
                {actionLoading === "upload-media" ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                Upload business photo
              </Button>
            </form>
            <div className="grid gap-3 sm:grid-cols-2">
              {(report?.media ?? []).slice(0, 8).map((item) => (
                <div key={text(item.media_name)} className="rounded-md border bg-background/45 p-3 text-sm">
                  {text(item.thumbnail_url) || text(item.source_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={text(item.thumbnail_url) || text(item.source_url)} alt="Google Business media" className="h-32 w-full rounded-md object-cover" />
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-md bg-muted text-muted-foreground">No preview</div>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{text(item.category, "Business photo")}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(item.synced_at)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void postAction({ action: "delete_media", mediaName: text(item.media_name) }, "Google media deleted.", `delete-media-${text(item.media_name)}`)}
                      disabled={!canUseGoogleBusiness}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-primary" />
            Latest sync activity
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {(report?.syncs ?? []).length ? report?.syncs.map((sync) => (
            <div key={String(sync.id)} className="flex flex-col gap-1 rounded-md border bg-background/45 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold">{text(sync.sync_type, "sync")}</span>
              <span className="text-muted-foreground">{text(sync.status, "unknown")} - {formatDate(sync.synced_at ?? sync.created_at)}</span>
            </div>
          )) : <p className="rounded-md border bg-background/45 p-4 text-muted-foreground">No sync history yet.</p>}
        </CardContent>
      </Card>
    </section>
  );
}
