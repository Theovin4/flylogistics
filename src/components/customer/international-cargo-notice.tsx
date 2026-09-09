"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, PackageCheck, Plane, ShieldCheck, Ship, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type InternationalCargoNoticeProps = {
  customerEmail?: string | null;
  enabled?: boolean;
  onShipCargo: () => void;
};

const cargoRates = [
  { destination: "United Kingdom", rate: "NGN 15,000/kg", timeline: "5-7 working days" },
  { destination: "United States", rate: "NGN 25,000/kg", timeline: "21 working days" }
] as const;

const heavyCargoRates = [
  { destination: "United Kingdom", rate: "NGN 13,000/kg", timeline: "3-5 working days, excluding customs clearance" },
  { destination: "United States", rate: "NGN 23,400/kg", timeline: "5-7 working days, excluding customs clearance" },
  { destination: "Canada", rate: "NGN 22,000/kg", timeline: "5-7 working days, excluding customs clearance" }
] as const;

function storageKey(customerEmail?: string | null) {
  return `fly-international-cargo-notice:${customerEmail?.trim().toLowerCase() || "customer"}`;
}

function RateTable({
  title,
  subtitle,
  rows,
  tone
}: {
  title: string;
  subtitle: string;
  rows: readonly { destination: string; rate: string; timeline: string }[];
  tone: "orange" | "green";
}) {
  const accent = tone === "orange" ? "border-primary/35 bg-primary/10 text-primary" : "border-emerald-500/35 bg-emerald-500/10 text-emerald-500";

  return (
    <div className="overflow-hidden rounded-lg border bg-background/55">
      <div className="flex flex-col gap-2 border-b bg-background/70 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xl font-black tracking-normal text-foreground sm:text-2xl">{title}</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p>
        </div>
        <Badge className={accent}>Per kg</Badge>
      </div>
      <div className="grid">
        <div className={`grid grid-cols-[1fr_0.8fr] gap-3 border-b px-4 py-3 text-xs font-black uppercase tracking-[0.16em] ${accent} sm:grid-cols-[1fr_0.75fr_1.25fr]`}>
          <span>Destination</span>
          <span>Rate</span>
          <span className="hidden sm:block">Timeline</span>
        </div>
        {rows.map((row) => (
          <div key={`${title}-${row.destination}`} className="grid gap-1 border-b px-4 py-3 text-sm last:border-b-0 sm:grid-cols-[1fr_0.75fr_1.25fr] sm:gap-3">
            <span className="font-semibold text-foreground">{row.destination}</span>
            <span className="font-mono font-black text-foreground">{row.rate}</span>
            <span className="text-xs leading-5 text-muted-foreground sm:text-sm">{row.timeline}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InternationalCargoNotice({ customerEmail, enabled = true, onShipCargo }: InternationalCargoNoticeProps) {
  const [open, setOpen] = useState(false);
  const key = useMemo(() => storageKey(customerEmail), [customerEmail]);

  const dismiss = useCallback(() => {
    try {
      window.sessionStorage.setItem(key, "dismissed");
    } catch {
      // If storage is unavailable, still let the customer continue.
    }
    setOpen(false);
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    try {
      setOpen(window.sessionStorage.getItem(key) !== "dismissed");
    } catch {
      setOpen(true);
    }
  }, [enabled, key]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss, open]);

  function shipCargo() {
    dismiss();
    onShipCargo();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/78 px-3 py-5 backdrop-blur-xl sm:px-6" role="dialog" aria-modal="true" aria-labelledby="fly-international-cargo-title">
      <div className="mx-auto max-w-4xl">
        <div className="glass relative overflow-hidden rounded-xl border border-primary/25 bg-background shadow-2xl">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent" aria-hidden="true" />
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-primary/20 blur-3xl" aria-hidden="true" />

          <div className="relative grid gap-6 p-4 sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <Logo className="pointer-events-none" />
              <button
                type="button"
                onClick={dismiss}
                className="grid size-10 shrink-0 place-items-center rounded-md border bg-background/70 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                aria-label="Close international cargo notice"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
              <div>
                <Badge className="border-primary/40 bg-primary/10 text-primary">International cargo notice</Badge>
                <h2 id="fly-international-cargo-title" className="mt-4 max-w-2xl text-3xl font-black leading-tight tracking-normal sm:text-5xl">
                  Fly Logistics international cargo rates.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Ship cargo from Nigeria to major global destinations with Fly Logistics handling, shipment visibility, and customer support from your account.
                </p>
              </div>
              <div className="grid gap-3 rounded-lg border border-primary/25 bg-primary/10 p-4 text-sm">
                {[
                  { icon: Plane, label: "Air cargo lanes to the UK, US, and Canada" },
                  { icon: ShieldCheck, label: "Fly Logistics branded tracking and support" },
                  { icon: CalendarClock, label: "Shipment leaves every Friday" }
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <item.icon className="size-4 shrink-0 text-primary" />
                    <span className="font-semibold">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <RateTable title="Cargo shipments" subtitle="10kg and above" rows={cargoRates} tone="orange" />
              <RateTable title="Heavy weight cargo" subtitle="50kg and above" rows={heavyCargoRates} tone="green" />
            </div>

            <div className="grid gap-3 rounded-lg border bg-background/60 p-4 text-sm sm:grid-cols-[auto_1fr]">
              <PackageCheck className="size-5 text-primary" />
              <p className="leading-6 text-muted-foreground">
                Customs duties, destination taxes, restricted-item checks, destination handling, and documentation requirements may apply. Final acceptance is subject to Fly Logistics operations review.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" size="lg" onClick={shipCargo}>
                Ship international cargo
                <Ship />
              </Button>
              <Button type="button" size="lg" variant="outline" onClick={dismiss}>
                Continue to dashboard
                <ArrowRight />
              </Button>
              <Button type="button" size="lg" variant="ghost" onClick={dismiss}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
