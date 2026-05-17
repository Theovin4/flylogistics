"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Clock3, Menu, MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";
import { getWhatsAppUrl, whatsappMessages } from "@/lib/contact";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/82 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex">
            {siteConfig.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/auth/login">Login</Link>
            </Button>
            <Button asChild variant="outline" className="hidden md:inline-flex">
              <Link href="/tracking">
                Track <Clock3 />
              </Link>
            </Button>
            <Button asChild variant="outline" className="hidden xl:inline-flex">
              <a href={getWhatsAppUrl(whatsappMessages.generalSupport())} target="_blank" rel="noreferrer">
                Chat on WhatsApp <MessageCircle />
              </a>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <Link href="/quote">
                Book shipment <ArrowRight />
              </Link>
            </Button>
            <Button variant="outline" size="icon" className="lg:hidden" aria-label="Toggle navigation" onClick={() => setOpen((value) => !value)}>
              {open ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {open && (
          <nav className="grid gap-2 border-t border-border/60 py-4 lg:hidden">
            {siteConfig.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button asChild variant="outline"><Link href="/auth/login">Login</Link></Button>
              <Button asChild><Link href="/quote">Quote</Link></Button>
              <Button asChild variant="outline"><Link href="/tracking">Tracking</Link></Button>
              <Button asChild variant="outline">
                <a href={getWhatsAppUrl(whatsappMessages.generalSupport())} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>WhatsApp</a>
              </Button>
              <Button asChild variant="outline"><Link href="/dashboard/admin">Admin</Link></Button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
