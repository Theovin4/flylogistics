import Link from "next/link";
import type { Route } from "next";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const posts = [
  "AI route optimization for volatile freight networks",
  "How real-time tracking changes customer trust",
  "Designing resilient warehouse operations with predictive signals"
];

export default function BlogPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <Badge className="border-primary/40 bg-primary/10 text-primary">Field notes</Badge>
        <h1 className="mt-6 text-5xl font-black tracking-normal">Logistics intelligence briefings.</h1>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {posts.map((post) => (
            <Link key={post} href={`/blog/${post.toLowerCase().replaceAll(" ", "-")}` as Route}>
              <Card className="glass h-full transition hover:-translate-y-1 hover:border-primary/50">
                <CardHeader><CardTitle>{post}</CardTitle></CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  Practical playbooks for teams building modern freight, fleet, and warehouse systems.
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
