import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { claimBackgroundJobs, completeBackgroundJob, failBackgroundJob, type BackgroundJob } from "@/server/background-jobs";
import { publishScheduledBlogPosts } from "@/server/blog-publisher";
import { refreshCarrierTrackingForFlyNumber } from "@/server/carrier-tracking";
import { processDueCancellationRefunds } from "@/server/cancellation-refunds";
import { logError, logInfo, requestContext } from "@/server/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorizedCron(request: Request) {
  const secret = cleanEnv(process.env.CRON_SECRET);
  if (!secret) return false;
  const url = new URL(request.url);
  return request.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

function trackingIdFromJob(job: BackgroundJob) {
  return String(job.payload?.trackingId ?? job.payload?.tracking_id ?? job.entity_id ?? "").trim();
}

async function runJob(job: BackgroundJob, request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase admin client is unavailable.");

  if (job.job_type === "carrier_sync") {
    const trackingId = trackingIdFromJob(job);
    if (!trackingId) throw new Error("Carrier sync job is missing a tracking ID.");
    const refreshed = await refreshCarrierTrackingForFlyNumber(supabase, trackingId, request);
    if (refreshed.error) throw new Error(typeof refreshed.error === "string" ? refreshed.error : refreshed.error.message ?? "Carrier sync failed.");
    await completeBackgroundJob(supabase, job.id, { trackingId, status: refreshed.data?.status ?? null });
    return { jobId: job.id, jobType: job.job_type, status: "completed", trackingId };
  }

  if (job.job_type === "refund_review") {
    const result = await processDueCancellationRefunds(supabase);
    await completeBackgroundJob(supabase, job.id, { processed: result.processed });
    return { jobId: job.id, jobType: job.job_type, status: "completed", processed: result.processed };
  }

  if (job.job_type === "blog_publish") {
    const result = await publishScheduledBlogPosts();
    await completeBackgroundJob(supabase, job.id, { ok: result.ok, results: result.results });
    return { jobId: job.id, jobType: job.job_type, status: result.ok ? "completed" : "completed_with_warnings" };
  }

  await completeBackgroundJob(supabase, job.id, {
    note: "Queued for scalable worker processing. Existing synchronous flow remains active until this worker is expanded."
  });
  return { jobId: job.id, jobType: job.job_type, status: "completed" };
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Background jobs are temporarily unavailable." }, { status: 503 });

  const claimed = await claimBackgroundJobs(supabase, 8);
  if (claimed.error) {
    return NextResponse.json({ ok: true, processed: 0, warning: "Background job table is not ready yet." }, { headers: { "Cache-Control": "no-store" } });
  }

  const results = [];
  let cancellationRefunds: Awaited<ReturnType<typeof processDueCancellationRefunds>> | null = null;
  try {
    cancellationRefunds = await processDueCancellationRefunds(supabase);
  } catch (error) {
    logError(error, "Daily cancellation refund sweep failed.", requestContext(request));
  }

  for (const job of claimed.jobs) {
    try {
      results.push(await runJob(job, request));
    } catch (error) {
      logError(error, "Background job failed.", requestContext(request, { jobId: job.id, jobType: job.job_type }));
      await failBackgroundJob(supabase, job, error);
      results.push({ jobId: job.id, jobType: job.job_type, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }

  logInfo(
    "Background job cron completed.",
    requestContext(request, { processed: results.length, cancellationRefunds: cancellationRefunds?.processed ?? 0 })
  );
  return NextResponse.json(
    { ok: true, processed: results.length, cancellationRefunds, results },
    { headers: { "Cache-Control": "no-store" } }
  );
}
