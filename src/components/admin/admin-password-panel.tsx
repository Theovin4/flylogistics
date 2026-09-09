"use client";

import { AccountPasswordPanel } from "@/components/auth/account-password-panel";

export function AdminPasswordPanel() {
  return (
    <AccountPasswordPanel
      title="Admin account security"
      description="Change your own signed-in admin password. Fly Logistics verifies your current password first and never stores the new password in operations records."
      successTitle="Admin password updated"
      successDescription="Use your new admin password the next time you sign in."
    />
  );
}
