import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { JsonLd } from "@/components/seo/json-ld";
import { estimateReadingMinutes, getPublishedBlogPosts, sectionParagraphs, type BlogPost } from "@/lib/blog";
import { breadcrumbJsonLd, createMetadata } from "@/lib/seo";
import { canonicalSiteUrl } from "@/lib/site";
import { getPublishedBlogPost } from "@/server/blog-posts";

type BlogPostPageProps = { params: Promise<{ slug: string }> };

export const revalidate = 3600;

export function generateStaticParams() {
  return getPublishedBlogPosts().map((post) => ({ slug: post.slug }));
}

function relatedServiceLinks(post: BlogPost) {
  const text = `${post.title} ${post.description} ${post.category} ${post.keywords.join(" ")}`.toLowerCase();
  const links = new Map<string, string>();
  const add = (href: string, label: string) => links.set(href, label);

  add("/quote", "Get Delivery Price");
  add("/tracking", "Track Shipment");

  if (text.includes("lagos") || text.includes("same-day")) add("/lagos-delivery-services", "Lagos Delivery Services");
  if (text.includes("abuja") || text.includes("interstate")) add("/interstate-delivery", "Interstate Delivery");
  if (text.includes("international") || text.includes("import") || text.includes("export")) add("/international-shipping-from-nigeria", "International Shipping from Nigeria");
  if (text.includes("air freight")) add("/air-freight-services", "Air Freight Services");
  if (text.includes("ocean freight")) add("/ocean-freight-services", "Ocean Freight Services");
  if (text.includes("ecommerce") || text.includes("fulfillment")) add("/ecommerce-fulfillment-worldwide", "E-commerce Fulfillment Worldwide");
  if (text.includes("business") || text.includes("cost")) add("/business-logistics", "Business Logistics");
  if (text.includes("tracking")) add("/service-areas", "Service Areas");

  return [...links].slice(0, 6).map(([href, label]) => ({ href, label }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPost(slug);
  if (!post) return { robots: { index: false, follow: false } };
  return createMetadata({
    title: `${post.title} - Fly Logistics Blog`,
    description: post.description,
    path: `/blog/${slug}`,
    keywords: [...post.keywords]
  });
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getPublishedBlogPost(slug);
  if (!post) notFound();
  const readingMinutes = estimateReadingMinutes(post);
  const publishedDate = new Date(post.publishedAt);
  const articleUrl = `${canonicalSiteUrl}/blog/${post.slug}`;
  const relatedLinks = relatedServiceLinks(post);
  return (
    <>
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-primary/40 bg-primary/10 text-primary">{post.category}</Badge>
          <span className="text-sm text-muted-foreground">{publishedDate.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })} - {readingMinutes} min read</span>
        </div>
        <h1 className="mt-6 text-4xl font-black tracking-normal text-balance sm:text-5xl">{post.title}</h1>
        <p className="mt-6 text-xl leading-9 text-muted-foreground">{post.description}</p>
        <p className="mt-6 text-base leading-8 text-muted-foreground">This guide is written for {post.audience}. It is designed to provide {post.promise}. Prices, service windows, customs requirements, and route availability can change, so confirm the current operational position before dispatching a time-sensitive or regulated shipment.</p>

        <div className="mt-12 space-y-12">
          {post.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-2xl font-bold tracking-normal">{section.heading}</h2>
              <div className="mt-4 space-y-4 text-base leading-8 text-muted-foreground">
                {sectionParagraphs(post, section).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </section>
          ))}

          <section className="rounded-md border border-primary/25 bg-primary/5 p-6">
            <h2 className="text-2xl font-bold tracking-normal">Practical checklist</h2>
            <ul className="mt-5 grid gap-3 text-muted-foreground sm:grid-cols-2">
              {post.checklist.map((item) => <li key={item} className="rounded-md border bg-background/60 p-3">{item}</li>)}
            </ul>
          </section>

          <section className="rounded-md border bg-background/45 p-6">
            <h2 className="text-2xl font-bold tracking-normal">Related Fly Logistics services</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Continue from this guide into a practical shipment action, route page, or service area.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {relatedLinks.map((link) => (
                <Link key={link.href} href={link.href as Route} className="rounded-md border bg-background/60 p-3 font-semibold hover:border-primary/50">
                  {link.label}
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold tracking-normal">Frequently asked questions</h2>
            <div className="mt-5 grid gap-4">
              {post.faqs.map(([question, answer]) => (
                <div key={question} className="rounded-md border bg-background/45 p-5">
                  <h3 className="font-semibold">{question}</h3>
                  <p className="mt-2 leading-7 text-muted-foreground">{answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border bg-background/45 p-6">
            <h2 className="text-2xl font-bold tracking-normal">Ready to move your shipment?</h2>
            <p className="mt-3 leading-7 text-muted-foreground">Get a delivery price, create a secure customer account, or track an existing shipment through Fly Logistics.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/customer/register" className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground">Create account</Link>
              <Link href="/tracking" className="rounded-md border px-4 py-2 font-semibold">Track shipment</Link>
            </div>
          </section>
        </div>
      </article>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.description,
        datePublished: post.publishedAt,
        dateModified: post.publishedAt,
        mainEntityOfPage: articleUrl,
        author: { "@type": "Organization", name: "Fly Logistics", url: canonicalSiteUrl },
        publisher: { "@type": "Organization", name: "Fly Logistics", url: canonicalSiteUrl, logo: { "@type": "ImageObject", url: `${canonicalSiteUrl}/icons/meta-app-icon-1024.png` } },
        image: `${canonicalSiteUrl}/opengraph-image`
      }} />
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", href: "/" }, { name: "Blog", href: "/blog" }, { name: post.title, href: `/blog/${post.slug}` }])} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: post.faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) }} />
      <SiteFooter />
    </>
  );
}
