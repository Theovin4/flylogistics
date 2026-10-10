import { z } from "zod";
import { freightClassificationOptions, freightModeOptions, supportedCurrencies } from "@/lib/international";
import { isReasonablePhone } from "@/lib/account-security";
import { deliveryTypeOptions, pricingUrgencies } from "@/lib/pricing";

export const customerDeliveryCategories = deliveryTypeOptions.map((item) => item.value) as [
  "local_nigeria",
  "international_import",
  "international_export"
];

const optionalAmount = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().min(0).max(1_000_000_000).optional()
);

const optionalDimension = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().positive().max(100_000).optional()
);

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("");

export const customerBookingSchema = z.object({
  customerName: z.string().trim().min(2).max(160),
  customerEmail: z.string().trim().email(),
  customerPhone: z.string().trim().min(5).max(40),
  recipientName: z.string().trim().min(2).max(160),
  recipientEmail: z.string().trim().email().optional().or(z.literal("")),
  pickupPhone: z.string().trim().min(5).max(40),
  deliveryPhone: z.string().trim().min(5).max(40),
  pickupEmail: z.string().trim().email().optional().or(z.literal("")),
  pickupCountry: z.string().trim().min(2).max(80),
  destinationCountry: z.string().trim().min(2).max(80),
  pickupState: optionalText(80),
  destinationState: optionalText(80),
  pickupCity: z.string().trim().min(2).max(120),
  deliveryCity: z.string().trim().min(2).max(120),
  pickupPostalCode: optionalText(40),
  deliveryPostalCode: optionalText(40),
  pickupAddress: z.string().trim().min(8).max(500),
  deliveryAddress: z.string().trim().min(8).max(500),
  packageType: z.string().trim().min(2).max(160),
  packageCategory: z.string().trim().min(2).max(80),
  weightKg: z.coerce.number().positive().max(100000),
  quantity: z.coerce.number().int().positive().max(10000).default(1),
  fragile: z.boolean().default(false),
  packageLengthCm: optionalDimension,
  packageWidthCm: optionalDimension,
  packageHeightCm: optionalDimension,
  shipmentPurpose: optionalText(160),
  commercialShipment: z.boolean().default(false),
  restrictedAcknowledged: z.boolean().default(false),
  documentUrls: z.array(z.string().url()).max(8).default([]),
  urgency: z.enum(pricingUrgencies.map((item) => item.value) as ["standard", "priority", "critical"]),
  deliveryCategory: z.enum(customerDeliveryCategories),
  freightMode: z.enum(freightModeOptions.map((item) => item.value) as ["air_freight", "sea_freight"]).optional(),
  quoteCurrency: z.enum(supportedCurrencies).default("NGN"),
  freightClassification: z.enum(freightClassificationOptions.map((item) => item.value) as ["documents", "general_cargo", "ecommerce_goods", "electronics", "fashion", "fragile", "oversized", "restricted_review"]).optional(),
  customsInformation: optionalText(2000),
  packageValue: optionalAmount,
  dutiesTaxesAmount: optionalAmount,
  exportImportDocuments: optionalText(4000),
  notes: optionalText(1000),
  website: optionalText(160),
  formStartedAt: z.coerce.number().int().positive().optional()
}).superRefine((data, context) => {
  if (!isReasonablePhone(data.pickupPhone)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupPhone"], message: "Enter a valid pickup phone number with country code." });
  }
  if (!isReasonablePhone(data.deliveryPhone)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryPhone"], message: "Enter a valid receiver phone number with country code." });
  }

  if (data.deliveryCategory === "local_nigeria") {
    if (data.pickupCountry.toLowerCase() !== "nigeria" || data.destinationCountry.toLowerCase() !== "nigeria") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryCategory"], message: "Local deliveries must start and end in Nigeria." });
    }
    if (!data.pickupState) context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupState"], message: "Select the pickup state." });
    if (!data.destinationState) context.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationState"], message: "Select the delivery state." });
    return;
  }

  if (data.deliveryCategory === "international_import") {
    if (data.pickupCountry.toLowerCase() === "nigeria") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupCountry"], message: "Choose the country the import is leaving from." });
    }
    if (data.destinationCountry.toLowerCase() !== "nigeria") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationCountry"], message: "Import deliveries must arrive in Nigeria." });
    }
    if (!data.destinationState) context.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationState"], message: "Select the Nigerian delivery state." });
  }

  if (data.deliveryCategory === "international_export") {
    if (data.pickupCountry.toLowerCase() !== "nigeria") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupCountry"], message: "Export deliveries must leave from Nigeria." });
    }
    if (data.destinationCountry.toLowerCase() === "nigeria") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationCountry"], message: "Choose the country receiving this export." });
    }
    if (!data.pickupState) context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupState"], message: "Select the Nigerian pickup state." });
  }

  if (!data.pickupEmail) context.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupEmail"], message: "Enter the sender email for international shipping." });
  if (!data.recipientEmail) context.addIssue({ code: z.ZodIssueCode.custom, path: ["recipientEmail"], message: "Enter the receiver email for international shipping." });
  if (!data.packageValue || data.packageValue <= 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["packageValue"], message: "Enter the declared package value." });
  if (!data.shipmentPurpose) context.addIssue({ code: z.ZodIssueCode.custom, path: ["shipmentPurpose"], message: "Select or describe the shipment purpose." });
  if (!data.restrictedAcknowledged) context.addIssue({ code: z.ZodIssueCode.custom, path: ["restrictedAcknowledged"], message: "Confirm that the shipment does not contain undeclared prohibited or dangerous items." });
});

export type CustomerBookingInput = z.infer<typeof customerBookingSchema>;

export function isInternationalCustomerBooking(category: string) {
  return category === "international_import" || category === "international_export";
}

export function customerBookingAddress(address: string, city: string, postalCode?: string) {
  return [address.trim(), city.trim(), postalCode?.trim()].filter(Boolean).join(", ");
}

export function customerBookingNotes(input: CustomerBookingInput) {
  const details = [
    input.notes,
    `Package category: ${input.packageCategory}`,
    `Quantity: ${input.quantity}`,
    `Fragile: ${input.fragile ? "Yes" : "No"}`
  ];
  if (isInternationalCustomerBooking(input.deliveryCategory)) {
    details.push(
      `Sender email: ${input.pickupEmail}`,
      `Receiver email: ${input.recipientEmail}`,
      `Shipment purpose: ${input.shipmentPurpose}`,
      `Commercial shipment: ${input.commercialShipment ? "Yes" : "No"}`,
      input.packageLengthCm && input.packageWidthCm && input.packageHeightCm
        ? `Dimensions: ${input.packageLengthCm} x ${input.packageWidthCm} x ${input.packageHeightCm} cm`
        : "Dimensions: To be confirmed"
    );
  }
  return details.filter(Boolean).join("\n");
}

export function customerBookingDocuments(input: CustomerBookingInput) {
  return [input.exportImportDocuments, ...input.documentUrls].filter(Boolean).join("\n");
}
