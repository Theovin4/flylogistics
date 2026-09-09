import { DriverOperationsDashboard } from "@/components/drivers/driver-operations-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Driver Portal - Fly Logistics",
  description: "Protected Fly Logistics driver portal for assignments, navigation, location updates, earnings, and proof of delivery.",
  path: "/driver",
  noIndex: true
});

export default function DriverPortalPage() {
  return <DriverOperationsDashboard />;
}
