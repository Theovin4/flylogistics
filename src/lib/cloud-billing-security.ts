import { validateCloudPaymentFacts } from "@/lib/cloud-plans";

export type PersistedCloudBillingSnapshot = {
  amount: number | string;
  currency: string;
  paymentReference: string;
  priceVersion: string | null;
  provider: string | null;
  providerPlanId: string | null;
};

export type VerifiedCloudTransactionFacts = {
  status?: string | null;
  transactionReference?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  providerPlanId?: string | null;
};

export function cloudBillingSnapshotMatchesTransaction(
  snapshot: PersistedCloudBillingSnapshot,
  transaction: VerifiedCloudTransactionFacts
) {
  if (snapshot.provider !== "flutterwave" || !snapshot.providerPlanId || !snapshot.priceVersion) return false;
  const paymentFactsMatch = validateCloudPaymentFacts({
    plan: "starter",
    expectedReference: snapshot.paymentReference,
    expectedAmount: snapshot.amount,
    expectedCurrency: snapshot.currency,
    transactionStatus: transaction.status,
    transactionReference: transaction.transactionReference,
    amount: transaction.amount,
    currency: transaction.currency
  });
  return paymentFactsMatch && (!transaction.providerPlanId || transaction.providerPlanId === snapshot.providerPlanId);
}
