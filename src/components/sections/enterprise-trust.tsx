import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, Clock3, FileCheck2, Globe2, LockKeyhole, ShieldCheck, Sparkles, Users2 } from "lucide-react";
import { RoiCalculator } from "@/components/sections/roi-calculator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const customerSegments = ["Retail networks", "E-commerce brands", "Food operators", "B2B merchants", "Marketplace teams", "Fleet partners"] as const;

const serviceCommitments = [
  {
    title: "One tracking number",
    description: "Clear milestones and direct support."
  },
  {
    title: "Current status",
    description: "The latest available shipment progress."
  },
  {
    title: "Private proof",
    description: "Delivery evidence stays restricted to authorised staff."
  }
] as const;

const operationalUseCases = [
  ["Retail dispatch", "Repeat deliveries with clear timelines and branded updates."],
  ["Interstate operations", "Status, payment, ETA, and exception visibility."],
  ["Business logistics", "Shared workflows for customers, drivers, and support teams."]
] as const;

const complianceSignals = [
  "Role-based account access",
  "Private delivery proof controls",
  "Admin audit activity",
  "Secure payment verification",
  "Customer data minimization",
  "Operational monitoring"
] as const;

const implementationSteps = [
  ["Day 1", "Discovery", "Review routes, shipment volume, pricing rules, user roles, and customer communication needs."],
  ["Day 2-3", "Setup plan", "Confirm accounts, dashboards, notifications, payment rules, tracking links, and operational permissions."],
  ["Day 4-7", "Pilot plan", "Test shipments, validate tracking, train operations, and decide when to move customers into live booking."]
] as const;

export function EnterpriseTrustSection({ compact = false }: { compact?: boolean }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8" aria-label="Enterprise trust signals">
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Enterprise trust</Badge>
          <h2 className="mt-4 text-3xl font-black tracking-normal text-balance sm:text-4xl">Confidence from the first pickup.</h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Clear tracking, secure payments, private delivery proof, and accountable support.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href={"/quote" as Route}>
                Get delivery price <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={"/security" as Route}>
                Security controls <ShieldCheck />
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [ShieldCheck, "Security", "Private proof and role controls."],
            [Clock3, "Availability", "24/7 active-shipment support."],
            [BadgeCheck, "Trust", "Verified payments and clear policies."]
          ].map(([Icon, title, text]) => (
            <Card key={String(title)} className="glass">
              <CardHeader>
                <Icon className="size-5 text-primary" />
                <CardTitle className="text-lg">{String(title)}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">{String(text)}</CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-lg border bg-background/45 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">For logistics teams</p>
          </div>
          <Badge className="w-fit border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Operations status monitored</Badge>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {customerSegments.map((segment) => (
            <div key={segment} className="grid min-h-20 place-items-center rounded-md border bg-background/55 px-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {segment}
            </div>
          ))}
        </div>
      </div>

      {!compact ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {serviceCommitments.map((item) => (
            <Card key={item.title} className="glass">
              <CardHeader>
                <BadgeCheck className="size-5 text-primary" />
                <CardTitle className="text-lg">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function OperationalUseCasesSection() {
  return (
    <section className="border-y border-border/70 bg-foreground/[0.025]" aria-label="Fly Logistics case studies">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Badge className="border-primary/40 bg-primary/10 text-primary">Operational use cases</Badge>
            <h2 className="mt-4 text-3xl font-black tracking-normal text-balance">Practical logistics workflows.</h2>
          </div>
          <div className="grid gap-3">
            {operationalUseCases.map(([title, text], index) => (
              <div key={title} className="rounded-md border bg-background/55 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-md border border-primary/30 bg-primary/10 text-sm font-black text-primary">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="font-bold">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ComplianceAndTimelineSection() {
  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:px-8" aria-label="Compliance and implementation">
      <Card className="glass">
        <CardHeader>
          <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">Security and compliance</Badge>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <LockKeyhole className="size-5 text-primary" />
            Security controls
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {complianceSignals.map((item) => (
            <div key={item} className="flex items-start gap-2 rounded-md border bg-background/45 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{item}</span>
            </div>
          ))}
          <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm leading-6 text-primary sm:col-span-2">
            Our security posture is reviewed as the platform grows. Formal certifications are only displayed after independent verification.
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">Implementation timeline</Badge>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <FileCheck2 className="size-5 text-primary" />
            From setup to pilot
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {implementationSteps.map(([day, title, text]) => (
            <div key={day} className="grid gap-3 rounded-md border bg-background/45 p-3 sm:grid-cols-[96px_1fr]">
              <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-black text-primary">{day}</div>
              <div>
                <h3 className="font-bold">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

export function PricingComparisonSection() {
  const plans = [
    ["Local delivery", "From NGN 5,000", "Same-state movement, 0.5kg to 2.5kg base weight, 24 to 48 hour planning window."],
    ["Interstate delivery", "From NGN 8,000", "State-to-state delivery, 0.5kg to 2.5kg base weight, 48 to 96 hour planning window."],
    ["International freight", "Operations quote", "Import, export, air freight, ocean freight, customs review, and multi-currency pricing."]
  ] as const;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8" aria-label="Pricing comparison">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Pricing comparison</Badge>
          <h2 className="mt-4 text-3xl font-black tracking-normal">Clear delivery rates before operations review.</h2>
        </div>
        <Button asChild variant="outline">
          <Link href={"/quote" as Route}>
            Start booking <ArrowRight />
          </Link>
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map(([title, price, text]) => (
          <Card key={title} className="glass">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <p className="text-2xl font-black text-primary">{price}</p>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">{text}</CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-6">
        <RoiCalculator />
      </div>
    </section>
  );
}

export function PlatformReadinessSection() {
  const items = [
    [Building2, "Business onboarding", "Role setup and multi-user operations."],
    [Users2, "Customer growth", "Leads, onboarding, attribution, and referrals."],
    [Globe2, "Service expansion", "Local, international, warehouse, and fleet operations."],
    [Sparkles, "Customer experience", "Fast tracking, branded updates, and clear dashboards."]
  ] as const;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8" aria-label="Platform readiness">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([Icon, title, text]) => (
          <Card key={title} className="glass">
            <CardHeader>
              <Icon className="size-5 text-primary" />
              <CardTitle className="text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">{text}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
