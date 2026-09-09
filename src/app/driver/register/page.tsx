import { RoleAccessForm } from "@/components/auth/role-access-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Register as Driver or Rider - Fly Logistics Delivery Network",
  description: "Apply to join Fly Logistics as a driver or rider for delivery assignments, route updates, proof of delivery, and business logistics operations.",
  path: "/driver/register",
  keywords: ["register delivery driver", "rider registration Nigeria", "logistics driver jobs", "Fly Logistics driver"]
});

export default function DriverRegisterPage() {
  return <RoleAccessForm mode="register" role="driver" />;
}
