import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { buildBrandedPdf, pdfResponse } from "@/server/documents/branded-pdf";
import { requireCompanyRole } from "@/server/tenancy";

export const dynamic = "force-dynamic";

function normalizeReference(reference: string) {
  return decodeURIComponent(reference).trim();
}

function value(row: Record<string, unknown> | null | undefined, key: string) {
  return row?.[key] ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const access = await requireCompanyRole(request, ["owner", "admin"]);
  if (!access.profile || !access.tenant) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Cloud receipt download is temporarily unavailable." }, { status: 503 });

  const { reference: rawReference } = await params;
  const reference = normalizeReference(rawReference);
  const subscription = await supabase
    .from("subscriptions")
    .select("*")
    .eq("company_id", access.tenant.companyId)
    .eq("payment_reference", reference)
    .maybeSingle();

  if (subscription.error) return NextResponse.json({ error: "Unable to load Cloud billing receipt." }, { status: 500 });
  if (!subscription.data) return NextResponse.json({ error: "Cloud billing receipt not found." }, { status: 404 });

  const row = subscription.data as Record<string, unknown>;
  const company = access.tenant.company;
  const pdf = buildBrandedPdf({
    title: "Cloud subscription receipt",
    documentNumber: String(value(row, "payment_reference") ?? reference),
    status: String(value(row, "status") ?? "active"),
    brandName: company?.name ?? "Fly Logistics Cloud",
    brandSubtitle: "Fly Logistics Cloud",
    brandColor: company?.brand_color ?? "#ff7a00",
    tenantLogoUrl: company?.logo_url ?? null,
    issuedTo: company?.name ?? access.profile.email ?? "Company workspace",
    currency: String(value(row, "currency") ?? company?.billing_currency ?? "NGN"),
    locale: company?.locale,
    timezone: company?.timezone,
    issuedAt: String(value(row, "updated_at") ?? value(row, "created_at") ?? ""),
    totalAmount: value(row, "amount") ?? company?.billing_amount,
    sections: [
      {
        title: "Subscription",
        rows: [
          { label: "Company", value: company?.name },
          { label: "Plan", value: value(row, "plan") },
          { label: "Status", value: value(row, "status") },
          { label: "Payment reference", value: value(row, "payment_reference") },
          { label: "Started", value: value(row, "started_at") ?? value(row, "created_at") },
          { label: "Next renewal", value: value(row, "renewal_date") }
        ]
      }
    ],
    lineItems: [
      {
        description: `${String(value(row, "plan") ?? "Cloud")} monthly subscription`,
        reference,
        amount: value(row, "amount") ?? company?.billing_amount
      }
    ],
    notes: [
      "This receipt confirms Fly Logistics Cloud billing for this company workspace.",
      "Tenant logos and brand colors are applied in Cloud workspaces where configured."
    ]
  });

  return pdfResponse(pdf, `Fly-Logistics-Cloud-receipt-${reference}`);
}
