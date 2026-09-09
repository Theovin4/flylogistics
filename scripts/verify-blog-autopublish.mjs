import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function dateInTimezone(now, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function postsForDate(sourceDate, switchDate) {
  return sourceDate < switchDate ? 3 : 1;
}

loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const timezone = process.env.BLOG_PUBLISH_TIMEZONE || "Africa/Lagos";
const switchDate =
  process.env.BLOG_DAILY_SWITCH_DATE ||
  process.env.BLOG_PUBLISH_START_DATE ||
  "2026-07-20";
const today = dateInTimezone(new Date(), timezone);

const readiness = {
  supabaseUrl: Boolean(url),
  serviceRoleKey: Boolean(serviceRoleKey),
  groqKey: Boolean(process.env.GROQ_API_KEY),
  cronSecret: Boolean(process.env.CRON_SECRET),
  model: process.env.BLOG_GROQ_MODEL || "llama-3.3-70b-versatile",
  timezone,
  switchDate,
  today,
  expectedPostsToday: postsForDate(today, switchDate)
};

if (!url || !serviceRoleKey) {
  console.log(JSON.stringify({ ok: false, readiness, error: "Missing Supabase env." }, null, 2));
  process.exitCode = 1;
} else {
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const latest = await supabase
    .from("blog_posts")
    .select("source_date,daily_sequence,slug,title,published_at,status,word_count")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(12);

  const todayRows = await supabase
    .from("blog_posts")
    .select("source_date,daily_sequence,slug,published_at,status,word_count")
    .eq("source_date", today)
    .eq("status", "published")
    .order("daily_sequence", { ascending: true });

  const total = await supabase
    .from("blog_posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");

  if (latest.error || todayRows.error || total.error) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          readiness,
          errors: {
            latest: latest.error?.message,
            todayRows: todayRows.error?.message,
            total: total.error?.message
          }
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } else {
    console.log(
      JSON.stringify(
        {
          ok: true,
          readiness,
          totalPublishedDatabasePosts: total.count,
          todayPublishedCount: todayRows.data?.length ?? 0,
          todayComplete: (todayRows.data?.length ?? 0) >= readiness.expectedPostsToday,
          todayPosts: todayRows.data ?? [],
          latestPosts: latest.data ?? []
        },
        null,
        2
      )
    );
  }
}
