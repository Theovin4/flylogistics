import { RoleAccessForm } from "@/components/auth/role-access-form";
import { adminLoginPath } from "@/lib/admin-access";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Private Admin Login - Fly Logistics",
  description: "Private Fly Logistics admin login for approved operations users only.",
  path: adminLoginPath,
  noIndex: true
});

export default function PrivateAdminLoginPage() {
  return <RoleAccessForm mode="login" role="admin" />;
}
