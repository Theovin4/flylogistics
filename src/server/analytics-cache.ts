import { getSupabaseAdmin } from "@/lib/supabase-server";
import { logWarn } from "@/server/monitoring";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type SnapshotRow = {
  payload?: unknown;
  generated_at?: string | null;
  expires_at?: string | null;
};

function isSchemaUnavailable(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST205" || error?.code === "PGRST204";
}

export function analyticsSnapshotKey(input: Record<string, unknown>) {
  const stable = JSON.stringify(input, Object.keys(input).sort());
  return Buffer.from(stable).toString("base64url").slice(0, 180);
}

export async function readAnalyticsSnapshot(
  supabase: SupabaseAdminClient,
  input: { snapshotKey: string; companyId?: string | null }
) {
  let query = supabase
    .from("admin_analytics_snapshots")
    .select("payload,generated_at,expires_at")
    .eq("snapshot_key", input.snapshotKey)
    .limit(1);

  query = input.companyId ? query.eq("company_id", input.companyId) : query.is("company_id", null);
  const result = await query.maybeSingle();

  if (result.error) {
    if (!isSchemaUnavailable(result.error)) {
      logWarn("Admin analytics snapshot read failed; computing live analytics.", { reason: result.error.message });
    }
    return null;
  }

  const row = result.data as SnapshotRow | null;
  if (!row?.payload) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null;

  return {
    payload: row.payload,
    generatedAt: row.generated_at ?? null,
    expiresAt: row.expires_at ?? null
  };
}

export async function writeAnalyticsSnapshot(
  supabase: SupabaseAdminClient,
  input: { snapshotKey: string; companyId?: string | null; payload: unknown; ttlSeconds?: number }
) {
  const ttlSeconds = input.ttlSeconds ?? 120;
  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt.getTime() + ttlSeconds * 1000);
  const result = await supabase
    .from("admin_analytics_snapshots")
    .upsert(
      {
        snapshot_key: input.snapshotKey,
        company_id: input.companyId ?? null,
        payload: input.payload,
        generated_at: generatedAt.toISOString(),
        expires_at: expiresAt.toISOString()
      },
      { onConflict: "snapshot_key,company_id" }
    );

  if (result.error && !isSchemaUnavailable(result.error)) {
    logWarn("Admin analytics snapshot write failed.", { reason: result.error.message });
  }
}
