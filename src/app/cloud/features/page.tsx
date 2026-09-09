import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, BadgeCheck, BarChart3, BellRing, Building2, MapPinned, PackageCheck, ShieldCheck, Truck, Users, WalletCards } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Fly Logistics Cloud Features - Shipment Tracking and Dispatch SaaS",
  description:
    "Explore Fly Logistics Cloud features for logistics companies: shipment management, tracking, customer portals, driver operations, billing, notifications, analytics, and white-label basics.",
  path: "/cloud/features",
  keywords: ["logistics SaaS features", "shipment tracking software", "dispatch management software", "courier management platform"]
});

const featureGroups = [
  {
    title: "Operations",
    icon: PackageCheck,
    items: ["Shipment creation", "Tracking timeline", "Quote management", "Flexible fulfilment", "Status updates"]
  },
  {
    title: "Driver network",
    icon: Truck,
    items: ["Driver records", "Assignment visibility", "Online status foundation", "Delivery performance visibility", "Mobile-first views"]
  },
  {
    title: "Customer experience",
    icon: Users,
    items: ["Customer portal", "Tracking center", "Quote history", "Notification center", "Support-ready workflows"]
  },
  {
    title: "Billing",
    icon: WalletCards,
    items: ["Cloud subscription", "Payment history foundation", "Wallet-ready architecture", "Flutterwave checkout", "Trial conversion"]
  },
  {
    title: "Visibility",
    icon: MapPinned,
    items: ["Live operations map", "Route and ETA sections", "Network status updates", "Customer-safe tracking", "Admin-only details"]
  },
  {
    title: "Growth",
    icon: BarChart3,
    items: ["Company metrics", "Quote leads", "Demo requests", "Analytics cards", "Conversion-oriented pages"]
  },
  {
    title: "Brand",
    icon: Building2,
    items: ["Company name", "Logo URL", "Brand color", "Support email", "Support phone"]
  },
  {
    title: "Trust",
    icon: ShieldCheck,
    items: ["Role separation", "Company scope", "Server-side secrets", "Private admin data", "Public-safe tracking"]
  },
  {
    title: "Notifications",
    icon: BellRing,
    items: ["Email-ready events", "WhatsApp-ready events", "In-app records", "Admin alerts", "Customer preferences"]
  }
];

export default function CloudFeaturesPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="px-4 py-12 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-7xl">
          <Badge className="border-primary/40 bg-primary/10 text-primary">Cloud features</Badge>
          <h1 className="mt-5 max-w-4xl text-4xl font-black sm:text-6xl">Everything a serious logistics operator needs in one workspace.</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-muted-foreground">
            Fly Logistics Cloud brings shipment operations, customer visibility, driver coordination, billing, analytics, and branded service delivery into a clean SaaS workspace.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featureGroups.map((group) => {
              const Icon = group.icon;
              return (
                <Card key={group.title} className="glass">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="size-5 text-primary" />
                      {group.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {group.items.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <BadgeCheck className="size-4 text-emerald-500" />
                        {item}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={"/cloud/signup" as Route}>
                Start free trial <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={"/cloud/demo" as Route}>Book a walkthrough</Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
