"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { calculateLogisticsPrice } from "@/server/pricing";

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
  const quote = await calculateLogisticsPrice({
    pickupAddress: data.origin,
    deliveryAddress: data.destination,
    packageType: "Standard package",
    weightKg: data.weightKg,
    urgency: data.urgency,
    deliveryCategory: "standard_package"
  }, getSupabaseAdmin());

  revalidatePath("/instant-quote");
  return {
    amount: quote.amount,
    formattedAmount: quote.formattedAmount,
    distanceKm,
    etaHours: quote.etaHours,
    deliveryType: quote.deliveryType,
    vehicleType: quote.vehicleType,
    warnings: quote.warnings,
    confidence: data.urgency === "critical" ? 94 : 97
  };
}
