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
}).superRefine((data, context) => {
  const pickupCountry = data.pickupCountry?.trim().toLowerCase();
  const destinationCountry = data.destinationCountry?.trim().toLowerCase();

  if (data.deliveryCategory === "local_nigeria") {
    if (pickupCountry !== "nigeria" || destinationCountry !== "nigeria") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryCategory"], message: "Local deliveries must start and end in Nigeria." });
    }
    if (!data.pickupState) context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupState"], message: "Select a pickup state." });
    if (!data.destinationState) context.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationState"], message: "Select a delivery state." });
  }

  if (data.deliveryCategory === "international_import") {
    if (!pickupCountry || pickupCountry === "nigeria") context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupCountry"], message: "Select the international origin country." });
    if (destinationCountry !== "nigeria") context.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationCountry"], message: "Imports must arrive in Nigeria." });
    if (!data.destinationState) context.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationState"], message: "Select the Nigerian delivery state." });
  }

  if (data.deliveryCategory === "international_export") {
    if (pickupCountry !== "nigeria") context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupCountry"], message: "Exports must leave from Nigeria." });
    if (!destinationCountry || destinationCountry === "nigeria") context.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationCountry"], message: "Select the international destination country." });
    if (!data.pickupState) context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupState"], message: "Select the Nigerian pickup state." });
  }
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
