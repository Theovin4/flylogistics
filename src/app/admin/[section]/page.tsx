import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { canonicalAdminSections } from "@/lib/admin-access";
import { createMetadata } from "@/lib/seo";

const sectionLabels: Record<string, string> = {
  dashboard: "Command Center",
  shipments: "Shipments",
  users: "Users and Roles",
  customers: "Customers",
  merchants: "Merchants",
  cloud: "Cloud Tenants",
  drivers: "Drivers and Riders",
  dispatchers: "Dispatchers",
  quotes: "Quote Requests",
  payments: "Payments",
  wallets: "Wallets",
  pricing: "Pricing",
  tracking: "Live Tracking",
  carriers: "Delivery Integrations",
  support: "Support",
  notifications: "Notifications",
  whatsapp: "WhatsApp Inbox",
  analytics: "Analytics",
  growth: "Growth",
  intelligence: "Operations Intelligence",
  audit: "Audit and Events",
  integrations: "Integrations",
  settings: "Settings"
};

export function generateStaticParams() {
  return canonicalAdminSections.map((section) => ({ section }));
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const label = sectionLabels[section] ?? "Admin";
  return createMetadata({
    title: `${label} - Fly Logistics Admin`,
    description: `Protected Fly Logistics ${label.toLowerCase()} workspace.`,
    path: `/admin/${section}`,
    noIndex: true
  });
}

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!canonicalAdminSections.includes(section)) notFound();
  return <DashboardShell role="admin" />;
}
