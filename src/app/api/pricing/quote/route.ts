import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryCategoryValues, pricingUrgencies } from "@/lib/pricing";
import { freightClassificationOptions, freightModeOptions, supportedCurrencies } from "@/lib/international";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { calculateLogisticsPrice } from "@/server/pricing";
import { enforceRateLimit, handleApiError, parseJson } from "@/server/api";

const pricingQuoteSchema = z.object({
  pickupState: z.string().trim().min(2).max(80).optional().nullable(),
  destinationState: z.string().trim().min(2).max(80).optional().nullable(),
  pickupCountry: z.string().trim().min(2).max(80).optional().nullable(),
  destinationCountry: z.string().trim().min(2).max(80).optional().nullable(),
  pickupAddress: z.string().trim().max(500).optional().nullable(),
  deliveryAddress: z.string().trim().max(500).optional().nullable(),
  packageType: z.string().trim().min(2).max(160),
  urgency: z.enum(pricingUrgencies.map((item) => item.value) as ["standard", "priority", "critical"]),
  weightKg: z.coerce.number().positive().max(100000),
  deliveryCategory: z.enum(deliveryCategoryValues),
  freightMode: z.enum(freightModeOptions.map((item) => item.value) as ["air_freight", "sea_freight"]).optional(),
  quoteCurrency: z.enum(supportedCurrencies).optional(),
  freightClassification: z.enum(freightClassificationOptions.map((item) => item.value) as ["documents", "general_cargo", "ecommerce_goods", "electronics", "fashion", "fragile", "oversized", "restricted_review"]).optional(),
  packageValue: z.coerce.number().min(0).max(1_000_000_000).optional(),
  customsInformation: z.string().trim().max(2000).optional(),
  exportImportDocuments: z.string().trim().max(2000).optional()
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "pricing-quote", { limit: 40, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await parseJson(request, pricingQuoteSchema, "Please complete the pricing fields.");
  if (parsed.response) return parsed.response;

  try {
    const quote = await calculateLogisticsPrice(parsed.data, getSupabaseAdmin());
    return NextResponse.json(quote);
  } catch (error) {
    return handleApiError(error, request, "Unable to calculate delivery pricing.");
  }
}
