import type { Route } from "next";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  PackageCheck,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
  Wallet
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaymentConversionTracker } from "@/components/analytics/payment-conversion-tracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type PaymentConfirmationResult = {
  ok: boolean;
  status: "UNPAID" | "PENDING" | "PAID" | "FAILED" | "CANCELLED" | string;
  message: string;
  requestId?: string;
  reference?: string;
  trackingId?: string;
  txRef?: string;
  amount?: number;
  currency?: string;
  paymentKind?: "booking" | "wallet";
};

type PaymentConfirmationViewProps = {
  result: PaymentConfirmationResult;
  paymentMethodLabel?: string;
};

function formatAmount(amount?: number, currency = "NGN") {
  if (!amount || !Number.isFinite(amount)) return "Pending verification";
  return new Intl.NumberFormat("en-NG", {
    currency,
    maximumFractionDigits: 0,
    style: "currency"
  }).format(amount);
}

function cleanCustomerMessage(message: string) {
  return message
    .replace(/\bFlutterwave\b/gi, "secure checkout")
    .replace(/\bFEZ(?: Logistics)?\b/gi, "Fly Logistics operations")
    .replace(/\bSendbox\b/gi, "Fly Logistics operations");
}

function resultCopy(result: PaymentConfirmationResult) {
  const status = String(result.status ?? "").toUpperCase();
  const paid = result.ok && status === "PAID";
  const walletPayment = result.paymentKind === "wallet";

  if (paid && walletPayment) {
    return {
      tone: "success" as const,
      eyebrow: "Wallet funded",
      title: "Wallet funded successfully.",
      description: cleanCustomerMessage(result.message || "Your Fly Logistics wallet balance has been updated."),
      icon: Wallet
    };
  }

  if (paid) {
    return {
      tone: "success" as const,
      eyebrow: "Order created",
      title: "Order created successfully.",
      description: cleanCustomerMessage(
        result.message ||
          (result.trackingId
            ? `Your Fly Logistics tracking number is ${result.trackingId}. You can track your order anytime on Fly Logistics.`
            : "Your shipment is now being processed by Fly Logistics operations.")
      ),
      icon: PackageCheck
    };
  }

  if (status === "CANCELLED") {
    return {
      tone: "warning" as const,
      eyebrow: "Payment cancelled",
      title: "Payment was cancelled.",
      description: cleanCustomerMessage(result.message || "No payment was confirmed for this Fly Logistics order."),
      icon: AlertCircle
    };
  }

  return {
    tone: "failed" as const,
    eyebrow: "Needs review",
    title: "Payment needs attention.",
    description: cleanCustomerMessage(result.message || "We could not confirm this payment. If you were debited, Fly Logistics operations will reconcile it from the payment reference."),
    icon: AlertCircle
  };
}

function badgeClass(tone: "success" | "warning" | "failed") {
  if (tone === "success") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (tone === "warning") return "border-primary/40 bg-primary/10 text-primary";
  return "border-destructive/40 bg-destructive/10 text-destructive";
}

export function PaymentConfirmationView({ result, paymentMethodLabel = "Secure card or bank payment" }: PaymentConfirmationViewProps) {
  const copy = resultCopy(result);
  const Icon = copy.icon;
  const paid = result.ok && String(result.status).toUpperCase() === "PAID";
  const walletPayment = result.paymentKind === "wallet";
  const reference = result.requestId ?? result.reference ?? result.txRef ?? "Pending";
  const receiptReference = result.txRef ?? result.reference ?? result.requestId;
  const amount = formatAmount(result.amount, result.currency ?? "NGN");
  const primaryHref = (walletPayment
    ? "/customer#customer-wallet"
    : result.trackingId
      ? `/tracking?trackingId=${encodeURIComponent(result.trackingId)}`
      : "/customer#customer-shipments") as Route;
  const primaryLabel = walletPayment ? "Open wallet" : result.trackingId ? "Track shipment" : "Open shipments";
  const secondaryHref = (walletPayment ? "/customer#customer-booking" : "/customer#customer-shipments") as Route;
  const secondaryLabel = walletPayment ? "Book shipment" : "Open customer dashboard";

  return (
    <>
      {paid ? <PaymentConversionTracker kind={walletPayment ? "wallet" : "booking"} amount={result.amount} currency={result.currency} /> : null}
      <SiteHeader />
      <main id="main-content" className="relative overflow-hidden">
        <section className="relative border-b border-border/70">
          <div className="absolute inset-0 grid-field opacity-50" aria-hidden="true" />
          <div className="absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--primary)_28%,transparent),transparent_62%)]" aria-hidden="true" />
          <div className="mx-auto grid min-h-[72vh] max-w-5xl items-center gap-8 px-4 py-16 sm:px-6 lg:px-8">
            <Card className={`glass relative z-10 overflow-hidden ${paid ? "success-pulse" : ""}`}>
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent" aria-hidden="true" />
              <CardHeader className="gap-6 p-5 sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <Logo className="pointer-events-none" />
                  <div className="flex flex-wrap gap-2">
                    <Badge className={badgeClass(copy.tone)}>{copy.eyebrow}</Badge>
                    <Badge>Fly Logistics secure checkout</Badge>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
                  <div className={`grid size-14 place-items-center rounded-md border ${badgeClass(copy.tone)}`}>
                    <Icon className="size-7" />
                  </div>
                  <div>
                    <CardTitle className="max-w-3xl text-3xl font-black leading-tight sm:text-5xl">{copy.title}</CardTitle>
                    <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{copy.description}</p>
                    {paid && result.trackingId ? (
                      <div className="mt-5 rounded-md border border-primary/30 bg-primary/10 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Fly Logistics tracking number</div>
                        <div className="mt-2 break-all font-mono text-2xl font-black text-foreground sm:text-3xl">{result.trackingId}</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="grid gap-6 p-5 pt-0 sm:p-8 sm:pt-0">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-md border bg-background/45 p-4">
                    <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">{walletPayment ? "Wallet reference" : "Booking reference"}</span>
                    <span className="mt-2 block break-all font-mono text-sm font-semibold">{reference}</span>
                  </div>
                  <div className="rounded-md border bg-background/45 p-4">
                    <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Amount</span>
                    <span className="mt-2 block text-lg font-black">{amount}</span>
                  </div>
                  <div className="rounded-md border bg-background/45 p-4">
                    <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Payment method</span>
                    <span className="mt-2 flex items-center gap-2 text-sm font-semibold">
                      <CreditCard className="size-4 text-primary" />
                      {paymentMethodLabel}
                    </span>
                  </div>
                  <div className="rounded-md border bg-background/45 p-4">
                    <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</span>
                    <span className="mt-2 flex items-center gap-2 text-sm font-semibold">
                      {paid ? <CheckCircle2 className="size-4 text-emerald-500" /> : <AlertCircle className="size-4 text-destructive" />}
                      {paid ? "Confirmed by Fly Logistics" : String(result.status || "Pending")}
                    </span>
                  </div>
                </div>

                {paid ? (
                  <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100 dark:text-emerald-100">
                    <div className="flex items-center gap-2 font-semibold text-emerald-500">
                      <ShieldCheck className="size-4" />
                      Your confirmation is complete
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      Keep your Fly Logistics reference safe. All delivery updates stay inside Fly Logistics tracking and your customer account.
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg">
                    <Link href={primaryHref}>
                      {primaryLabel}
                      {walletPayment ? <Wallet /> : <PackageSearch />}
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link href={secondaryHref}>
                      {secondaryLabel}
                      <ArrowRight />
                    </Link>
                  </Button>
                  {receiptReference ? (
                    <Button asChild size="lg" variant="outline">
                      <Link href={`/api/customer/receipts/${encodeURIComponent(receiptReference)}/pdf` as Route}>
                        Receipt
                        <ReceiptText />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
