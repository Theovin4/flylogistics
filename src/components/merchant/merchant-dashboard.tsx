"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Route as NextRoute } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Headphones,
  Loader2,
  MapPin,
  PackagePlus,
  Plus,
  RefreshCw,
  Route,
  Save,
  ShieldCheck,
  Truck,
  Upload,
  Users,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AccountPasswordPanel } from "@/components/auth/account-password-panel";
import { flyError, flyInfo, flySuccess } from "@/components/feedback/fly-toast";
import { CustomerWalletPanel, type CustomerWalletView, type WalletFundingProvider, type WalletTransactionView } from "@/components/customer/customer-wallet-panel";
import { CryptoPaymentPanel, type CryptoPayment } from "@/components/payments/crypto-payment-panel";
import { AccountSupportCenter } from "@/components/support/account-support-center";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";
import { quoteDisplayAmount, quoteLifecycleTone, quoteStatusLabel } from "@/lib/quotes";
import type { QuoteRequestRecord, ShipmentRecord } from "@/lib/shipments";

export type MerchantSection = "overview" | "bulk" | "shipments" | "recipients" | "wallet" | "team" | "addresses" | "invoices" | "analytics" | "support" | "security";

type MerchantOverview = {
  profile: {
    id: string;
    email: string | null;
    full_name: string | null;
    company: string | null;
    phone?: string | null;
    role: string;
  };
  businessAccounts: BusinessAccount[];
  activeAccount: BusinessAccount | null;
  team: BusinessMember[];
  quoteRequests: QuoteRequestRecord[];
  shipments: ShipmentRecord[];
  recipients: MerchantRecipient[];
  addresses: MerchantAddress[];
  wallet: CustomerWalletView;
  walletTransactions: WalletTransactionView[];
  invoices: MerchantInvoice[];
  analytics: {
    activeShipments: number;
    completedShipments: number;
    monthlyDeliveries: Record<string, number>;
    spending: number;
    topDestinations: Array<[string, number]>;
    deliverySuccessRate: number;
    unpaidQuotes: number;
  };
  warnings?: string[];
};

type BusinessAccount = {
  id: number | string;
  account_name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  billing_email?: string | null;
  billing_terms?: string | null;
  credit_limit?: number | string | null;
  status?: string | null;
};

type BusinessMember = {
  id: number | string;
  role?: string | null;
  status?: string | null;
  profile?: {
    email?: string | null;
    full_name?: string | null;
    phone?: string | null;
    role?: string | null;
  } | null;
};

type MerchantAddress = {
  id: number | string;
  label: string;
  address_type: string;
  address: string;
  city?: string | null;
  notes?: string | null;
};

type MerchantRecipient = {
  id: number | string;
  name: string;
  phone: string;
  email?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  notes?: string | null;
};

type MerchantInvoice = {
  id: number | string;
  invoice_number: string;
  total_amount: number | string;
  currency?: string | null;
  status?: string | null;
  created_at?: string | null;
  due_at?: string | null;
};

type BulkRow = {
  customerName?: string;
  recipientName?: string;
  pickupPhone?: string;
  deliveryPhone?: string;
  pickupCountry?: string;
  destinationCountry?: string;
  pickupState?: string;
  destinationState?: string;
  pickupAddress: string;
  deliveryAddress: string;
  packageType: string;
  weightKg: string;
  urgency: "standard" | "priority" | "critical";
  deliveryCategory: "local_nigeria" | "international_import" | "international_export";
  notes?: string;
  businessReference?: string;
};

type PreviewRow = BulkRow & { rowNumber: number; errors: string[] };

type BulkPricePreview = {
  rowNumber: number;
  standardPrice: number;
  discountRate: number;
  discountAmount: number;
  finalPrice: number;
  etaLabel: string;
  serviceAvailable: boolean;
  warnings: string[];
};

const initialBusinessForm = {
  accountName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  billingEmail: "",
  billingTerms: "prepaid",
  creditLimit: "0",
  address: "",
  registrationNumber: "",
  website: ""
};

const initialAddressForm = {
  label: "",
  addressType: "delivery",
  address: "",
  city: "",
  notes: "",
  isDefault: false
};

const initialRecipientForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  country: "Nigeria",
  notes: ""
};

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 0,
  style: "currency"
});

const navItems: Array<{ section: MerchantSection; label: string; icon: LucideIcon }> = [
  { section: "overview", label: "Overview", icon: Building2 },
  { section: "bulk", label: "Bulk upload", icon: Upload },
  { section: "shipments", label: "Shipments", icon: Truck },
  { section: "recipients", label: "Recipients", icon: Route },
  { section: "wallet", label: "Wallet", icon: Wallet },
  { section: "team", label: "Team", icon: Users },
  { section: "addresses", label: "Addresses", icon: MapPin },
  { section: "invoices", label: "Invoices", icon: FileText },
  { section: "analytics", label: "Analytics", icon: BarChart3 },
  { section: "support", label: "Support", icon: Headphones },
  { section: "security", label: "Security", icon: ShieldCheck }
];

const sectionRoutes: Record<MerchantSection, string> = {
  overview: "/merchant/dashboard",
  bulk: "/merchant/shipments/bulk",
  shipments: "/merchant/shipments",
  recipients: "/merchant/recipients",
  wallet: "/merchant/wallet",
  team: "/merchant/team",
  addresses: "/merchant/settings#merchant-addresses",
  invoices: "/merchant/invoices",
  analytics: "/merchant/analytics",
  support: "/merchant/support",
  security: "/merchant/settings"
};

function sectionFromHash(hash: string): MerchantSection {
  const value = hash.replace("#merchant-", "");
  return navItems.some((item) => item.section === value) ? value as MerchantSection : "overview";
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function headerToField(header: string): keyof BulkRow | null {
  const aliases: Record<string, keyof BulkRow> = {
    customer_name: "customerName",
    sender_name: "customerName",
    recipient_name: "recipientName",
    receiver_name: "recipientName",
    pickup_phone: "pickupPhone",
    delivery_phone: "deliveryPhone",
    recipient_phone: "deliveryPhone",
    pickup_country: "pickupCountry",
    destination_country: "destinationCountry",
    pickup_state: "pickupState",
    destination_state: "destinationState",
    delivery_state: "destinationState",
    pickup_address: "pickupAddress",
    delivery_address: "deliveryAddress",
    destination_address: "deliveryAddress",
    package_type: "packageType",
    weight_kg: "weightKg",
    weight: "weightKg",
    urgency: "urgency",
    delivery_category: "deliveryCategory",
    delivery_type: "deliveryCategory",
    notes: "notes",
    business_reference: "businessReference",
    reference: "businessReference"
  };
  return aliases[normalizeHeader(header)] ?? null;
}

function validateBulkRow(row: BulkRow, rowNumber: number): PreviewRow {
  const errors = [
    row.customerName ? null : "Sender name is required",
    row.recipientName ? null : "Recipient name is required",
    row.pickupPhone && row.pickupPhone.replace(/\D/g, "").length >= 10 ? null : "Sender phone is required",
    row.deliveryPhone && row.deliveryPhone.replace(/\D/g, "").length >= 10 ? null : "Recipient phone is required",
    row.pickupState ? null : "Pickup state is required",
    row.destinationState ? null : "Destination state is required",
    row.pickupAddress ? null : "Pickup address is required",
    row.deliveryAddress ? null : "Delivery address is required",
    row.packageType ? null : "Package type is required",
    Number(row.weightKg) > 0 ? null : "Weight must be above 0",
    row.deliveryCategory !== "international_import" || row.pickupCountry ? null : "Origin country is required",
    row.deliveryCategory !== "international_export" || row.destinationCountry ? null : "Destination country is required"
  ].filter(Boolean) as string[];
  return { ...row, rowNumber, errors };
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(headerToField);
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row: BulkRow = {
      pickupAddress: "",
      deliveryAddress: "",
      packageType: "",
      weightKg: "1",
      urgency: "standard",
      deliveryCategory: "local_nigeria"
    };
    headers.forEach((field, fieldIndex) => {
      if (!field) return;
      const value = values[fieldIndex]?.trim();
      if (!value) return;
      if (field === "urgency") {
        row.urgency = ["priority", "critical"].includes(value.toLowerCase()) ? value.toLowerCase() as BulkRow["urgency"] : "standard";
      } else if (field === "deliveryCategory") {
        const normalized = value.toLowerCase().replace(/[^a-z]+/g, "_");
        row.deliveryCategory = normalized.includes("import")
          ? "international_import"
          : normalized.includes("export")
            ? "international_export"
            : "local_nigeria";
      } else {
        row[field] = value as never;
      }
    });
    return validateBulkRow(row, index + 2);
  });
}

function statusClass(status?: string | null) {
  const normalized = String(status ?? "").toUpperCase();
  if (["PAID", "DELIVERED", "COMPLETED", "ISSUED"].includes(normalized)) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (["FAILED", "CANCELLED", "DECLINED"].includes(normalized)) return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-primary/40 bg-primary/10 text-primary";
}

export function MerchantDashboard({ initialSection = "overview" }: { initialSection?: MerchantSection }) {
  const [overview, setOverview] = useState<MerchantOverview | null>(null);
  const [activeSection, setActiveSection] = useState<MerchantSection>(initialSection);
  const [businessForm, setBusinessForm] = useState(initialBusinessForm);
  const [addressForm, setAddressForm] = useState(initialAddressForm);
  const [recipientForm, setRecipientForm] = useState(initialRecipientForm);
  const [teamEmail, setTeamEmail] = useState("");
  const [teamRole, setTeamRole] = useState("member");
  const [csvRows, setCsvRows] = useState<PreviewRow[]>([]);
  const [bulkPricePreviews, setBulkPricePreviews] = useState<BulkPricePreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shipmentCryptoPayment, setShipmentCryptoPayment] = useState<CryptoPayment | null>(null);
  const [shipmentCryptoNetwork, setShipmentCryptoNetwork] = useState<"TRC20" | "BEP20" | "SOL" | "BTC">("TRC20");

  const accountId = overview?.activeAccount?.id;
  const unpaidQuotes = useMemo(
    () => (overview?.quoteRequests ?? []).filter((quote) => String(quote.payment_status ?? "UNPAID").toUpperCase() !== "PAID"),
    [overview?.quoteRequests]
  );
  const validRows = useMemo(() => csvRows.filter((row) => row.errors.length === 0), [csvRows]);
  const bulkPreviewTotals = useMemo(() => bulkPricePreviews.reduce((total, item) => ({
    standardPrice: total.standardPrice + item.standardPrice,
    discountAmount: total.discountAmount + item.discountAmount,
    finalPrice: total.finalPrice + item.finalPrice
  }), { standardPrice: 0, discountAmount: 0, finalPrice: 0 }), [bulkPricePreviews]);
  const bulkPreviewByCsvRow = useMemo(() => new Map(
    validRows.map((row, index) => [row.rowNumber, bulkPricePreviews[index]])
  ), [bulkPricePreviews, validRows]);

  const authHeaders = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const authorizedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const auth = await authHeaders();
    Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
    return fetch(input, { ...init, headers });
  }, [authHeaders]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authorizedFetch("/api/merchant/overview");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load merchant platform.");
      setOverview(data);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to load merchant platform.";
      setError(nextError);
      flyError("Merchant platform unavailable", nextError);
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const syncHash = () => setActiveSection(window.location.hash ? sectionFromHash(window.location.hash) : initialSection);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [initialSection]);

  async function postMerchant(body: Record<string, unknown>, success: string) {
    setBusy(String(body.action ?? "merchant"));
    setError(null);
    setMessage(null);
    try {
      const response = await authorizedFetch("/api/merchant/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Merchant action failed.");
      setMessage(success);
      flySuccess(success);
      await loadOverview();
      return data;
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Merchant action failed.";
      setError(nextError);
      flyError("Merchant action failed", nextError);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = await postMerchant({
      action: "create_business_account",
      ...businessForm,
      creditLimit: Number(businessForm.creditLimit || 0)
    }, "Business account created.");
    if (data) setBusinessForm(initialBusinessForm);
  }

  async function addTeamMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId) return;
    const data = await postMerchant({ action: "add_team_member", accountId, email: teamEmail, role: teamRole }, "Team member added.");
    if (data) {
      setTeamEmail("");
      setTeamRole("member");
    }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = await postMerchant({ action: "save_address", accountId, ...addressForm }, "Business address saved.");
    if (data) setAddressForm(initialAddressForm);
  }

  async function saveRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId) return;
    const data = await postMerchant({ action: "save_recipient", accountId, ...recipientForm }, "Recipient saved.");
    if (data) setRecipientForm(initialRecipientForm);
  }

  async function handleCsvFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    setCsvRows(parsed);
    setBulkPricePreviews([]);
    if (parsed.length) flyInfo("CSV ready for review", `${parsed.length} shipment rows loaded.`);
  }

  function bulkPayloadRows() {
    return validRows.map((row) => ({
      businessReference: row.businessReference,
      customerName: row.customerName,
      deliveryAddress: row.deliveryAddress,
      deliveryCategory: row.deliveryCategory,
      deliveryPhone: row.deliveryPhone,
      destinationCountry: row.destinationCountry,
      destinationState: row.destinationState,
      notes: row.notes,
      packageType: row.packageType,
      pickupAddress: row.pickupAddress,
      pickupCountry: row.pickupCountry,
      pickupPhone: row.pickupPhone,
      pickupState: row.pickupState,
      recipientName: row.recipientName,
      urgency: row.urgency,
      weightKg: Number(row.weightKg)
    }));
  }

  async function previewBulkQuotes() {
    if (!accountId || validRows.length === 0) return;
    setBusy("preview_bulk_quotes");
    setError(null);
    try {
      const response = await authorizedFetch("/api/merchant/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview_bulk_quotes", accountId, rows: bulkPayloadRows() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to preview merchant prices.");
      setBulkPricePreviews(data.previews ?? []);
      flySuccess("Business prices ready", "Review the standard price, 5% saving, and final total before confirming.");
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to preview merchant prices.";
      setError(nextError);
      flyError("Unable to preview prices", nextError);
    } finally {
      setBusy(null);
    }
  }

  async function createBulkQuotes() {
    if (!accountId || validRows.length === 0) return;
    const rows = bulkPayloadRows();
    const data = await postMerchant({ action: "bulk_create_quotes", accountId, rows }, `${rows.length} shipment quote${rows.length === 1 ? "" : "s"} created.`);
    if (data) {
      setCsvRows([]);
      setBulkPricePreviews([]);
    }
  }

  async function fundWallet(amount: number, paymentProvider: WalletFundingProvider = "flutterwave", network = "TRC20") {
    setBusy("fund_wallet");
    try {
      const response = await authorizedFetch(paymentProvider === "crypto" ? "/api/payments/crypto/checkout" : "/api/customer/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentProvider === "crypto" ? { walletAmount: amount, network } : { amount, paymentProvider })
      });
      const data = await response.json();
      if (paymentProvider === "crypto") {
        if (!response.ok || !data.payment) throw new Error(data.error ?? "Unable to prepare crypto wallet funding.");
        flyInfo("Crypto wallet funding prepared", "Send the exact amount and submit the transaction hash for review.");
        return data.payment;
      }
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error ?? "Unable to start wallet funding.");
      flyInfo("Opening wallet funding checkout", "Your Fly Logistics wallet funding page is loading.");
      window.location.assign(data.checkoutUrl);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to start wallet funding.";
      setError(nextError);
      flyError("Unable to fund wallet", nextError);
    } finally {
      setBusy(null);
    }
  }

  async function payUnpaidQuotes(method: "wallet" | "flutterwave" | "crypto") {
    const requestIds = unpaidQuotes.map((quote) => quote.request_id);
    if (requestIds.length === 0) return;
    setBusy(`pay_${method}`);
    try {
      const response = await authorizedFetch(method === "wallet" ? "/api/customer/wallet/pay" : method === "crypto" ? "/api/payments/crypto/checkout" : "/api/payments/flutterwave/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "crypto" ? { requestIds, network: shipmentCryptoNetwork } : { requestIds })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to start payment.");
      if (method === "crypto") {
        if (!data.payment) throw new Error("Crypto payment instructions were not returned.");
        setShipmentCryptoPayment(data.payment);
        flyInfo("Crypto payment prepared", "Send the exact amount and submit the transaction hash for verification.");
      } else if (method === "flutterwave") {
        if (!data.checkoutUrl) throw new Error("Checkout link was not returned.");
        window.location.assign(data.checkoutUrl);
      } else {
        flySuccess("Wallet payment complete", `${data.shipments?.length ?? requestIds.length} shipment booking${requestIds.length === 1 ? "" : "s"} processed.`);
        await loadOverview();
      }
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to start payment.";
      setError(nextError);
      flyError("Payment failed", nextError);
    } finally {
      setBusy(null);
    }
  }

  async function generateInvoice() {
    if (!accountId) return;
    await postMerchant({ action: "generate_invoice", accountId, requestIds: unpaidQuotes.map((quote) => quote.request_id) }, "Business invoice generated.");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-7xl rounded-md border bg-background/60 p-6 text-sm text-muted-foreground">
          Loading merchant platform...
        </div>
      </main>
    );
  }

  const stats = overview?.analytics;
  const statCards: Array<{ label: string; value: string | number; icon: LucideIcon }> = [
    { label: "Active shipments", value: stats?.activeShipments ?? 0, icon: Truck },
    { label: "Completed", value: stats?.completedShipments ?? 0, icon: CheckCircle2 },
    { label: "Business spend", value: moneyFormatter.format(stats?.spending ?? 0), icon: CreditCard },
    { label: "Success rate", value: `${stats?.deliverySuccessRate ?? 0}%`, icon: BarChart3 }
  ];

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border/60 bg-black text-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_auto] lg:px-8">
          <div>
            <Badge className="border-primary/40 bg-primary/20 text-primary">Merchant Platform</Badge>
            <h1 className="mt-4 text-3xl font-black sm:text-5xl">Business logistics command center</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              Manage company shipments, wallet payments, team members, invoices, saved addresses, and delivery analytics from one Fly Logistics workspace.
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-primary">Active business</p>
            <p className="mt-3 text-xl font-black">{overview?.activeAccount?.account_name ?? "Create business account"}</p>
            <p className="mt-1 text-sm text-white/60">{overview?.profile.email}</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <nav className="mb-6 flex gap-2 overflow-x-auto rounded-md border bg-background/70 p-2">
          {navItems.map((item) => (
            <Link
              key={item.section}
              href={sectionRoutes[item.section] as NextRoute}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${activeSection === item.section ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        {message && <div className="mb-4 flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500"><CheckCircle2 className="size-4" />{message}</div>}
        {error && <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {overview?.warnings?.map((warning) => (
          <div key={warning} className="mb-4 flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">
            <AlertTriangle className="size-4" />
            {warning}
          </div>
        ))}

        <section className={`grid gap-4 ${activeSection === "overview" ? "" : "hidden"}`}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {statCards.map(({ label, value, icon: Icon }) => (
              <Card key={String(label)} className="glass">
                <CardContent className="p-4">
                  <Icon className="size-5 text-primary" />
                  <p className="mt-4 text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-black">{String(value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="size-5 text-primary" />Business account</CardTitle>
            </CardHeader>
            <CardContent>
              {overview?.activeAccount ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    ["Company", overview.activeAccount.account_name],
                    ["Contact", overview.activeAccount.contact_name ?? overview.activeAccount.contact_email ?? "Not set"],
                    ["Billing terms", overview.activeAccount.billing_terms ?? "prepaid"]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border bg-background/35 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                      <p className="mt-2 font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <form className="grid gap-4 md:grid-cols-2" onSubmit={createBusiness}>
                  <div className="grid gap-2">
                    <Label>Company name</Label>
                    <Input value={businessForm.accountName} onChange={(event) => setBusinessForm((current) => ({ ...current, accountName: event.target.value }))} required />
                  </div>
                  <div className="grid gap-2">
                    <Label>Contact name</Label>
                    <Input value={businessForm.contactName} onChange={(event) => setBusinessForm((current) => ({ ...current, contactName: event.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Contact email</Label>
                    <Input type="email" value={businessForm.contactEmail} onChange={(event) => setBusinessForm((current) => ({ ...current, contactEmail: event.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Contact phone</Label>
                    <Input value={businessForm.contactPhone} onChange={(event) => setBusinessForm((current) => ({ ...current, contactPhone: event.target.value }))} />
                  </div>
                  <Button disabled={busy === "create_business_account"} className="md:col-span-2">
                    {busy === "create_business_account" ? <Loader2 className="animate-spin" /> : <Plus />}
                    Create business account
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </section>

        <section className={`grid gap-4 ${activeSection === "bulk" ? "" : "hidden"}`}>
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Upload className="size-5 text-primary" />Bulk shipment upload</CardTitle>
              <p className="text-sm text-muted-foreground">
                Upload a CSV with headers like pickup_address, delivery_address, package_type, weight_kg, delivery_phone, urgency, delivery_category, pickup_state, destination_state.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Input type="file" accept=".csv,text/csv" onChange={(event) => void handleCsvFile(event.target.files?.[0] ?? null)} disabled={!overview?.activeAccount} />
              {!overview?.activeAccount && <p className="text-sm text-muted-foreground">Create a business account before uploading bulk shipments.</p>}
              {csvRows.length > 0 && (
                <div className="grid gap-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">{validRows.length} valid of {csvRows.length} rows</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button variant="outline" onClick={() => void previewBulkQuotes()} disabled={!accountId || validRows.length === 0 || Boolean(busy)}>
                        {busy === "preview_bulk_quotes" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                        Preview delivery prices
                      </Button>
                      <Button onClick={() => void createBulkQuotes()} disabled={!accountId || validRows.length === 0 || bulkPricePreviews.length !== validRows.length || Boolean(busy)}>
                        {busy === "bulk_create_quotes" ? <Loader2 className="animate-spin" /> : <PackagePlus />}
                        Confirm shipment quotes
                      </Button>
                    </div>
                  </div>
                  {bulkPricePreviews.length === validRows.length ? (
                    <div className="grid gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm sm:grid-cols-3">
                      <span>Standard total <strong className="block text-foreground">{moneyFormatter.format(bulkPreviewTotals.standardPrice)}</strong></span>
                      <span className="text-emerald-500">Merchant savings (5%) <strong className="block">-{moneyFormatter.format(bulkPreviewTotals.discountAmount)}</strong></span>
                      <span>Final total <strong className="block text-foreground">{moneyFormatter.format(bulkPreviewTotals.finalPrice)}</strong></span>
                    </div>
                  ) : null}
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead className="bg-muted/40 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        <tr>
                          <th className="p-3">Row</th>
                          <th className="p-3">Pickup</th>
                          <th className="p-3">Delivery</th>
                          <th className="p-3">Package</th>
                          <th className="p-3">Weight</th>
                          <th className="p-3">Business price</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 25).map((row) => (
                          <tr key={row.rowNumber} className="border-t">
                            <td className="p-3">{row.rowNumber}</td>
                            <td className="p-3">{row.pickupAddress}</td>
                            <td className="p-3">{row.deliveryAddress}</td>
                            <td className="p-3">{row.packageType}</td>
                            <td className="p-3">{row.weightKg}kg</td>
                            <td className="p-3">
                              {bulkPreviewByCsvRow.get(row.rowNumber) ? (
                                <span className="grid gap-1">
                                  <span className="text-xs text-muted-foreground line-through">{moneyFormatter.format(bulkPreviewByCsvRow.get(row.rowNumber)!.standardPrice)}</span>
                                  <strong>{moneyFormatter.format(bulkPreviewByCsvRow.get(row.rowNumber)!.finalPrice)}</strong>
                                  <span className="text-xs text-emerald-500">Save {moneyFormatter.format(bulkPreviewByCsvRow.get(row.rowNumber)!.discountAmount)}</span>
                                </span>
                              ) : <span className="text-muted-foreground">Preview required</span>}
                            </td>
                            <td className="p-3">
                              {row.errors.length ? <Badge className="border-destructive/40 bg-destructive/10 text-destructive">{row.errors.join(", ")}</Badge> : <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Ready</Badge>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className={`grid gap-4 ${activeSection === "shipments" ? "" : "hidden"}`}>
          <div className="grid gap-4 lg:grid-cols-2">
            {(overview?.shipments ?? []).map((shipment) => (
              <Card key={shipment.tracking_id} className="glass">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="font-mono text-lg">{shipment.tracking_id}</CardTitle>
                    <Badge className={statusClass(shipment.status)}>{String(shipment.status).replaceAll("_", " ")}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm text-muted-foreground">
                  <p>{shipment.pickup_address} to {shipment.delivery_address}</p>
                  <p>{shipment.package_type} • {shipment.eta ?? "ETA pending"}</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button asChild variant="outline">
                      <Link href={`/tracking?trackingId=${encodeURIComponent(shipment.tracking_id)}`}>Track shipment</Link>
                    </Button>
                    {String(shipment.payment_status ?? "").toUpperCase() === "PAID" ? (
                      <Button asChild variant="outline">
                        <a href={`/api/customer/receipts/${encodeURIComponent(shipment.payment_reference ?? shipment.tracking_id)}/pdf`} target="_blank" rel="noreferrer">
                          <Download />
                          Receipt
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(overview?.shipments ?? []).length === 0 && <div className="rounded-md border p-4 text-sm text-muted-foreground">No business shipments yet. Bulk-created paid quotes will become shipments after payment and operations conversion.</div>}
          </div>
          <Card className="glass">
            <CardHeader>
              <CardTitle>Shipment quote queue</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {unpaidQuotes.length > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => void payUnpaidQuotes("wallet")} disabled={busy === "pay_wallet"}>
                    {busy === "pay_wallet" ? <Loader2 className="animate-spin" /> : <Wallet />}
                    Pay queue with wallet
                  </Button>
                  <Button variant="outline" onClick={() => void payUnpaidQuotes("flutterwave")} disabled={busy === "pay_flutterwave"}>
                    {busy === "pay_flutterwave" ? <Loader2 className="animate-spin" /> : <CreditCard />}
                    Pay queue with Flutterwave
                  </Button>
                  <select aria-label="Business shipment crypto network" value={shipmentCryptoNetwork} onChange={(event) => setShipmentCryptoNetwork(event.target.value as typeof shipmentCryptoNetwork)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="TRC20">USDT TRC20</option><option value="BEP20">USDT BEP20</option><option value="SOL">USDT Solana</option><option value="BTC">Bitcoin</option></select>
                  <Button variant="outline" onClick={() => void payUnpaidQuotes("crypto")} disabled={busy === "pay_crypto"}>
                    {busy === "pay_crypto" ? <Loader2 className="animate-spin" /> : <CreditCard />}
                    Pay queue with crypto
                  </Button>
                </div>
              )}
              {shipmentCryptoPayment && <CryptoPaymentPanel payment={shipmentCryptoPayment} authorizedFetch={authorizedFetch} onSubmitted={() => void loadOverview()} />}
              {(overview?.quoteRequests ?? []).slice(0, 20).map((quote) => (
                <div key={quote.request_id} className="flex flex-col gap-3 rounded-md border bg-background/35 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="block font-mono font-semibold">{quote.request_id}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{quote.pickup_address} to {quote.delivery_address}</span>
                    {Number(quote.discount_amount ?? 0) > 0 ? (
                      <span className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                        <span>Standard {moneyFormatter.format(Number(quote.standard_price ?? quoteDisplayAmount(quote)))}</span>
                        <span className="text-emerald-500">Business saving -{moneyFormatter.format(Number(quote.discount_amount ?? 0))}</span>
                        <span className="font-semibold text-foreground">Final {moneyFormatter.format(Number(quote.final_price ?? quoteDisplayAmount(quote)))}</span>
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge className={quoteLifecycleTone(quote.status)}>{quoteStatusLabel(quote.status)}</Badge>
                    <Badge className={statusClass(quote.payment_status)}>{quote.payment_status ?? "UNPAID"}</Badge>
                    <span className="font-mono font-semibold">{moneyFormatter.format(quoteDisplayAmount(quote))}</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className={`grid gap-4 lg:grid-cols-[0.85fr_1.15fr] ${activeSection === "recipients" ? "" : "hidden"}`}>
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Route className="size-5 text-primary" />Save recipient</CardTitle>
              <p className="text-sm text-muted-foreground">Keep frequently used delivery contacts ready for future shipment batches.</p>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={saveRecipient}>
                <Input value={recipientForm.name} onChange={(event) => setRecipientForm((current) => ({ ...current, name: event.target.value }))} placeholder="Recipient name" required />
                <Input type="tel" inputMode="tel" value={recipientForm.phone} onChange={(event) => setRecipientForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone number" required />
                <Input type="email" inputMode="email" value={recipientForm.email} onChange={(event) => setRecipientForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email (optional)" />
                <Input value={recipientForm.address} onChange={(event) => setRecipientForm((current) => ({ ...current, address: event.target.value }))} placeholder="Full delivery address" required />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input value={recipientForm.city} onChange={(event) => setRecipientForm((current) => ({ ...current, city: event.target.value }))} placeholder="City / LGA" required />
                  <Input value={recipientForm.state} onChange={(event) => setRecipientForm((current) => ({ ...current, state: event.target.value }))} placeholder="State" required />
                </div>
                <Input value={recipientForm.country} onChange={(event) => setRecipientForm((current) => ({ ...current, country: event.target.value }))} placeholder="Country" required />
                <Button disabled={!accountId || busy === "save_recipient"}>
                  {busy === "save_recipient" ? <Loader2 className="animate-spin" /> : <Save />}
                  Save recipient
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader><CardTitle>Saved recipients</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {(overview?.recipients ?? []).map((recipient) => (
                <div key={recipient.id} className="rounded-md border bg-background/35 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span>
                      <span className="block font-semibold">{recipient.name}</span>
                      <span className="text-sm text-muted-foreground">{recipient.phone}{recipient.email ? ` · ${recipient.email}` : ""}</span>
                    </span>
                    <Badge>{recipient.country ?? "Nigeria"}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{recipient.address}{recipient.city ? `, ${recipient.city}` : ""}{recipient.state ? `, ${recipient.state}` : ""}</p>
                </div>
              ))}
              {(overview?.recipients ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No recipients saved yet.</p> : null}
            </CardContent>
          </Card>
        </section>

        <section className={activeSection === "wallet" ? "" : "hidden"}>
          <CustomerWalletPanel wallet={overview?.wallet ?? null} transactions={overview?.walletTransactions ?? []} onFundWallet={fundWallet} authorizedFetch={authorizedFetch} />
        </section>

        <section className={`grid gap-4 lg:grid-cols-[0.8fr_1.2fr] ${activeSection === "team" ? "" : "hidden"}`}>
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="size-5 text-primary" />Add team member</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={addTeamMember}>
                <Input type="email" value={teamEmail} onChange={(event) => setTeamEmail(event.target.value)} placeholder="teammate@company.com" required />
                <select value={teamRole} onChange={(event) => setTeamRole(event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                  <option value="member">Member</option>
                  <option value="operations">Operations</option>
                  <option value="finance">Finance</option>
                  <option value="admin">Business admin</option>
                </select>
                <Button disabled={!accountId || busy === "add_team_member"}>
                  {busy === "add_team_member" ? <Loader2 className="animate-spin" /> : <Plus />}
                  Add member
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader><CardTitle>Team members</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {(overview?.team ?? []).map((member) => (
                <div key={member.id} className="flex flex-col gap-2 rounded-md border bg-background/35 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="block font-semibold">{member.profile?.full_name ?? member.profile?.email ?? "Team member"}</span>
                    <span className="text-sm text-muted-foreground">{member.profile?.email}</span>
                  </span>
                  <Badge>{member.role ?? "member"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className={`grid gap-4 lg:grid-cols-[0.8fr_1.2fr] ${activeSection === "addresses" ? "" : "hidden"}`}>
          <Card className="glass">
            <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="size-5 text-primary" />Save address</CardTitle></CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={saveAddress}>
                <Input value={addressForm.label} onChange={(event) => setAddressForm((current) => ({ ...current, label: event.target.value }))} placeholder="Warehouse, office, hub..." required />
                <Input value={addressForm.address} onChange={(event) => setAddressForm((current) => ({ ...current, address: event.target.value }))} placeholder="Full address" required />
                <Input value={addressForm.city} onChange={(event) => setAddressForm((current) => ({ ...current, city: event.target.value }))} placeholder="City / area" />
                <Button disabled={busy === "save_address"}>
                  {busy === "save_address" ? <Loader2 className="animate-spin" /> : <Save />}
                  Save address
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader><CardTitle>Saved addresses</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {(overview?.addresses ?? []).map((address) => (
                <div key={address.id} className="rounded-md border bg-background/35 p-3">
                  <p className="font-semibold">{address.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{address.address}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className={`grid gap-4 ${activeSection === "invoices" ? "" : "hidden"}`}>
          <Card className="glass">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><FileText className="size-5 text-primary" />Invoices</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Create and download branded invoices.</p>
                </div>
                <Button onClick={() => void generateInvoice()} disabled={!accountId || unpaidQuotes.length === 0 || busy === "generate_invoice"}>
                  {busy === "generate_invoice" ? <Loader2 className="animate-spin" /> : <Plus />}
                  Generate invoice
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              {(overview?.invoices ?? []).map((invoice) => (
                <div key={invoice.invoice_number} className="flex flex-col gap-3 rounded-md border bg-background/35 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="block font-mono font-semibold">{invoice.invoice_number}</span>
                    <span className="text-sm text-muted-foreground">{invoice.created_at ? new Date(invoice.created_at).toLocaleString() : "Recently generated"}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge className={statusClass(invoice.status)}>{invoice.status ?? "ISSUED"}</Badge>
                    <span className="font-mono font-semibold">{moneyFormatter.format(Number(invoice.total_amount ?? 0))}</span>
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/merchant/invoices/${encodeURIComponent(invoice.invoice_number)}/pdf`} target="_blank" rel="noreferrer">
                        <Download />
                        PDF
                      </a>
                    </Button>
                  </span>
                </div>
              ))}
              {(overview?.invoices ?? []).length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
            </CardContent>
          </Card>
        </section>

        <section className={`grid gap-4 lg:grid-cols-2 ${activeSection === "analytics" ? "" : "hidden"}`}>
          <Card className="glass">
            <CardHeader><CardTitle>Monthly deliveries</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {Object.entries(stats?.monthlyDeliveries ?? {}).map(([month, count]) => (
                <div key={month} className="flex items-center justify-between rounded-md border bg-background/35 p-3">
                  <span>{month}</span>
                  <Badge>{count} deliveries</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader><CardTitle>Top destinations</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {(stats?.topDestinations ?? []).map(([destination, count]) => (
                <div key={destination} className="flex items-center justify-between rounded-md border bg-background/35 p-3">
                  <span className="truncate">{destination}</span>
                  <Badge>{count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className={activeSection === "support" ? "" : "hidden"}>
          <AccountSupportCenter accountLabel="merchant" businessAccountId={accountId} portal="merchant" />
        </section>

        <section className={`grid gap-4 ${activeSection === "security" ? "" : "hidden"}`}>
          <AccountPasswordPanel
            title="Business account security"
            description="Change the password for your signed-in merchant account. Team, wallet, invoice, and shipment records remain linked to this business profile."
            successTitle="Merchant password updated"
            successDescription="Use your new merchant password the next time you sign in."
          />
        </section>

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={() => void loadOverview()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh merchant data
          </Button>
        </div>
      </div>
    </main>
  );
}
