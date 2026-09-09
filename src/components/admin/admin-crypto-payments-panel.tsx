"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { flyError, flySuccess } from "@/components/feedback/fly-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowser } from "@/lib/supabase";

type Row = { id: string; payment_kind: string; asset: string; network: string; amount_ngn: number; crypto_amount: number; tx_hash?: string | null; status: string; created_at: string };

export function AdminCryptoPaymentsPanel() {
  const [rows, setRows] = useState<Row[]>([]); const [busy, setBusy] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const client = getSupabaseBrowser();
    if (!client) throw new Error("Secure admin session is unavailable.");
    const session = await client.auth.getSession();
    return fetch(url, { ...init, cache: "no-store", headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session.data.session?.access_token ?? ""}` } });
  }, []);
  const load = useCallback(async () => { setLoading(true); try { const response = await authFetch("/api/admin/crypto-payments"); const data = await response.json(); if (!response.ok) throw new Error(data.error); setRows(data.payments ?? []); } catch (error) { flyError("Unable to load crypto payments", error instanceof Error ? error.message : undefined); } finally { setLoading(false); } }, [authFetch]);
  useEffect(() => { void load(); }, [load]);
  async function review(id: string, action: "approve" | "reject" | "cancel") { setBusy(id); try { const response = await authFetch("/api/admin/crypto-payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, reason: action === "approve" ? undefined : "Reviewed by Fly Logistics operations" }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); flySuccess(`Crypto payment ${action}d`); await load(); } catch (error) { flyError("Unable to review crypto payment", error instanceof Error ? error.message : undefined); } finally { setBusy(null); } }
  return <Card id="admin-crypto-payments" className="glass"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Crypto payment review</CardTitle><p className="mt-1 text-sm text-muted-foreground">Approve only after confirming the transaction on the correct blockchain.</p></div><Button variant="outline" size="icon" title="Refresh" onClick={() => void load()}><RefreshCw/></Button></CardHeader><CardContent className="grid gap-3">
    {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin"/>Loading payment requests</div> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No crypto payment requests yet.</p> : rows.map((row) => <div key={row.id} className="grid gap-3 rounded-md border p-4 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="font-semibold">{row.crypto_amount} {row.asset} · {row.network}</div><div className="text-sm text-muted-foreground">₦{Number(row.amount_ngn).toLocaleString("en-NG")} · {row.payment_kind} · {row.status}</div><div className="mt-1 break-all font-mono text-xs text-muted-foreground">{row.tx_hash ?? "Transaction hash not submitted"}</div></div>{["PENDING", "SUBMITTED"].includes(row.status) && <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy === row.id || !row.tx_hash} onClick={() => void review(row.id, "approve")}><Check/>Approve</Button><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => void review(row.id, "reject")}><X/>Reject</Button><Button size="sm" variant="destructive" disabled={busy === row.id} onClick={() => void review(row.id, "cancel")}>Cancel</Button></div>}</div>)}
  </CardContent></Card>;
}
