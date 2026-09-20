"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Bookmark,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  Gift,
  Headphones,
  History,
  Loader2,
  MapPin,
  MessageCircle,
  PackageCheck,
  PackagePlus,
  PackageSearch,
  Plus,
  RefreshCw,
  Repeat,
  Save,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  Truck,
  UserCircle,
  Wallet
} from "lucide-react";
import { flyError, flyInfo, flySuccess } from "@/components/feedback/fly-toast";
import { AccountPasswordPanel } from "@/components/auth/account-password-panel";
import { CustomerShell } from "@/components/customer/customer-shell";
import { InternationalCargoNotice } from "@/components/customer/international-cargo-notice";
import { DashboardQuickActions, DashboardSectionHeader, DashboardStatCard } from "@/components/dashboard/dashboard-primitives";
import type { CustomerWalletView, WalletFundingProvider, WalletTransactionView } from "@/components/customer/customer-wallet-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getWhatsAppUrl, whatsappMessages } from "@/lib/contact";
import {
  canCustomerRespondToQuote,
  canPayQuote,
  quoteDisplayAmount,
  quoteDisplayEta,
  quoteLifecycleTone,
  quoteStatusLabel
} from "@/lib/quotes";
import { publicShipmentTimeline, type QuoteRequestRecord, type ShipmentRecord } from "@/lib/shipments";
import { canonicalSiteUrl } from "@/lib/site";

const CustomerBookingWorkspace = dynamic(
  () => import("@/components/customer/customer-booking-workspace").then((module) => module.CustomerBookingWorkspace),
  { ssr: false, loading: () => <PanelLoading label="Preparing booking workspace..." /> }
);

const CustomerTrackingPanel = dynamic(
  () => import("@/components/customer/customer-tracking-panel").then((module) => module.CustomerTrackingPanel),
  { ssr: false, loading: () => <PanelLoading label="Preparing shipment tracking..." /> }
);

const CustomerWalletPanel = dynamic(
  () => import("@/components/customer/customer-wallet-panel").then((module) => module.CustomerWalletPanel),
  { ssr: false, loading: () => <PanelLoading label="Preparing wallet..." /> }
);

const CustomerAccountMap = dynamic(
  () => import("@/components/maps/customer-account-map").then((module) => module.CustomerAccountMap),
  { ssr: false, loading: () => <PanelLoading label="Loading live map..." /> }
);

type CustomerOverview = {
  profile: {
    email: string | null;
    full_name: string | null;
    company: string | null;
    phone?: string | null;
    role: string;
  };
  quoteRequests: QuoteRequestRecord[];
  shipments: ShipmentRecord[];
  addresses: CustomerAddress[];
  supportTickets: SupportTicket[];
  notifications: CustomerNotification[];
  referralRewards: ReferralReward[];
  loyaltyRewards: LoyaltyReward[];
  testimonials: CustomerTestimonial[];
  wallet: CustomerWalletView;
  walletTransactions: WalletTransactionView[];
  warnings?: string[];
};

type CustomerAddress = {
  id: number | string;
  label: string;
  address_type: string;
  address: string;
  city?: string | null;
  notes?: string | null;
  is_default?: boolean | null;
  created_at?: string | null;
};

type SupportTicket = {
  id: number | string;
  ticket_id: string;
  tracking_id?: string | null;
  subject: string;
  priority: string;
  status: string;
  message: string;
  admin_reply?: string | null;
  ticket_type?: string | null;
  dispute_category?: string | null;
  refund_amount?: number | string | null;
  resolution_status?: string | null;
  resolution_notes?: string | null;
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

type CustomerNotification = {
  id: number | string;
  title: string;
  body: string;
  category: string;
  entity_type?: string | null;
  entity_id?: string | null;
  read_at?: string | null;
  created_at?: string | null;
};

type ReferralReward = {
  id: number | string;
  referral_code?: string | null;
  reward_amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  reward_type?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
};

type LoyaltyReward = {
  id: number | string;
  reward_type?: string | null;
  bonus_amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  reason?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  applied_at?: string | null;
};

type CustomerTestimonial = {
  id: number | string;
  customer_name?: string | null;
  company?: string | null;
  rating?: number | string | null;
  review?: string | null;
  status?: string | null;
  source?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
};

type SavedAddressView = {
  id?: number | string;
  label: string;
  name: string;
  type: string;
  city?: string | null;
  notes?: string | null;
  isDefault?: boolean | null;
  count: number;
  persisted: boolean;
};

type BookingPrefill = {
  id: string;
  recipientName?: string;
  pickupPhone?: string;
  deliveryPhone?: string;
  pickupCountry?: string;
  destinationCountry?: string;
  pickupState?: string;
  destinationState?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  packageType?: string;
  weightKg?: string;
  urgency?: string;
  deliveryCategory?: string;
  notes?: string;
};

type CustomerSection = "overview" | "booking" | "shipments" | "tracking" | "map" | "wallet" | "quotes" | "payments" | "addresses" | "support" | "notifications" | "profile" | "rewards";

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 0,
  style: "currency"
});

const initialAddressForm = {
  label: "",
  addressType: "delivery",
  address: "",
  city: "",
  notes: "",
  isDefault: false
};

const initialSupportForm = {
  subject: "",
  priority: "NORMAL",
  ticketType: "support",
  disputeCategory: "",
  refundAmount: "0",
  trackingId: "",
  message: ""
};

const initialProfileForm = {
  fullName: "",
  company: "",
  phone: ""
};

const customerSupportQuickReplies = [
  "Please check the latest ETA for my shipment.",
  "I need help with payment confirmation.",
  "Please connect this ticket to my tracking ID.",
  "I want to report a delivery issue."
];

function formatStatus(value: string | null | undefined) {
  return (value ?? "pending").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function paymentBadgeClass(status: string | null | undefined) {
  const normalized = (status ?? "UNPAID").toUpperCase();
  if (normalized === "PAID") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (normalized === "PENDING") return "border-primary/40 bg-primary/10 text-primary";
  if (normalized === "FAILED" || normalized === "CANCELLED") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-muted-foreground/30 bg-background/55 text-muted-foreground";
}

function PaymentBadge({ status }: { status?: string | null }) {
  return <Badge className={paymentBadgeClass(status)}>{formatStatus(status ?? "UNPAID")}</Badge>;
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="rounded-md border bg-background/35 p-4 text-sm text-muted-foreground">
      <Loader2 className="mr-2 inline size-4 animate-spin text-primary" />
      {label}
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  return <Badge className="border-primary/40 bg-primary/10 text-primary">{formatStatus(status)}</Badge>;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

function sectionFromHash(hash: string): CustomerSection {
  switch (hash.replace("#", "")) {
    case "customer-booking":
      return "booking";
    case "customer-shipments":
      return "shipments";
    case "customer-tracking":
      return "tracking";
    case "customer-live-map":
      return "map";
    case "customer-wallet":
      return "wallet";
    case "customer-quotes":
      return "quotes";
    case "customer-rewards":
      return "rewards";
    case "customer-payments":
      return "payments";
    case "customer-addresses":
      return "addresses";
    case "customer-support":
      return "support";
    case "customer-notifications":
      return "notifications";
    case "customer-profile":
      return "profile";
    default:
      return "overview";
  }
}

export function CustomerDashboard() {
  const [overview, setOverview] = useState<CustomerOverview | null>(null);
  const [addressForm, setAddressForm] = useState(initialAddressForm);
  const [supportForm, setSupportForm] = useState(initialSupportForm);
  const [profileForm, setProfileForm] = useState(initialProfileForm);
  const [loading, setLoading] = useState(true);
  const [paymentLoadingId, setPaymentLoadingId] = useState<string | null>(null);
  const [walletPaymentId, setWalletPaymentId] = useState<string | null>(null);
  const [quoteActionId, setQuoteActionId] = useState<string | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [savingTicket, setSavingTicket] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);
  const [activeSection, setActiveSection] = useState<CustomerSection>("overview");
  const [customerShipmentFilters, setCustomerShipmentFilters] = useState({ query: "", status: "all", paymentStatus: "all" });
  const [customerQuoteFilters, setCustomerQuoteFilters] = useState({ query: "", status: "all", paymentStatus: "all" });
  const [bookingPrefill, setBookingPrefill] = useState<BookingPrefill | undefined>(undefined);
  const [activeSupportTicketId, setActiveSupportTicketId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<Record<string, SupportMessage[]>>({});
  const [supportMessageDrafts, setSupportMessageDrafts] = useState<Record<string, string>>({});
  const [loadingSupportChat, setLoadingSupportChat] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setOverview(null);
    setError(null);

    try {
      const supabase = getSupabaseBrowser();
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const activeUserId = sessionData.session?.user.id;
      if (!activeUserId) throw new Error("Your customer session has expired. Please sign in again.");
      const response = await authorizedFetch(`/api/customer/overview?session=${encodeURIComponent(activeUserId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load your customer portal.");
      if (!data.profile?.id || data.profile.id !== activeUserId) {
        await supabase?.auth.signOut().catch(() => undefined);
        await fetch("/api/auth/session", { method: "DELETE", cache: "no-store" }).catch(() => undefined);
        throw new Error("We prevented data from a previous session from being shown. Please sign in again.");
      }
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your customer portal.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "USER_UPDATED") setOverview(null);
    });
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setOverview(null);
        void loadOverview();
      }
    };
    window.addEventListener("pageshow", restore);
    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener("pageshow", restore);
    };
  }, [loadOverview]);

  useEffect(() => {
    if (!overview?.profile) return;
    setProfileForm({
      fullName: overview.profile.full_name ?? "",
      company: overview.profile.company ?? "",
      phone: overview.profile.phone ?? ""
    });
  }, [overview?.profile]);

  useEffect(() => {
    const syncHash = () => setActiveSection(sectionFromHash(window.location.hash));
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    const walletStatus = params.get("wallet");
    const trackingId = params.get("trackingId");
    const amount = Number(params.get("amount") ?? 0);

    if (paymentStatus === "success") {
      const success = trackingId
        ? `Payment successful. Your Fly Logistics tracking ID is ${trackingId}.`
        : "Payment successful. Your shipment is being prepared inside your customer account.";
      setActiveSection("shipments");
      setMessage(success);
      flySuccess("Payment successful", success);
      window.history.replaceState(null, "", "/customer#customer-shipments");
      void loadOverview();
      return;
    }

    if (walletStatus === "success") {
      const success = Number.isFinite(amount) && amount > 0
        ? `Wallet funded successfully with ${moneyFormatter.format(amount)}.`
        : "Wallet funded successfully.";
      setActiveSection("wallet");
      setMessage(success);
      flySuccess("Wallet funded", success);
      window.history.replaceState(null, "", "/customer#customer-wallet");
      void loadOverview();
    }
  }, [loadOverview]);

  useEffect(() => {
    if (!activeSupportTicketId || activeSection !== "support") return;
    let cancelled = false;

    const refreshSupportChat = async () => {
      try {
        const response = await authorizedFetch(`/api/customer/support/${encodeURIComponent(activeSupportTicketId)}/messages`);
        const data = await response.json();
        if (!response.ok || cancelled) return;
        setSupportMessages((current) => ({ ...current, [activeSupportTicketId]: data.messages ?? [] }));
      } catch {
        // Live chat refresh is best-effort; manual refresh and sending still surface visible errors.
      }
    };

    const interval = window.setInterval(() => void refreshSupportChat(), 5000);
    const supabase = getSupabaseBrowser();
    const channel = supabase
      ?.channel(`customer-support-chat:${activeSupportTicketId}`)
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
  }, [activeSection, activeSupportTicketId, authorizedFetch]);

  async function startPayment(requestId: string, paymentProvider: "flutterwave" = "flutterwave") {
    setMessage(null);
    setError(null);
    setPaymentLoadingId(requestId);

    try {
      const response = await authorizedFetch(`/api/payments/${paymentProvider}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId })
      });
      const data = await response.json();
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error ?? "Unable to start secure checkout.");
      flyInfo("Opening Fly Logistics checkout", "Your secure payment page is loading.");
      window.location.assign(data.checkoutUrl);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to start secure checkout.";
      setError(nextError);
      flyError("Unable to start checkout", nextError);
      setPaymentLoadingId(null);
    }
  }

  async function fundWallet(amount: number, paymentProvider: WalletFundingProvider = "flutterwave", network = "TRC20") {
    setMessage(null);
    setError(null);

    try {
      const response = await authorizedFetch(paymentProvider === "crypto" ? "/api/payments/crypto/checkout" : "/api/customer/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentProvider === "crypto" ? { walletAmount: amount, network } : { amount, paymentProvider })
      });
      const data = await response.json();
      if (paymentProvider === "crypto") {
        if (!response.ok || !data.payment) throw new Error(data.error ?? "Unable to prepare crypto wallet funding.");
        flyInfo("Crypto wallet funding prepared", "Send the exact amount, then submit the transaction hash for review.");
        return data.payment;
      }
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error ?? "Unable to start wallet funding.");
      flyInfo("Opening wallet funding checkout", "Your Fly Logistics wallet funding page is loading.");
      window.location.assign(data.checkoutUrl);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to start wallet funding.";
      setError(nextError);
      flyError("Unable to fund wallet", nextError);
    }
  }

  async function payWithWallet(input: { requestId?: string; trackingId?: string }) {
    const key = input.requestId ?? input.trackingId ?? "wallet-payment";
    setMessage(null);
    setError(null);
    setWalletPaymentId(key);

    try {
      const response = await authorizedFetch("/api/customer/wallet/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to pay with wallet.");
      const trackingId = data.shipment?.tracking_id ?? data.shipments?.[0]?.tracking_id;
      const success = trackingId
        ? `Wallet payment recorded. Tracking ID ${trackingId}.`
        : `Wallet payment recorded. Reference ${data.reference}.`;
      setMessage(success);
      flySuccess("Wallet payment complete", success);
      const successUrl = new URL("/payment/success", window.location.origin);
      successUrl.searchParams.set("kind", "booking");
      successUrl.searchParams.set("status", "paid");
      if (trackingId) successUrl.searchParams.set("trackingId", trackingId);
      if (data.reference) successUrl.searchParams.set("reference", data.reference);
      if (data.amount) successUrl.searchParams.set("amount", String(data.amount));
      window.location.assign(successUrl.toString());
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to pay with wallet.";
      setError(nextError);
      flyError("Unable to pay with wallet", nextError);
    } finally {
      setWalletPaymentId(null);
    }
  }

  function openBookingWithPrefill(prefill: Omit<BookingPrefill, "id">, successMessage: string) {
    setBookingPrefill({ ...prefill, id: crypto.randomUUID() });
    setActiveSection("booking");
    window.history.replaceState(null, "", "/customer#customer-booking");
    setMessage(successMessage);
    flySuccess("Booking prefilled", successMessage);
  }

  function openInternationalCargoBooking() {
    openBookingWithPrefill(
      {
        deliveryCategory: "international_export",
        pickupCountry: "Nigeria",
        destinationCountry: "",
        pickupState: "LA",
        destinationState: "",
        packageType: "International cargo",
        weightKg: "10",
        urgency: "standard",
        notes: "International cargo booking from the Fly Logistics rate notice."
      },
      "International cargo booking opened. Add the receiver details and destination country to continue."
    );
  }

  function reorderShipment(shipment: ShipmentRecord) {
    openBookingWithPrefill(
      {
        recipientName: shipment.recipient_name ?? "",
        pickupPhone: shipment.pickup_phone ?? overview?.profile?.phone ?? "",
        deliveryPhone: shipment.delivery_phone ?? "",
        pickupCountry: shipment.pickup_country ?? "Nigeria",
        destinationCountry: shipment.destination_country ?? "Nigeria",
        pickupState: shipment.pickup_state ?? "",
        destinationState: shipment.destination_state ?? "",
        pickupAddress: shipment.pickup_address,
        deliveryAddress: shipment.delivery_address,
        packageType: shipment.package_type,
        weightKg: String(shipment.weight_kg ?? 2),
        urgency: shipment.urgency ?? "standard",
        deliveryCategory: shipment.delivery_category ?? "local_nigeria",
        notes: `Reorder based on ${shipment.tracking_id}`
      },
      `Shipment details from ${shipment.tracking_id} are ready for review.`
    );
  }

  function applyQuoteTemplate(quote: QuoteRequestRecord) {
    openBookingWithPrefill(
      {
        recipientName: quote.recipient_name ?? "",
        pickupPhone: quote.pickup_phone ?? overview?.profile?.phone ?? "",
        deliveryPhone: quote.delivery_phone ?? "",
        pickupCountry: quote.pickup_country ?? "Nigeria",
        destinationCountry: quote.destination_country ?? "Nigeria",
        pickupState: quote.pickup_state ?? "",
        destinationState: quote.destination_state ?? "",
        pickupAddress: quote.pickup_address,
        deliveryAddress: quote.delivery_address,
        packageType: quote.package_type,
        weightKg: String(quote.weight_kg ?? 2),
        urgency: quote.urgency ?? "standard",
        deliveryCategory: quote.delivery_category ?? "local_nigeria",
        notes: `Template based on ${quote.request_id}`
      },
      `Template from ${quote.request_id} is ready for pricing.`
    );
  }

  function applyAddressForBooking(address: SavedAddressView, addressType: "pickup" | "delivery") {
    openBookingWithPrefill(
      addressType === "pickup"
        ? { pickupAddress: address.label, pickupState: "", pickupCountry: "Nigeria" }
        : { deliveryAddress: address.label, destinationState: "", destinationCountry: "Nigeria" },
      `${address.name || "Saved address"} was added as the ${addressType} location.`
    );
  }

  async function copyReferralLink() {
    const referralCode = `FLY-${overview?.profile?.email?.split("@")[0]?.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10) || "CUSTOMER"}`;
    const link = `${canonicalSiteUrl}/customer/register?ref=${encodeURIComponent(referralCode)}`;
    try {
      await navigator.clipboard.writeText(link);
      flySuccess("Referral link copied", "Share it with customers or businesses that need Fly Logistics.");
    } catch {
      flyInfo("Referral link ready", link);
    }
  }

  async function respondToQuote(requestId: string, action: "accept" | "decline") {
    setMessage(null);
    setError(null);
    setQuoteActionId(`${requestId}:${action}`);

    try {
      const response = await authorizedFetch(`/api/customer/quote-requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update quote response.");
      setOverview((current) =>
        current
          ? {
              ...current,
              quoteRequests: current.quoteRequests.map((quote) => (quote.request_id === requestId ? data : quote))
            }
          : current
      );
      const success = action === "accept" ? `Quote ${requestId} accepted. You can now complete payment.` : `Quote ${requestId} declined.`;
      setMessage(success);
      flySuccess(action === "accept" ? "Quote accepted" : "Quote declined", success);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to update quote response.";
      setError(nextError);
      flyError("Unable to update quote", nextError);
    } finally {
      setQuoteActionId(null);
    }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setSavingAddress(true);

    try {
      const response = await authorizedFetch("/api/customer/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addressForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save this address.");
      setOverview((current) =>
        current
          ? {
              ...current,
              addresses: [
                data,
                ...current.addresses.map((address) => (data.is_default ? { ...address, is_default: false } : address))
              ]
            }
          : current
      );
      setAddressForm(initialAddressForm);
      setMessage("Address saved to your customer workspace.");
      flySuccess("Address saved", "This address is now available in your customer workspace.");
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to save this address.";
      setError(nextError);
      flyError("Unable to save address", nextError);
    } finally {
      setSavingAddress(false);
    }
  }

  async function deleteAddress(addressId: number | string) {
    setMessage(null);
    setError(null);
    setDeletingAddressId(String(addressId));

    try {
      const response = await authorizedFetch(`/api/customer/addresses/${encodeURIComponent(String(addressId))}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to delete this address.");
      setOverview((current) =>
        current ? { ...current, addresses: current.addresses.filter((address) => String(address.id) !== String(addressId)) } : current
      );
      setMessage("Address removed.");
      flySuccess("Address removed");
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to delete this address.";
      setError(nextError);
      flyError("Unable to delete address", nextError);
    } finally {
      setDeletingAddressId(null);
    }
  }

  async function openSupportTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setSavingTicket(true);

    try {
      const response = await authorizedFetch("/api/customer/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supportForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to open this support ticket.");
      setOverview((current) => (current ? { ...current, supportTickets: [data, ...current.supportTickets] } : current));
      setSupportForm(initialSupportForm);
      setActiveSupportTicketId(data.ticket_id);
      setSupportMessages((current) => ({ ...current, [data.ticket_id]: [] }));
      setMessage(`Support ticket ${data.ticket_id} opened.`);
      flySuccess("Support ticket opened", `Ticket ${data.ticket_id} has been sent to Fly Logistics support.`);
      void loadOverview();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to open this support ticket.";
      setError(nextError);
      flyError("Unable to open support ticket", nextError);
    } finally {
      setSavingTicket(false);
    }
  }

  async function loadSupportThread(ticketId: string) {
    setActiveSupportTicketId(ticketId);
    setLoadingSupportChat(ticketId);
    setError(null);

    try {
      const response = await authorizedFetch(`/api/customer/support/${encodeURIComponent(ticketId)}/messages`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to open support chat.");
      setSupportMessages((current) => ({ ...current, [ticketId]: data.messages ?? [] }));
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to open support chat.";
      setError(nextError);
      flyError("Unable to open support chat", nextError);
    } finally {
      setLoadingSupportChat(null);
    }
  }

  async function sendSupportMessage(ticketId: string) {
    const draft = supportMessageDrafts[ticketId]?.trim() ?? "";
    if (!draft) {
      flyError("Type a message", "Please type your support message before sending.");
      return;
    }

    setLoadingSupportChat(ticketId);
    setError(null);

    try {
      const response = await authorizedFetch(`/api/customer/support/${encodeURIComponent(ticketId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: draft })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to send support message.");
      setSupportMessages((current) => ({ ...current, [ticketId]: [...(current[ticketId] ?? []), data] }));
      setSupportMessageDrafts((current) => ({ ...current, [ticketId]: "" }));
      flySuccess("Message sent", "Fly Logistics support has received your message.");
      void loadOverview();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to send support message.";
      setError(nextError);
      flyError("Unable to send support message", nextError);
    } finally {
      setLoadingSupportChat(null);
    }
  }

  async function markNotificationsRead(notificationId?: number | string) {
    setUpdatingNotifications(true);
    setError(null);

    try {
      const response = await authorizedFetch("/api/customer/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationId ? { notificationId: Number(notificationId) } : { readAll: true })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update notifications.");
      const readAt = new Date().toISOString();
      setOverview((current) =>
        current
          ? {
              ...current,
              notifications: current.notifications.map((notification) =>
                !notificationId || String(notification.id) === String(notificationId) ? { ...notification, read_at: readAt } : notification
              )
            }
          : current
      );
      flySuccess(notificationId ? "Notification marked read" : "Notifications marked read");
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to update notifications.";
      setError(nextError);
      flyError("Unable to update notifications", nextError);
    } finally {
      setUpdatingNotifications(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setMessage(null);
    setError(null);

    try {
      const response = await authorizedFetch("/api/customer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update your profile.");
      setOverview((current) => (current ? { ...current, profile: { ...current.profile, ...data } } : current));
      setMessage("Profile updated.");
      flySuccess("Profile updated", "Your customer account details were saved.");
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to update your profile.";
      setError(nextError);
      flyError("Unable to update profile", nextError);
    } finally {
      setSavingProfile(false);
    }
  }

  const stats = useMemo(() => {
    const shipments = overview?.shipments ?? [];
    const quotes = overview?.quoteRequests ?? [];
    const pendingPaymentCount = [...quotes, ...shipments].filter((item) => String(item.payment_status ?? "UNPAID").toUpperCase() !== "PAID").length;
    return [
      {
        label: "Active shipments",
        value: shipments.filter((shipment) => !["DELIVERED", "CANCELLED"].includes(String(shipment.status).toUpperCase())).length,
        icon: PackageCheck,
        helper: "In motion or awaiting pickup"
      },
      {
        label: "Delivered shipments",
        value: shipments.filter((shipment) => String(shipment.status).toUpperCase() === "DELIVERED").length,
        icon: Truck,
        helper: "Completed records"
      },
      {
        label: "Wallet balance",
        value: moneyFormatter.format(Number(overview?.wallet?.balance ?? 0)),
        icon: Wallet,
        helper: "Available for instant payment"
      },
      {
        label: "Pending payments",
        value: pendingPaymentCount,
        icon: CreditCard,
        helper: "Quotes or shipments awaiting payment"
      }
    ];
  }, [overview]);

  const activeShipments = useMemo(
    () => (overview?.shipments ?? []).filter((shipment) => !["DELIVERED", "CANCELLED"].includes(String(shipment.status).toUpperCase())),
    [overview?.shipments]
  );

  const shipmentHistory = useMemo(
    () => (overview?.shipments ?? []).filter((shipment) => ["DELIVERED", "CANCELLED"].includes(String(shipment.status).toUpperCase())),
    [overview?.shipments]
  );

  const filteredCustomerShipments = useMemo(() => {
    const query = customerShipmentFilters.query.trim().toLowerCase();
    return (overview?.shipments ?? []).filter((shipment) => {
      const matchesQuery = !query || [
        shipment.tracking_id,
        shipment.package_type,
        shipment.pickup_address,
        shipment.delivery_address,
        shipment.assigned_driver?.name
      ].some((value) => String(value ?? "").toLowerCase().includes(query));
      const matchesStatus = customerShipmentFilters.status === "all" || String(shipment.status ?? "").toUpperCase() === customerShipmentFilters.status;
      const matchesPayment = customerShipmentFilters.paymentStatus === "all" || String(shipment.payment_status ?? "UNPAID").toUpperCase() === customerShipmentFilters.paymentStatus;
      return matchesQuery && matchesStatus && matchesPayment;
    });
  }, [customerShipmentFilters, overview?.shipments]);

  const filteredCustomerQuotes = useMemo(() => {
    const query = customerQuoteFilters.query.trim().toLowerCase();
    return (overview?.quoteRequests ?? []).filter((quote) => {
      const matchesQuery = !query || [
        quote.request_id,
        quote.package_type,
        quote.pickup_address,
        quote.delivery_address
      ].some((value) => String(value ?? "").toLowerCase().includes(query));
      const matchesStatus = customerQuoteFilters.status === "all" || String(quote.status ?? "").toUpperCase() === customerQuoteFilters.status;
      const matchesPayment = customerQuoteFilters.paymentStatus === "all" || String(quote.payment_status ?? "UNPAID").toUpperCase() === customerQuoteFilters.paymentStatus;
      return matchesQuery && matchesStatus && matchesPayment;
    });
  }, [customerQuoteFilters, overview?.quoteRequests]);

  const paymentItems = useMemo(() => {
    const quotes = (overview?.quoteRequests ?? []).map((quote) => ({
      id: quote.request_id,
      label: "Quote request",
      status: quote.payment_status ?? "UNPAID",
      amount: Number(quote.payment_amount ?? quote.estimated_price ?? 0),
      createdAt: quote.created_at,
      receiptReference: quote.payment_reference ?? quote.request_id
    }));
    const shipments = (overview?.shipments ?? []).map((shipment) => ({
      id: shipment.tracking_id,
      label: "Shipment",
      status: shipment.payment_status ?? "UNPAID",
      amount: Number(shipment.payment_amount ?? shipment.quoted_price ?? 0),
      createdAt: shipment.created_at,
      receiptReference: shipment.payment_reference ?? shipment.tracking_id
    }));
    return [...quotes, ...shipments].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  }, [overview?.quoteRequests, overview?.shipments]);

  const savedAddresses = useMemo<SavedAddressView[]>(() => {
    if (overview?.addresses?.length) {
      return overview.addresses.map((address) => ({
        id: address.id,
        label: address.address,
        name: address.label,
        type: formatStatus(address.address_type),
        city: address.city,
        notes: address.notes,
        isDefault: address.is_default,
        count: 1,
        persisted: true
      }));
    }

    const addresses = new Map<string, { label: string; type: "Pickup" | "Delivery"; count: number }>();

    for (const shipment of overview?.shipments ?? []) {
      [
        { label: shipment.pickup_address, type: "Pickup" as const },
        { label: shipment.delivery_address, type: "Delivery" as const }
      ].forEach((address) => {
        const key = `${address.type}:${address.label}`.toLowerCase();
        const current = addresses.get(key);
        addresses.set(key, { ...address, count: (current?.count ?? 0) + 1 });
      });
    }

    for (const quote of overview?.quoteRequests ?? []) {
      [
        { label: quote.pickup_address, type: "Pickup" as const },
        { label: quote.delivery_address, type: "Delivery" as const }
      ].forEach((address) => {
        const key = `${address.type}:${address.label}`.toLowerCase();
        const current = addresses.get(key);
        addresses.set(key, { ...address, count: (current?.count ?? 0) + 1 });
      });
    }

    return Array.from(addresses.values()).map((address) => ({ ...address, name: address.type, persisted: false })).slice(0, 6);
  }, [overview?.addresses, overview?.quoteRequests, overview?.shipments]);

  const notificationItems = useMemo(() => {
    if (overview?.notifications?.length) return overview.notifications;

    const latestShipment = overview?.shipments?.[0];
    const latestQuote = overview?.quoteRequests?.[0];
    return [
      {
        id: "shipment-fallback",
        title: latestShipment ? `Shipment ${latestShipment.tracking_id}` : "Shipment updates",
        body: latestShipment
          ? latestShipment.customer_status_message ?? `Shipment is ${formatStatus(latestShipment.status)}.`
          : "New shipments will appear here after operations creates a tracking ID.",
        category: "shipment",
        read_at: null,
        created_at: latestShipment?.updated_at ?? latestShipment?.created_at ?? null
      },
      {
        id: "quote-fallback",
        title: latestQuote ? `Quote ${latestQuote.request_id}` : "Quote updates",
        body: latestQuote
          ? `Payment status is ${formatStatus(latestQuote.payment_status ?? "UNPAID")}.`
          : "Quote request updates will appear here.",
        category: "quote",
        read_at: null,
        created_at: latestQuote?.created_at ?? null
      },
      {
        id: "completion-fallback",
        title: "Delivery completion",
        body: "Completion updates and driver notes are shown after operations review.",
        category: "delivery",
        read_at: null,
        created_at: null
      }
    ] satisfies CustomerNotification[];
  }, [overview?.notifications, overview?.quoteRequests, overview?.shipments]);

  const shipmentTemplates = (() => {
    const shipmentTemplateItems = (overview?.shipments ?? []).slice(0, 4).map((shipment) => ({
      id: shipment.tracking_id,
      title: shipment.package_type,
      route: `${shipment.pickup_address} to ${shipment.delivery_address}`,
      source: "Shipment",
      onUse: () => reorderShipment(shipment)
    }));
    const quoteTemplates = (overview?.quoteRequests ?? []).slice(0, 4).map((quote) => ({
      id: quote.request_id,
      title: quote.package_type,
      route: `${quote.pickup_address} to ${quote.delivery_address}`,
      source: "Quote",
      onUse: () => applyQuoteTemplate(quote)
    }));
    return [...shipmentTemplateItems, ...quoteTemplates].slice(0, 6);
  })();

  const referralCode = useMemo(
    () => `FLY-${overview?.profile?.email?.split("@")[0]?.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10) || "CUSTOMER"}`,
    [overview?.profile?.email]
  );

  const referralTotal = useMemo(
    () => (overview?.referralRewards ?? []).reduce((total, reward) => total + Number(reward.reward_amount ?? 0), 0),
    [overview?.referralRewards]
  );

  const loyaltyTotal = useMemo(
    () => (overview?.loyaltyRewards ?? []).reduce((total, reward) => total + Number(reward.bonus_amount ?? 0), 0),
    [overview?.loyaltyRewards]
  );

  const rewardsProgress = useMemo(() => {
    const delivered = shipmentHistory.filter((shipment) => String(shipment.status ?? "").toUpperCase() === "DELIVERED").length;
    const milestones = [3, 10, 25, 50, 100];
    const nextMilestone = milestones.find((milestone) => delivered < milestone) ?? delivered + 25;
    return {
      delivered,
      nextMilestone,
      remaining: Math.max(0, nextMilestone - delivered),
      progress: Math.min(100, Math.round((delivered / Math.max(1, nextMilestone)) * 100)),
      availableRewards: (overview?.referralRewards ?? []).filter((reward) => ["APPROVED", "PAID", "APPLIED"].includes(String(reward.status ?? "").toUpperCase())).length
        + (overview?.loyaltyRewards ?? []).filter((reward) => ["APPROVED", "PAID", "APPLIED"].includes(String(reward.status ?? "").toUpperCase())).length
    };
  }, [overview?.loyaltyRewards, overview?.referralRewards, shipmentHistory]);

  const rewardLedger = useMemo(() => {
    const referrals = (overview?.referralRewards ?? []).map((reward) => ({
      id: `referral-${String(reward.id)}`,
      label: formatStatus(reward.reward_type ?? "Referral reward"),
      amount: Number(reward.reward_amount ?? 0),
      status: reward.status ?? "PENDING",
      date: reward.created_at,
      detail: reward.referral_code ? `Referral code ${reward.referral_code}` : "Referral reward activity"
    }));
    const loyalty = (overview?.loyaltyRewards ?? []).map((reward) => ({
      id: `loyalty-${String(reward.id)}`,
      label: formatStatus(reward.reward_type ?? "Loyalty reward"),
      amount: Number(reward.bonus_amount ?? 0),
      status: reward.status ?? "PENDING",
      date: reward.created_at,
      detail: reward.reason ?? "Repeat shipment loyalty activity"
    }));
    return [...referrals, ...loyalty]
      .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
      .slice(0, 12);
  }, [overview?.loyaltyRewards, overview?.referralRewards]);

  const nextRewardPath = useMemo(() => {
    if (rewardsProgress.remaining <= 0) return "You are eligible for the current loyalty milestone. Fly Logistics operations can review and approve the reward.";
    return `${rewardsProgress.remaining} more delivered shipment${rewardsProgress.remaining === 1 ? "" : "s"} to unlock the next loyalty review.`;
  }, [rewardsProgress.remaining]);

  const unreadNotifications = useMemo(
    () => (overview?.notifications ?? []).filter((notification) => !notification.read_at).length,
    [overview?.notifications]
  );

  const supportStats = useMemo(() => {
    const tickets = overview?.supportTickets ?? [];
    return {
      open: tickets.filter((ticket) => !["RESOLVED", "CLOSED", "REFUNDED"].includes(String(ticket.status ?? "").toUpperCase())).length,
      unread: tickets.reduce((sum, ticket) => sum + Number(ticket.unread_customer_count ?? 0), 0),
      urgent: tickets.filter((ticket) => String(ticket.priority ?? "").toUpperCase() === "URGENT").length
    };
  }, [overview?.supportTickets]);

  return (
    <CustomerShell active={activeSection} onNavigate={setActiveSection}>
      <InternationalCargoNotice
        enabled={Boolean(!loading && overview?.profile?.email)}
        customerEmail={overview?.profile?.email}
        onShipCargo={openInternationalCargoBooking}
      />
      <div className="grid gap-6">
        <DashboardSectionHeader
          eyebrow="Secure customer portal"
          title={`Welcome back${overview?.profile?.full_name ? `, ${overview.profile.full_name.split(" ")[0]}` : ""}.`}
          description="Track shipments, create bookings, manage payments, and contact support from one clean workspace."
          action={
            <Button type="button" variant="outline" onClick={loadOverview} disabled={loading} className="w-full sm:w-auto">
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Refresh
            </Button>
          }
        />

        {message && <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500"><CheckCircle2 className="size-4" />{message}</div>}
        {error && <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="size-4" />{error}</div>}
        {overview?.warnings?.map((warning) => (
          <div key={warning} className="flex gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            <AlertTriangle className="size-4" />
            {warning} This customer feature is being prepared by Fly Logistics operations.
          </div>
        ))}

        {loading ? (
          <Card className="glass">
            <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              Loading your customer operations data...
            </CardContent>
          </Card>
        ) : (
          <>
            {activeSection === "overview" && (
              <DashboardQuickActions
                title="Primary actions"
                description="Start the three most common customer jobs from one place."
                actions={[
                  {
                    label: "Create Shipment",
                    href: "/customer#customer-booking",
                    icon: Plus,
                    onClick: () => setActiveSection("booking")
                  },
                  {
                    label: "Track Shipment",
                    href: "/customer#customer-tracking",
                    icon: PackageSearch,
                    onClick: () => setActiveSection("tracking")
                  },
                  {
                    label: "Request Quote",
                    href: "/customer#customer-booking",
                    icon: ArrowRight,
                    onClick: () => setActiveSection("booking")
                  }
                ]}
              />
            )}

            <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${activeSection === "overview" ? "" : "hidden"}`}>
              {stats.map((stat) => (
                <DashboardStatCard key={stat.label} {...stat} compact />
              ))}
            </div>

            <section className={`grid gap-4 ${["booking", "wallet", "tracking", "map"].includes(activeSection) ? "" : "hidden"}`}>
              {activeSection === "booking" && (
              <div>
                <CustomerBookingWorkspace
                  key={overview?.profile?.email ?? "customer-booking"}
                  customer={overview?.profile ?? null}
                  wallet={overview?.wallet ?? null}
                  authorizedFetch={authorizedFetch}
                  onChanged={loadOverview}
                  prefill={bookingPrefill}
                />
              </div>
              )}
              {activeSection === "wallet" && (
              <div id="customer-wallet" className="scroll-mt-24">
                <CustomerWalletPanel
                  wallet={overview?.wallet ?? null}
                  transactions={overview?.walletTransactions ?? []}
                  onFundWallet={fundWallet}
                  authorizedFetch={authorizedFetch}
                />
              </div>
              )}
              {activeSection === "tracking" && (
              <div id="customer-tracking" className="scroll-mt-24">
                <CustomerTrackingPanel shipments={overview?.shipments ?? []} />
              </div>
              )}
              {activeSection === "map" && (
              <div id="customer-live-map" className="scroll-mt-24">
                <CustomerAccountMap shipments={overview?.shipments ?? []} />
              </div>
              )}
            </section>

            <section id="customer-profile" className={`grid gap-4 scroll-mt-24 ${activeSection === "profile" ? "" : "hidden"}`}>
              <div>
                <h2 className="text-2xl font-black">Profile</h2>
                <p className="text-sm text-muted-foreground">Manage your contact and security details.</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <Card className="glass">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCircle className="size-5 text-primary" />
                      Customer details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form className="grid gap-4" onSubmit={saveProfile}>
                      <div className="grid gap-2">
                        <Label htmlFor="dashboardCustomerEmail">Email</Label>
                        <Input id="dashboardCustomerEmail" value={overview?.profile.email ?? ""} readOnly className="font-mono text-sm" />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="dashboardCustomerFullName">Full name</Label>
                          <Input
                            id="dashboardCustomerFullName"
                            value={profileForm.fullName}
                            onChange={(event) => setProfileForm((current) => ({ ...current, fullName: event.target.value }))}
                            required
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="dashboardCustomerPhone">Phone</Label>
                          <Input
                            id="dashboardCustomerPhone"
                            value={profileForm.phone}
                            onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
                            placeholder="+234 706 107 2929"
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="dashboardCustomerCompany">Company</Label>
                        <Input
                          id="dashboardCustomerCompany"
                          value={profileForm.company}
                          onChange={(event) => setProfileForm((current) => ({ ...current, company: event.target.value }))}
                          placeholder="Company or personal account"
                        />
                      </div>
                      <Button disabled={savingProfile} className="w-full sm:w-fit">
                        {savingProfile ? <Loader2 className="animate-spin" /> : <Save />}
                        Save profile
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <div className="grid gap-4">
                  <Card className="glass">
                    <CardHeader>
                      <CardTitle>Account status</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 text-sm">
                      <div className="rounded-md border bg-background/40 p-3">
                        <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Role</span>
                        <Badge className="mt-2 border-primary/40 bg-primary/10 text-primary">{overview?.profile.role ?? "customer"}</Badge>
                      </div>
                      <div className="rounded-md border bg-background/40 p-3">
                        <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Wallet balance</span>
                        <span className="mt-2 block font-mono text-xl font-black">{moneyFormatter.format(Number(overview?.wallet?.balance ?? 0))}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <AccountPasswordPanel
                    title="Customer account security"
                    description="Change your customer portal password without leaving the dashboard."
                    successTitle="Customer password updated"
                    successDescription="Use your new customer password the next time you sign in."
                  />
                </div>
              </div>
            </section>

            <section className={`grid gap-4 xl:grid-cols-[1.25fr_0.75fr] ${activeSection === "overview" ? "" : "hidden"}`}>
              <Card className="glass scroll-mt-24">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <PackageCheck className="size-5 text-primary" />
                        Active shipments
                      </CardTitle>
                    </div>
                    <Badge className="border-primary/40 bg-primary/10 text-primary">{activeShipments.length} active</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {activeShipments.length === 0 && (
                    <div className="rounded-md border bg-background/35 p-4 text-sm text-muted-foreground">
                      No active shipment yet. Create a booking and operations will attach a tracking ID here.
                    </div>
                  )}
                  {activeShipments.slice(0, 4).map((shipment) => (
                    <div key={shipment.tracking_id} className="flex flex-col gap-3 rounded-md border bg-background/35 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-semibold">{shipment.tracking_id}</span>
                          <StatusBadge status={shipment.status} />
                        </div>
                        <p className="mt-2 truncate text-sm text-muted-foreground">{shipment.pickup_address} to {shipment.delivery_address}</p>
                        {shipment.customer_status_message && (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{shipment.customer_status_message}</p>
                        )}
                      </div>
                      <div className="grid gap-2 sm:flex sm:items-center">
                        <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                          <Link href="#customer-tracking" onClick={() => setActiveSection("tracking")}>
                            Track in portal <ArrowRight />
                          </Link>
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => reorderShipment(shipment)}>
                          <Repeat />
                          Reorder
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="glass">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Bell className="size-5 text-primary" />
                        Notifications
                      </CardTitle>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!unreadNotifications || updatingNotifications}
                      onClick={() => void markNotificationsRead()}
                    >
                      {updatingNotifications ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                      Mark read
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {notificationItems.map((notification) => (
                    <div key={String(notification.id)} className={`rounded-md border p-3 text-sm ${notification.read_at ? "bg-background/30 text-muted-foreground" : "bg-primary/10 text-foreground"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <span>
                          <span className="block font-semibold">{notification.title}</span>
                          <span className="mt-1 block leading-6 text-muted-foreground">{notification.body}</span>
                        </span>
                        {!notification.read_at && typeof notification.id === "number" && (
                          <Button type="button" size="sm" variant="outline" disabled={updatingNotifications} onClick={() => void markNotificationsRead(notification.id)}>
                            Read
                          </Button>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge>{formatStatus(notification.category)}</Badge>
                        {notification.created_at && <span className="text-xs text-muted-foreground">{formatDate(notification.created_at)}</span>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <section className={`grid gap-4 xl:grid-cols-3 ${activeSection === "overview" ? "" : "hidden"}`}>
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Repeat className="size-5 text-primary" />
                    Shipment templates
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Reuse saved shipment details.</p>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {shipmentTemplates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}
                  {shipmentTemplates.map((template) => (
                    <div key={`${template.source}-${template.id}`} className="rounded-md border bg-background/35 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{template.source}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">{template.id}</span>
                      </div>
                      <div className="mt-2 font-semibold">{template.title}</div>
                      <p className="mt-1 line-clamp-2 text-muted-foreground">{template.route}</p>
                      <Button type="button" size="sm" variant="outline" className="mt-3 w-full" onClick={template.onUse}>
                        <PackagePlus />
                        Use template
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="size-5 text-primary" />
                    Referrals and rewards
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Share your referral link and track rewards.</p>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  <div className="rounded-md border bg-background/40 p-3">
                    <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Referral code</span>
                    <span className="mt-2 block font-mono text-lg font-black">{referralCode}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-md border bg-background/40 p-3">
                      <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Referral rewards</span>
                      <span className="mt-2 block font-semibold">{moneyFormatter.format(referralTotal)}</span>
                    </div>
                    <div className="rounded-md border bg-background/40 p-3">
                      <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Loyalty bonuses</span>
                      <span className="mt-2 block font-semibold">{moneyFormatter.format(loyaltyTotal)}</span>
                    </div>
                  </div>
                  <Button type="button" variant="outline" className="w-full" onClick={() => void copyReferralLink()}>
                    <Copy />
                    Copy referral link
                  </Button>
                  {(overview?.referralRewards ?? []).slice(0, 2).map((reward) => (
                    <div key={String(reward.id)} className="rounded-md border bg-background/35 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span>{formatStatus(reward.reward_type ?? "reward")}</span>
                        <Badge className={paymentBadgeClass(reward.status)}>{formatStatus(reward.status ?? "pending")}</Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="size-5 text-primary" />
                    Loyalty and reviews
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">View loyalty rewards and reviews.</p>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  {(overview?.loyaltyRewards ?? []).length === 0 && (
                    <div className="rounded-md border bg-background/35 p-3 text-muted-foreground">
                      Loyalty rewards will appear after repeat paid shipments, merchant discounts, or admin-approved bonuses.
                    </div>
                  )}
                  {(overview?.loyaltyRewards ?? []).slice(0, 3).map((reward) => (
                    <div key={String(reward.id)} className="rounded-md border bg-background/35 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{formatStatus(reward.reward_type ?? "loyalty")}</span>
                        <Badge className={paymentBadgeClass(reward.status)}>{formatStatus(reward.status ?? "pending")}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{reward.reason ?? moneyFormatter.format(Number(reward.bonus_amount ?? 0))}</p>
                    </div>
                  ))}
                  {(overview?.testimonials ?? []).slice(0, 2).map((review) => (
                    <div key={String(review.id)} className="rounded-md border bg-background/35 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{Number(review.rating ?? 5)} star review</span>
                        <Badge>{formatStatus(review.status ?? "pending")}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-muted-foreground">{review.review ?? "Review submitted."}</p>
                    </div>
                  ))}
                  <Button asChild variant="outline" className="w-full">
                    <Link href="#customer-support" onClick={() => setActiveSection("support")}>
                      Share feedback <MessageCircle />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </section>

            <section id="customer-rewards" className={`grid gap-4 scroll-mt-24 ${activeSection === "rewards" ? "" : "hidden"}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-black">Rewards center</h2>
                  <p className="text-sm text-muted-foreground">Track referrals and loyalty benefits.</p>
                </div>
                <Button type="button" variant="outline" onClick={() => void copyReferralLink()} className="w-full sm:w-auto">
                  <Copy />
                  Copy referral link
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="glass lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Gift className="size-5 text-primary" />
                      Reward wallet
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">View approved bonuses and wallet benefits.</p>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-md border bg-background/40 p-4">
                        <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Referral total</span>
                        <span className="mt-2 block text-2xl font-black">{moneyFormatter.format(referralTotal)}</span>
                      </div>
                      <div className="rounded-md border bg-background/40 p-4">
                        <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Loyalty total</span>
                        <span className="mt-2 block text-2xl font-black">{moneyFormatter.format(loyaltyTotal)}</span>
                      </div>
                      <div className="rounded-md border bg-background/40 p-4">
                        <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Approved rewards</span>
                        <span className="mt-2 block text-2xl font-black">{rewardsProgress.availableRewards}</span>
                      </div>
                    </div>

                    <div className="rounded-md border bg-background/35 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Referral code</div>
                          <div className="mt-2 font-mono text-xl font-black">{referralCode}</div>
                        </div>
                        <Badge className="border-primary/40 bg-primary/10 text-primary">Share and earn</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">Approved referral bonuses appear here.</p>
                    </div>

                    <div className="grid gap-3">
                      {rewardLedger.map((reward) => (
                        <div key={reward.id} className="flex flex-col gap-3 rounded-md border bg-background/35 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-semibold">{reward.label}</div>
                            <p className="text-xs text-muted-foreground">{reward.date ? formatDate(reward.date) : "Reward activity"} - {reward.detail}</p>
                          </div>
                          <div className="flex items-center gap-2 sm:justify-end">
                            <span className="font-semibold">{moneyFormatter.format(reward.amount)}</span>
                            <Badge className={paymentBadgeClass(reward.status)}>{formatStatus(reward.status ?? "pending")}</Badge>
                          </div>
                        </div>
                      ))}
                      {rewardLedger.length === 0 && (
                        <div className="rounded-md border bg-background/35 p-4 text-sm text-muted-foreground">
                          Your reward ledger is empty for now. Book repeat shipments, refer customers, or share Fly Logistics with businesses to start earning.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="size-5 text-primary" />
                      Loyalty progress
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">Progress toward your next reward.</p>
                  </CardHeader>
                  <CardContent className="grid gap-4 text-sm">
                    <div className="rounded-md border bg-background/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Delivered shipments</span>
                        <span className="font-mono font-black">{rewardsProgress.delivered}/{rewardsProgress.nextMilestone}</span>
                      </div>
                      <div className="mt-4 h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${rewardsProgress.progress}%` }} />
                      </div>
                      <p className="mt-3 leading-6 text-muted-foreground">
                        {nextRewardPath}
                      </p>
                    </div>

                    {[
                      "Earn referral rewards when approved customers book with your link.",
                      "Repeat shipments can unlock wallet bonuses and merchant discounts.",
                      "Approved rewards are reviewed by Fly Logistics before payout or wallet credit.",
                      "Business referrals can be reviewed for affiliate-style payout opportunities."
                    ].map((item) => (
                      <div key={item} className="flex gap-2 rounded-md border bg-background/35 p-3">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span className="text-muted-foreground">{item}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </section>

            <section className={`grid gap-4 xl:grid-cols-3 ${["payments", "addresses", "support"].includes(activeSection) ? "" : "hidden"}`}>
              <Card id="customer-payments" className={`glass scroll-mt-24 ${activeSection === "payments" ? "" : "hidden"}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="size-5 text-primary" />
                    Invoices and payments
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {paymentItems.length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}
                  {paymentItems.slice(0, 4).map((item) => (
                    <div key={`${item.label}-${item.id}`} className="flex items-center justify-between gap-3 rounded-md border bg-background/35 p-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-mono font-semibold">{item.id}</span>
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold">{moneyFormatter.format(item.amount)}</span>
                        <span className="flex flex-wrap justify-end gap-2">
                          <PaymentBadge status={item.status} />
                          {String(item.status ?? "").toUpperCase() === "PAID" && item.receiptReference ? (
                            <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                              <a href={`/api/customer/receipts/${encodeURIComponent(item.receiptReference)}/pdf`} target="_blank" rel="noreferrer">
                                <Download className="size-3" />
                                Receipt
                              </a>
                            </Button>
                          ) : null}
                        </span>
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card id="customer-addresses" className={`glass scroll-mt-24 ${activeSection === "addresses" ? "" : "hidden"}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bookmark className="size-5 text-primary" />
                    Saved addresses
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Save addresses for faster booking.</p>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <form className="grid gap-3 rounded-md border bg-background/35 p-3" onSubmit={saveAddress}>
                    <div className="grid gap-2">
                      <Label htmlFor="customerAddressLabel">Label</Label>
                      <Input id="customerAddressLabel" value={addressForm.label} onChange={(event) => setAddressForm((current) => ({ ...current, label: event.target.value }))} placeholder="Home, office, warehouse" required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="customerAddressType">Type</Label>
                      <select
                        id="customerAddressType"
                        value={addressForm.addressType}
                        onChange={(event) => setAddressForm((current) => ({ ...current, addressType: event.target.value }))}
                        className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                      >
                        {["delivery", "pickup", "billing", "office", "warehouse"].map((type) => (
                          <option key={type} value={type}>{formatStatus(type)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="customerAddress">Address</Label>
                      <Input id="customerAddress" value={addressForm.address} onChange={(event) => setAddressForm((current) => ({ ...current, address: event.target.value }))} placeholder="Street, landmark, city" required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="customerAddressCity">City</Label>
                      <Input id="customerAddressCity" value={addressForm.city} onChange={(event) => setAddressForm((current) => ({ ...current, city: event.target.value }))} placeholder="Lagos" />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={addressForm.isDefault}
                        onChange={(event) => setAddressForm((current) => ({ ...current, isDefault: event.target.checked }))}
                        className="size-4 accent-primary"
                      />
                      Make default address
                    </label>
                    <Button type="submit" disabled={savingAddress}>
                      {savingAddress ? <Loader2 className="animate-spin" /> : <Plus />}
                      Save address
                    </Button>
                  </form>

                  {savedAddresses.length === 0 && <p className="text-sm text-muted-foreground">No saved addresses yet.</p>}
                  {savedAddresses.map((address) => (
                    <div key={`${address.type}-${address.label}`} className="rounded-md border bg-background/35 p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{address.type}</Badge>
                          {address.isDefault && <Badge className="border-primary/40 bg-primary/10 text-primary">Default</Badge>}
                        </div>
                        {address.persisted && address.id !== undefined ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={deletingAddressId === String(address.id)}
                            onClick={() => void deleteAddress(address.id as string | number)}
                          >
                            {deletingAddressId === String(address.id) ? <Loader2 className="animate-spin" /> : <Trash2 />}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{address.count} use{address.count === 1 ? "" : "s"}</span>
                        )}
                      </div>
                      <div className="mt-2 font-semibold">{address.name}</div>
                      <p className="mt-2 line-clamp-2 text-muted-foreground">{address.label}</p>
                      {address.city && <p className="mt-1 text-xs text-muted-foreground">{address.city}</p>}
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => applyAddressForBooking(address, "pickup")}>
                          Pickup
                        </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => applyAddressForBooking(address, "delivery")}>
                          Delivery
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card id="customer-support" className={`glass scroll-mt-24 ${activeSection === "support" ? "" : "hidden"}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Headphones className="size-5 text-primary" />
                    Support center
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Get help with your account or shipment.</p>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "Open tickets", value: supportStats.open },
                      { label: "Unread replies", value: supportStats.unread },
                      { label: "Urgent cases", value: supportStats.urgent }
                    ].map((item) => (
                      <div key={item.label} className="rounded-md border bg-background/40 p-3">
                        <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</span>
                        <span className="mt-2 block text-xl font-black">{item.value}</span>
                      </div>
                    ))}
                  </div>
                  <form className="grid gap-3 rounded-md border bg-background/35 p-3" onSubmit={openSupportTicket}>
                    <div className="grid gap-2">
                      <Label htmlFor="supportSubject">Subject</Label>
                      <Input id="supportSubject" value={supportForm.subject} onChange={(event) => setSupportForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Delivery question" required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="supportTracking">Tracking ID</Label>
                      <Input id="supportTracking" value={supportForm.trackingId} onChange={(event) => setSupportForm((current) => ({ ...current, trackingId: event.target.value }))} placeholder="Optional" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="supportPriority">Priority</Label>
                      <select
                        id="supportPriority"
                        value={supportForm.priority}
                        onChange={(event) => setSupportForm((current) => ({ ...current, priority: event.target.value }))}
                        className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                      >
                        {["NORMAL", "HIGH", "URGENT"].map((priority) => (
                          <option key={priority} value={priority}>{formatStatus(priority)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="supportType">Request type</Label>
                      <select
                        id="supportType"
                        value={supportForm.ticketType}
                        onChange={(event) => setSupportForm((current) => ({ ...current, ticketType: event.target.value }))}
                        className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                      >
                        {["support", "dispute", "failed_delivery", "refund"].map((type) => (
                          <option key={type} value={type}>{formatStatus(type)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="supportDisputeCategory">Category</Label>
                        <Input
                          id="supportDisputeCategory"
                          value={supportForm.disputeCategory}
                          onChange={(event) => setSupportForm((current) => ({ ...current, disputeCategory: event.target.value }))}
                          placeholder="Late delivery, damaged item, refund"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="supportRefundAmount">Refund amount</Label>
                        <Input
                          id="supportRefundAmount"
                          inputMode="decimal"
                          value={supportForm.refundAmount}
                          onChange={(event) => setSupportForm((current) => ({ ...current, refundAmount: event.target.value }))}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="supportMessage">Message</Label>
                      <textarea
                        id="supportMessage"
                        value={supportForm.message}
                        onChange={(event) => setSupportForm((current) => ({ ...current, message: event.target.value }))}
                        placeholder="Tell customer care what you need help with."
                        required
                        className="min-h-24 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
                      />
                    </div>
                    <Button type="submit" disabled={savingTicket}>
                      {savingTicket ? <Loader2 className="animate-spin" /> : <Send />}
                      Open ticket
                    </Button>
                  </form>

                  {(overview?.supportTickets ?? []).slice(0, 6).map((ticket) => {
                    const ticketId = ticket.ticket_id;
                    const messages = supportMessages[ticketId] ?? [];
                    const isOpen = activeSupportTicketId === ticketId;
                    return (
                      <div key={ticketId} className="rounded-md border bg-background/35 p-3 text-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-semibold">{ticketId}</span>
                              <Badge>{formatStatus(ticket.status)}</Badge>
                              <Badge className={ticket.priority === "URGENT" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/40 bg-primary/10 text-primary"}>{formatStatus(ticket.priority)}</Badge>
                              {ticket.ticket_type && <Badge>{formatStatus(ticket.ticket_type)}</Badge>}
                              {Number(ticket.unread_customer_count ?? 0) > 0 && <Badge className="border-primary/40 bg-primary/10 text-primary">{ticket.unread_customer_count} unread</Badge>}
                            </div>
                            <div className="mt-2 font-semibold">{ticket.subject}</div>
                            <p className="mt-1 line-clamp-2 text-muted-foreground">{ticket.message}</p>
                            {ticket.resolution_status && <p className="mt-2 text-xs text-muted-foreground">Resolution: {formatStatus(ticket.resolution_status)}</p>}
                            {ticket.last_message_at && <p className="mt-1 text-xs text-muted-foreground">Last activity: {formatDate(ticket.last_message_at)}</p>}
                          </div>
                          <Button
                            type="button"
                            variant={isOpen ? "default" : "outline"}
                            disabled={loadingSupportChat === ticketId}
                            onClick={() => void loadSupportThread(ticketId)}
                            className="w-full sm:w-auto"
                          >
                            {loadingSupportChat === ticketId ? <Loader2 className="animate-spin" /> : <MessageCircle />}
                            {isOpen ? "Refresh chat" : "Open chat"}
                          </Button>
                        </div>

                        {isOpen && (
                          <div className="mt-4 grid gap-3 rounded-md border bg-background/45 p-3">
                            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                              {messages.length === 0 && (
                                <div className="rounded-md border bg-background/40 p-3 text-muted-foreground">
                                  No live chat messages yet. Send a message and customer support will reply here.
                                </div>
                              )}
                              {messages.map((chat) => {
                                const mine = chat.sender_role === "customer";
                                return (
                                  <div key={String(chat.id)} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[86%] rounded-md border p-3 ${mine ? "border-primary/30 bg-primary/10" : "bg-background/70"}`}>
                                      <div className="text-xs font-semibold text-muted-foreground">
                                        {mine ? "You" : chat.sender_name ?? "Fly Logistics support"} {formatDate(chat.created_at) ? `- ${formatDate(chat.created_at)}` : ""}
                                      </div>
                                      <p className="mt-1 leading-6">{chat.message}</p>
                                      {chat.attachment_url && (
                                        <a className="mt-2 inline-block text-xs font-semibold text-primary underline" href={chat.attachment_url} target="_blank" rel="noreferrer">
                                          View attachment
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                              <div className="md:col-span-2 flex flex-wrap gap-2">
                                {customerSupportQuickReplies.map((reply) => (
                                  <Button
                                    key={reply}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-auto whitespace-normal text-left"
                                    onClick={() => setSupportMessageDrafts((current) => ({ ...current, [ticketId]: reply }))}
                                  >
                                    {reply}
                                  </Button>
                                ))}
                              </div>
                              <textarea
                                value={supportMessageDrafts[ticketId] ?? ""}
                                onChange={(event) => setSupportMessageDrafts((current) => ({ ...current, [ticketId]: event.target.value }))}
                                placeholder="Reply to Fly Logistics support..."
                                className="min-h-20 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
                              />
                              <Button type="button" disabled={loadingSupportChat === ticketId} onClick={() => void sendSupportMessage(ticketId)} className="w-full md:w-auto">
                                {loadingSupportChat === ticketId ? <Loader2 className="animate-spin" /> : <Send />}
                                Send reply
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <Button asChild>
                    <Link href="#customer-support" onClick={() => setActiveSection("support")}>
                      <MessageCircle />
                      Ask support inside portal
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <a href={getWhatsAppUrl(whatsappMessages.generalSupport())} target="_blank" rel="noreferrer">
                      <MessageCircle />
                      Chat on WhatsApp
                    </a>
                  </Button>
                  <p className="text-xs text-muted-foreground">Support can reference your quote IDs, tracking IDs, payments, and delivery history.</p>
                </CardContent>
              </Card>
            </section>

            <section className={`grid gap-4 ${activeSection === "shipments" ? "" : "hidden"}`}>
              <div className="flex items-center gap-2">
                <History className="size-5 text-primary" />
                <div>
                  <h2 className="text-2xl font-black">Shipment history</h2>
                  <p className="text-sm text-muted-foreground">Delivered and cancelled shipments remain available for customer records.</p>
                </div>
              </div>
              <Card className="glass">
                <CardContent className="grid gap-3 p-5">
                  {shipmentHistory.length === 0 && <p className="text-sm text-muted-foreground">No completed shipment history yet.</p>}
                  {shipmentHistory.slice(0, 5).map((shipment) => (
                    <div key={shipment.tracking_id} className="flex flex-col gap-2 rounded-md border bg-background/35 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        <span className="block font-mono font-semibold">{shipment.tracking_id}</span>
                        <span className="text-muted-foreground">{shipment.package_type}</span>
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge status={shipment.status} />
                        <PaymentBadge status={shipment.payment_status} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <section id="customer-shipments" className={`grid gap-4 scroll-mt-24 ${activeSection === "shipments" ? "" : "hidden"}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-black">Your shipments</h2>
                  <p className="text-sm text-muted-foreground">Live shipment records connected to your account email.</p>
                </div>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="#customer-tracking" onClick={() => setActiveSection("tracking")}>
                    Track in dashboard <PackageCheck />
                  </Link>
                </Button>
              </div>
              <div className="grid gap-3 rounded-md border bg-background/35 p-3 md:grid-cols-3">
                <div className="grid gap-1">
                  <Label htmlFor="customerShipmentSearch">Search</Label>
                  <Input
                    id="customerShipmentSearch"
                    value={customerShipmentFilters.query}
                    onChange={(event) => setCustomerShipmentFilters((current) => ({ ...current, query: event.target.value }))}
                    placeholder="Tracking ID, route, package"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="customerShipmentStatus">Status</Label>
                  <select
                    id="customerShipmentStatus"
                    value={customerShipmentFilters.status}
                    onChange={(event) => setCustomerShipmentFilters((current) => ({ ...current, status: event.target.value }))}
                    className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    {["all", "PENDING", "PENDING_PICKUP", "CONFIRMED", "DRIVER_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "ARRIVED", "DELIVERED", "CANCELLED"].map((status) => (
                      <option key={status} value={status}>{status === "all" ? "All statuses" : formatStatus(status)}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="customerShipmentPayment">Payment</Label>
                  <select
                    id="customerShipmentPayment"
                    value={customerShipmentFilters.paymentStatus}
                    onChange={(event) => setCustomerShipmentFilters((current) => ({ ...current, paymentStatus: event.target.value }))}
                    className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    {["all", "PAID", "UNPAID", "PENDING", "FAILED"].map((status) => (
                      <option key={status} value={status}>{status === "all" ? "All payments" : formatStatus(status)}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground md:col-span-3">Showing {filteredCustomerShipments.length} of {overview?.shipments.length ?? 0} shipments.</p>
              </div>

              {!overview?.shipments.length && (
                <Card className="glass">
                  <CardContent className="grid gap-3 p-6 text-sm text-muted-foreground">
                    <p>No shipments are linked to this email yet. Once operations converts your quote into a shipment, it will appear here.</p>
                    <Button asChild className="w-full sm:w-fit">
                      <Link href="#customer-booking" onClick={() => setActiveSection("booking")}>Request a booking</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
              {Boolean(overview?.shipments.length) && filteredCustomerShipments.length === 0 && (
                <Card className="glass">
                  <CardContent className="p-6 text-sm text-muted-foreground">No shipments match these filters.</CardContent>
                </Card>
              )}

              <div className="grid gap-4">
                {filteredCustomerShipments.map((shipment) => (
                  <Card key={shipment.tracking_id} className="glass overflow-hidden">
                    <CardHeader>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="font-mono text-xl">{shipment.tracking_id}</CardTitle>
                            <StatusBadge status={shipment.status} />
                            <PaymentBadge status={shipment.payment_status} />
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{shipment.pickup_address} to {shipment.delivery_address}</p>
                        </div>
                        <div className="grid gap-2 sm:flex sm:items-center">
                          <Button asChild variant="outline" className="w-full lg:w-auto">
                            <Link href="#customer-tracking" onClick={() => setActiveSection("tracking")}>
                              Track in portal <ArrowRight />
                            </Link>
                          </Button>
                          <Button type="button" variant="outline" className="w-full lg:w-auto" onClick={() => reorderShipment(shipment)}>
                            <Repeat />
                            Reorder
                          </Button>
                          {String(shipment.payment_status ?? "").toUpperCase() === "PAID" ? (
                            <Button asChild variant="outline" className="w-full lg:w-auto">
                              <a href={`/api/customer/receipts/${encodeURIComponent(shipment.payment_reference ?? shipment.tracking_id)}/pdf`} target="_blank" rel="noreferrer">
                                <Download />
                                Receipt
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-md border bg-background/40 p-3 text-sm">
                          <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Package</span>
                          <span className="mt-2 block font-semibold">{shipment.package_type}</span>
                        </div>
                        <div className="rounded-md border bg-background/40 p-3 text-sm">
                          <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">ETA</span>
                          <span className="mt-2 block font-semibold">{shipment.eta ?? "Pending"}</span>
                        </div>
                        <div className="rounded-md border bg-background/40 p-3 text-sm">
                          <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Driver</span>
                          <span className="mt-2 block font-semibold">{shipment.assigned_driver?.name ?? "Unassigned"}</span>
                        </div>
                        <div className="rounded-md border bg-background/40 p-3 text-sm">
                          <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Payment</span>
                          <span className="mt-2 block font-semibold">{moneyFormatter.format(Number(shipment.payment_amount ?? shipment.quoted_price ?? 0))}</span>
                        </div>
                      </div>

                      {String(shipment.payment_status ?? "UNPAID").toUpperCase() !== "PAID" && Number(shipment.payment_amount ?? shipment.quoted_price ?? 0) > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={walletPaymentId === shipment.tracking_id}
                          onClick={() => void payWithWallet({ trackingId: shipment.tracking_id })}
                          className="w-full sm:w-fit"
                        >
                          {walletPaymentId === shipment.tracking_id ? <Loader2 className="animate-spin" /> : <CreditCard />}
                          Pay with wallet
                        </Button>
                      )}

                      {shipment.customer_status_message && (
                        <div className="rounded-md border border-primary/25 bg-primary/10 p-4 text-sm">
                          <div className="font-semibold text-foreground">Fly Logistics update</div>
                          <p className="mt-1 leading-6 text-muted-foreground">{shipment.customer_status_message}</p>
                        </div>
                      )}

                      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                        <div className="grid gap-2">
                          <h3 className="text-sm font-semibold">Timeline</h3>
                          {publicShipmentTimeline(shipment).map((event, index) => (
                            <div key={`${shipment.tracking_id}-${event.label}-${index}`} className="flex flex-col gap-2 rounded-md border bg-background/35 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                              <span className="flex min-w-0 items-start gap-2">
                                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                                <span>
                                  <span className="block font-medium">{event.label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {event.location || "Fly Logistics network"}{formatDate(event.occurred_at) ? ` - ${formatDate(event.occurred_at)}` : ""}
                                  </span>
                                </span>
                              </span>
                              <Badge className={event.completed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                                {event.completed ? "Complete" : "Pending"}
                              </Badge>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-md border bg-background/40 p-3">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <ShieldCheck className="size-4 text-primary" />
                            Delivery completion
                          </div>
                          <p className="mt-3 text-sm text-muted-foreground">
                            Delivery media is securely reviewed by Fly Logistics operations. Contact support if your business needs a delivery document.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section id="customer-quotes" className={`grid gap-4 scroll-mt-24 ${activeSection === "quotes" ? "" : "hidden"}`}>
              <div>
                <h2 className="text-2xl font-black">Quote requests</h2>
                <p className="text-sm text-muted-foreground">Bookings submitted with your account email, including payment readiness.</p>
              </div>
              <div className="grid gap-3 rounded-md border bg-background/35 p-3 md:grid-cols-3">
                <div className="grid gap-1">
                  <Label htmlFor="customerQuoteSearch">Search</Label>
                  <Input
                    id="customerQuoteSearch"
                    value={customerQuoteFilters.query}
                    onChange={(event) => setCustomerQuoteFilters((current) => ({ ...current, query: event.target.value }))}
                    placeholder="Request ID, route, package"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="customerQuoteStatus">Status</Label>
                  <select
                    id="customerQuoteStatus"
                    value={customerQuoteFilters.status}
                    onChange={(event) => setCustomerQuoteFilters((current) => ({ ...current, status: event.target.value }))}
                    className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    {["all", "PENDING_REVIEW", "QUOTED", "ACCEPTED", "DECLINED", "EXPIRED", "PAID", "CONVERTED_TO_SHIPMENT"].map((status) => (
                      <option key={status} value={status}>{status === "all" ? "All statuses" : formatStatus(status)}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="customerQuotePayment">Payment</Label>
                  <select
                    id="customerQuotePayment"
                    value={customerQuoteFilters.paymentStatus}
                    onChange={(event) => setCustomerQuoteFilters((current) => ({ ...current, paymentStatus: event.target.value }))}
                    className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    {["all", "PAID", "UNPAID", "PENDING", "FAILED"].map((status) => (
                      <option key={status} value={status}>{status === "all" ? "All payments" : formatStatus(status)}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground md:col-span-3">Showing {filteredCustomerQuotes.length} of {overview?.quoteRequests.length ?? 0} quote requests.</p>
              </div>
              {!overview?.quoteRequests.length && (
                <Card className="glass">
                  <CardContent className="p-6 text-sm text-muted-foreground">No quote requests are linked to your email yet.</CardContent>
                </Card>
              )}
              {Boolean(overview?.quoteRequests.length) && filteredCustomerQuotes.length === 0 && (
                <Card className="glass">
                  <CardContent className="p-6 text-sm text-muted-foreground">No quote requests match these filters.</CardContent>
                </Card>
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredCustomerQuotes.map((quote) => {
                  const paid = quote.payment_status === "PAID";
                  const canRespond = canCustomerRespondToQuote(quote.status, quote.quote_valid_until);
                  const canPay = canPayQuote(quote.status, quote.payment_status, quote.quote_valid_until);
                  const amount = quoteDisplayAmount(quote);
                  return (
                    <Card key={quote.request_id} className="glass">
                      <CardHeader>
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="font-mono text-lg">{quote.request_id}</CardTitle>
                          <Badge className={quoteLifecycleTone(quote.status)}>{quoteStatusLabel(quote.status)}</Badge>
                          <PaymentBadge status={quote.payment_status} />
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-4 text-sm">
                        <div className="text-muted-foreground">{quote.pickup_address} to {quote.delivery_address}</div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <span className="rounded-md border bg-background/40 p-3">
                            <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Package</span>
                            <span className="mt-2 block font-semibold">{quote.package_type}</span>
                          </span>
                          <span className="rounded-md border bg-background/40 p-3">
                            <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">ETA</span>
                            <span className="mt-2 block font-semibold">{quoteDisplayEta(quote)}</span>
                          </span>
                          <span className="rounded-md border bg-background/40 p-3">
                            <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Quoted amount</span>
                            <span className="mt-2 block font-semibold">{moneyFormatter.format(amount)}</span>
                          </span>
                        </div>
                        {(quote.quote_notes || quote.review_notes || quote.quote_valid_until) && (
                          <div className="rounded-md border bg-background/40 p-3 text-muted-foreground">
                            {(quote.quote_notes || quote.review_notes) && <p>{quote.quote_notes ?? quote.review_notes}</p>}
                            {quote.quote_valid_until && <p className="mt-2 text-xs">Valid until {formatDate(quote.quote_valid_until)}</p>}
                          </div>
                        )}
                        {canRespond && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button
                              type="button"
                              disabled={quoteActionId === `${quote.request_id}:accept`}
                              onClick={() => void respondToQuote(quote.request_id, "accept")}
                              className="w-full"
                            >
                              {quoteActionId === `${quote.request_id}:accept` ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                              Accept Quote
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={quoteActionId === `${quote.request_id}:decline`}
                              onClick={() => void respondToQuote(quote.request_id, "decline")}
                              className="w-full"
                            >
                              {quoteActionId === `${quote.request_id}:decline` ? <Loader2 className="animate-spin" /> : <AlertTriangle />}
                              Decline Quote
                            </Button>
                          </div>
                        )}
                        {canPay && (
                          <Button type="button" disabled={paymentLoadingId === quote.request_id} onClick={() => void startPayment(quote.request_id, "flutterwave")} className="w-full">
                            {paymentLoadingId === quote.request_id ? <Loader2 className="animate-spin" /> : <CreditCard />}
                            Pay with Flutterwave
                          </Button>
                        )}
                        {canPay && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={walletPaymentId === quote.request_id}
                            onClick={() => void payWithWallet({ requestId: quote.request_id })}
                            className="w-full"
                          >
                            {walletPaymentId === quote.request_id ? <Loader2 className="animate-spin" /> : <CreditCard />}
                            Pay with wallet
                          </Button>
                        )}
                        {paid && (
                          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-500">
                            Payment complete. Operations can now convert this quote into a shipment.
                          </div>
                        )}
                        {!canRespond && !canPay && !paid && (
                          <div className="rounded-md border bg-background/40 p-3 text-sm text-muted-foreground">
                            {quoteStatusLabel(quote.status)}. Payment becomes available after you accept an active quote.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </CustomerShell>
  );
}
