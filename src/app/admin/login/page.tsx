import { RoleAccessForm } from "@/components/auth/role-access-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Admin Login - Fly Logistics Operations",
  description: "Secure Fly Logistics admin login for approved operations administrators only.",
  path: "/admin/login",
  noIndex: true
});

export default function AdminLoginPage() {
  return <RoleAccessForm mode="login" role="admin" />;
}
