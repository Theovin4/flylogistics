"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, LogIn, Menu, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const desktopNav = siteConfig.nav.map((item) => ({
    ...item,
    label: item.label === "Get Delivery Price" ? "Delivery Price" : item.label
  }));

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/88 shadow-[0_18px_55px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 xl:px-10">
        <div className="flex h-[72px] items-center gap-4">
          <div className="flex min-w-fit shrink-0 items-center">
            <Logo />
          </div>

          <nav className="hidden min-w-0 flex-1 items-center justify-center xl:flex" aria-label="Primary navigation">
            <div className="flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-background/55 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              {desktopNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground 2xl:px-4"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>

          <div className="ml-auto flex min-w-fit shrink-0 items-center gap-2">
            <ThemeToggle />
            <Button asChild className="hidden h-11 px-4 lg:inline-flex 2xl:px-5">
              <Link href={"/customer/register" as Route}>
                Create Account <UserPlus />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="hidden h-11 px-4 md:inline-flex">
              <Link href="/customer/login">
                Login <LogIn />
              </Link>
            </Button>
            <Button asChild className="hidden h-11 px-5 2xl:inline-flex">
              <Link href="/customer/register">
                Book Shipment <ArrowRight />
              </Link>
            </Button>
            <Button variant="outline" size="icon" className="xl:hidden" aria-label="Toggle navigation" onClick={() => setOpen((value) => !value)}>
              {open ? <X /> : <Menu />}
            </Button>
          </div>
        </div>

        {open && (
          <nav className="grid max-h-[calc(100vh-4.5rem)] gap-2 overflow-y-auto border-t border-border/60 py-4 xl:hidden" aria-label="Mobile navigation">
            {siteConfig.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border/50 bg-background/50 px-3 py-3 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <div className="grid gap-2 pt-2 sm:grid-cols-3">
              <Button asChild>
                <Link href={"/customer/register" as Route} onClick={() => setOpen(false)}>
                  Create Account
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/customer/login" onClick={() => setOpen(false)}>
                  Login
                </Link>
              </Button>
              <Button asChild>
                <Link href="/customer/register" onClick={() => setOpen(false)}>
                  Book Shipment
                </Link>
              </Button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
