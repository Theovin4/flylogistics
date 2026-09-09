"use client";

import { useMemo, useState } from "react";
import { Calculator, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function currency(value: number) {
  return new Intl.NumberFormat("en-NG", {
    currency: "NGN",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(Math.max(0, value));
}

export function RoiCalculator() {
  const [shipments, setShipments] = useState(120);
  const [averageFee, setAverageFee] = useState(8000);
  const [failedAttemptRate, setFailedAttemptRate] = useState(8);
  const [supportHours, setSupportHours] = useState(24);

  const results = useMemo(() => {
    const monthlyShipping = shipments * averageFee;
    const failedAttemptCost = monthlyShipping * (failedAttemptRate / 100) * 0.35;
    const supportCost = supportHours * 4500;
    const visibilitySavings = failedAttemptCost * 0.42;
    const automationSavings = supportCost * 0.35;
    const recoveredRevenue = monthlyShipping * 0.025;

    return {
      monthlyShipping,
      estimatedImpact: visibilitySavings + automationSavings + recoveredRevenue,
      recoveredRevenue,
      supportCost,
      visibilitySavings
    };
  }, [averageFee, failedAttemptRate, shipments, supportHours]);

  return (
    <Card className="glass">
      <CardHeader>
        <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">ROI calculator</Badge>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Calculator className="size-5 text-primary" />
          Estimate logistics savings from better visibility.
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          {[
            ["Monthly shipments", shipments, setShipments, 1, 100000],
            ["Average delivery fee", averageFee, setAverageFee, 500, 1000000],
            ["Failed attempt rate (%)", failedAttemptRate, setFailedAttemptRate, 0, 80],
            ["Monthly support hours", supportHours, setSupportHours, 0, 1000]
          ].map(([label, value, setter, min, max]) => (
            <div key={String(label)} className="grid gap-2">
              <Label>{String(label)}</Label>
              <Input
                inputMode="numeric"
                min={Number(min)}
                max={Number(max)}
                type="number"
                value={Number(value)}
                onChange={(event) => (setter as (next: number) => void)(Number(event.target.value || 0))}
              />
            </div>
          ))}
        </div>
        <div className="grid content-start gap-3">
          <div className="rounded-md border bg-background/55 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Monthly shipping volume</p>
            <p className="mt-2 text-3xl font-black">{currency(results.monthlyShipping)}</p>
          </div>
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-emerald-500">
              <TrendingUp className="size-4" />
              Estimated monthly operational impact
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-500">{currency(results.estimatedImpact)}</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Based on fewer failed attempts, faster customer support, stronger tracking visibility, and recovered delivery revenue.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Visibility savings", results.visibilitySavings],
              ["Support cost baseline", results.supportCost],
              ["Recovered revenue", results.recoveredRevenue]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-md border bg-background/45 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{String(label)}</p>
                <p className="mt-2 font-bold">{currency(Number(value))}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
