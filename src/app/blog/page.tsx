import Link from "next/link";
import type { Route } from "next";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { estimateReadingMinutes } from "@/lib/blog";
import { createMetadata } from "@/lib/seo";
import { conversionLinks } from "@/lib/site";
import { getAllPublishedBlogPosts } from "@/server/blog-posts";

export const revalidate = 3600;

export const metadata = createMetadata({
  title: "Logistics Intelligence Blog - Fly Logistics",
  description: "Read Fly Logistics briefings on AI route optimization, realtime tracking, warehouse operations, and business logistics.",
  path: "/blog",
  keywords: ["logistics blog", "AI route optimization", "warehouse operations", "real-time tracking"]
});

export default async function BlogPage() {
  const posts = await getAllPublishedBlogPosts();
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <Badge className="border-primary/40 bg-primary/10 text-primary">Fly Logistics guides</Badge>
        <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-normal text-balance sm:text-5xl">Practical logistics knowledge for confident shipping.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">Original field guides on Nigerian delivery, international shipping, tracking, e-commerce fulfilment, shipment protection, and modern logistics operations.</p>
        <section className="mt-10 rounded-md border bg-background/45 p-5" aria-label="Popular Fly Logistics service links">
          <h2 className="text-xl font-bold tracking-normal">Popular services from the Fly Logistics knowledge base</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {conversionLinks.slice(0, 9).map((link) => (
              <Link key={link.href} href={link.href as Route} className="rounded-md border bg-background/60 p-3 text-sm font-semibold hover:border-primary/50">
                {link.label}
              </Link>
            ))}
          </div>
        </section>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}` as Route}>
              <Card className="glass h-full transition hover:-translate-y-1 hover:border-primary/50">
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{post.category}</span><span aria-hidden>·</span><span>{estimateReadingMinutes(post)} min read</span>
                  </div>
                  <CardTitle>{post.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  {post.description}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
