import Link from "next/link";
import { ArrowRight, Mail, MapPin, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWhatsAppUrl, whatsappMessages } from "@/lib/contact";
import type { LegalPage as LegalPageConfig } from "@/lib/legal";
import { siteConfig } from "@/lib/site";

export function LegalPage({ page }: { page: LegalPageConfig }) {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 grid-field opacity-50" aria-hidden="true" />
          <div className="relative mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <Badge className="border-primary/40 bg-primary/10 text-primary">Fly Logistics policy</Badge>
            <h1 className="mt-6 text-4xl font-black tracking-normal text-balance sm:text-5xl">{page.title}</h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{page.description}</p>
            <p className="mt-4 text-sm text-muted-foreground">Last updated: {page.updatedAt}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/quote">
                  Get Quote <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <a href={getWhatsAppUrl(whatsappMessages.generalSupport())} target="_blank" rel="noreferrer">
                  Contact on WhatsApp <MessageCircle />
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-4 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          {page.sections.map((section) => (
            <Card key={section.title} className="glass">
              <CardHeader>
                <CardTitle className="flex items-start gap-3 text-xl">
                  <ShieldCheck className="mt-1 size-5 shrink-0 text-primary" />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm leading-6 text-muted-foreground">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-14 sm:px-6 sm:pb-20 md:grid-cols-3 lg:px-8">
          {[
            { icon: MapPin, label: "Address", value: siteConfig.contact.address },
            { icon: Mail, label: "Email", value: siteConfig.contact.supportEmail, href: `mailto:${siteConfig.contact.supportEmail}` },
            { icon: Phone, label: "Phone", value: siteConfig.contact.supportPhone, href: `tel:${siteConfig.contact.supportPhone.replaceAll(" ", "")}` }
          ].map((item) => (
            <Card key={item.label} className="glass">
              <CardHeader>
                <item.icon className="size-5 text-primary" />
                <CardTitle className="text-base">{item.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                {item.href ? <a href={item.href} className="hover:text-foreground">{item.value}</a> : item.value}
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
