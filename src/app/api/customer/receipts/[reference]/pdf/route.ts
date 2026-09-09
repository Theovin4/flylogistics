import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { buildBrandedPdf, pdfResponse } from "@/server/documents/branded-pdf";

export const dynamic = "force-dynamic";

function normalizeReference(reference: string) {
  return decodeURIComponent(reference).trim();
}

function rowValue(row: Record<string, unknown> | null | undefined, key: string) {
  return row?.[key] ?? null;
}

async function findCustomerShipment(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, reference: string, email: string) {
  const byTracking = await supabase
    .from("shipments")
    .select("*")
    .eq("tracking_id", reference.toUpperCase())
    .ilike("customer_email", email)
    .maybeSingle();
  if (byTracking.data || byTracking.error) return byTracking;

  return supabase
    .from("shipments")
    .select("*")
    .eq("payment_reference", reference)
    .ilike("customer_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function findCustomerQuote(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, reference: string, email: string) {
  const byRequest = await supabase
    .from("quote_requests")
    .select("*")
    .eq("request_id", reference.toUpperCase())
    .ilike("customer_email", email)
    .maybeSingle();
  if (byRequest.data || byRequest.error) return byRequest;

  return supabase
    .from("quote_requests")
    .select("*")
    .eq("payment_reference", reference)
    .ilike("customer_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function GET(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.profile.email) return NextResponse.json({ error: "Your account needs an email before receipts can be downloaded." }, { status: 409 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Receipt download is temporarily unavailable." }, { status: 503 });

  const { reference: rawReference } = await params;
  const reference = normalizeReference(rawReference);
  const shipmentResult = await findCustomerShipment(supabase, reference, access.profile.email);
  if (shipmentResult.error) return NextResponse.json({ error: "Unable to load receipt." }, { status: 500 });

  if (shipmentResult.data) {
    const shipment = shipmentResult.data as Record<string, unknown>;
    const pdf = buildBrandedPdf({
      title: "Shipment receipt",
      documentNumber: String(rowValue(shipment, "payment_reference") ?? rowValue(shipment, "tracking_id") ?? reference),
      status: String(rowValue(shipment, "payment_status") ?? "PAID"),
      issuedTo: String(rowValue(shipment, "customer_name") ?? access.profile.full_name ?? "Fly Logistics customer"),
      currency: String(rowValue(shipment, "quote_currency") ?? "NGN"),
      totalAmount: rowValue(shipment, "payment_amount") ?? rowValue(shipment, "quoted_price"),
      sections: [
        {
          title: "Shipment",
          rows: [
            { label: "Fly tracking number", value: rowValue(shipment, "tracking_id") },
            { label: "Payment reference", value: rowValue(shipment, "payment_reference") },
            { label: "Sender", value: rowValue(shipment, "customer_name") },
            { label: "Recipient", value: rowValue(shipment, "recipient_name") },
            { label: "Pickup", value: rowValue(shipment, "pickup_address") },
            { label: "Delivery", value: rowValue(shipment, "delivery_address") },
            { label: "Package", value: rowValue(shipment, "package_type") },
            { label: "Status", value: rowValue(shipment, "status") }
          ]
        }
      ],
      lineItems: [
        {
          description: "Fly Logistics shipment payment",
          reference: String(rowValue(shipment, "tracking_id") ?? reference),
          amount: rowValue(shipment, "payment_amount") ?? rowValue(shipment, "quoted_price")
        }
      ],
      notes: [
        "This customer receipt contains Fly Logistics tracking details only.",
        "Private fulfilment details, delivery proof, sender phone numbers, and recipient phone numbers are not shown on customer receipts."
      ]
    });
    return pdfResponse(pdf, `Fly-Logistics-receipt-${rowValue(shipment, "tracking_id") ?? reference}`);
  }

  const quoteResult = await findCustomerQuote(supabase, reference, access.profile.email);
  if (quoteResult.error) return NextResponse.json({ error: "Unable to load receipt." }, { status: 500 });

  if (quoteResult.data) {
    const quote = quoteResult.data as Record<string, unknown>;
    const pdf = buildBrandedPdf({
      title: "Quote payment receipt",
      documentNumber: String(rowValue(quote, "payment_reference") ?? rowValue(quote, "request_id") ?? reference),
      status: String(rowValue(quote, "payment_status") ?? "PAID"),
      issuedTo: String(rowValue(quote, "customer_name") ?? access.profile.full_name ?? "Fly Logistics customer"),
      currency: "NGN",
      totalAmount: rowValue(quote, "payment_amount") ?? rowValue(quote, "quoted_price") ?? rowValue(quote, "estimated_price"),
      sections: [
        {
          title: "Quote",
          rows: [
            { label: "Request reference", value: rowValue(quote, "request_id") },
            { label: "Payment reference", value: rowValue(quote, "payment_reference") },
            { label: "Pickup", value: rowValue(quote, "pickup_address") },
            { label: "Delivery", value: rowValue(quote, "delivery_address") },
            { label: "Package", value: rowValue(quote, "package_type") },
            { label: "Status", value: rowValue(quote, "status") }
          ]
        }
      ],
      lineItems: [
        {
          description: "Fly Logistics quote payment",
          reference: String(rowValue(quote, "request_id") ?? reference),
          amount: rowValue(quote, "payment_amount") ?? rowValue(quote, "quoted_price") ?? rowValue(quote, "estimated_price")
        }
      ],
      notes: ["This receipt confirms payment activity recorded by Fly Logistics."]
    });
    return pdfResponse(pdf, `Fly-Logistics-receipt-${rowValue(quote, "request_id") ?? reference}`);
  }

  const walletResult = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("reference", reference)
    .eq("user_id", access.profile.id)
    .maybeSingle();

  if (walletResult.error) return NextResponse.json({ error: "Unable to load receipt." }, { status: 500 });
  if (!walletResult.data) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });

  const transaction = walletResult.data as Record<string, unknown>;
  const pdf = buildBrandedPdf({
    title: "Wallet receipt",
    documentNumber: String(rowValue(transaction, "reference") ?? reference),
    status: String(rowValue(transaction, "status") ?? "COMPLETED"),
    issuedTo: access.profile.full_name ?? access.profile.email,
    currency: String(rowValue(transaction, "currency") ?? "NGN"),
    totalAmount: rowValue(transaction, "amount"),
    sections: [
      {
        title: "Wallet transaction",
        rows: [
          { label: "Reference", value: rowValue(transaction, "reference") },
          { label: "Type", value: rowValue(transaction, "transaction_type") },
          { label: "Status", value: rowValue(transaction, "status") },
          { label: "Created", value: rowValue(transaction, "created_at") },
          { label: "Description", value: rowValue(transaction, "description") },
          { label: "Provider", value: rowValue(transaction, "payment_provider") }
        ]
      }
    ],
    lineItems: [
      {
        description: String(rowValue(transaction, "description") ?? "Wallet transaction"),
        reference,
        amount: rowValue(transaction, "amount")
      }
    ],
    notes: ["This receipt confirms wallet activity in your Fly Logistics customer account."]
  });

  return pdfResponse(pdf, `Fly-Logistics-wallet-receipt-${reference}`);
}
