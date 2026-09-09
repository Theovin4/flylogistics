"use client";

import { useEffect, useRef } from "react";
import { trackConversion } from "@/lib/analytics";

export function PaymentConversionTracker({ kind, amount, currency }: { kind: "booking" | "wallet"; amount?: number; currency?: string }) {
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackConversion(kind === "wallet" ? "wallet_funded" : "payment_completed", {
      value: Number(amount ?? 0),
      currency: currency ?? "NGN",
      content_category: kind === "wallet" ? "wallet_funding" : "shipment_booking"
    });
  }, [amount, currency, kind]);
  return null;
}
