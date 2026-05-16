import { Calculator, Clock, PackageCheck } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function InstantQuotePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <section>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Smart Quote Engine</Badge>
          <h1 className="mt-6 text-5xl font-black tracking-normal text-balance">Price complex shipments in seconds.</h1>
          <p className="mt-5 text-muted-foreground">
            Estimate freight with urgency pricing, distance, service class, vehicle type, fuel, and AI risk scoring.
          </p>
          <div className="mt-8 grid gap-4">
            {([
              [Calculator, "Dynamic pricing by route, mass, urgency, and service tier"],
              [Clock, "ETA range and delivery confidence score"],
              [PackageCheck, "Quote can be converted into a shipment workflow"]
            ] as const).map(([Icon, text]) => (
              <div key={String(text)} className="glass flex items-center gap-3 rounded-lg p-4">
                <Icon className="size-5 text-primary" />
                <span className="text-sm">{text}</span>
              </div>
            ))}
          </div>
        </section>
        <Card className="glass">
          <CardHeader><CardTitle>Instant quote</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4">
              {["Origin", "Destination", "Weight kg", "Cargo value", "Service level"].map((field) => (
                <div key={field} className="grid gap-2">
                  <Label htmlFor={field}>{field}</Label>
                  <Input id={field} placeholder={field} />
                </div>
              ))}
              <Button type="submit" size="lg">Generate AI quote</Button>
            </form>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
