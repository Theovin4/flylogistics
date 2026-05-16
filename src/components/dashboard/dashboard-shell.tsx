import Link from "next/link";
import type { Route as NextRoute } from "next";
import {
  Activity,
  Bell,
  Bot,
  CreditCard,
  Gauge,
  MapPinned,
  MessageSquareText,
  Package,
  Radar,
  Route,
  Truck,
  Users,
  Wallet
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";

const primaryNav = [
  { label: "Admin", href: "/dashboard/admin" },
  { label: "Dispatcher", href: "/dashboard/dispatcher" },
  { label: "Customer", href: "/dashboard/customer" },
  { label: "Driver", href: "/dashboard/driver" }
] as const;

const toolNav = [
  { label: "Live Map", href: "/map", icon: MapPinned },
  { label: "AI Chat", href: "/chat", icon: MessageSquareText },
  { label: "Tracking", href: "/tracking", icon: Radar }
] as const;

const dashboards = {
  customer: {
    title: "Customer Command Center",
    subtitle: "Shipment tracking, invoices, payment history, support, and notifications.",
    metrics: [["24", "Active shipments"], ["$48.2K", "Monthly spend"], ["7", "Open invoices"], ["99%", "On-time rate"]],
    modules: [
      [Package, "Shipment tracking", "Ocean container FL-8392 cleared customs and is 68% complete."],
      [CreditCard, "Invoices", "Three invoices are pending approval with autopay enabled."],
      [Bell, "Notifications", "WhatsApp, SMS, email, and push preferences are synced."],
      [Bot, "Support chat", "AI assistant has drafted a carrier escalation summary."]
    ]
  },
  driver: {
    title: "Driver Workspace",
    subtitle: "Assigned deliveries, navigation, proof of delivery, earnings, and availability.",
    metrics: [["6", "Assigned drops"], ["$842", "Today earnings"], ["92%", "Route score"], ["On", "Availability"]],
    modules: [
      [Truck, "Assigned deliveries", "Priority pharma route with temperature checks every 30 minutes."],
      [Route, "Navigation", "AI reroute saves 18 minutes and 2.4 liters of fuel."],
      [Package, "Proof of delivery", "Signature, image upload, and geolocation proof are ready."],
      [Wallet, "Earnings", "Weekly payout scheduled with bonus eligibility."]
    ]
  },
  dispatcher: {
    title: "Dispatcher Fleet OS",
    subtitle: "Assign drivers, monitor fleet, optimize routes, and supervise live delivery maps.",
    metrics: [["118", "Vehicles live"], ["31", "Drivers idle"], ["14", "At-risk ETAs"], ["8.7%", "Fuel saved"]],
    modules: [
      [Users, "Driver assignment", "AI suggests three nearby certified drivers for the critical load."],
      [MapPinned, "Live fleet map", "Vehicles animate across regions with route deviation alerts."],
      [Route, "Route optimization", "Traffic-aware batch reroute reduces late risk by 41%."],
      [Gauge, "Fleet health", "Maintenance window predicted for Unit FLY-224."]
    ]
  },
  admin: {
    title: "Admin Intelligence Hub",
    subtitle: "Analytics, user management, revenue, fleet management, AI insights, and shipment governance.",
    metrics: [["$2.4M", "Monthly revenue"], ["18.6t", "Carbon saved"], ["14.8M", "AI events"], ["0.03%", "Error rate"]],
    modules: [
      [Gauge, "Analytics", "Delivery metrics, heatmaps, customer analytics, and revenue curves."],
      [Users, "User management", "RBAC roles for customers, drivers, dispatchers, finance, and admins."],
      [Bot, "AI insights", "Risk summaries and route optimization recommendations are logged."],
      [Package, "Shipment management", "Bulk shipment workflows support enterprise API imports."]
    ]
  }
} as const;

export function DashboardShell({ role }: { role: keyof typeof dashboards }) {
  const config = dashboards[role];
  return (
    <main className="min-h-screen bg-background/70">
      <aside className="fixed inset-y-0 left-0 hidden w-76 border-r bg-background/88 p-5 backdrop-blur-xl lg:block">
        <Logo />
        <div className="mt-8 rounded-lg border bg-black p-4 text-white">
          <div className="text-xs uppercase tracking-[0.22em] text-primary">Network pulse</div>
          <div className="mt-3 flex items-end justify-between">
            <div className="text-3xl font-black">97.4%</div>
            <Activity className="size-5 text-primary" />
          </div>
          <p className="mt-2 text-xs text-white/60">Delivery confidence across active lanes</p>
        </div>
        <nav className="mt-8 grid gap-2">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href as NextRoute}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                item.href.endsWith(role) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {item.label} dashboard
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t pt-6">
          <div className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tools</div>
          <div className="grid gap-2">
            {toolNav.map((item) => (
              <Link key={item.href} href={item.href as NextRoute} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </aside>
      <section className="lg:pl-76">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/78 px-4 backdrop-blur-xl sm:px-6">
          <div>
            <Badge className="border-primary/40 bg-primary/10 text-primary">{role}</Badge>
          </div>
          <div className="flex items-center gap-3">
            {role === "driver" && <div className="flex items-center gap-2 text-sm"><span>Available</span><Switch defaultChecked /></div>}
            <ThemeToggle />
          </div>
        </header>
        <nav className="flex gap-2 overflow-x-auto border-b px-4 py-3 lg:hidden">
          {[...primaryNav, ...toolNav].map((item) => (
            <Link key={item.href} href={item.href as NextRoute} className="shrink-0 rounded-md border px-3 py-2 text-xs font-semibold text-muted-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
            <div>
              <h1 className="text-4xl font-black tracking-normal">{config.title}</h1>
              <p className="mt-2 text-muted-foreground">{config.subtitle}</p>
            </div>
            <Card className="glass">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">AI operations brief</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                Three shipments need proactive customer updates. Route engine recommends delaying two low-priority dispatches by 18 minutes to protect critical ETAs.
              </CardContent>
            </Card>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {config.metrics.map(([value, label]) => (
              <Card key={label} className="glass">
                <CardHeader><CardTitle className="font-mono text-3xl">{value}</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">{label}</CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="glass overflow-hidden">
              <div className="relative h-96 bg-black">
                <div className="absolute inset-0 grid-field opacity-55" />
                <div className="orange-line absolute left-8 right-8 top-24 h-px" />
                <div className="orange-line absolute left-8 right-20 top-52 h-px rotate-6" />
                <Truck className="absolute left-[52%] top-[44%] size-9 text-primary" />
                <Truck className="absolute left-[22%] top-[28%] size-7 text-white/80" />
                <Truck className="absolute right-[18%] top-[61%] size-7 text-white/80" />
              </div>
            </Card>
            <div className="grid gap-4">
              {config.modules.map(([Icon, title, text]) => (
                <Card key={title} className="glass">
                  <CardHeader className="flex-row items-center gap-3">
                    <Icon className="size-5 text-primary" />
                    <CardTitle className="text-lg">{title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-6 text-muted-foreground">
                    {text}
                    <Progress value={role === "admin" ? 82 : 68} className="mt-4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {["At-risk shipments", "Driver availability", "Revenue protection"].map((title, index) => (
              <Card key={title} className="glass">
                <CardHeader>
                  <CardTitle className="text-lg">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{index === 0 ? "Needs action" : "Healthy"}</span>
                    <Badge className={index === 0 ? "border-primary/40 bg-primary/10 text-primary" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"}>
                      {index === 0 ? "14 open" : "On track"}
                    </Badge>
                  </div>
                  <Progress value={index === 0 ? 52 : 86} className="mt-4" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
