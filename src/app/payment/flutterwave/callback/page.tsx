import type { Metadata } from "next";
import { PaymentConfirmationView } from "@/components/payments/payment-confirmation-view";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { createMetadata } from "@/lib/seo";
import { recoverFlutterwavePaymentResult, verifyAndPersistFlutterwavePayment, type PaymentResult } from "@/server/payments/flutterwave";
import { isWalletFundingReference, verifyAndCreditWalletPayment, type WalletPaymentResult } from "@/server/wallets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createMetadata({
  title: "Payment Status - Fly Logistics",
  description: "Secure payment confirmation for Fly Logistics shipment bookings.",
  path: "/payment/flutterwave/callback",
  noIndex: true
});

type PaymentCallbackPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type CallbackPaymentResult = PaymentResult & { paymentKind?: "booking" | "wallet" };

async function resolvePayment(searchParams: Record<string, string | string[] | undefined>): Promise<CallbackPaymentResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      ok: false,
      status: "FAILED",
      message: "Payment verification is not configured yet."
    };
  }

  try {
    const txRef = firstParam(searchParams.tx_ref);
    if (isWalletFundingReference(txRef)) {
      const result: WalletPaymentResult = await verifyAndCreditWalletPayment(supabase, {
        transactionId: firstParam(searchParams.transaction_id) ?? firstParam(searchParams.transactionId),
        txRef,
        callbackStatus: firstParam(searchParams.status)
      });
      return {
        ok: result.ok,
        status: result.status,
        message: result.message,
        requestId: result.reference,
        txRef: result.reference,
        amount: result.amount,
        currency: result.currency,
        paymentKind: "wallet"
      };
    }

    const input = {
      transactionId: firstParam(searchParams.transaction_id) ?? firstParam(searchParams.transactionId),
      txRef,
      requestId: firstParam(searchParams.requestId),
      callbackStatus: firstParam(searchParams.status)
    };
    return await verifyAndPersistFlutterwavePayment(supabase, input);
  } catch (err) {
    console.error(err);
    const recovered = await recoverFlutterwavePaymentResult(
      supabase,
      {
        transactionId: firstParam(searchParams.transaction_id) ?? firstParam(searchParams.transactionId),
        txRef: firstParam(searchParams.tx_ref),
        requestId: firstParam(searchParams.requestId),
        callbackStatus: firstParam(searchParams.status)
      },
      "Payment verified successfully. Your Fly Logistics shipment is ready to track."
    );
    if (recovered) return recovered;

    const rawMessage = err instanceof Error ? err.message : "Unable to verify payment.";
    const message = /maximum call stack|stack size|rangeerror/i.test(rawMessage)
      ? "Payment verification needs an operations retry. If your bank or card was debited, Fly Logistics will reconcile it from the payment reference and notify you."
      : rawMessage;
    return {
      ok: false,
      status: "FAILED",
      message
    };
  }
}

export default async function FlutterwavePaymentCallbackPage({ searchParams }: PaymentCallbackPageProps) {
  const params = await searchParams;
  const result = await resolvePayment(params);
  return <PaymentConfirmationView result={result} />;
}
