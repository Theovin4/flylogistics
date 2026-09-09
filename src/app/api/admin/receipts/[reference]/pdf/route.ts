import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { buildBrandedPdf, pdfResponse } from "@/server/documents/branded-pdf";

export const dynamic = "force-dynamic";

function normalizeReference(reference: string) {
  return decodeURIComponent(reference).trim();
}

function value(row: Record<string, unknown> | null | undefined, key: string) {
  return row?.[key] ?? null;
}

async function findShipment(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, reference: string) {
  const byTracking = await supabase
    .from("shipments")
    .select("*")
    .eq("tracking_id", reference.toUpperCase())
    .maybeSingle();
  if (byTracking.data || byTracking.error) return byTracking;

  return supabase
    .from("shipments")
    .select("*")
    .eq("payment_reference", reference)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function GET(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Receipt download is temporarily unavailable." }, { status: 503 });

  const { reference: rawReference } = await params;
  const reference = normalizeReference(rawReference);
  const shipmentResult = await findShipment(supabase, reference);
  if (shipmentResult.error) return NextResponse.json({ error: "Unable to load receipt." }, { status: 500 });
  if (!shipmentResult.data) return NextResponse.json({ error: "Shipment receipt not found." }, { status: 404 });

  const shipment = shipmentResult.data as Record<string, unknown>;
  const pdf = buildBrandedPdf({
    title: "Admin shipment receipt",
    documentNumber: String(value(shipment, "payment_reference") ?? value(shipment, "tracking_id") ?? reference),
    status: String(value(shipment, "payment_status") ?? "UNPAID"),
    issuedTo: String(value(shipment, "customer_name") ?? "Fly Logistics customer"),
    currency: String(value(shipment, "quote_currency") ?? "NGN"),
    totalAmount: value(shipment, "payment_amount") ?? value(shipment, "quoted_price"),
    sections: [
      {
        title: "Shipment",
        rows: [
          { label: "Fly tracking number", value: value(shipment, "tracking_id") },
          { label: "Payment reference", value: value(shipment, "payment_reference") },
          { label: "Sender", value: value(shipment, "customer_name") },
          { label: "Sender email", value: value(shipment, "customer_email") },
          { label: "Recipient", value: value(shipment, "recipient_name") },
          { label: "Delivery phone", value: value(shipment, "delivery_phone") ?? value(shipment, "customer_phone") },
          { label: "Pickup", value: value(shipment, "pickup_address") },
          { label: "Delivery", value: value(shipment, "delivery_address") },
          { label: "Package", value: value(shipment, "package_type") },
          { label: "Status", value: value(shipment, "status") }
        ]
      },
      {
        title: "Operations finance",
        rows: [
          { label: "Revenue", value: value(shipment, "payment_amount") ?? value(shipment, "quoted_price") },
          { label: "Rider payout", value: value(shipment, "driver_payout_amount") },
          { label: "Carrier cost", value: value(shipment, "carrier_cost_amount") ?? value(shipment, "carrier_rate_amount") },
          { label: "Payment provider", value: value(shipment, "payment_provider") },
          { label: "Carrier provider", value: value(shipment, "carrier_provider") },
          { label: "Created", value: value(shipment, "created_at") }
        ]
      }
    ],
    lineItems: [
      {
        description: "Shipment revenue",
        reference: String(value(shipment, "tracking_id") ?? reference),
        amount: value(shipment, "payment_amount") ?? value(shipment, "quoted_price")
      },
      {
        description: "Rider payout",
        reference: String(value(shipment, "assigned_driver_id") ?? "Driver payout"),
        amount: value(shipment, "driver_payout_amount")
      },
      {
        description: "Carrier cost",
        reference: String(value(shipment, "carrier_provider") ?? "Carrier"),
        amount: value(shipment, "carrier_cost_amount") ?? value(shipment, "carrier_rate_amount")
      }
    ],
    notes: [
      "Admin receipts may include internal operation and carrier fields. Do not share admin receipts with customers.",
      "Customer-facing tracking and receipts remain Fly Logistics branded."
    ]
  });

  return pdfResponse(pdf, `Fly-Logistics-admin-receipt-${value(shipment, "tracking_id") ?? reference}`);
}
