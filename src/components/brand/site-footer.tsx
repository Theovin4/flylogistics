import Link from "next/link";
import type { Route } from "next";
import { MessageCircle } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { getWhatsAppUrl, whatsappMessages } from "@/lib/contact";

const columns = [
  { title: "Platform", links: ["Tracking", "Quote", "AI Logistics", "Fleet Management"] },
  { title: "Company", links: ["About", "Careers", "Blog", "Contact"] },
  { title: "Enterprise", links: ["Enterprise Logistics", "Warehousing", "Pricing", "Services"] }
];

function href(label: string): Route {
  return `/${label.toLowerCase().replaceAll(" ", "-")}` as Route;
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_2fr] lg:px-8">
        <div>
          <Logo />
          <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">
            Fly Logistics connects freight, fleets, warehouses, AI assistants, and global visibility into one operating layer.
          </p>
          <a
            href={getWhatsAppUrl(whatsappMessages.generalSupport())}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15"
          >
            <MessageCircle className="size-4" />
            Chat on WhatsApp
          </a>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold">{column.title}</h3>
              <div className="mt-4 grid gap-3">
                {column.links.map((link) => (
                  <Link key={link} href={href(link)} className="text-sm text-muted-foreground hover:text-foreground">
                    {link}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-border/70 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <span>Copyright 2026 Fly Logistics, Inc. All rights reserved.</span>
        <span>ISO-ready architecture. Vercel deployment. Cloudinary media pipeline.</span>
      </div>
    </footer>
  );
}
