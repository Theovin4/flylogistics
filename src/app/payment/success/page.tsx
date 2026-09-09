import type { Metadata } from "next";
import { PaymentConfirmationView, type PaymentConfirmationResult } from "@/components/payments/payment-confirmation-view";
import { createMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createMetadata({
  title: "Payment Successful - Fly Logistics",
  description: "Fly Logistics payment confirmation and order created status.",
  path: "/payment/success",
  noIndex: true
});

type PaymentSuccessPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function amountFrom(value: string | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

export default async function PaymentSuccessPage({ searchParams }: PaymentSuccessPageProps) {
  const params = await searchParams;
  const kind = firstParam(params?.kind)?.toLowerCase();
  const status = firstParam(params?.status)?.toUpperCase();
  const trackingId = firstParam(params?.trackingId)?.trim().toUpperCase();
  const reference = firstParam(params?.reference)?.trim();
  const amount = amountFrom(firstParam(params?.amount));
  const isWalletFunding = kind === "wallet" || kind === "wallet-funding";
  const isFailed = status === "FAILED" || status === "CANCELLED";

  const result: PaymentConfirmationResult = {
    ok: !isFailed,
    status: isFailed ? status : "PAID",
    message: isWalletFunding
      ? "Your Fly Logistics wallet has been funded successfully."
      : trackingId
        ? `Order placed successfully. Your Fly Logistics tracking number is ${trackingId}. You can track your order anytime on Fly Logistics.`
        : "Order placed successfully. Your shipment is being processed by Fly Logistics operations.",
    reference,
    trackingId,
    amount,
    currency: "NGN",
    paymentKind: isWalletFunding ? "wallet" : "booking"
  };

  return (
    <PaymentConfirmationView
      result={result}
      paymentMethodLabel={isWalletFunding ? "Secure wallet funding" : "Fly Logistics wallet"}
    />
  );
}
