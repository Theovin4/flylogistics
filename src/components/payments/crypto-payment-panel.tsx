"use client";

import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CryptoPayment = { id: string; asset: string; network: string; deposit_address: string; amount_ngn: number; crypto_amount: number; status: string };

export function CryptoPaymentPanel({ payment, authorizedFetch, onSubmitted }: { payment: CryptoPayment; authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; onSubmitted?: () => void }) {
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setMessage(null);
    try {
      const response = await authorizedFetch("/api/payments/crypto/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: payment.id, txHash: hash }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to submit transaction hash.");
      setMessage("Payment proof submitted. Fly Logistics operations will review it before crediting your account or creating the shipment.");
      onSubmitted?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to submit payment proof."); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-4 rounded-md border border-primary/30 bg-primary/5 p-4">
    <div><div className="font-semibold">Pay with {payment.asset} on {payment.network}</div><p className="text-sm text-muted-foreground">Send exactly <strong>{payment.crypto_amount} {payment.asset}</strong>. The total includes the 2% crypto processing margin.</p></div>
    <div className="grid gap-2"><Label>Fly Logistics deposit address</Label><div className="flex gap-2"><Input readOnly value={payment.deposit_address} className="font-mono text-xs"/><Button type="button" variant="outline" size="icon" title="Copy address" onClick={() => navigator.clipboard.writeText(payment.deposit_address)}><Copy/></Button></div></div>
    <div className="grid gap-2"><Label>Transaction hash</Label><Input value={hash} onChange={(event) => setHash(event.target.value)} placeholder="Paste the completed blockchain transaction hash" autoCapitalize="none" autoCorrect="off" /></div>
    <Button type="button" disabled={busy || !hash.trim()} onClick={() => void submit()}>{busy ? <Loader2 className="animate-spin"/> : <Check/>} Submit payment proof</Button>
    {message && <p className="text-sm leading-6 text-muted-foreground">{message}</p>}
  </div>;
}
