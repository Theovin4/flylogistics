"use client";

import Link from "next/link";
import type { Route as NextRoute } from "next";
import { useEffect, useRef, useState } from "react";
import { Building2, FileText, Loader2, Package, Search, Truck, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Input } from "@/components/ui/input";

type SearchResult = {
  type: "shipment" | "customer" | "driver" | "quote" | "tenant";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const resultIcons: Record<SearchResult["type"], LucideIcon> = {
  shipment: Package,
  customer: User,
  driver: Truck,
  quote: FileText,
  tenant: Building2
};

export function AdminGlobalSearch({ mobile = false }: { mobile?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabaseBrowser();
        const session = await supabase?.auth.getSession();
        const token = session?.data.session?.access_token;
        if (!token) throw new Error("Your admin session has expired.");
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store"
        });
        const data = (await response.json()) as { results?: SearchResult[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Search is temporarily unavailable.");
        if (requestId.current === currentRequest) setResults(data.results ?? []);
      } catch (searchError) {
        if (requestId.current === currentRequest) setError(searchError instanceof Error ? searchError.message : "Search is temporarily unavailable.");
      } finally {
        if (requestId.current === currentRequest) setLoading(false);
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [query]);

  const open = query.trim().length >= 2;

  return (
    <div className={mobile ? "relative w-full md:hidden" : "relative hidden w-full max-w-lg md:block"}>
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search tracking, customer, driver, quote, or tenant"
        aria-label="Search Fly Logistics operations"
        className="h-10 bg-background/75 pl-9 pr-10"
      />
      {loading ? <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" /> : null}
      {open ? (
        <div className="absolute left-0 right-0 top-12 z-50 max-h-[60vh] overflow-y-auto rounded-md border bg-popover p-2 text-popover-foreground shadow-xl">
          {error ? <p role="alert" className="p-3 text-sm text-destructive">{error}</p> : null}
          {!error && !loading && results.length === 0 ? <p className="p-3 text-sm text-muted-foreground">No matching operations records.</p> : null}
          {results.map((result) => {
            const Icon = resultIcons[result.type];
            return (
              <Link key={`${result.type}-${result.id}`} href={result.href as NextRoute} onClick={() => setQuery("")} className="flex items-start gap-3 rounded-md p-3 transition hover:bg-accent">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{result.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{result.subtitle}</span></span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
