"use client";

import { useEffect, useState } from "react";
import type { Route as NextRoute } from "next";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export function AccountControl() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    const supabase = getSupabaseBrowser();
    await supabase?.auth.signOut();
    await fetch("/api/auth/session", { method: "DELETE" });
    router.push("/login" as NextRoute);
    router.refresh();
  }

  return (
    <div className="hidden items-center gap-2 sm:flex">
      {email && <span className="max-w-44 truncate text-xs text-muted-foreground">{email}</span>}
      <Button type="button" variant="outline" size="sm" onClick={signOut}>
        <LogOut />
        Sign out
      </Button>
    </div>
  );
}
