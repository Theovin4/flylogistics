import type { MetadataRoute } from "next";
import { canonicalSiteUrl, publicPages } from "@/lib/site";
import { getAllPublishedBlogPosts } from "@/server/blog-posts";

export const revalidate = 3600;

const publicIndexableRoutes = [
  "",
  "quote",
  "tracking",
  "blog",
  "map",
  "chat",
  "service-areas",
  "knowledge-base",
  "security",
  "merchant",
  "terms",
  "privacy",
  "delivery-policy",
  "refund-policy",
  "prohibited-items",
  "data-deletion",
  "cloud",
  "cloud/pricing",
  "cloud/features",
  "cloud/demo"
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const blogPosts = await getAllPublishedBlogPosts();
  const defaultLastModified = new Date();
  const routes = Array.from(new Set([
    ...publicIndexableRoutes,
    ...publicPages.map((page) => page.slug),
    ...blogPosts.map((post) => `blog/${post.slug}`)
  ]));

  return routes.map((route) => ({
    url: route ? `${canonicalSiteUrl}/${route}` : canonicalSiteUrl,
    lastModified: route.startsWith("blog/")
      ? new Date(blogPosts.find((post) => `blog/${post.slug}` === route)?.publishedAt ?? "2026-06-21")
      : defaultLastModified,
    changeFrequency: route === "" || route === "tracking" || route === "quote" || route === "blog" ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "quote" || route === "tracking" ? 0.95 : route.startsWith("blog/") ? 0.78 : 0.82
  }));
}
