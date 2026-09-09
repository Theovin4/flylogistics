import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { AdminLeadsDashboard } from "@/components/admin/admin-leads-dashboard";
import { RoleGate } from "@/components/auth/role-gate";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Button } from "@/components/ui/button";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Sales CRM - Fly Logistics Cloud",
  description: "Admin-only Fly Logistics Cloud sales CRM for leads, demos, pipeline, notes, and follow-up activity.",
  path: "/admin/leads",
  noIndex: true
});

export default function AdminLeadsPage() {
  return (
    <RoleGate allowedRoles={["admin"]}>
      <main className="min-h-screen bg-background/70">
        <header className="sticky top-0 z-30 border-b bg-background/82 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Logo />
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="hidden sm:inline-flex">
                <Link href="/dashboard/admin#admin-growth">
                  <ArrowLeft />
                  Admin dashboard
                </Link>
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">
          <div className="mb-5 flex sm:hidden">
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/admin#admin-growth">
                <ArrowLeft />
                Admin dashboard
              </Link>
            </Button>
          </div>
          <Suspense fallback={<div className="rounded-md border bg-background/45 p-4 text-sm text-muted-foreground">Loading sales CRM...</div>}>
            <AdminLeadsDashboard />
          </Suspense>
        </section>
      </main>
    </RoleGate>
  );
}
