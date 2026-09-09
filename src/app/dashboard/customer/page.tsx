import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Customer Dashboard - Fly Logistics",
  description: "Protected customer dashboard for Fly Logistics shipment operations.",
  path: "/dashboard/customer",
  noIndex: true
});

export default function Page() { return <DashboardShell role="customer" />; }
