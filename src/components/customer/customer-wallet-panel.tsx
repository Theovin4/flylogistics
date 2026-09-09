"use client";

import { FormEvent, useMemo, useState } from "react";
import { CreditCard, Download, Loader2, Plus, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CryptoPaymentPanel, type CryptoPayment } from "@/components/payments/crypto-payment-panel";

export type CustomerWalletView = {
  id: number | string;
  balance: number | string;
  currency: string;
  status?: string | null;
} | null;

export type WalletTransactionView = {
  id: number | string;
  transaction_type: string;
  amount: number | string;
  currency: string;
  reference: string;
  description?: string | null;
  status: string;
  payment_provider?: string | null;
  created_at?: string | null;
};

export type WalletFundingProvider = "flutterwave" | "crypto";

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 0,
  style: "currency"
});

function statusClass(status: string) {
  if (status === "COMPLETED" || status === "PAID") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (status === "FAILED" || status === "CANCELLED") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-primary/40 bg-primary/10 text-primary";
}

export function CustomerWalletPanel({
  wallet,
  transactions,
  onFundWallet,
  authorizedFetch
}: {
  wallet: CustomerWalletView;
  transactions: WalletTransactionView[];
  onFundWallet: (amount: number, paymentProvider?: WalletFundingProvider, network?: string) => Promise<CryptoPayment | void>;
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}) {
  const [amount, setAmount] = useState("10000");
  const [paymentProvider, setPaymentProvider] = useState<WalletFundingProvider>("flutterwave");
  const [funding, setFunding] = useState(false);
  const [network, setNetwork] = useState<"TRC20" | "BEP20" | "SOL" | "BTC">("TRC20");
  const [cryptoPayment, setCryptoPayment] = useState<CryptoPayment | null>(null);
  const balance = Number(wallet?.balance ?? 0);
  const latestTransactions = useMemo(() => transactions.slice(0, 6), [transactions]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFunding(true);
    try {
      const result = await onFundWallet(Number(amount), paymentProvider, network);
      if (result) setCryptoPayment(result);
    } finally {
      setFunding(false);
    }
  }

  return (
    <Card id="customer-wallet" className="glass scroll-mt-24">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5 text-primary" />
              Wallet
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Fund your Fly Logistics wallet, pay for shipment bookings, and review wallet activity in one secure account view.
            </p>
          </div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">{wallet?.status ?? "Wallet ready"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="rounded-md border bg-black p-5 text-white">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs uppercase tracking-[0.22em] text-primary">Available balance</span>
            <Wallet className="size-5 text-primary" />
          </div>
          <div className="mt-5 font-mono text-4xl font-black">{moneyFormatter.format(balance)}</div>
          <p className="mt-2 text-sm text-white/60">Currency {wallet?.currency ?? "NGN"}</p>
          <form className="mt-5 grid gap-3" onSubmit={submit}>
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              className="border-white/20 bg-white/10 text-white"
              placeholder="Amount"
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Button
                type="button"
                variant={paymentProvider === "flutterwave" ? "default" : "outline"}
                className={paymentProvider === "flutterwave" ? "" : "border-white/20 bg-white/10 text-white hover:bg-white/15"}
                onClick={() => setPaymentProvider("flutterwave")}
              >
                Flutterwave
              </Button>
              <Button
                type="button"
                variant={paymentProvider === "crypto" ? "default" : "outline"}
                className={paymentProvider === "crypto" ? "" : "border-white/20 bg-white/10 text-white hover:bg-white/15"}
                onClick={() => setPaymentProvider("crypto")}
              >
                Crypto
              </Button>
            </div>
            {paymentProvider === "crypto" && <select aria-label="Crypto network" value={network} onChange={(event) => setNetwork(event.target.value as typeof network)} className="h-10 rounded-md border border-white/20 bg-black px-3 text-sm text-white"><option value="TRC20">USDT (TRC20)</option><option value="BEP20">USDT (BEP20)</option><option value="SOL">USDT (Solana)</option><option value="BTC">Bitcoin</option></select>}
            <Button type="submit" disabled={funding || Number(amount) < 100}>
              {funding ? <Loader2 className="animate-spin" /> : <Plus />}
              Fund wallet with {paymentProvider === "crypto" ? "crypto" : "Flutterwave"}
            </Button>
          </form>
          {cryptoPayment && <div className="mt-4"><CryptoPaymentPanel payment={cryptoPayment} authorizedFetch={authorizedFetch} /></div>}
        </div>
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Wallet transaction history</h3>
            <Badge>{transactions.length} records</Badge>
          </div>
          {latestTransactions.length === 0 && (
            <div className="rounded-md border bg-background/35 p-4 text-sm text-muted-foreground">
              Wallet credits, debits, failed transactions, and funding confirmations will appear here.
            </div>
          )}
          {latestTransactions.map((transaction) => (
            <div key={transaction.id} className="flex flex-col gap-2 rounded-md border bg-background/35 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="flex items-center gap-2 font-semibold">
                  <CreditCard className="size-4 text-primary" />
                  {transaction.description ?? transaction.reference}
                </span>
                <span className="mt-1 block font-mono text-xs text-muted-foreground">{transaction.reference}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge className={transaction.transaction_type === "credit" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                  {transaction.transaction_type}
                </Badge>
                <Badge className={statusClass(transaction.status)}>{transaction.status}</Badge>
                <span className="font-mono font-semibold">{moneyFormatter.format(Number(transaction.amount ?? 0))}</span>
                {["COMPLETED", "PAID"].includes(String(transaction.status ?? "").toUpperCase()) ? (
                  <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                    <a href={`/api/customer/receipts/${encodeURIComponent(transaction.reference)}/pdf`} target="_blank" rel="noreferrer">
                      <Download className="size-3" />
                      Receipt
                    </a>
                  </Button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
