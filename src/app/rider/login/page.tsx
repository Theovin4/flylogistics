import { DriverQuickLoginForm } from "@/components/auth/driver-quick-login-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Rider Login - Fly Logistics Delivery Network",
  description: "Fly Logistics rider login for assigned deliveries, live route updates, proof of delivery, and dispatch operations.",
  path: "/rider/login",
  keywords: ["rider login", "dispatch rider login", "delivery rider portal", "logistics rider Nigeria"]
});

export default function RiderLoginPage() {
  return <DriverQuickLoginForm />;
}
