import Link from "next/link";
import { ArrowRight, Bell, Building2, CircleHelp, CreditCard, Gift, Globe2, MapPinned, MessageCircle, PackageCheck, Repeat, ShieldCheck, UserRound } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWhatsAppUrl, whatsappMessages } from "@/lib/contact";
import { createMetadata, faqJsonLd } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

const helpTopics = [
  {
    title: "Create a shipment",
    icon: PackageCheck,
    text: "Create a customer account, enter sender and receiver details, review the delivery price, and pay securely before operations processing.",
    href: "/customer/register"
  },
  {
    title: "Track a shipment",
    icon: MapPinned,
    text: "Use your Fly Logistics tracking number to view status, ETA, timeline, and delivery progress without exposing private operational records.",
    href: "/tracking"
  },
  {
    title: "Payments and wallet",
    icon: CreditCard,
    text: "Customers can pay during checkout or fund a wallet for faster repeat shipments. Payment history remains available in the account.",
    href: "/customer/login"
  },
  {
    title: "Notifications",
    icon: Bell,
    text: "Fly Logistics sends branded delivery updates for shipment creation, movement, delivery, and important account activity.",
    href: "/customer/login"
  },
  {
    title: "Profile and addresses",
    icon: UserRound,
    text: "Keep customer information, saved addresses, support activity, and shipment records organized inside the customer portal.",
    href: "/customer/login"
  },
  {
    title: "Reorder and templates",
    icon: Repeat,
    text: "Use previous shipments, saved addresses, and quote details as templates so repeat delivery orders can be started faster.",
    href: "/customer/login"
  },
  {
    title: "Referral and loyalty rewards",
    icon: Gift,
    text: "Customer rewards, wallet bonuses, and referral activity appear inside the customer account when reward programs are active.",
    href: "/customer/login"
  },
  {
    title: "Business and merchant accounts",
    icon: Building2,
    text: "Businesses can request merchant access for team shipment management, wallet visibility, invoices, and bulk logistics workflows.",
    href: "/merchant"
  },
  {
    title: "International shipping",
    icon: Globe2,
    text: "Fly Logistics supports local, interstate, import, and export shipment requests with customs, documentation, and freight review.",
    href: "/international-shipping-from-nigeria"
  },
  {
    title: "Privacy and delivery records",
    icon: ShieldCheck,
    text: "Private delivery records are restricted to authorized operations users. Public and customer tracking stay focused on delivery status.",
    href: "/privacy"
  }
] as const;

const faqs = [
  ["Do I need an account to create a shipment?", "Yes. Customer shipment creation is handled inside the customer account so payment, tracking, wallet, and notifications stay connected."],
  ["Can guests track a shipment?", "Yes. Guests can track with a Fly Logistics tracking number on the public tracking page."],
  ["Will customers see private delivery proof?", "No. Delivery completion is visible, but private proof records are restricted to authorized Fly Logistics operations users."],
  ["Can I repeat a previous shipment?", "Yes. Inside the customer account, previous shipments and quotes can be reused as templates before the latest delivery price is confirmed."],
  ["Does Fly Logistics support business accounts?", "Yes. Merchants and businesses can request business access for team operations, shipment management, wallet visibility, and invoice history."],
  ["Can Fly Logistics handle international delivery?", "Yes. Customers can request local Nigeria delivery, interstate delivery, international import, and international export support."],
  ["How do I get urgent help?", `Use WhatsApp support or contact ${siteConfig.contact.supportPhone} for active shipment assistance.`]
] as const;

export const metadata = createMetadata({
  title: "Knowledge Base - Shipment Help, Tracking, Payments, and Support",
  description:
    "Get help with Fly Logistics shipment creation, tracking, payments, wallet, notifications, delivery policies, privacy, and customer support.",
  path: "/knowledge-base",
  keywords: ["logistics help", "shipment tracking help", "delivery support", "customer logistics support", "Fly Logistics support"]
});

export default function KnowledgeBasePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 grid-field opacity-60" aria-hidden="true" />
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <Badge className="border-primary/40 bg-primary/10 text-primary">Knowledge base</Badge>
            <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-normal text-balance sm:text-5xl lg:text-6xl">
              Clear answers for booking, tracking, payments, and delivery support.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Find the fastest path to create a shipment, track delivery progress, manage payments, and contact Fly Logistics support.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/tracking">
                  Track shipment <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/customer/register">Create account</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <a href={getWhatsAppUrl(whatsappMessages.generalSupport())} target="_blank" rel="noreferrer">
                  <MessageCircle />
                  WhatsApp support
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-5 px-4 pb-14 sm:px-6 sm:pb-20 md:grid-cols-2 lg:grid-cols-3 lg:px-8">
          {helpTopics.map((topic) => (
            <Card key={topic.title} className="glass">
              <CardHeader>
                <topic.icon className="size-5 text-primary" />
                <CardTitle className="text-base">{topic.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm leading-6 text-muted-foreground">
                <p>{topic.text}</p>
                <Button asChild variant="outline" className="w-full justify-between">
                  <Link href={topic.href}>
                    Open
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="border-y border-border/70 bg-foreground/[0.025]">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <Card className="glass">
              <CardHeader>
                <CircleHelp className="size-5 text-primary" />
                <CardTitle>Still need support?</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm leading-6 text-muted-foreground md:grid-cols-3">
                <a href={`tel:${siteConfig.contact.supportPhone.replaceAll(" ", "")}`} className="rounded-md border bg-background/45 p-4 hover:text-foreground">
                  Call {siteConfig.contact.supportPhone}
                </a>
                <a href={`mailto:${siteConfig.contact.supportEmail}`} className="rounded-md border bg-background/45 p-4 hover:text-foreground">
                  Email {siteConfig.contact.supportEmail}
                </a>
                <a href={getWhatsAppUrl(whatsappMessages.generalSupport())} target="_blank" rel="noreferrer" className="rounded-md border bg-background/45 p-4 hover:text-foreground">
                  Chat on WhatsApp
                </a>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <Badge className="border-primary/40 bg-primary/10 text-primary">FAQ</Badge>
              <h2 className="mt-4 text-3xl font-black tracking-normal">Customer support questions.</h2>
            </div>
            <dl className="grid gap-3">
              {faqs.map(([question, answer]) => (
                <div key={question} className="rounded-md border bg-background/45 p-4">
                  <dt className="font-semibold">{question}</dt>
                  <dd className="mt-2 text-sm leading-6 text-muted-foreground">{answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
      <SiteFooter />
      <JsonLd data={faqJsonLd(faqs)} />
    </>
  );
}
