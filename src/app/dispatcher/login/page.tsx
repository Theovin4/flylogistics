import { DriverQuickLoginForm } from "@/components/auth/driver-quick-login-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Dispatcher Login - Fly Logistics Operations Control",
  description: "Fly Logistics dispatcher login for driver assignment, route monitoring, shipment updates, and delivery coordination.",
  path: "/dispatcher/login",
  keywords: ["dispatcher login", "logistics dispatcher", "route monitoring", "shipment coordination"]
});

export default function DispatcherLoginPage() {
  return <DriverQuickLoginForm access="dispatcher" />;
}
