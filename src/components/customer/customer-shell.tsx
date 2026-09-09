"use client";

import Link from "next/link";
import type { Route as NextRoute } from "next";
import type { ReactNode } from "react";
import { BarChart3, BookOpenCheck, CreditCard, Gift, Headphones, Landmark, MapPinned, PackageCheck, PackagePlus, PackageSearch, ReceiptText, UserCircle } from "lucide-react";
import { AccountControl } from "@/components/auth/account-control";
import { RoleGate } from "@/components/auth/role-gate";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { DashboardNavGroup } from "@/components/dashboard/dashboard-primitives";

type CustomerShellSection = "overview" | "booking" | "shipments" | "tracking" | "map" | "wallet" | "quotes" | "payments" | "addresses" | "support" | "notifications" | "profile" | "rewards";

type CustomerShellProps = {
  active: CustomerShellSection;
  onNavigate?: (section: CustomerShellSection) => void;
  children: ReactNode;
};

const primaryNavItems = [
  { label: "Dashboard", href: "/customer", icon: BarChart3, section: "overview" },
  { label: "Shipments", href: "/customer#customer-shipments", icon: PackageCheck, section: "shipments" },
  { label: "Tracking", href: "/customer#customer-tracking", icon: PackageSearch, section: "tracking" },
  { label: "Quotes", href: "/customer#customer-quotes", icon: BookOpenCheck, section: "quotes" },
  { label: "Rewards", href: "/customer#customer-rewards", icon: Gift, section: "rewards" },
  { label: "Profile", href: "/customer#customer-profile", icon: UserCircle, section: "profile" },
  { label: "Support", href: "/customer#customer-support", icon: Headphones, section: "support" }
] as const;

const toolNavItems = [
  { label: "Create Shipment", href: "/customer#customer-booking", icon: PackagePlus, section: "booking" },
  { label: "Live Map", href: "/customer#customer-live-map", icon: MapPinned, section: "map" },
  { label: "Wallet", href: "/customer#customer-wallet", icon: CreditCard, section: "wallet" },
  { label: "Payments", href: "/customer#customer-payments", icon: ReceiptText, section: "payments" },
  { label: "Addresses", href: "/customer#customer-addresses", icon: Landmark, section: "addresses" }
] as const;

const navItems = [...primaryNavItems, ...toolNavItems] as const;

export function CustomerShell({ active, onNavigate, children }: CustomerShellProps) {
  return (
    <RoleGate allowedRoles={["customer"]}>
      <main className="min-h-screen bg-background/70">
        <aside className="fixed inset-y-0 left-0 hidden w-72 overflow-y-auto border-r bg-background/88 p-5 backdrop-blur-xl lg:block">
          <Logo />
          <div className="mt-8 rounded-md border border-primary/20 bg-black p-4 text-white shadow-sm">
            <div className="text-xs uppercase tracking-[0.22em] text-primary">Customer portal</div>
            <div className="mt-3 text-3xl font-black">Fly OS</div>
            <p className="mt-2 text-xs leading-5 text-white/60">Bookings, shipments, payments, timeline events, and delivery updates in one secure workspace.</p>
          </div>
          <nav className="mt-8 grid gap-6">
            <DashboardNavGroup title="Customer" items={primaryNavItems} active={active} onNavigate={onNavigate} />
            <DashboardNavGroup title="Workspace tools" items={toolNavItems} active={active} onNavigate={onNavigate} />
          </nav>
        </aside>
        <section className="lg:pl-72">
          <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b bg-background/78 px-3 py-2 backdrop-blur-xl sm:px-6">
            <div className="flex items-center gap-3">
              <div className="lg:hidden">
                <Logo />
              </div>
              <Badge className="hidden border-primary/40 bg-primary/10 text-primary sm:inline-flex">Customer</Badge>
            </div>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <AccountControl />
              <ThemeToggle />
            </div>
          </header>
          <nav className="flex gap-2 overflow-x-auto overscroll-x-contain border-b px-3 py-3 sm:px-4 lg:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href as NextRoute}
                onClick={() => onNavigate?.(item.section)}
                className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold ${
                  item.section === active ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">{children}</div>
        </section>
      </main>
    </RoleGate>
  );
}
