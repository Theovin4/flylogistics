"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { adminLoginPath } from "@/lib/admin-access";
import { isInternalAdminRole, normalizeRole, type FlyRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";

export function AccountControl() {
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<FlyRole | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    void supabase.auth.getSession().then(async ({ data }) => {
      setEmail(data.session?.user.email ?? null);
      const accessToken = data.session?.access_token;
      if (!accessToken) return;

      try {
        const response = await fetch("/api/auth/profile", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (response.ok) {
          const profile = await response.json() as { role?: unknown };
          setRole(normalizeRole(profile.role));
        }
      } catch {
        setRole(null);
      }
    });
  }, []);

  function logoutTarget() {
    if (!role) return "/login";
    if (isInternalAdminRole(role)) return adminLoginPath;
    if (role === "driver") return "/driver/login";
    if (role === "dispatcher") return "/dispatcher/login";
    return "/customer/login";
  }

  async function signOut() {
    const supabase = getSupabaseBrowser();
    const target = logoutTarget();
    await supabase?.auth.signOut();
    await fetch("/api/auth/session", { method: "DELETE" });
    window.localStorage.removeItem("fly_role");
    window.sessionStorage.removeItem("fly_role");
    window.location.replace(target);
  }

  return (
    <div className="flex items-center gap-2">
      {email && <span className="hidden max-w-44 truncate text-xs text-muted-foreground sm:inline">{email}</span>}
      <Button type="button" variant="outline" size="sm" onClick={signOut}>
        <LogOut />
        Sign out
      </Button>
    </div>
  );
}
