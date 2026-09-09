import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Driver Dashboard - Fly Logistics",
  description: "Protected driver dashboard for Fly Logistics delivery assignments and location updates.",
  path: "/dashboard/driver",
  noIndex: true
});

export default function Page() { return <DashboardShell role="driver" />; }
