import { getSupabaseAdmin } from "@/lib/supabase-server";
import { logWarn } from "@/server/monitoring";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type BackgroundJobError = { code?: string; message?: string } | null;

export type BackgroundJobType =
  | "carrier_sync"
  | "notification_send"
  | "payment_reconcile"
  | "blog_publish"
  | "refund_review"
  | "admin_export_workbook";

export type BackgroundJob = {
  id: string;
  job_type: BackgroundJobType;
  entity_type?: string | null;
  entity_id?: string | null;
  company_id?: string | null;
  payload?: Record<string, unknown> | null;
  attempts?: number | null;
};

export type BackgroundJobEnqueueResult = {
  jobId: string | null;
  error: BackgroundJobError;
};

function isSchemaUnavailable(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST205" || error?.code === "PGRST204";
}

export async function enqueueBackgroundJob(
  supabase: SupabaseAdminClient,
  input: {
    jobType: BackgroundJobType;
    entityType?: string;
    entityId?: string;
    companyId?: string | null;
    payload?: Record<string, unknown>;
    runAt?: string;
  }
): Promise<BackgroundJobEnqueueResult> {
  const result = await supabase
    .from("background_jobs")
    .insert({
      job_type: input.jobType,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      company_id: input.companyId ?? null,
      payload: input.payload ?? {},
      status: "pending",
      run_at: input.runAt ?? new Date().toISOString()
    })
    .select("id")
    .single();

  if (result.error) {
    if (!isSchemaUnavailable(result.error)) {
      logWarn("Background job enqueue failed.", { jobType: input.jobType, reason: result.error.message });
    }
    return { jobId: null, error: result.error };
  }

  return { jobId: String(result.data.id), error: null };
}

export async function claimBackgroundJobs(supabase: SupabaseAdminClient, limit = 10) {
  const pending = await supabase
    .from("background_jobs")
    .select("id,job_type,entity_type,entity_id,company_id,payload,attempts")
    .eq("status", "pending")
    .lte("run_at", new Date().toISOString())
    .order("run_at", { ascending: true })
    .limit(limit);

  if (pending.error) {
    if (!isSchemaUnavailable(pending.error)) {
      logWarn("Background job claim lookup failed.", { reason: pending.error.message });
    }
    return { jobs: [] as BackgroundJob[], error: pending.error };
  }

  const jobs: BackgroundJob[] = [];
  for (const job of (pending.data ?? []) as BackgroundJob[]) {
    const claimed = await supabase
      .from("background_jobs")
      .update({
        status: "running",
        locked_at: new Date().toISOString(),
        attempts: Number(job.attempts ?? 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id,job_type,entity_type,entity_id,company_id,payload,attempts")
      .maybeSingle();

    if (!claimed.error && claimed.data) jobs.push(claimed.data as BackgroundJob);
  }

  return { jobs, error: null };
}

export async function completeBackgroundJob(supabase: SupabaseAdminClient, jobId: string, result?: Record<string, unknown>) {
  await supabase
    .from("background_jobs")
    .update({
      status: "completed",
      result: result ?? {},
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", jobId);
}

export async function failBackgroundJob(supabase: SupabaseAdminClient, job: BackgroundJob, error: unknown) {
  const attempts = Number(job.attempts ?? 1);
  const retryDelayMs = Math.min(30 * 60_000, 60_000 * Math.max(1, attempts));
  const retryAt = new Date(Date.now() + retryDelayMs).toISOString();
  await supabase
    .from("background_jobs")
    .update({
      status: attempts >= 5 ? "failed" : "pending",
      error_message: error instanceof Error ? error.message : String(error),
      run_at: attempts >= 5 ? null : retryAt,
      locked_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", job.id);
}
