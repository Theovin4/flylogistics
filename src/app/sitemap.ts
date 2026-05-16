import type { MetadataRoute } from "next";
import { publicPages, siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "tracking", "instant-quote", "blog", ...publicPages.map((page) => page.slug)];
  return routes.map((route) => ({
    url: `${siteConfig.url}/${route}`,
    lastModified: new Date("2026-05-15"),
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.8
  }));
}
