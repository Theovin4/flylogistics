"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { RoleGate } from "@/components/auth/role-gate";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseBrowser } from "@/lib/supabase";

function MembershipGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function verify() {
      const supabase = getSupabaseBrowser();
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) return;
      const response = await fetch("/api/merchant/access", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (!active) return;
      if (!response.ok) {
        setError(data.error ?? "Unable to verify merchant access.");
        return;
      }
      if (data.merchantAccessBlocked) {
        setError("This merchant account is not active. Contact Fly Logistics support for assistance.");
        return;
      }
      if (!data.hasMerchantAccess) {
        router.replace("/merchant/onboarding");
        return;
      }
      setReady(true);
    }
    void verify();
    return () => { active = false; };
  }, [router]);

  if (error) return <div className="grid min-h-[60vh] place-items-center px-4"><Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card></div>;
  if (!ready) return <div className="grid min-h-[60vh] place-items-center px-4"><Card><CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin text-primary" />Verifying merchant workspace...</CardContent></Card></div>;
  return children;
}

export function MerchantGate({ children }: { children: ReactNode }) {
  return <RoleGate allowedRoles={["customer"]}><MembershipGate>{children}</MembershipGate></RoleGate>;
}
