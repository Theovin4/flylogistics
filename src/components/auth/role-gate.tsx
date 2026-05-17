"use client";

import { ReactNode, useEffect, useState } from "react";
import type { Route as NextRoute } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck, Loader2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { canAccessRole, normalizeRole, type FlyRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Profile = {
  email: string | null;
  full_name: string | null;
  role: FlyRole;
};

export function RoleGate({ allowedRoles, children }: { allowedRoles: FlyRole[]; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const loginHref = `/login?next=${encodeURIComponent(pathname)}` as NextRoute;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setError("Supabase Auth is not configured.");
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Please sign in to continue.");
        setLoading(false);
        router.replace(loginHref);
        return;
      }

      const response = await fetch("/api/auth/profile", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!mounted) return;

      if (!response.ok) {
        setError(data.error ?? "Unable to verify your account.");
        setLoading(false);
        return;
      }

      setProfile({ ...data, role: normalizeRole(data.role) });
      setLoading(false);
    }

    void loadProfile();
    return () => {
      mounted = false;
    };
  }, [loginHref, router]);

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-4">
        <Card className="glass w-full max-w-md">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            Verifying secure Fly Logistics access...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-4">
        <Card className="glass w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              Secure access required
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground">
            <p>{error ?? "Please sign in to continue."}</p>
            <Button asChild>
              <Link href={loginHref}>Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canAccessRole(profile.role, allowedRoles)) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-4">
        <Card className="glass w-full max-w-md">
          <CardHeader>
            <CardTitle>Role access required</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground">
            <p>
              Your account is signed in as {profile.role}. Fly Logistics dashboard access is limited to admin operators.
            </p>
            <Button asChild variant="outline">
              <Link href="/">Return to public site</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return children;
}
