"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Building2,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Fuel,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  TicketCheck,
  Wrench,
  Warehouse
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EnterpriseMetrics = {
  businessAccounts: number;
  codOutstanding: number;
  codPending: number;
  kycPending: number;
  supportOpen: number;
  warehouses: number;
  inventoryItems?: number;
  lowStockItems?: number;
  maintenanceOpen?: number;
  fuelSpend?: number;
};

type BusinessAccount = {
  id: number | string;
  account_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  billing_terms?: string | null;
  credit_limit?: number | string | null;
  status?: string | null;
  created_at?: string | null;
};

type CodShipment = {
  id: number | string;
  tracking_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  cod_amount?: number | string | null;
  cod_status?: string | null;
  cod_remittance_reference?: string | null;
  status?: string | null;
  driver_id?: number | string | null;
  created_at?: string | null;
};

type KycSubmission = {
  id: number | string;
  driver_id?: number | string | null;
  id_document_url?: string | null;
  license_url?: string | null;
  vehicle_type?: string | null;
  vehicle_plate_number?: string | null;
  vehicle_model?: string | null;
  status?: string | null;
  review_notes?: string | null;
  created_at?: string | null;
  driver?: {
    id?: number | string | null;
    name?: string | null;
    phone?: string | null;
    status?: string | null;
    approval_status?: string | null;
  } | null;
};

type SupportTicket = {
  id?: number | string;
  ticket_id?: string | null;
  tracking_id?: string | null;
  subject?: string | null;
  priority?: string | null;
  status?: string | null;
  message?: string | null;
  admin_reply?: string | null;
  ticket_type?: string | null;
  dispute_category?: string | null;
  refund_amount?: number | string | null;
  resolution_status?: string | null;
  unread_admin_count?: number | string | null;
  unread_customer_count?: number | string | null;
  last_message_at?: string | null;
  created_at?: string | null;
};

type SupportMessage = {
  id: number | string;
  ticket_id: string;
  sender_role?: string | null;
  sender_name?: string | null;
  message: string;
  attachment_url?: string | null;
  read_at?: string | null;
  created_at?: string | null;
};

type WarehouseRecord = {
  id: number | string;
  code?: string | null;
  name?: string | null;
  state_code?: string | null;
  address?: string | null;
  manager_name?: string | null;
  manager_phone?: string | null;
  capacity_notes?: string | null;
  status?: string | null;
};

type InventoryItem = {
  id: number | string;
  warehouse_id?: number | string | null;
  sku?: string | null;
  item_name?: string | null;
  quantity_on_hand?: number | string | null;
  reorder_level?: number | string | null;
  unit?: string | null;
  status?: string | null;
  notes?: string | null;
  updated_at?: string | null;
  warehouse?: {
    code?: string | null;
    name?: string | null;
  } | null;
};

type FleetMaintenanceLog = {
  id: number | string;
  driver_id?: number | string | null;
  vehicle_identifier?: string | null;
  service_type?: string | null;
  status?: string | null;
  cost_amount?: number | string | null;
  due_at?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  created_at?: string | null;
  driver?: {
    name?: string | null;
    vehicle_type?: string | null;
  } | null;
};

type FleetFuelLog = {
  id: number | string;
  driver_id?: number | string | null;
  vehicle_identifier?: string | null;
  liters?: number | string | null;
  amount?: number | string | null;
  odometer?: number | string | null;
  fuel_date?: string | null;
  notes?: string | null;
  driver?: {
    name?: string | null;
    vehicle_type?: string | null;
  } | null;
};

type EnterpriseResponse = {
  businessAccounts: BusinessAccount[];
  codShipments: CodShipment[];
  kycSubmissions: KycSubmission[];
  supportTickets: SupportTicket[];
  warehouses: WarehouseRecord[];
  inventoryItems: InventoryItem[];
  maintenanceLogs: FleetMaintenanceLog[];
  fuelLogs: FleetFuelLog[];
  metrics: EnterpriseMetrics;
};

const businessInitial = {
  accountName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  billingEmail: "",
  billingTerms: "prepaid",
  creditLimit: "0"
};

const warehouseInitial = {
  code: "",
  name: "",
  stateCode: "",
  address: "",
  managerName: "",
  managerPhone: "",
  capacityNotes: ""
};

const inventoryInitial = {
  warehouseId: "",
  sku: "",
  itemName: "",
  quantityOnHand: "0",
  reorderLevel: "0",
  unit: "unit",
  notes: ""
};

const maintenanceInitial = {
  driverId: "",
  vehicleIdentifier: "",
  serviceType: "",
  status: "OPEN",
  costAmount: "0",
  dueAt: "",
  notes: ""
};

const fuelInitial = {
  driverId: "",
  vehicleIdentifier: "",
  liters: "0",
  amount: "0",
  odometer: "",
  fuelDate: "",
  notes: ""
};

const adminSupportQuickReplies = [
  "Thanks for reaching out. We are reviewing your shipment and will update you shortly.",
  "Your request has been escalated to operations for a delivery status check.",
  "Payment and shipment records are being verified now. We will confirm once complete.",
  "We have resolved this case. Please reply here if you need anything else."
];

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 0,
  style: "currency"
});

function badgeClass(status?: string | null) {
  const normalized = String(status ?? "PENDING").toUpperCase();
  if (["ACTIVE", "APPROVED", "REMITTED", "RESOLVED", "REFUNDED"].includes(normalized)) {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  }
  if (["REJECTED", "SUSPENDED", "DISPUTED", "CLOSED"].includes(normalized)) {
    return "border-destructive/40 bg-destructive/10 text-destructive";
  }
  return "border-primary/40 bg-primary/10 text-primary";
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function supportAgeHours(ticket: SupportTicket) {
  const value = ticket.last_message_at ?? ticket.created_at;
  if (!value) return 0;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 36e5));
}

function formatMoney(value?: number | string | null) {
  return moneyFormatter.format(Number(value ?? 0));
}

function formatNumber(value?: number | string | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toLocaleString() : "0";
}

export function AdminEnterpriseOperationsPanel() {
  const [data, setData] = useState<EnterpriseResponse | null>(null);
  const [businessForm, setBusinessForm] = useState(businessInitial);
  const [warehouseForm, setWarehouseForm] = useState(warehouseInitial);
  const [inventoryForm, setInventoryForm] = useState(inventoryInitial);
  const [maintenanceForm, setMaintenanceForm] = useState(maintenanceInitial);
  const [fuelForm, setFuelForm] = useState(fuelInitial);
  const [codDrafts, setCodDrafts] = useState<Record<string, { status: string; remittedAmount: string; remittanceReference: string; notes: string }>>({});
  const [kycNotes, setKycNotes] = useState<Record<string, string>>({});
  const [supportDrafts, setSupportDrafts] = useState<Record<string, { status: string; adminReply: string; resolutionNotes: string; refundAmount: string }>>({});
  const [activeSupportTicketId, setActiveSupportTicketId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<Record<string, SupportMessage[]>>({});
  const [supportReplyDrafts, setSupportReplyDrafts] = useState<Record<string, string>>({});
  const [loadingSupportChat, setLoadingSupportChat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return sessionData.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {};
  }, []);

  const authorizedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const auth = await authHeaders();
    Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
    return fetch(input, { ...init, headers });
  }, [authHeaders]);

  const loadEnterprise = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authorizedFetch("/api/admin/enterprise");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load enterprise operations.");
      const nextData = payload as EnterpriseResponse;
      setData(nextData);
      setCodDrafts((current) => ({
        ...Object.fromEntries(
          nextData.codShipments
            .filter((shipment) => shipment.tracking_id)
            .map((shipment) => [
              String(shipment.tracking_id),
              {
                status: String(shipment.cod_status ?? "COLLECTED").toUpperCase() === "PENDING" ? "COLLECTED" : String(shipment.cod_status ?? "COLLECTED").toUpperCase(),
                remittedAmount: String(shipment.cod_amount ?? 0),
                remittanceReference: shipment.cod_remittance_reference ?? "",
                notes: ""
              }
            ])
        ),
        ...current
      }));
      setSupportDrafts((current) => ({
        ...Object.fromEntries(
          nextData.supportTickets
            .filter((ticket) => ticket.ticket_id)
            .map((ticket) => [
              String(ticket.ticket_id),
              {
                status: String(ticket.status ?? "IN_REVIEW").toUpperCase(),
                adminReply: ticket.admin_reply ?? "",
                resolutionNotes: "",
                refundAmount: String(ticket.refund_amount ?? 0)
              }
            ])
        ),
        ...current
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load enterprise operations.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadEnterprise();
  }, [loadEnterprise]);

  useEffect(() => {
    if (!activeSupportTicketId) return;
    let cancelled = false;

    const refreshSupportChat = async () => {
      try {
        const response = await authorizedFetch(`/api/admin/support/${encodeURIComponent(activeSupportTicketId)}/messages`);
        const payload = await response.json();
        if (!response.ok || cancelled) return;
        setSupportMessages((current) => ({ ...current, [activeSupportTicketId]: payload.messages ?? [] }));
      } catch {
        // Admin support chat polling is best-effort; manual actions still report visible errors.
      }
    };

    const interval = window.setInterval(() => void refreshSupportChat(), 5000);
    const supabase = getSupabaseBrowser();
    const channel = supabase
      ?.channel(`admin-support-chat:${activeSupportTicketId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_chat_messages", filter: `ticket_id=eq.${activeSupportTicketId}` },
        () => void refreshSupportChat()
      )
      .subscribe();
    void refreshSupportChat();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [activeSupportTicketId, authorizedFetch]);

  const openSupportTickets = useMemo(
    () => data?.supportTickets.filter((ticket) => !["RESOLVED", "CLOSED", "REFUNDED"].includes(String(ticket.status ?? "").toUpperCase())) ?? [],
    [data?.supportTickets]
  );

  const supportQueueStats = useMemo(() => {
    const urgent = openSupportTickets.filter((ticket) => String(ticket.priority ?? "").toUpperCase() === "URGENT").length;
    const unread = openSupportTickets.reduce((sum, ticket) => sum + Number(ticket.unread_admin_count ?? 0), 0);
    const stale = openSupportTickets.filter((ticket) => {
      const lastMessageAt = ticket.last_message_at ?? ticket.created_at;
      if (!lastMessageAt) return false;
      return Date.now() - new Date(lastMessageAt).getTime() > 60 * 60 * 1000;
    }).length;
    return { urgent, unread, stale };
  }, [openSupportTickets]);

  async function postAction(body: Record<string, unknown>, success: string, key: string) {
    setBusyKey(key);
    setMessage(null);
    setError(null);
    try {
      const response = await authorizedFetch("/api/admin/enterprise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to save operation.");
      setMessage(success);
      await loadEnterprise();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save operation.");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function loadSupportThread(ticketId: string) {
    setActiveSupportTicketId(ticketId);
    setLoadingSupportChat(ticketId);
    setError(null);
    try {
      const response = await authorizedFetch(`/api/admin/support/${encodeURIComponent(ticketId)}/messages`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load support chat.");
      setSupportMessages((current) => ({ ...current, [ticketId]: payload.messages ?? [] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load support chat.");
    } finally {
      setLoadingSupportChat(null);
    }
  }

  async function sendSupportReply(ticketId: string) {
    const draft = supportReplyDrafts[ticketId]?.trim() ?? "";
    if (!draft) {
      setError("Type a support reply before sending.");
      return;
    }

    setLoadingSupportChat(ticketId);
    setError(null);
    try {
      const response = await authorizedFetch(`/api/admin/support/${encodeURIComponent(ticketId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: draft })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to send support reply.");
      setSupportMessages((current) => ({ ...current, [ticketId]: [...(current[ticketId] ?? []), payload] }));
      setSupportReplyDrafts((current) => ({ ...current, [ticketId]: "" }));
      setMessage(`Reply sent on ${ticketId}.`);
      await loadEnterprise();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send support reply.");
    } finally {
      setLoadingSupportChat(null);
    }
  }

  async function createBusinessAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await postAction(
      {
        action: "create_business_account",
        ...businessForm,
        creditLimit: Number(businessForm.creditLimit || 0)
      },
      "Business account created.",
      "business"
    );
    if (ok) setBusinessForm(businessInitial);
  }

  async function createWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await postAction(
      {
        action: "create_warehouse",
        ...warehouseForm
      },
      "Warehouse or hub profile saved.",
      "warehouse"
    );
    if (ok) setWarehouseForm(warehouseInitial);
  }

  async function saveInventoryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await postAction(
      {
        action: "upsert_inventory_item",
        ...inventoryForm,
        quantityOnHand: Number(inventoryForm.quantityOnHand || 0),
        reorderLevel: Number(inventoryForm.reorderLevel || 0)
      },
      "Inventory item saved.",
      "inventory"
    );
    if (ok) setInventoryForm(inventoryInitial);
  }

  async function logFleetMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await postAction(
      {
        action: "log_fleet_maintenance",
        ...maintenanceForm,
        costAmount: Number(maintenanceForm.costAmount || 0)
      },
      "Fleet maintenance log saved.",
      "maintenance"
    );
    if (ok) setMaintenanceForm(maintenanceInitial);
  }

  async function logFleetFuel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await postAction(
      {
        action: "log_fleet_fuel",
        ...fuelForm,
        liters: Number(fuelForm.liters || 0),
        amount: Number(fuelForm.amount || 0),
        odometer: fuelForm.odometer ? Number(fuelForm.odometer) : null
      },
      "Fleet fuel log saved.",
      "fuel"
    );
    if (ok) setFuelForm(fuelInitial);
  }

  function updateCodDraft(trackingId: string, field: "status" | "remittedAmount" | "remittanceReference" | "notes", value: string) {
    setCodDrafts((current) => ({
      ...current,
      [trackingId]: {
        ...(current[trackingId] ?? { status: "COLLECTED", remittedAmount: "0", remittanceReference: "", notes: "" }),
        [field]: value
      }
    }));
  }

  function updateSupportDraft(ticketId: string, field: "status" | "adminReply" | "resolutionNotes" | "refundAmount", value: string) {
    setSupportDrafts((current) => ({
      ...current,
      [ticketId]: {
        ...(current[ticketId] ?? { status: "IN_REVIEW", adminReply: "", resolutionNotes: "", refundAmount: "0" }),
        [field]: value
      }
    }));
  }

  const metrics = data?.metrics ?? {
    businessAccounts: 0,
    codOutstanding: 0,
    codPending: 0,
    kycPending: 0,
    supportOpen: 0,
    warehouses: 0,
    inventoryItems: 0,
    lowStockItems: 0,
    maintenanceOpen: 0,
    fuelSpend: 0
  };

  return (
    <section className="mt-8 grid gap-6">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge className="border-primary/40 bg-primary/10 text-primary">Merchant operations</Badge>
            <h2 className="mt-3 text-2xl font-black tracking-normal sm:text-3xl">Business accounts, COD, KYC, support, and hub control</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Manage merchant companies, business shipment operations, rider verification, COD remittance, disputes, refunds, and regional fulfillment.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <a href="/merchant/dashboard" target="_blank" rel="noreferrer">
              <ExternalLink />
              Open merchant portal
            </a>
          </Button>
        </div>
      </div>

      {message && (
        <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Business accounts", value: metrics.businessAccounts, icon: Building2 },
          { label: "COD outstanding", value: formatMoney(metrics.codOutstanding), icon: CreditCard },
          { label: "COD pending", value: metrics.codPending, icon: CreditCard },
          { label: "KYC pending", value: metrics.kycPending, icon: ShieldCheck },
          { label: "Support open", value: metrics.supportOpen, icon: TicketCheck },
          { label: "Warehouses", value: metrics.warehouses, icon: Warehouse },
          { label: "Inventory items", value: metrics.inventoryItems ?? 0, icon: Boxes },
          { label: "Low stock", value: metrics.lowStockItems ?? 0, icon: Boxes },
          { label: "Maintenance open", value: metrics.maintenanceOpen ?? 0, icon: Wrench },
          { label: "Fuel spend", value: formatMoney(metrics.fuelSpend), icon: Fuel }
        ].map((item) => (
          <Card key={item.label} className="glass">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                <p className="mt-2 font-mono text-xl font-black">{item.value}</p>
              </div>
              <item.icon className="size-5 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={loadEnterprise} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh merchant data
        </Button>
      </div>

      {loading ? (
        <Card className="glass">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            Loading merchant operations...
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="size-5 text-primary" />
                  Business accounts
                </CardTitle>
                <p className="text-sm text-muted-foreground">Create company accounts for staff users, billing visibility, and bulk shipment operations.</p>
              </CardHeader>
              <CardContent className="grid gap-5">
                <form className="grid gap-4 rounded-md border bg-background/45 p-4" onSubmit={createBusinessAccount}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="businessAccountName">Company name</Label>
                      <Input id="businessAccountName" value={businessForm.accountName} onChange={(event) => setBusinessForm((current) => ({ ...current, accountName: event.target.value }))} required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="businessContactName">Contact person</Label>
                      <Input id="businessContactName" value={businessForm.contactName} onChange={(event) => setBusinessForm((current) => ({ ...current, contactName: event.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="businessContactEmail">Contact email</Label>
                      <Input id="businessContactEmail" type="email" value={businessForm.contactEmail} onChange={(event) => setBusinessForm((current) => ({ ...current, contactEmail: event.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="businessContactPhone">Contact phone</Label>
                      <Input id="businessContactPhone" value={businessForm.contactPhone} onChange={(event) => setBusinessForm((current) => ({ ...current, contactPhone: event.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="businessBillingEmail">Billing email</Label>
                      <Input id="businessBillingEmail" type="email" value={businessForm.billingEmail} onChange={(event) => setBusinessForm((current) => ({ ...current, billingEmail: event.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="businessBillingTerms">Billing terms</Label>
                      <select id="businessBillingTerms" value={businessForm.billingTerms} onChange={(event) => setBusinessForm((current) => ({ ...current, billingTerms: event.target.value }))} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                        {["prepaid", "weekly", "monthly", "credit"].map((term) => <option key={term} value={term}>{term}</option>)}
                      </select>
                    </div>
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="businessCreditLimit">Credit limit</Label>
                      <Input id="businessCreditLimit" inputMode="decimal" value={businessForm.creditLimit} onChange={(event) => setBusinessForm((current) => ({ ...current, creditLimit: event.target.value }))} />
                    </div>
                  </div>
                  <Button type="submit" disabled={busyKey === "business"} className="w-full sm:w-fit">
                    {busyKey === "business" ? <Loader2 className="animate-spin" /> : <Building2 />}
                    Create business account
                  </Button>
                </form>
                <div className="grid gap-3">
                  {(data?.businessAccounts ?? []).length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No business accounts yet.</p>}
                  {(data?.businessAccounts ?? []).slice(0, 6).map((account) => (
                    <div key={String(account.id)} className="rounded-md border bg-background/45 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">{account.account_name ?? "Unnamed account"}</div>
                        <Badge className={badgeClass(account.status)}>{account.status ?? "ACTIVE"}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{account.contact_name ?? "No contact"} {account.contact_email ? `- ${account.contact_email}` : ""}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Terms {account.billing_terms ?? "prepaid"} · Limit {formatMoney(account.credit_limit)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Warehouse className="size-5 text-primary" />
                  Warehouses and hubs
                </CardTitle>
                <p className="text-sm text-muted-foreground">Prepare regional handling points for sorting, fulfillment, and handoff workflows.</p>
              </CardHeader>
              <CardContent className="grid gap-5">
                <form className="grid gap-4 rounded-md border bg-background/45 p-4" onSubmit={createWarehouse}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="warehouseCode">Code</Label>
                      <Input id="warehouseCode" value={warehouseForm.code} onChange={(event) => setWarehouseForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="LOS-HUB" required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="warehouseName">Name</Label>
                      <Input id="warehouseName" value={warehouseForm.name} onChange={(event) => setWarehouseForm((current) => ({ ...current, name: event.target.value }))} required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="warehouseState">State code</Label>
                      <Input id="warehouseState" value={warehouseForm.stateCode} onChange={(event) => setWarehouseForm((current) => ({ ...current, stateCode: event.target.value.toUpperCase() }))} placeholder="LA" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="warehousePhone">Manager phone</Label>
                      <Input id="warehousePhone" value={warehouseForm.managerPhone} onChange={(event) => setWarehouseForm((current) => ({ ...current, managerPhone: event.target.value }))} />
                    </div>
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="warehouseAddress">Address</Label>
                      <Input id="warehouseAddress" value={warehouseForm.address} onChange={(event) => setWarehouseForm((current) => ({ ...current, address: event.target.value }))} />
                    </div>
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="warehouseManager">Manager name</Label>
                      <Input id="warehouseManager" value={warehouseForm.managerName} onChange={(event) => setWarehouseForm((current) => ({ ...current, managerName: event.target.value }))} />
                    </div>
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="warehouseCapacity">Capacity notes</Label>
                      <textarea id="warehouseCapacity" value={warehouseForm.capacityNotes} onChange={(event) => setWarehouseForm((current) => ({ ...current, capacityNotes: event.target.value }))} className="min-h-20 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" />
                    </div>
                  </div>
                  <Button type="submit" disabled={busyKey === "warehouse"} className="w-full sm:w-fit">
                    {busyKey === "warehouse" ? <Loader2 className="animate-spin" /> : <Warehouse />}
                    Save warehouse
                  </Button>
                </form>
                <div className="grid gap-3">
                  {(data?.warehouses ?? []).length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No warehouses or hubs yet.</p>}
                  {(data?.warehouses ?? []).slice(0, 6).map((warehouse) => (
                    <div key={String(warehouse.id)} className="rounded-md border bg-background/45 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">{warehouse.code ?? "HUB"} · {warehouse.name ?? "Warehouse"}</div>
                        <Badge className={badgeClass(warehouse.status)}>{warehouse.status ?? "ACTIVE"}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{warehouse.address ?? "Address pending"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{warehouse.manager_name ?? "No manager"} {warehouse.manager_phone ? `· ${warehouse.manager_phone}` : ""}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Boxes className="size-5 text-primary" />
                  Warehouse inventory
                </CardTitle>
                <p className="text-sm text-muted-foreground">Track stock, packaging materials, fulfillment supplies, and low-stock alerts for each hub.</p>
              </CardHeader>
              <CardContent className="grid gap-5">
                <form className="grid gap-4 rounded-md border bg-background/45 p-4" onSubmit={saveInventoryItem}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="inventoryWarehouse">Warehouse</Label>
                      <select
                        id="inventoryWarehouse"
                        value={inventoryForm.warehouseId}
                        onChange={(event) => setInventoryForm((current) => ({ ...current, warehouseId: event.target.value }))}
                        className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {(data?.warehouses ?? []).map((warehouse) => (
                          <option key={String(warehouse.id)} value={String(warehouse.id)}>
                            {warehouse.code ?? warehouse.name ?? warehouse.id}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="inventorySku">SKU</Label>
                      <Input id="inventorySku" value={inventoryForm.sku} onChange={(event) => setInventoryForm((current) => ({ ...current, sku: event.target.value.toUpperCase() }))} placeholder="FLY-PACK-001" required />
                    </div>
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="inventoryName">Item name</Label>
                      <Input id="inventoryName" value={inventoryForm.itemName} onChange={(event) => setInventoryForm((current) => ({ ...current, itemName: event.target.value }))} placeholder="Thermal delivery bag" required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="inventoryQty">Quantity on hand</Label>
                      <Input id="inventoryQty" inputMode="decimal" value={inventoryForm.quantityOnHand} onChange={(event) => setInventoryForm((current) => ({ ...current, quantityOnHand: event.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="inventoryReorder">Reorder level</Label>
                      <Input id="inventoryReorder" inputMode="decimal" value={inventoryForm.reorderLevel} onChange={(event) => setInventoryForm((current) => ({ ...current, reorderLevel: event.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="inventoryUnit">Unit</Label>
                      <Input id="inventoryUnit" value={inventoryForm.unit} onChange={(event) => setInventoryForm((current) => ({ ...current, unit: event.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="inventoryNotes">Notes</Label>
                      <Input id="inventoryNotes" value={inventoryForm.notes} onChange={(event) => setInventoryForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Supplier, reorder instruction" />
                    </div>
                  </div>
                  <Button type="submit" disabled={busyKey === "inventory"} className="w-full sm:w-fit">
                    {busyKey === "inventory" ? <Loader2 className="animate-spin" /> : <Boxes />}
                    Save inventory item
                  </Button>
                </form>
                <div className="grid gap-3">
                  {(data?.inventoryItems ?? []).length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No inventory items yet.</p>}
                  {(data?.inventoryItems ?? []).slice(0, 8).map((item) => (
                    <div key={String(item.id)} className="rounded-md border bg-background/45 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">{item.sku ?? "SKU"} - {item.item_name ?? "Inventory item"}</div>
                        <Badge className={badgeClass(item.status)}>{item.status ?? "ACTIVE"}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {formatNumber(item.quantity_on_hand)} {item.unit ?? "units"} on hand. Reorder at {formatNumber(item.reorder_level)}.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.warehouse?.code ?? "No warehouse"} {item.updated_at ? `- Updated ${formatDate(item.updated_at)}` : ""}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="size-5 text-primary" />
                  Fleet maintenance and fuel
                </CardTitle>
                <p className="text-sm text-muted-foreground">Track service work, fuel spend, vehicle health, and operating costs for riders, vans, and trucks.</p>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="grid gap-4 lg:grid-cols-2">
                  <form className="grid gap-3 rounded-md border bg-background/45 p-4" onSubmit={logFleetMaintenance}>
                    <div className="font-semibold">Maintenance log</div>
                    <Input value={maintenanceForm.vehicleIdentifier} onChange={(event) => setMaintenanceForm((current) => ({ ...current, vehicleIdentifier: event.target.value }))} placeholder="Vehicle ID or plate" required />
                    <Input value={maintenanceForm.driverId} onChange={(event) => setMaintenanceForm((current) => ({ ...current, driverId: event.target.value }))} placeholder="Driver ID, optional" />
                    <Input value={maintenanceForm.serviceType} onChange={(event) => setMaintenanceForm((current) => ({ ...current, serviceType: event.target.value }))} placeholder="Oil change, tire, brake service" required />
                    <select value={maintenanceForm.status} onChange={(event) => setMaintenanceForm((current) => ({ ...current, status: event.target.value }))} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                      {["OPEN", "SCHEDULED", "COMPLETED", "CANCELLED"].map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                    <Input inputMode="decimal" value={maintenanceForm.costAmount} onChange={(event) => setMaintenanceForm((current) => ({ ...current, costAmount: event.target.value }))} placeholder="Cost amount" />
                    <Input type="datetime-local" value={maintenanceForm.dueAt} onChange={(event) => setMaintenanceForm((current) => ({ ...current, dueAt: event.target.value }))} />
                    <Input value={maintenanceForm.notes} onChange={(event) => setMaintenanceForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Service notes" />
                    <Button type="submit" disabled={busyKey === "maintenance"}>
                      {busyKey === "maintenance" ? <Loader2 className="animate-spin" /> : <Wrench />}
                      Save maintenance
                    </Button>
                  </form>

                  <form className="grid gap-3 rounded-md border bg-background/45 p-4" onSubmit={logFleetFuel}>
                    <div className="font-semibold">Fuel log</div>
                    <Input value={fuelForm.vehicleIdentifier} onChange={(event) => setFuelForm((current) => ({ ...current, vehicleIdentifier: event.target.value }))} placeholder="Vehicle ID or plate" required />
                    <Input value={fuelForm.driverId} onChange={(event) => setFuelForm((current) => ({ ...current, driverId: event.target.value }))} placeholder="Driver ID, optional" />
                    <Input inputMode="decimal" value={fuelForm.liters} onChange={(event) => setFuelForm((current) => ({ ...current, liters: event.target.value }))} placeholder="Liters" />
                    <Input inputMode="decimal" value={fuelForm.amount} onChange={(event) => setFuelForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" />
                    <Input inputMode="decimal" value={fuelForm.odometer} onChange={(event) => setFuelForm((current) => ({ ...current, odometer: event.target.value }))} placeholder="Odometer, optional" />
                    <Input type="datetime-local" value={fuelForm.fuelDate} onChange={(event) => setFuelForm((current) => ({ ...current, fuelDate: event.target.value }))} />
                    <Input value={fuelForm.notes} onChange={(event) => setFuelForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Fuel station or note" />
                    <Button type="submit" disabled={busyKey === "fuel"}>
                      {busyKey === "fuel" ? <Loader2 className="animate-spin" /> : <Fuel />}
                      Save fuel
                    </Button>
                  </form>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="grid gap-3">
                    <div className="text-sm font-semibold">Recent maintenance</div>
                    {(data?.maintenanceLogs ?? []).length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No maintenance logs yet.</p>}
                    {(data?.maintenanceLogs ?? []).slice(0, 5).map((log) => (
                      <div key={String(log.id)} className="rounded-md border bg-background/45 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{log.vehicle_identifier ?? "Vehicle"}</span>
                          <Badge className={badgeClass(log.status)}>{log.status ?? "OPEN"}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{log.service_type ?? "Service"} - {formatMoney(log.cost_amount)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-3">
                    <div className="text-sm font-semibold">Recent fuel</div>
                    {(data?.fuelLogs ?? []).length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No fuel logs yet.</p>}
                    {(data?.fuelLogs ?? []).slice(0, 5).map((log) => (
                      <div key={String(log.id)} className="rounded-md border bg-background/45 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{log.vehicle_identifier ?? "Vehicle"}</span>
                          <span className="font-mono">{formatMoney(log.amount)}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{Number(log.liters ?? 0)} liters {log.fuel_date ? `- ${formatDate(log.fuel_date)}` : ""}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-5 text-primary" />
                COD reconciliation
              </CardTitle>
              <p className="text-sm text-muted-foreground">Track cash-on-delivery collections, remittance status, and settlement references.</p>
            </CardHeader>
            <CardContent className="grid gap-3">
              {(data?.codShipments ?? []).length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No COD shipments found.</p>}
              {(data?.codShipments ?? []).map((shipment) => {
                const trackingId = String(shipment.tracking_id ?? shipment.id);
                const draft = codDrafts[trackingId] ?? { status: "COLLECTED", remittedAmount: String(shipment.cod_amount ?? 0), remittanceReference: "", notes: "" };
                return (
                  <div key={trackingId} className="grid gap-3 rounded-md border bg-background/45 p-4 xl:grid-cols-[1fr_1.35fr]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-mono font-bold">{trackingId}</h3>
                        <Badge className={badgeClass(shipment.cod_status)}>{shipment.cod_status ?? "PENDING"}</Badge>
                        <Badge>{shipment.status ?? "Shipment"}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{shipment.customer_name ?? "Customer"} · Driver {shipment.driver_id ?? "unassigned"}</p>
                      <p className="mt-2 font-mono text-xl font-black">{formatMoney(shipment.cod_amount)}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <select value={draft.status} onChange={(event) => updateCodDraft(trackingId, "status", event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                        {["COLLECTED", "PARTIALLY_REMITTED", "REMITTED", "DISPUTED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                      </select>
                      <Input inputMode="decimal" value={draft.remittedAmount} onChange={(event) => updateCodDraft(trackingId, "remittedAmount", event.target.value)} placeholder="Remitted amount" />
                      <Input value={draft.remittanceReference} onChange={(event) => updateCodDraft(trackingId, "remittanceReference", event.target.value)} placeholder="Remittance reference" />
                      <Input value={draft.notes} onChange={(event) => updateCodDraft(trackingId, "notes", event.target.value)} placeholder="Settlement notes" />
                      <Button
                        type="button"
                        disabled={busyKey === `cod-${trackingId}`}
                        onClick={() => void postAction({ action: "reconcile_cod", trackingId, status: draft.status, remittedAmount: Number(draft.remittedAmount || 0), remittanceReference: draft.remittanceReference, notes: draft.notes }, `COD updated for ${trackingId}.`, `cod-${trackingId}`)}
                        className="w-full md:col-span-2 md:w-fit"
                      >
                        {busyKey === `cod-${trackingId}` ? <Loader2 className="animate-spin" /> : <CreditCard />}
                        Save COD update
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck2 className="size-5 text-primary" />
                  Driver KYC review
                </CardTitle>
                <p className="text-sm text-muted-foreground">Review rider identity, license, and vehicle submissions before approving field work.</p>
              </CardHeader>
              <CardContent className="grid gap-3">
                {(data?.kycSubmissions ?? []).length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No KYC submissions yet.</p>}
                {(data?.kycSubmissions ?? []).map((submission) => {
                  const submissionId = String(submission.id);
                  return (
                    <div key={submissionId} className="rounded-md border bg-background/45 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{submission.driver?.name ?? `Driver ${submission.driver_id ?? submission.id}`}</h3>
                            <Badge className={badgeClass(submission.status)}>{submission.status ?? "PENDING"}</Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{submission.vehicle_type ?? "Vehicle type pending"} · {submission.vehicle_plate_number ?? "No plate"} · {submission.vehicle_model ?? "No model"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Submitted {formatDate(submission.created_at)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {submission.id_document_url && (
                            <Button asChild type="button" variant="outline" size="sm">
                              <a href={submission.id_document_url} target="_blank" rel="noreferrer">ID document</a>
                            </Button>
                          )}
                          {submission.license_url && (
                            <Button asChild type="button" variant="outline" size="sm">
                              <a href={submission.license_url} target="_blank" rel="noreferrer">License</a>
                            </Button>
                          )}
                        </div>
                      </div>
                      <textarea
                        value={kycNotes[submissionId] ?? submission.review_notes ?? ""}
                        onChange={(event) => setKycNotes((current) => ({ ...current, [submissionId]: event.target.value }))}
                        placeholder="Review note"
                        className="mt-4 min-h-20 w-full rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
                      />
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {[
                          ["APPROVED", "Approve"],
                          ["NEEDS_REVIEW", "Needs review"],
                          ["REJECTED", "Reject"]
                        ].map(([status, label]) => (
                          <Button
                            key={status}
                            type="button"
                            variant={status === "REJECTED" ? "outline" : "default"}
                            disabled={busyKey === `kyc-${submissionId}-${status}`}
                            onClick={() => void postAction({ action: "review_kyc", submissionId: Number(submission.id), status, reviewNotes: kycNotes[submissionId] ?? "" }, `KYC marked ${label.toLowerCase()}.`, `kyc-${submissionId}-${status}`)}
                          >
                            {busyKey === `kyc-${submissionId}-${status}` ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TicketCheck className="size-5 text-primary" />
                  Support, disputes, and refunds
                </CardTitle>
                <p className="text-sm text-muted-foreground">Handle failed delivery reports, disputes, refund requests, and customer resolutions.</p>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  {[
                    { label: "Open", value: openSupportTickets.length, tone: "default" },
                    { label: "Unread", value: supportQueueStats.unread, tone: supportQueueStats.unread ? "warning" : "default" },
                    { label: "Urgent", value: supportQueueStats.urgent, tone: supportQueueStats.urgent ? "danger" : "default" },
                    { label: "Over 1h", value: supportQueueStats.stale, tone: supportQueueStats.stale ? "warning" : "default" }
                  ].map((item) => (
                    <div key={item.label} className="rounded-md border bg-background/45 p-3">
                      <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</span>
                      <span className={`mt-2 block text-2xl font-black ${item.tone === "danger" ? "text-destructive" : item.tone === "warning" ? "text-primary" : ""}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
                {openSupportTickets.length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No open support tickets.</p>}
                {openSupportTickets.slice(0, 8).map((ticket) => {
                  const ticketId = String(ticket.ticket_id ?? ticket.id);
                  const draft = supportDrafts[ticketId] ?? { status: String(ticket.status ?? "IN_REVIEW").toUpperCase(), adminReply: ticket.admin_reply ?? "", resolutionNotes: "", refundAmount: String(ticket.refund_amount ?? 0) };
                  const isChatOpen = activeSupportTicketId === ticketId;
                  const messages = supportMessages[ticketId] ?? [];
                  const ageHours = supportAgeHours(ticket);
                  return (
                    <div key={ticketId} className="rounded-md border bg-background/45 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-mono font-bold">{ticketId}</h3>
                            <Badge className={badgeClass(ticket.status)}>{ticket.status ?? "OPEN"}</Badge>
                            <Badge>{ticket.priority ?? "NORMAL"}</Badge>
                            {Number(ticket.unread_admin_count ?? 0) > 0 && <Badge className="border-primary/40 bg-primary/10 text-primary">{ticket.unread_admin_count} unread</Badge>}
                            <Badge className={ageHours >= 2 ? "border-primary/40 bg-primary/10 text-primary" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"}>
                              {ageHours ? `${ageHours}h since activity` : "fresh"}
                            </Badge>
                            {ticket.last_message_at && <Badge>{formatDate(ticket.last_message_at)}</Badge>}
                          </div>
                          <p className="mt-2 font-semibold">{ticket.subject ?? "Support ticket"}</p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{ticket.message ?? "No customer message provided."}</p>
                        </div>
                        <Button
                          type="button"
                          variant={isChatOpen ? "default" : "outline"}
                          disabled={loadingSupportChat === ticketId}
                          onClick={() => void loadSupportThread(ticketId)}
                          className="w-full sm:w-auto"
                        >
                          {loadingSupportChat === ticketId ? <Loader2 className="animate-spin" /> : <MessageCircle />}
                          {isChatOpen ? "Refresh chat" : "Open chat"}
                        </Button>
                      </div>

                      {isChatOpen && (
                        <div className="mt-4 grid gap-3 rounded-md border bg-background/50 p-3">
                          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                            {messages.length === 0 && <p className="rounded-md border p-3 text-sm text-muted-foreground">No live messages yet.</p>}
                            {messages.map((chat) => {
                              const staff = chat.sender_role !== "customer";
                              return (
                                <div key={String(chat.id)} className={`flex ${staff ? "justify-end" : "justify-start"}`}>
                                  <div className={`max-w-[88%] rounded-md border p-3 text-sm ${staff ? "border-primary/30 bg-primary/10" : "bg-background/70"}`}>
                                    <div className="text-xs font-semibold text-muted-foreground">
                                      {staff ? chat.sender_name ?? "Fly Logistics support" : "Customer"} {chat.created_at ? `- ${formatDate(chat.created_at)}` : ""}
                                    </div>
                                    <p className="mt-1 leading-6">{chat.message}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                            <div className="md:col-span-2 flex flex-wrap gap-2">
                              {adminSupportQuickReplies.map((reply) => (
                                <Button
                                  key={reply}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-auto whitespace-normal text-left"
                                  onClick={() => setSupportReplyDrafts((current) => ({ ...current, [ticketId]: reply }))}
                                >
                                  {reply}
                                </Button>
                              ))}
                            </div>
                            <textarea
                              value={supportReplyDrafts[ticketId] ?? ""}
                              onChange={(event) => setSupportReplyDrafts((current) => ({ ...current, [ticketId]: event.target.value }))}
                              placeholder="Reply to customer..."
                              className="min-h-20 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
                            />
                            <Button type="button" disabled={loadingSupportChat === ticketId} onClick={() => void sendSupportReply(ticketId)} className="w-full md:w-auto">
                              {loadingSupportChat === ticketId ? <Loader2 className="animate-spin" /> : <Send />}
                              Send reply
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 grid gap-3">
                        <select value={draft.status} onChange={(event) => updateSupportDraft(ticketId, "status", event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                          {["OPEN", "IN_REVIEW", "RESOLVED", "REFUND_REQUESTED", "REFUNDED", "CLOSED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                        </select>
                        <textarea value={draft.adminReply} onChange={(event) => updateSupportDraft(ticketId, "adminReply", event.target.value)} placeholder="Customer-facing reply" className="min-h-20 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" />
                        <textarea value={draft.resolutionNotes} onChange={(event) => updateSupportDraft(ticketId, "resolutionNotes", event.target.value)} placeholder="Internal resolution notes" className="min-h-20 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" />
                        <Input inputMode="decimal" value={draft.refundAmount} onChange={(event) => updateSupportDraft(ticketId, "refundAmount", event.target.value)} placeholder="Refund amount, if any" />
                        <Button
                          type="button"
                          disabled={busyKey === `support-${ticketId}`}
                          onClick={() => void postAction({ action: "resolve_support", ticketId, status: draft.status, adminReply: draft.adminReply, resolutionNotes: draft.resolutionNotes, refundAmount: Number(draft.refundAmount || 0) }, `Support ticket ${ticketId} updated.`, `support-${ticketId}`)}
                          className="w-full sm:w-fit"
                        >
                          {busyKey === `support-${ticketId}` ? <Loader2 className="animate-spin" /> : <TicketCheck />}
                          Save support update
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}
