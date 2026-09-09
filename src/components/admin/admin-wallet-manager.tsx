"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, RefreshCw, Wallet } from "lucide-react";
import { flyError, flySuccess } from "@/components/feedback/fly-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { WalletTransactionView } from "@/components/customer/customer-wallet-panel";

type AdminWallet = {
  id: number | string;
  user_id: string;
  balance: number | string;
  currency: string;
  status?: string | null;
  user_profiles?: {
    email?: string | null;
    full_name?: string | null;
    role?: string | null;
  } | null;
};

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 0,
  style: "currency"
});

export function AdminWalletManager() {
  const [wallets, setWallets] = useState<AdminWallet[]>([]);
  const [transactions, setTransactions] = useState<WalletTransactionView[]>([]);
  const [form, setForm] = useState({ userId: "", transactionType: "credit", amount: "", description: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const loadWallets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers(await authHeaders());
      const response = await fetch("/api/admin/wallets", { headers, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load wallets.");
      setWallets(data.wallets ?? []);
      setTransactions(data.transactions ?? []);
      if (data.warning) setMessage(data.warning);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to load wallets.";
      setError(nextError);
      flyError("Unable to load wallets", nextError);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  async function adjustWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const headers = new Headers(await authHeaders());
      headers.set("Content-Type", "application/json");
      const response = await fetch("/api/admin/wallets", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ ...form, amount: Number(form.amount) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to adjust wallet.");
      setMessage(`Wallet adjustment saved. Reference ${data.reference}.`);
      flySuccess("Wallet adjustment saved", `Reference ${data.reference}.`);
      setForm({ userId: "", transactionType: "credit", amount: "", description: "" });
      void loadWallets();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to adjust wallet.";
      setError(nextError);
      flyError("Unable to adjust wallet", nextError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="glass mt-8">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5 text-primary" />
              Customer wallets
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">View customer balances, transaction history, refunds, top-ups, and audited manual credits or debits. Manual adjustments require an exact account ID, amount, and reason.</p>
          </div>
          <Button variant="outline" onClick={loadWallets} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {message && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">{message}</div>}
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <form className="grid gap-3 rounded-md border bg-background/35 p-3 md:grid-cols-5" onSubmit={adjustWallet}>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="adminWalletUser">Customer user ID</Label>
            <Input id="adminWalletUser" value={form.userId} onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))} placeholder="Customer account ID" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adminWalletType">Type</Label>
            <select id="adminWalletType" value={form.transactionType} onChange={(event) => setForm((current) => ({ ...current, transactionType: event.target.value }))} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adminWalletAmount">Amount</Label>
            <Input id="adminWalletAmount" inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Enter exact amount" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adminWalletDescription">Reason</Label>
            <Input id="adminWalletDescription" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Adjustment reason" required />
          </div>
          <Button className="md:col-span-5" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <CreditCard />}
            Apply wallet adjustment
          </Button>
        </form>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">Wallet balances</h3>
            {wallets.length === 0 && <div className="rounded-md border bg-background/35 p-4 text-sm text-muted-foreground">No customer wallets yet.</div>}
            {wallets.slice(0, 10).map((wallet) => (
              <div key={String(wallet.id)} className="flex flex-col gap-2 rounded-md border bg-background/35 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="block font-semibold">{wallet.user_profiles?.full_name ?? wallet.user_profiles?.email ?? wallet.user_id}</span>
                  <span className="font-mono text-xs text-muted-foreground">{wallet.user_id}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge>{wallet.status ?? "ACTIVE"}</Badge>
                  <span className="font-mono font-black">{moneyFormatter.format(Number(wallet.balance ?? 0))}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">Latest wallet transactions</h3>
            {transactions.slice(0, 10).map((transaction) => (
              <div key={String(transaction.id)} className="rounded-md border bg-background/35 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{transaction.description ?? transaction.reference}</span>
                  <span className="font-mono font-black">{moneyFormatter.format(Number(transaction.amount ?? 0))}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge>{transaction.transaction_type}</Badge>
                  <Badge>{transaction.status}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{transaction.reference}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
