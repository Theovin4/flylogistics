import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RoleGate } from "@/components/auth/role-gate";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { AdminWhatsAppInbox } from "@/components/admin/admin-whatsapp-inbox";
import { Button } from "@/components/ui/button";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Admin WhatsApp Inbox",
  description: "Admin-only WhatsApp customer support inbox for Fly Logistics.",
  path: "/admin/whatsapp",
  noIndex: true
});

export default function AdminWhatsAppPage() {
  return (
    <RoleGate allowedRoles={["admin", "customer_care", "moderator", "dispatcher"]}>
      <main className="min-h-screen bg-background/70">
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Logo />
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link href="/dashboard/admin#admin-whatsapp">
                  <ArrowLeft />
                  Admin dashboard
                </Link>
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
          <AdminWhatsAppInbox />
        </section>
      </main>
    </RoleGate>
  );
}
