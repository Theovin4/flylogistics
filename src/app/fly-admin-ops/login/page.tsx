import { redirect } from "next/navigation";

export default function LegacyPrivateAdminLoginPage() {
  redirect("/admin/login");
}
