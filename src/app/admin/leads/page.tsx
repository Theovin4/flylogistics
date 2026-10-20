import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Sales CRM - Fly Logistics Cloud",
  description: "Protected Fly Logistics sales CRM for leads, demos, pipeline, notes, and follow-up activity.",
  path: "/admin/leads",
  noIndex: true
});

export default function AdminLeadsPage() {
  return <DashboardShell role="admin" />;
}
