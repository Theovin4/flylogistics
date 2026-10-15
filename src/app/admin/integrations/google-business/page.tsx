import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Google Business Profile Integration - Fly Logistics",
  description: "Protected Google Business Profile operations for Fly Logistics administrators.",
  path: "/admin/integrations/google-business",
  noIndex: true
});

export default function GoogleBusinessIntegrationPage() {
  return <DashboardShell role="admin" />;
}
