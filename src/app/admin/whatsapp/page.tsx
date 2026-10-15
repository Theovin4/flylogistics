import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Admin WhatsApp Inbox",
  description: "Protected WhatsApp customer support inbox for Fly Logistics operations staff.",
  path: "/admin/whatsapp",
  noIndex: true
});

export default function AdminWhatsAppPage() {
  return <DashboardShell role="admin" />;
}
