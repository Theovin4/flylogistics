import { z } from "zod";
import { getBlogPost, getPublishedBlogPosts, type BlogPost } from "@/lib/blog";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { logWarn } from "@/server/monitoring";

const sectionSchema = z.object({
  heading: z.string().min(2),
  focus: z.string().min(2),
  risks: z.string().min(2),
  actions: z.string().min(2),
  measures: z.string().min(2)
});

const rowSchema = z.object({
  slug: z.string().min(2),
  title: z.string().min(2),
  description: z.string().min(2),
  category: z.string().min(2),
  published_at: z.string().min(2),
  keywords: z.array(z.string()).default([]),
  audience: z.string().min(2),
  promise: z.string().min(2),
  sections: z.array(sectionSchema).min(6),
  checklist: z.array(z.string()).min(6),
  faqs: z.array(z.tuple([z.string(), z.string()])).min(3)
});

function fromRow(value: unknown): BlogPost | null {
  const parsed = rowSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    slug: parsed.data.slug,
    title: parsed.data.title,
    description: parsed.data.description,
    category: parsed.data.category,
    publishedAt: parsed.data.published_at,
    keywords: parsed.data.keywords,
    audience: parsed.data.audience,
    promise: parsed.data.promise,
    sections: parsed.data.sections,
    checklist: parsed.data.checklist,
    faqs: parsed.data.faqs
  };
}

async function databasePosts(now: Date) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug,title,description,category,published_at,keywords,audience,promise,sections,checklist,faqs")
    .eq("status", "published")
    .lte("published_at", now.toISOString())
    .order("published_at", { ascending: false });

  if (error) {
    if (!["42P01", "PGRST205"].includes(error.code ?? "")) {
      logWarn("Unable to load database blog posts.", { reason: error.message });
    }
    return [];
  }

  return (data ?? []).map(fromRow).filter((post): post is BlogPost => Boolean(post));
}

export async function getAllPublishedBlogPosts(now = new Date()) {
  const combined = [...getPublishedBlogPosts(now), ...(await databasePosts(now))];
  const unique = new Map(combined.map((post) => [post.slug, post]));
  return [...unique.values()].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export async function getPublishedBlogPost(slug: string, now = new Date()) {
  const staticPost = getBlogPost(slug);
  if (staticPost && new Date(staticPost.publishedAt).getTime() <= now.getTime()) return staticPost;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug,title,description,category,published_at,keywords,audience,promise,sections,checklist,faqs")
    .eq("slug", slug)
    .eq("status", "published")
    .lte("published_at", now.toISOString())
    .maybeSingle();

  if (error) {
    if (!["42P01", "PGRST205"].includes(error.code ?? "")) {
      logWarn("Unable to load database blog post.", { slug, reason: error.message });
    }
    return null;
  }
  return fromRow(data);
}
