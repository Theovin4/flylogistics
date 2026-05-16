"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { etaFromDistance, formatCurrency } from "@/lib/utils";

const quoteSchema = z.object({
  origin: z.string().min(2),
  destination: z.string().min(2),
  weightKg: z.coerce.number().positive(),
  cargoValue: z.coerce.number().nonnegative(),
  urgency: z.enum(["standard", "priority", "critical"]).default("standard")
});

export async function createQuote(input: unknown) {
  const data = quoteSchema.parse(input);
  const distanceKm = Math.max(120, Math.round((data.origin.length + data.destination.length) * 83));
  const urgencyMultiplier = data.urgency === "critical" ? 2.2 : data.urgency === "priority" ? 1.45 : 1;
  const amount = Math.round((distanceKm * 1.22 + data.weightKg * 0.72 + data.cargoValue * 0.003) * urgencyMultiplier);
  revalidatePath("/instant-quote");
  return {
    amount,
    formattedAmount: formatCurrency(amount),
    distanceKm,
    etaHours: etaFromDistance(distanceKm, data.urgency),
    confidence: data.urgency === "critical" ? 94 : 97
  };
}
