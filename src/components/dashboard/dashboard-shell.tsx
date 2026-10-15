"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { Route as NextRoute } from "next";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Bot,
  Building2,
  CreditCard,
  FileText,
  Gauge,
  MapPinned,
  MessageSquareText,
  Package,
  Radar,
  Route,
  Settings,
  TrendingUp,
  Truck,
  Users,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { AccountControl } from "@/components/auth/account-control";
import { AccountPasswordPanel } from "@/components/auth/account-password-panel";
import { RoleGate } from "@/components/auth/role-gate";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { AdminGlobalSearch } from "@/components/admin/admin-global-search";
import { DashboardNavGroup, DashboardQuickActions, DashboardSectionHeader } from "@/components/dashboard/dashboard-primitives";
import { internalAdminRoles, type FlyRole } from "@/lib/roles";
import { canAccessAdminPath, rolesForAdminPath } from "@/lib/admin-access";

function AdminPanelLoading({ label = "Loading operations panel" }: { label?: string }) {
  return (
    <Card className="glass">
      <CardContent className="p-5">
        <div className="h-5 w-48 animate-pulse rounded-md bg-muted" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="h-24 animate-pulse rounded-md bg-muted/70" />
          <div className="h-24 animate-pulse rounded-md bg-muted/70" />
          <div className="h-24 animate-pulse rounded-md bg-muted/70" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{label}...</p>
      </CardContent>
    </Card>
  );
}

const AdminAnalyticsPanel = dynamic(() => import("@/components/admin/admin-analytics-panel").then((module) => module.AdminAnalyticsPanel), {
  loading: () => <AdminPanelLoading label="Loading analytics" />,
  ssr: false
});
const AdminAuditLogPanel = dynamic(() => import("@/components/admin/admin-audit-log-panel").then((module) => module.AdminAuditLogPanel), {
  loading: () => <AdminPanelLoading label="Loading audit logs" />,
  ssr: false
});
const AdminCarrierDiagnosticsPanel = dynamic(() => import("@/components/admin/admin-carrier-diagnostics-panel").then((module) => module.AdminCarrierDiagnosticsPanel), {
  loading: () => <AdminPanelLoading label="Loading carrier diagnostics" />,
  ssr: false
});
const AdminDriverManager = dynamic(() => import("@/components/admin/admin-driver-manager").then((module) => module.AdminDriverManager), {
  loading: () => <AdminPanelLoading label="Loading drivers" />,
  ssr: false
});
const AdminEnterpriseOperationsPanel = dynamic(() => import("@/components/admin/admin-enterprise-operations-panel").then((module) => module.AdminEnterpriseOperationsPanel), {
  loading: () => <AdminPanelLoading label="Loading merchant operations" />,
  ssr: false
});
const AdminExportWorkbookButton = dynamic(() => import("@/components/admin/admin-export-workbook-button").then((module) => module.AdminExportWorkbookButton), {
  loading: () => <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />,
  ssr: false
});
const AdminGrowthPanel = dynamic(() => import("@/components/admin/admin-growth-panel").then((module) => module.AdminGrowthPanel), {
  loading: () => <AdminPanelLoading label="Loading growth engine" />,
  ssr: false
});
const AdminGoogleBusinessPanel = dynamic(() => import("@/components/admin/admin-google-business-panel").then((module) => module.AdminGoogleBusinessPanel), {
  loading: () => <AdminPanelLoading label="Loading Google Business Profile" />,
  ssr: false
});
const AdminIntelligencePanel = dynamic(() => import("@/components/admin/admin-intelligence-panel").then((module) => module.AdminIntelligencePanel), {
  loading: () => <AdminPanelLoading label="Loading AI intelligence" />,
  ssr: false
});
const AdminNotificationLogPanel = dynamic(() => import("@/components/admin/admin-notification-log-panel").then((module) => module.AdminNotificationLogPanel), {
  loading: () => <AdminPanelLoading label="Loading notifications" />,
  ssr: false
});
const AdminSupportPanel = dynamic(() => import("@/components/admin/admin-support-panel").then((module) => module.AdminSupportPanel), {
  loading: () => <AdminPanelLoading label="Loading support queue" />,
  ssr: false
});
const AccountSupportCenter = dynamic(() => import("@/components/support/account-support-center").then((module) => module.AccountSupportCenter), {
  loading: () => <AdminPanelLoading label="Loading support center" />,
  ssr: false
});
const AdminWhatsAppInbox = dynamic(() => import("@/components/admin/admin-whatsapp-inbox").then((module) => module.AdminWhatsAppInbox), {
  loading: () => <AdminPanelLoading label="Loading WhatsApp inbox" />,
  ssr: false
});
const AdminOperationalEventsPanel = dynamic(() => import("@/components/admin/admin-operational-events-panel").then((module) => module.AdminOperationalEventsPanel), {
  loading: () => <AdminPanelLoading label="Loading operational events" />,
  ssr: false
});
const AdminPasswordPanel = dynamic(() => import("@/components/admin/admin-password-panel").then((module) => module.AdminPasswordPanel), {
  loading: () => <AdminPanelLoading label="Loading admin security" />,
  ssr: false
});
const AdminOperationsMap = dynamic(() => import("@/components/admin/admin-operations-map").then((module) => module.AdminOperationsMap), {
  loading: () => <AdminPanelLoading label="Loading live operations map" />,
  ssr: false
});
const AdminOperationsPanel = dynamic(() => import("@/components/admin/admin-operations-panel").then((module) => module.AdminOperationsPanel), {
  loading: () => <AdminPanelLoading label="Loading workflows" />,
  ssr: false
});
const AdminPricingManager = dynamic(() => import("@/components/admin/admin-pricing-manager").then((module) => module.AdminPricingManager), {
  loading: () => <AdminPanelLoading label="Loading pricing engine" />,
  ssr: false
});
const AdminUserRoleManager = dynamic(() => import("@/components/admin/admin-user-role-manager").then((module) => module.AdminUserRoleManager), {
  loading: () => <AdminPanelLoading label="Loading users and roles" />,
  ssr: false
});
const AdminWalletManager = dynamic(() => import("@/components/admin/admin-wallet-manager").then((module) => module.AdminWalletManager), {
  loading: () => <AdminPanelLoading label="Loading wallets" />,
  ssr: false
});
const AdminCryptoPaymentsPanel = dynamic(() => import("@/components/admin/admin-crypto-payments-panel").then((module) => module.AdminCryptoPaymentsPanel), {
  loading: () => <AdminPanelLoading label="Loading crypto payments" />,
  ssr: false
});
const AdminCloudTenantPanel = dynamic(() => import("@/components/admin/admin-cloud-tenant-panel").then((module) => module.AdminCloudTenantPanel), {
  loading: () => <AdminPanelLoading label="Loading Cloud tenants" />,
  ssr: false
});
const AdminShipmentManager = dynamic(() => import("@/components/shipments/admin-shipment-manager").then((module) => module.AdminShipmentManager), {
  loading: () => <AdminPanelLoading label="Loading shipments" />,
  ssr: false
});
const DriverLocationPanel = dynamic(() => import("@/components/drivers/driver-location-panel").then((module) => module.DriverLocationPanel), {
  loading: () => null,
  ssr: false
});

const primaryNav = [
  { label: "Admin", href: "/admin/dashboard" },
  { label: "Dispatcher", href: "/dispatcher" },
  { label: "Customer", href: "/customer" },
  { label: "Driver", href: "/driver" }
] as const;

const toolNav = [
  { label: "Live Map", href: "/map", icon: MapPinned },
  { label: "AI Chat", href: "/chat", icon: MessageSquareText },
  { label: "Tracking", href: "/tracking", icon: Radar }
] as const;

type AdminSection = "overview" | "analytics" | "shipments" | "quotes" | "drivers" | "map" | "pricing" | "wallets" | "users" | "growth" | "googleBusiness" | "intelligence" | "carriers" | "merchants" | "cloud" | "support" | "notifications" | "whatsapp" | "events" | "settings";

type AdminNavItem = { label: string; href: string; icon: LucideIcon; section: AdminSection };

const adminNavGroups: Array<{ title: string; items: AdminNavItem[] }> = [
  {
    title: "Operations",
    items: [
      { label: "Dashboard", href: "/admin/dashboard", icon: Gauge, section: "overview" },
      { label: "Shipments", href: "/admin/shipments", icon: Package, section: "shipments" },
      { label: "Drivers", href: "/admin/drivers", icon: Truck, section: "drivers" },
      { label: "Tracking map", href: "/admin/tracking", icon: MapPinned, section: "map" }
    ]
  },
  {
    title: "Customers",
    items: [
      { label: "Customers & roles", href: "/admin/customers", icon: Users, section: "users" },
      { label: "Quote requests", href: "/admin/quotes", icon: FileText, section: "quotes" },
      { label: "Merchants", href: "/admin/merchants", icon: Building2, section: "merchants" },
      { label: "Cloud tenants", href: "/admin/cloud", icon: Building2, section: "cloud" },
      { label: "Support", href: "/admin/support", icon: MessageSquareText, section: "support" },
      { label: "Growth", href: "/admin/growth", icon: TrendingUp, section: "growth" }
    ]
  },
  {
    title: "Finance",
    items: [
      { label: "Pricing", href: "/admin/pricing", icon: CreditCard, section: "pricing" },
      { label: "Payments & wallets", href: "/admin/payments", icon: Wallet, section: "wallets" }
    ]
  },
  {
    title: "System",
    items: [
      { label: "Integrations", href: "/admin/integrations", icon: Route, section: "carriers" },
      { label: "Google Business", href: "/admin/integrations/google-business", icon: Building2, section: "googleBusiness" },
      { label: "AI intelligence", href: "/admin/intelligence", icon: Bot, section: "intelligence" },
      { label: "Analytics", href: "/admin/analytics", icon: Gauge, section: "analytics" },
      { label: "Notifications", href: "/admin/notifications", icon: Bell, section: "notifications" },
      { label: "WhatsApp inbox", href: "/admin/whatsapp", icon: MessageSquareText, section: "whatsapp" },
      { label: "Events & audit", href: "/admin/audit", icon: Activity, section: "events" },
      { label: "Settings", href: "/admin/settings", icon: Settings, section: "settings" }
    ]
  }
];

const adminQuickActions: Array<{ label: string; href: string; icon: LucideIcon; section: AdminSection }> = [
  { label: "Create Shipment", href: "/admin/shipments", icon: Package, section: "shipments" },
  { label: "Create Driver", href: "/admin/drivers", icon: Truck, section: "drivers" },
  { label: "View Quotes", href: "/admin/quotes", icon: FileText, section: "quotes" },
  { label: "Assign Driver", href: "/admin/shipments", icon: Route, section: "shipments" },
  { label: "View Tracking", href: "/admin/tracking", icon: Radar, section: "map" },
  { label: "View Customers", href: "/admin/customers", icon: Users, section: "users" }
];

function adminSectionFromPathname(pathname: string): AdminSection | null {
  if (pathname === "/admin/dashboard") return "overview";
  const section = pathname.split("/").filter(Boolean)[1];
  switch (section) {
    case "shipments": return "shipments";
    case "quotes": return "quotes";
    case "drivers":
    case "dispatchers": return "drivers";
    case "tracking": return "map";
    case "pricing": return "pricing";
    case "payments":
    case "wallets": return "wallets";
    case "users":
    case "customers": return "users";
    case "merchants": return "merchants";
    case "cloud": return "cloud";
    case "growth":
    case "leads": return "growth";
    case "intelligence": return "intelligence";
    case "analytics": return "analytics";
    case "carriers":
    case "integrations": return pathname.includes("google-business") ? "googleBusiness" : "carriers";
    case "support": return "support";
    case "notifications": return "notifications";
    case "whatsapp": return "whatsapp";
    case "audit": return "events";
    case "settings": return "settings";
    default: return null;
  }
}

function adminSectionFromHash(hash: string): AdminSection {
  switch (hash.replace("#", "")) {
    case "admin-shipments":
      return "shipments";
    case "admin-quotes":
      return "quotes";
    case "admin-drivers":
      return "drivers";
    case "admin-map":
      return "map";
    case "admin-pricing":
      return "pricing";
    case "admin-wallets":
      return "wallets";
    case "admin-users":
      return "users";
    case "admin-growth":
      return "growth";
    case "admin-google-business":
      return "googleBusiness";
    case "admin-intelligence":
      return "intelligence";
    case "admin-carriers":
      return "carriers";
    case "admin-enterprise":
    case "admin-merchants":
      return "merchants";
    case "admin-notifications":
      return "notifications";
    case "admin-support":
      return "support";
    case "admin-whatsapp":
      return "whatsapp";
    case "admin-events":
      return "events";
    case "admin-settings":
      return "settings";
    default:
      return "overview";
  }
}

const dashboards = {
  customer: {
    title: "Customer Command Center",
    subtitle: "Shipment tracking, invoices, payment history, support, and notifications.",
    metrics: [["Track", "Shipments"], ["Pay", "Invoices"], ["Open", "Support"], ["Manage", "Notifications"]],
    modules: [
      [Package, "Shipment tracking", "Search by Fly tracking number and review the latest timeline milestone."],
      [CreditCard, "Invoices", "Open payment history, receipts, wallet funding, and shipment charges."],
      [Bell, "Notifications", "Review account, payment, shipment, and support updates in one place."],
      [Bot, "Support chat", "Ask customer care for help with tracking, payment, pickup, or delivery exceptions."]
    ]
  },
  driver: {
    title: "Driver Workspace",
    subtitle: "Assigned deliveries, navigation, proof of delivery, earnings, and availability.",
    metrics: [["View", "Assigned drops"], ["Update", "Status"], ["Upload", "Proof"], ["Share", "Location"]],
    modules: [
      [Truck, "Assigned deliveries", "Accept or reject assigned shipments and keep operations updated."],
      [Route, "Navigation", "Use route notes, pickup details, and delivery instructions before moving."],
      [Package, "Proof of delivery", "Signature, image upload, and geolocation proof are ready."],
      [Wallet, "Earnings", "Review payout amounts attached to completed shipment assignments."]
    ]
  },
  dispatcher: {
    title: "Dispatcher Fleet OS",
    subtitle: "Assign drivers, monitor fleet, optimize routes, and supervise live delivery maps.",
    metrics: [["Assign", "Drivers"], ["Monitor", "Fleet"], ["Review", "ETAs"], ["Resolve", "Exceptions"]],
    modules: [
      [Users, "Driver assignment", "Match shipments to approved drivers by availability, vehicle type, and route fit."],
      [MapPinned, "Live fleet map", "View online drivers and assigned shipment movement where sharing is enabled."],
      [Route, "Route planning", "Review route notes, delivery urgency, and workload before dispatch."],
      [Gauge, "Fleet health", "Record vehicle, maintenance, fuel, and driver performance signals."]
    ]
  },
  admin: {
    title: "Admin Intelligence Hub",
    subtitle: "Analytics, user management, revenue, fleet management, AI insights, and shipment governance.",
    metrics: [["Review", "Revenue"], ["Control", "Users"], ["Audit", "Activity"], ["Resolve", "Exceptions"]],
    modules: [
      [Gauge, "Analytics", "Review shipment counts, quote activity, payments, driver workload, and carrier sync."],
      [Users, "User management", "RBAC roles for customers, drivers, dispatchers, finance, and admins."],
      [Bot, "AI insights", "Use shipment context and risk summaries to support human operational decisions."],
      [Package, "Shipment management", "Create, edit, assign, sync, and complete shipments from the admin workspace."]
    ]
  }
} as const;

export function DashboardShell({ role }: { role: keyof typeof dashboards }) {
  const pathname = usePathname();
  const config = dashboards[role];
  const allowedRoles: FlyRole[] = role === "admin" ? (rolesForAdminPath(pathname) ?? [...internalAdminRoles]) : [role];
  const [adminSection, setAdminSection] = useState<AdminSection>(() => adminSectionFromPathname(pathname) ?? "overview");

  useEffect(() => {
    if (role !== "admin") return;
    const syncHash = () => setAdminSection(adminSectionFromPathname(pathname) ?? adminSectionFromHash(window.location.hash));
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname, role]);

  return (
    <RoleGate allowedRoles={allowedRoles}>
      {(profile) => {
        const visibleAdminNavGroups = adminNavGroups
          .map((group) => ({ ...group, items: group.items.filter((item) => canAccessAdminPath(profile.role, item.href)) }))
          .filter((group) => group.items.length > 0);
        const visibleAdminNav = visibleAdminNavGroups.flatMap((group) => group.items);
        const visibleQuickActions = adminQuickActions.filter((item) => canAccessAdminPath(profile.role, item.href));
        return (
      <main className="min-h-screen bg-background/70">
      <aside className="fixed inset-y-0 left-0 hidden w-72 overflow-y-auto border-r bg-background/88 p-5 backdrop-blur-xl lg:block">
        <Logo />
        <div className="mt-8 rounded-md border border-primary/20 bg-black p-4 text-white shadow-sm">
          <div className="text-xs uppercase tracking-[0.22em] text-primary">Network pulse</div>
          <div className="mt-3 flex items-end justify-between">
            <div className="text-3xl font-black">Live</div>
            <Activity className="size-5 text-primary" />
          </div>
            <p className="mt-2 text-xs text-white/60">Open analytics for current delivery activity</p>
        </div>
        {role === "admin" ? (
          <nav className="mt-8 grid gap-6">
            {visibleAdminNavGroups.map((group) => (
              <DashboardNavGroup
                key={group.title}
                title={group.title}
                items={group.items}
                active={adminSection}
                onNavigate={setAdminSection}
              />
            ))}
          </nav>
        ) : (
          <>
            <nav className="mt-8 grid gap-2">
              {primaryNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href as NextRoute}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    item.href === `/${role}` ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
          </>
        )}
      </aside>
      <section className="lg:pl-72">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b bg-background/78 px-3 py-2 backdrop-blur-xl sm:px-6">
          <div>
            <Badge className="border-primary/40 bg-primary/10 text-primary">{role}</Badge>
          </div>
          {role === "admin" ? <AdminGlobalSearch /> : null}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {role === "driver" && <div className="hidden items-center gap-2 text-sm sm:flex"><span>Available</span><Switch defaultChecked /></div>}
            <AccountControl />
            <ThemeToggle />
          </div>
        </header>
        <nav className="flex gap-2 overflow-x-auto overscroll-x-contain border-b px-3 py-3 sm:px-4 lg:hidden">
          {role === "admin"
            ? visibleAdminNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href as NextRoute}
                  onClick={() => setAdminSection(item.section)}
                  className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold ${
                    item.section === adminSection ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))
            : [...primaryNav, ...toolNav].map((item) => (
                <Link key={item.href} href={item.href as NextRoute} className="shrink-0 rounded-md border px-3 py-2 text-xs font-semibold text-muted-foreground">
                  {item.label}
                </Link>
              ))}
        </nav>
        {role === "admin" ? (
          <div className="border-b px-3 py-3 md:hidden">
            <AdminGlobalSearch mobile />
          </div>
        ) : null}
        <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-8">
          <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
            <DashboardSectionHeader
              eyebrow={role === "admin" ? "Operations control" : `${role} workspace`}
              title={config.title}
              description={config.subtitle}
            />
            <Card className="glass">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">AI operations brief</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                Open the relevant section to review live records, resolve exceptions, update customers, and keep delivery decisions attached to the shipment timeline.
              </CardContent>
            </Card>
          </div>
          {role === "admin" ? (
            <>
              {adminSection === "overview" && (
                <div id="admin-overview" className="grid gap-6">
                  <AdminAnalyticsPanel />
                  <DashboardQuickActions
                    title="Quick actions"
                    description="The fastest path into daily operations."
                    actions={visibleQuickActions.map((action) => ({
                      ...action,
                      onClick: () => setAdminSection(action.section)
                    }))}
                  />
                  <div className="flex flex-col gap-3 rounded-md border bg-background/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold">Operations analysis workbook</div>
                      <p className="text-sm text-muted-foreground">Export shipments, quotes, drivers, wallets, payments, audit logs, and operational events for analysis.</p>
                    </div>
                    <AdminExportWorkbookButton />
                  </div>
                  <AdminOperationsPanel />
                </div>
              )}
              {adminSection === "shipments" && <div id="admin-shipments"><AdminShipmentManager mode="shipments" /></div>}
              {adminSection === "analytics" && <div id="admin-analytics"><AdminAnalyticsPanel /></div>}
              {adminSection === "quotes" && <div id="admin-quotes"><AdminShipmentManager mode="quotes" /></div>}
              {adminSection === "drivers" && <div id="admin-drivers"><AdminDriverManager /></div>}
              {adminSection === "map" && <div id="admin-map"><AdminOperationsMap /></div>}
              {adminSection === "pricing" && <div id="admin-pricing"><AdminPricingManager /></div>}
              {adminSection === "wallets" && <div id="admin-wallets" className="grid gap-5"><AdminWalletManager /><AdminCryptoPaymentsPanel /></div>}
              {adminSection === "users" && (
                <div id="admin-users" className="grid gap-6">
                  <AdminPasswordPanel />
                  <AdminUserRoleManager />
                </div>
              )}
              {adminSection === "growth" && <div id="admin-growth"><AdminGrowthPanel /></div>}
              {adminSection === "googleBusiness" && <div id="admin-google-business"><AdminGoogleBusinessPanel /></div>}
              {adminSection === "intelligence" && <div id="admin-intelligence"><AdminIntelligencePanel /></div>}
              {adminSection === "carriers" && <div id="admin-carriers"><AdminCarrierDiagnosticsPanel /></div>}
              {adminSection === "merchants" && <div id="admin-merchants"><AdminEnterpriseOperationsPanel /></div>}
              {adminSection === "cloud" && <div id="admin-cloud"><AdminCloudTenantPanel /></div>}
              {adminSection === "support" && <div id="admin-support"><AdminSupportPanel /></div>}
              {adminSection === "notifications" && <div id="admin-notifications"><AdminNotificationLogPanel /></div>}
              {adminSection === "whatsapp" && <div id="admin-whatsapp"><AdminWhatsAppInbox /></div>}
              {adminSection === "events" && (
                <div id="admin-events" className="grid gap-6">
                  <AdminOperationalEventsPanel />
                  <AdminAuditLogPanel />
                </div>
              )}
              {adminSection === "settings" && (
                <div id="admin-settings" className="grid gap-6">
                  <AdminPasswordPanel />
                </div>
              )}
            </>
          ) : (
            <>
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
                  <div className="relative h-72 bg-black sm:h-96">
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
                          {index === 0 ? "Review" : "Available"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {role === "dispatcher" && (
                <section id="dispatcher-shipments" className="mt-8">
                  <AdminShipmentManager mode="shipments" />
                </section>
              )}
              {role === "dispatcher" && (
                <section id="dispatcher-support" className="mt-8 scroll-mt-24">
                  <AccountSupportCenter accountLabel="dispatcher" portal="dispatcher" />
                </section>
              )}
              <section className="mt-8">
                <AccountPasswordPanel
                  title={`${role[0].toUpperCase()}${role.slice(1)} account security`}
                  description="Change the password for your signed-in Fly Logistics account securely."
                  successTitle="Password updated"
                  successDescription="Use your new password the next time you sign in."
                />
              </section>
            </>
          )}
          {(role === "driver" || role === "dispatcher") && <DriverLocationPanel />}
        </div>
      </section>
      </main>
        );
      }}
    </RoleGate>
  );
}
