export const quoteStatuses = [
  "PENDING_REVIEW",
  "QUOTED",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "PAID",
  "CONVERTED_TO_SHIPMENT"
] as const;

export type QuoteStatus = (typeof quoteStatuses)[number];

const quoteStatusAliases: Record<string, QuoteStatus> = {
  NEW: "PENDING_REVIEW",
  APPROVED: "QUOTED",
  REJECTED: "DECLINED",
  CONVERTED: "CONVERTED_TO_SHIPMENT"
};

export function normalizeQuoteStatus(status: string | null | undefined): QuoteStatus {
  const normalized = String(status ?? "PENDING_REVIEW").trim().toUpperCase();
  if (quoteStatuses.includes(normalized as QuoteStatus)) return normalized as QuoteStatus;
  return quoteStatusAliases[normalized] ?? "PENDING_REVIEW";
}

export function quoteStatusLabel(status: string | null | undefined) {
  return normalizeQuoteStatus(status)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function quoteLifecycleTone(status: string | null | undefined) {
  switch (normalizeQuoteStatus(status)) {
    case "QUOTED":
      return "border-primary/40 bg-primary/10 text-primary";
    case "ACCEPTED":
      return "border-sky-500/40 bg-sky-500/10 text-sky-500";
    case "PAID":
    case "CONVERTED_TO_SHIPMENT":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
    case "DECLINED":
    case "EXPIRED":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    default:
      return "border-muted-foreground/30 bg-background/55 text-muted-foreground";
  }
}

export function isQuoteAccepted(status: string | null | undefined) {
  return normalizeQuoteStatus(status) === "ACCEPTED";
}

export function isQuotePaid(status: string | null | undefined, paymentStatus?: string | null) {
  return normalizeQuoteStatus(status) === "PAID" || String(paymentStatus ?? "").toUpperCase() === "PAID";
}

export function isQuoteConverted(status: string | null | undefined) {
  return normalizeQuoteStatus(status) === "CONVERTED_TO_SHIPMENT";
}

export function isQuoteExpired(status: string | null | undefined, validUntil?: string | null) {
  if (normalizeQuoteStatus(status) === "EXPIRED") return true;
  if (!validUntil) return false;
  const timestamp = new Date(validUntil).getTime();
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

export function canCustomerRespondToQuote(status: string | null | undefined, validUntil?: string | null) {
  return normalizeQuoteStatus(status) === "QUOTED" && !isQuoteExpired(status, validUntil);
}

export function canPayQuote(status: string | null | undefined, paymentStatus?: string | null, validUntil?: string | null) {
  const quoteStatus = normalizeQuoteStatus(status);
  return (quoteStatus === "QUOTED" || quoteStatus === "ACCEPTED") && !isQuoteExpired(status, validUntil) && String(paymentStatus ?? "UNPAID").toUpperCase() !== "PAID";
}

export function canConvertQuote(status: string | null | undefined, paymentStatus?: string | null, adminOverride = false) {
  if (adminOverride) return true;
  return normalizeQuoteStatus(status) === "PAID" && String(paymentStatus ?? "UNPAID").toUpperCase() === "PAID";
}

export function quoteDisplayAmount(input: { final_price?: number | string | null; quoted_price?: number | string | null; payment_amount?: number | string | null; estimated_price?: number | string | null }) {
  const amount = Number(input.final_price ?? input.quoted_price ?? input.payment_amount ?? input.estimated_price ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function quoteDisplayEta(input: { quoted_eta_label?: string | null; quoted_eta_hours?: number | string | null; estimated_eta_hours?: number | string | null }) {
  if (input.quoted_eta_label) return input.quoted_eta_label;
  const eta = Number(input.quoted_eta_hours ?? input.estimated_eta_hours ?? 0);
  return eta > 0 && Number.isFinite(eta) ? `${eta}h` : "Pending ETA";
}

export type QuoteStatusHistoryItem = {
  status: QuoteStatus | string;
  label?: string;
  actor_id?: string | null;
  actor_role?: string | null;
  note?: string | null;
  occurred_at: string;
};

export function appendQuoteStatusHistory(
  history: QuoteStatusHistoryItem[] | null | undefined,
  item: Omit<QuoteStatusHistoryItem, "occurred_at">
) {
  const current = Array.isArray(history) ? history : [];
  return [
    ...current,
    {
      ...item,
      status: normalizeQuoteStatus(item.status),
      occurred_at: new Date().toISOString()
    }
  ];
}
