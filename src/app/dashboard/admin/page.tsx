import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Admin Dashboard - Fly Logistics",
  description: "Protected admin operations dashboard for Fly Logistics shipment, driver, analytics, and quote workflows.",
  path: "/dashboard/admin",
  noIndex: true
});

export default function Page() { return <DashboardShell role="admin" />; }
