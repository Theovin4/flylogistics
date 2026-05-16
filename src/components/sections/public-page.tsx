import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PublicPage({ page }: { page: { title: string; eyebrow: string; description: string; metrics: readonly string[] } }) {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 grid-field opacity-60" />
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <Badge className="border-primary/40 bg-primary/10 text-primary">{page.eyebrow}</Badge>
            <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-normal text-balance sm:text-6xl">{page.title}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">{page.description}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/instant-quote">
                  Start moving freight <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/contact">Talk to sales</Link>
              </Button>
            </div>
          </div>
        </section>
        <section className="mx-auto grid max-w-7xl gap-5 px-4 pb-20 sm:px-6 md:grid-cols-3 lg:px-8">
          {page.metrics.map((metric) => (
            <Card key={metric} className="glass">
              <CardHeader>
                <CheckCircle2 className="size-5 text-primary" />
                <CardTitle>{metric}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                Designed as a production-ready module with responsive UI, secure API boundaries, and room for enterprise workflows.
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
