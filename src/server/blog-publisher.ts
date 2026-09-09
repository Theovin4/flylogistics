import { z } from "zod";
import { blogWordCount, type BlogPost } from "@/lib/blog";
import { cleanEnv } from "@/lib/env";
import { getGroq } from "@/lib/groq";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { logError, logInfo, logWarn } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

const publishingStartDate = cleanEnv(process.env.BLOG_HIGH_FREQUENCY_START_DATE) ?? "2026-07-06";
const dailyPublishingSwitchDate =
  cleanEnv(process.env.BLOG_DAILY_SWITCH_DATE) ??
  cleanEnv(process.env.BLOG_PUBLISH_START_DATE) ??
  "2026-07-20";
const publishingTimezone = cleanEnv(process.env.BLOG_PUBLISH_TIMEZONE) ?? "Africa/Lagos";
const highFrequencyPostsPerDay = 3;
const steadyStatePostsPerDay = 1;

const generatedSectionSchema = z.object({
  heading: z.string().trim().min(8).max(300),
  focus: z.string().trim().min(12).max(2000),
  risks: z.string().trim().min(12).max(2000),
  actions: z.string().trim().min(12).max(2000),
  measures: z.string().trim().min(8).max(1000)
});

const generatedPostSchema = z.object({
  title: z.string().trim().min(12).max(240),
  description: z.string().trim().min(20).max(600),
  category: z.string().trim().min(2).max(100),
  keywords: z.array(z.string().trim().min(2).max(160)).min(4).max(10),
  audience: z.string().trim().min(12).max(800),
  promise: z.string().trim().min(12).max(800),
  sections: z.array(generatedSectionSchema).length(6),
  checklist: z.array(z.string().trim().min(4).max(400)).length(6),
  faqs: z.array(z.tuple([z.string().trim().min(8).max(400), z.string().trim().min(15).max(1600)])).length(3)
});

const subjects = [
  "address accuracy and first-attempt delivery", "interstate parcel preparation", "delivery pricing transparency", "small-business dispatch planning",
  "international export documentation", "international import readiness", "e-commerce returns logistics", "warehouse-to-customer fulfilment",
  "last-mile route planning", "shipment fraud prevention", "delivery payment safety", "fragile parcel packaging",
  "high-value shipment protection", "customer tracking confidence", "driver workload planning", "regional hub operations",
  "air freight readiness", "ocean freight planning", "cross-border African trade", "sustainable delivery operations",
  "peak-season logistics", "failed delivery reduction", "business shipping analytics", "customer notification strategy",
  "cash-on-delivery controls", "delivery exception recovery", "medical and urgent parcel planning", "fashion and retail fulfilment",
  "food delivery handling", "multi-location business logistics", "logistics support quality", "mobile-first shipment management"
] as const;

const audiences = ["online sellers", "growing Nigerian businesses", "individual senders", "operations managers", "retail teams", "international traders", "e-commerce brands", "customer support teams"] as const;
const lenses = ["practical guide", "cost and risk playbook", "step-by-step checklist", "common mistakes and fixes", "planning framework", "customer trust guide", "operations scorecard", "decision guide"] as const;

function dateInTimezone(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: publishingTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function daysBetween(start: string, end: string) {
  return Math.floor((utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000);
}

function dateFromIndex(index: number) {
  const date = utcDate(publishingStartDate);
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

function postsForDate(sourceDate: string) {
  return sourceDate < dailyPublishingSwitchDate ? highFrequencyPostsPerDay : steadyStatePostsPerDay;
}

function topicForIndex(index: number) {
  const subject = subjects[index % subjects.length];
  const audience = audiences[Math.floor(index / subjects.length) % audiences.length];
  const lens = lenses[Math.floor(index / (subjects.length * audiences.length)) % lenses.length];
  return `${subject} for ${audience}: ${lens}`;
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}

function truncateAtWord(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  const shortened = compact.slice(0, maxLength + 1);
  const boundary = shortened.lastIndexOf(" ");
  return shortened.slice(0, boundary > maxLength * 0.65 ? boundary : maxLength).replace(/[,:;\s]+$/, "").trim();
}

function normalizeDescription(value: string, topic: string) {
  const support = `Practical Fly Logistics guidance for ${topic}, with clearer planning, tracking, risk control, and delivery decisions.`;
  let description = value.replace(/\s+/g, " ").trim();
  if (description.length < 120) description = `${description} ${support}`.trim();
  if (description.length < 120) {
    description = `${description} Learn the essential steps for a safer and more reliable shipment experience.`.trim();
  }
  return truncateAtWord(description, 165);
}

function extractJson(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed) as unknown;
}

function containsInternalBranding(post: BlogPost) {
  const text = JSON.stringify(post);
  return /\b(?:supabase|groq|vercel|cloudinary|redis|fez|sendbox)\b/i.test(text);
}

async function generatePost(topic: string, sourceDate: string): Promise<BlogPost> {
  const groq = getGroq();
  if (!groq) throw new Error("GROQ_API_KEY is not configured for scheduled blog publishing.");

  const response = await groq.chat.completions.create({
    model: cleanEnv(process.env.BLOG_GROQ_MODEL) ?? "llama-3.3-70b-versatile",
    temperature: 0.55,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the senior editorial team for Fly Logistics, a premium logistics company based in Lagos serving Nigeria and global routes.

Create factual, original, customer-friendly logistics guidance. Never invent statistics, guarantees, prices, laws, customer stories, quotations, awards, or market claims. Never mention backend carriers or developer infrastructure. Keep proof-of-delivery media private. Use Nigerian English and globally understandable language. The content must be useful enough for Google Search and AdSense review, but never use keyword stuffing or promise rankings.

Return valid JSON only with exactly this structure:
{"title":"","description":"120-165 characters","category":"","keywords":["4-8 phrases"],"audience":"","promise":"","sections":[{"heading":"","focus":"","risks":"","actions":"","measures":""}],"checklist":["exactly 6"],"faqs":[["question","answer"]]}

Rules: exactly 6 distinct sections, exactly 6 checklist items, exactly 3 FAQs. Every section must be specific to the topic. Write enough practical detail to render as a 1,200-2,000 word article after formatting: each section focus should be 70-110 words, risks 45-80 words, actions 45-80 words, and measures 25-50 words. Do not use dates in the title. Do not repeat a heading. Do not provide medical, legal, customs, or insurance advice as certainty; recommend verification when rules vary.`
      },
      {
        role: "user",
        content: `Editorial date: ${sourceDate}. Write a unique Fly Logistics guide about: ${topic}. Optimize naturally for logistics searches in Nigeria and relevant global routes.`
      }
    ]
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Blog generation returned no content.");
  const parsed = generatedPostSchema.parse(extractJson(content));
  const post: BlogPost = {
    slug: slugify(truncateAtWord(parsed.title, 105)),
    title: truncateAtWord(parsed.title, 105),
    description: normalizeDescription(parsed.description, topic),
    category: truncateAtWord(parsed.category, 50),
    publishedAt: new Date().toISOString(),
    keywords: parsed.keywords.slice(0, 8).map((keyword) => truncateAtWord(keyword, 70)),
    audience: truncateAtWord(parsed.audience, 260),
    promise: truncateAtWord(parsed.promise, 260),
    sections: parsed.sections.map((section) => ({
      heading: truncateAtWord(section.heading, 90),
      focus: truncateAtWord(section.focus, 620),
      risks: truncateAtWord(section.risks, 460),
      actions: truncateAtWord(section.actions, 460),
      measures: truncateAtWord(section.measures, 280)
    })),
    checklist: parsed.checklist.map((item) => truncateAtWord(item, 150)),
    faqs: parsed.faqs.map(([question, answer]) => [
      truncateAtWord(question, 140),
      truncateAtWord(answer, 520)
    ] as [string, string])
  };

  const wordCount = blogWordCount(post);
  if (wordCount < 1200 || wordCount > 2000) {
    throw new Error(`Generated article failed word-count validation (${wordCount}).`);
  }
  if (containsInternalBranding(post)) throw new Error("Generated article exposed internal provider terminology.");
  return post;
}

async function publishDate(sourceDate: string, index: number, dailySequence: number) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase admin connection is unavailable for blog publishing.");

  const existing = await supabase
    .from("blog_posts")
    .select("id,slug")
    .eq("source_date", sourceDate)
    .eq("daily_sequence", dailySequence)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { status: "already_published" as const, slug: existing.data.slug };

  const topic = topicForIndex(index);
  let post: BlogPost | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2 && !post; attempt += 1) {
    try {
      post = await generatePost(`${topic}${attempt ? `, alternative angle ${attempt + 1}` : ""}`, sourceDate);
    } catch (error) {
      lastError = error;
      logWarn("Scheduled blog generation attempt failed.", { sourceDate, attempt: attempt + 1, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (!post) throw lastError instanceof Error ? lastError : new Error("Scheduled blog generation failed validation.");

  const duplicateSlug = await supabase.from("blog_posts").select("id").eq("slug", post.slug).limit(1);
  if (duplicateSlug.error) throw duplicateSlug.error;
  const duplicateTitle = await supabase.from("blog_posts").select("id").eq("title", post.title).limit(1);
  if (duplicateTitle.error) throw duplicateTitle.error;
  if (duplicateSlug.data?.length || duplicateTitle.data?.length) {
    post = { ...post, slug: `${post.slug}-${sourceDate}` };
  }

  const wordCount = blogWordCount(post);
  const { error } = await supabase.from("blog_posts").insert({
    source_date: sourceDate,
    daily_sequence: dailySequence,
    slug: post.slug,
    title: post.title,
    description: post.description,
    category: post.category,
    published_at: post.publishedAt,
    keywords: post.keywords,
    audience: post.audience,
    promise: post.promise,
    sections: post.sections,
    checklist: post.checklist,
    faqs: post.faqs,
    status: "published",
    generated_by: cleanEnv(process.env.BLOG_GROQ_MODEL) ?? "llama-3.3-70b-versatile",
    word_count: wordCount
  });
  if (error) throw error;

  await writeOperationalEvent(supabase, {
    category: "system",
    message: "Scheduled Fly Logistics blog article published.",
    entityType: "blog_post",
    entityId: post.slug,
    metadata: { sourceDate, dailySequence, wordCount, topic }
  });
  return { status: "published" as const, slug: post.slug, wordCount };
}

export async function publishScheduledBlogPosts(now = new Date()) {
  const today = dateInTimezone(now);
  if (today < publishingStartDate) {
    return { ok: true, active: false, startDate: publishingStartDate, timezone: publishingTimezone, results: [] };
  }

  const totalDays = daysBetween(publishingStartDate, today);
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase admin connection is unavailable for blog scheduling.");
  const { data: published, error } = await supabase
    .from("blog_posts")
    .select("source_date,daily_sequence")
    .gte("source_date", publishingStartDate)
    .lte("source_date", today);
  if (error) throw error;

  const completed = new Set(
    (published ?? []).map((row) => `${String(row.source_date)}:${Number(row.daily_sequence ?? 1)}`)
  );
  const pending: Array<{ date: string; index: number; dailySequence: number }> = [];
  let topicIndex = 0;
  for (let dayIndex = 0; dayIndex <= totalDays; dayIndex += 1) {
    const date = dateFromIndex(dayIndex);
    for (let dailySequence = 1; dailySequence <= postsForDate(date); dailySequence += 1) {
      if (!completed.has(`${date}:${dailySequence}`)) {
        pending.push({ date, index: topicIndex, dailySequence });
      }
      topicIndex += 1;
    }
  }

  const results = [];
  const postsThisRun = postsForDate(today);
  for (const item of pending.slice(0, postsThisRun)) {
    try {
      results.push({
        date: item.date,
        dailySequence: item.dailySequence,
        ...(await publishDate(item.date, item.index, item.dailySequence))
      });
    } catch (error) {
      logError(error, "Scheduled blog publication failed.", {
        sourceDate: item.date,
        dailySequence: item.dailySequence
      });
      await writeOperationalEvent(supabase, {
        category: "system",
        severity: "error",
        message: "Scheduled blog publication failed quality or provider checks.",
        entityType: "blog_post",
        entityId: `${item.date}:${item.dailySequence}`,
        metadata: {
          sourceDate: item.date,
          dailySequence: item.dailySequence,
          reason: error instanceof Error ? error.message : String(error)
        }
      });
      results.push({ date: item.date, dailySequence: item.dailySequence, status: "failed" as const });
      break;
    }
  }

  logInfo("Scheduled blog publication job completed.", { today, results });
  return {
    ok: results.every((result) => result.status !== "failed"),
    active: true,
    startDate: publishingStartDate,
    dailyPublishingSwitchDate,
    postsPerDay: postsThisRun,
    timezone: publishingTimezone,
    results
  };
}
