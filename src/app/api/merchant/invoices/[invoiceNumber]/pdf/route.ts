import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { buildBrandedPdf, pdfResponse } from "@/server/documents/branded-pdf";

export const dynamic = "force-dynamic";

function isMissingSchema(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "42703" || String(error?.code ?? "").startsWith("PGRST") || message.includes("could not find");
}

function buildPdf(invoice: Record<string, unknown>, account: Record<string, unknown> | null) {
  const metadata = (invoice.metadata && typeof invoice.metadata === "object" ? invoice.metadata : {}) as { line_items?: Array<Record<string, unknown>> };
  return buildBrandedPdf({
    title: "Business invoice",
    documentNumber: String(invoice.invoice_number ?? "Invoice"),
    status: String(invoice.status ?? "ISSUED"),
    issuedTo: String(account?.account_name ?? "Business account"),
    currency: String(invoice.currency ?? "NGN"),
    totalAmount: invoice.total_amount,
    sections: [
      {
        title: "Invoice details",
        rows: [
          { label: "Invoice number", value: invoice.invoice_number },
          { label: "Business", value: account?.account_name ?? "Business account" },
          { label: "Billing email", value: account?.billing_email ?? account?.contact_email ?? "Not set" },
          { label: "Created", value: invoice.created_at ?? new Date().toISOString() },
          { label: "Terms", value: account?.billing_terms ?? "Due on receipt" },
          { label: "Status", value: invoice.status ?? "ISSUED" }
        ]
      }
    ],
    lineItems: (metadata.line_items ?? []).map((item) => ({
      description: String(item.package_type ?? "Shipment quote"),
      reference: String(item.request_id ?? "Request"),
      amount: item.amount
    })),
    notes: [
      "This invoice was generated from Fly Logistics merchant shipment quote activity.",
      "Please use the invoice number as your payment reference when contacting support."
    ]
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ invoiceNumber: string }> }) {
  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const { invoiceNumber } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Invoice download is temporarily unavailable." }, { status: 503 });

  const invoiceResult = await supabase
    .from("business_invoices")
    .select("*")
    .eq("invoice_number", invoiceNumber.toUpperCase())
    .maybeSingle();

  if (invoiceResult.error) {
    return NextResponse.json({ error: isMissingSchema(invoiceResult.error) ? "Invoice storage is not installed yet." : "Unable to load invoice." }, { status: isMissingSchema(invoiceResult.error) ? 503 : 500 });
  }
  if (!invoiceResult.data) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const invoice = invoiceResult.data as Record<string, unknown>;
  if (access.profile.role !== "admin") {
    const member = await supabase
      .from("business_account_members")
      .select("id")
      .eq("business_account_id", invoice.business_account_id)
      .eq("user_id", access.profile.id)
      .eq("status", "active")
      .maybeSingle();
    if (member.error || !member.data) return NextResponse.json({ error: "You do not have access to this invoice." }, { status: 403 });
  }

  const accountResult = await supabase
    .from("business_accounts")
    .select("*")
    .eq("id", invoice.business_account_id)
    .maybeSingle();
  const pdf = buildPdf(invoice, (accountResult.data as Record<string, unknown> | null) ?? null);

  return pdfResponse(pdf, invoiceNumber.toUpperCase());
}
