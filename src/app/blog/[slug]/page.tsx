import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = slug.replaceAll("-", " ");
  return (
    <>
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <Badge className="border-primary/40 bg-primary/10 text-primary">Fly Logistics Blog</Badge>
        <h1 className="mt-6 text-5xl font-black capitalize tracking-normal text-balance">{title}</h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          Fly Logistics turns fragmented freight operations into a measurable, AI-assisted operating system. This briefing outlines the architecture, data signals, and human workflows needed to scale with confidence.
        </p>
        <div className="mt-10 space-y-6 text-muted-foreground">
          <p>Modern logistics teams need live shipment context, route intelligence, warehouse signals, and financial controls in one place. The winning platforms make exceptions visible early and help operators act before service levels degrade.</p>
          <p>AI should support dispatchers and customers with concise recommendations, traceable confidence, and clear next actions. That means logging prompts, outcomes, costs, and operational impact for every assistant interaction.</p>
        </div>
      </article>
      <SiteFooter />
    </>
  );
}
