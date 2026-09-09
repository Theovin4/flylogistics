import { RoleAccessForm } from "@/components/auth/role-access-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Rider Registration - Fly Logistics Delivery Network",
  description: "Register as a Fly Logistics rider for delivery assignments, route updates, proof of delivery, and live operations.",
  path: "/rider/register",
  keywords: ["rider registration", "dispatch rider registration", "delivery rider jobs Nigeria", "Fly Logistics rider"]
});

export default function RiderRegisterPage() {
  return <RoleAccessForm mode="register" role="driver" />;
}
