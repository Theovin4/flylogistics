import { DriverQuickLoginForm } from "@/components/auth/driver-quick-login-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Driver and Rider Login - Fly Logistics Delivery Operations",
  description: "Fly Logistics driver and rider login for assigned deliveries, route updates, proof of delivery, and live delivery operations.",
  path: "/driver/login",
  keywords: ["driver login", "rider delivery login", "delivery jobs Nigeria", "logistics driver portal"]
});

export default function DriverLoginPage() {
  return <DriverQuickLoginForm />;
}
