"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, PackagePlus, Plus, Trash2, Wallet } from "lucide-react";
import { flyError, flyInfo, flySuccess } from "@/components/feedback/fly-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountryStateSelect } from "@/components/shipments/country-state-select";
import { CryptoPaymentPanel, type CryptoPayment } from "@/components/payments/crypto-payment-panel";
import { freightClassificationOptions, freightModeOptions, supportedCurrencies } from "@/lib/international";
import { deliveryTypeOptions, pricingUrgencies } from "@/lib/pricing";

type CustomerProfile = {
  email: string | null;
  full_name: string | null;
  phone?: string | null;
};

type WalletSummary = {
  balance?: number | string | null;
  currency?: string | null;
} | null;

type BookingForm = {
  recipientName: string;
  pickupPhone: string;
  deliveryPhone: string;
  pickupCountry: string;
  destinationCountry: string;
  pickupState: string;
  destinationState: string;
  pickupAddress: string;
  deliveryAddress: string;
  packageType: string;
  weightKg: string;
  freightMode: string;
  quoteCurrency: string;
  freightClassification: string;
  customsInformation: string;
  packageValue: string;
  dutiesTaxesAmount: string;
  exportImportDocuments: string;
  urgency: string;
  deliveryCategory: string;
  notes: string;
};

type CartItem = BookingForm & {
  id: string;
  amount: number;
  formattedAmount: string;
  formattedByCurrency?: Record<string, string>;
  international?: {
    freightModeLabel: string;
    freightClassificationLabel: string;
    formattedQuoteAmount: string;
    trackingLabel: string;
    etaLabel: string;
  };
  etaLabel: string;
  vehicleType: string;
  deliveryType: string;
  warnings: string[];
  requestId?: string;
};

const initialForm: BookingForm = {
  recipientName: "",
  pickupPhone: "",
  deliveryPhone: "",
  pickupCountry: "Nigeria",
  destinationCountry: "Nigeria",
  pickupState: "LA",
  destinationState: "LA",
  pickupAddress: "",
  deliveryAddress: "",
  packageType: "",
  weightKg: "2",
  freightMode: "air_freight",
  quoteCurrency: "NGN",
  freightClassification: "general_cargo",
  customsInformation: "",
  packageValue: "",
  dutiesTaxesAmount: "",
  exportImportDocuments: "",
  urgency: "standard",
  deliveryCategory: "local_nigeria",
  notes: ""
};

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 0,
  style: "currency"
});

export function CustomerBookingWorkspace({
  customer,
  wallet,
  authorizedFetch,
  onChanged,
  prefill
}: {
  customer: CustomerProfile | null;
  wallet?: WalletSummary;
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onChanged: () => void;
  prefill?: Partial<BookingForm> & { id?: string };
}) {
  const [form, setForm] = useState<BookingForm>(initialForm);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState<"wallet" | "flutterwave" | "crypto" | null>(null);
  const [cryptoNetwork, setCryptoNetwork] = useState<"TRC20" | "BEP20" | "SOL" | "BTC">("TRC20");
  const [cryptoPayment, setCryptoPayment] = useState<CryptoPayment | null>(null);
  const [showPaymentStep, setShowPaymentStep] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => items.reduce((sum, item) => sum + item.amount, 0), [items]);
  const allSubmitted = items.length > 0 && items.every((item) => item.requestId);
  const rawWalletBalance = Number(wallet?.balance ?? 0);
  const walletBalance = Number.isFinite(rawWalletBalance) ? rawWalletBalance : 0;
  const selectedDeliveryType = useMemo(
    () => deliveryTypeOptions.find((option) => option.value === form.deliveryCategory) ?? deliveryTypeOptions[0],
    [form.deliveryCategory]
  );

  useEffect(() => {
    if (!prefill) return;
    const { id: _id, ...fields } = prefill;
    void _id;
    setForm((current) => ({ ...current, ...fields }));
  }, [prefill]);

  function update(field: keyof BookingForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateDeliveryCategory(value: string) {
    setForm((current) => ({
      ...current,
      deliveryCategory: value,
      pickupCountry: value === "international_import" ? "" : "Nigeria",
      destinationCountry: value === "international_export" ? "" : "Nigeria",
      pickupState: value === "international_import" ? "" : current.pickupState || "LA",
      destinationState: value === "international_export" ? "" : current.destinationState || "LA"
    }));
  }

  async function addOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingPrice(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/pricing/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, weightKg: Number(form.weightKg) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to calculate shipping price.");

      setItems((current) => [
        ...current,
        {
          ...form,
          id: crypto.randomUUID(),
          amount: Number(data.amount ?? 0),
          formattedAmount: data.formattedAmount ?? moneyFormatter.format(Number(data.amount ?? 0)),
          formattedByCurrency: data.formattedByCurrency,
          international: data.international,
          etaLabel: data.etaLabel ?? "ETA pending",
          vehicleType: data.vehicleType ?? "Vehicle pending",
          deliveryType: data.deliveryType ?? "Delivery",
          warnings: data.warnings ?? []
        }
      ]);
      setForm((current) => ({
        ...initialForm,
        deliveryCategory: current.deliveryCategory,
        pickupCountry: current.deliveryCategory === "international_import" ? "" : "Nigeria",
        destinationCountry: current.deliveryCategory === "international_export" ? "" : "Nigeria",
        pickupState: current.deliveryCategory === "international_import" ? "" : "LA",
        destinationState: current.deliveryCategory === "international_export" ? "" : "LA"
      }));
      const success = "Shipping price added to your booking cart.";
      setMessage(success);
      flySuccess(success, "You can add more orders or continue to payment.");
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to calculate shipping price.";
      setError(nextError);
      flyError("Unable to calculate shipping price", nextError);
    } finally {
      setLoadingPrice(false);
    }
  }

  async function createBookings(): Promise<CartItem[] | null> {
    if (!items.length) return null;
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const nextItems: CartItem[] = [];
      for (const item of items) {
        if (item.requestId) {
          nextItems.push(item);
          continue;
        }
        const response = await authorizedFetch("/api/quote-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerName: customer?.full_name ?? "Fly Logistics Customer",
            customerEmail: customer?.email ?? "",
            customerPhone: customer?.phone || item.pickupPhone,
            recipientName: item.recipientName,
            pickupPhone: item.pickupPhone,
            deliveryPhone: item.deliveryPhone,
            pickupCountry: item.pickupCountry,
            destinationCountry: item.destinationCountry,
            pickupState: item.pickupState,
            destinationState: item.destinationState,
            pickupAddress: item.pickupAddress,
            deliveryAddress: item.deliveryAddress,
            packageType: item.packageType,
            weightKg: Number(item.weightKg),
            freightMode: item.freightMode,
            quoteCurrency: item.quoteCurrency,
            freightClassification: item.freightClassification,
            customsInformation: item.customsInformation,
            packageValue: item.packageValue ? Number(item.packageValue) : undefined,
            dutiesTaxesAmount: item.dutiesTaxesAmount ? Number(item.dutiesTaxesAmount) : undefined,
            exportImportDocuments: item.exportImportDocuments,
            urgency: item.urgency,
            deliveryCategory: item.deliveryCategory,
            notes: item.notes,
            formStartedAt: Date.now() - 3000
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to create one of the bookings.");
        nextItems.push({ ...item, requestId: data.request_id });
      }
      setItems(nextItems);
      const success = `${nextItems.length} booking${nextItems.length === 1 ? "" : "s"} created. You can now pay together.`;
      setMessage(success);
      flySuccess("Booking saved", success);
      onChanged();
      return nextItems;
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to create bookings.";
      setError(nextError);
      flyError("Unable to create booking", nextError);
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function payAll(method: "wallet" | "flutterwave" | "crypto") {
    setPaying(method);
    setError(null);
    setMessage(null);

    try {
      if (method === "wallet" && walletBalance < total) {
        throw new Error(`Your wallet balance is ${moneyFormatter.format(walletBalance)}. Fund your wallet or choose secure card/bank checkout to pay ${moneyFormatter.format(total)}.`);
      }

      const payableItems = allSubmitted ? items : await createBookings();
      const payableRequestIds = (payableItems ?? []).map((item) => item.requestId).filter(Boolean) as string[];
      if (!payableRequestIds.length) throw new Error("Book the shipping orders before payment.");

      if (method === "wallet") {
        const response = await authorizedFetch("/api/customer/wallet/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestIds: payableRequestIds })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to pay with wallet.");
        const success = `Wallet payment complete. ${data.shipments?.length ?? 0} shipment${data.shipments?.length === 1 ? "" : "s"} created.`;
        setMessage(success);
        flySuccess("Payment complete", success);
        setItems([]);
        setShowPaymentStep(false);
        onChanged();
        return;
      }

      const response = await authorizedFetch(`/api/payments/${method}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "crypto" ? { requestIds: payableRequestIds, network: cryptoNetwork } : { requestIds: payableRequestIds })
      });
      const data = await response.json();
      if (method === "crypto") {
        if (!response.ok || !data.payment) throw new Error(data.error ?? "Unable to prepare crypto payment.");
        setCryptoPayment(data.payment);
        flyInfo("Crypto payment prepared", "Send the exact amount and submit the blockchain transaction hash for review.");
        return;
      }
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error ?? "Unable to start secure checkout.");
      flyInfo("Opening Fly Logistics checkout", "Your secure payment page is loading.");
      window.location.assign(data.checkoutUrl);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to complete payment.";
      setError(nextError);
      flyError("Unable to complete payment", nextError);
    } finally {
      setPaying(null);
    }
  }

  function openPaymentStep() {
    if (!items.length) {
      const nextError = "Add at least one shipping order before payment.";
      setError(nextError);
      flyError("Booking cart is empty", nextError);
      return;
    }
    setShowPaymentStep(true);
    flyInfo("Choose payment method", "Wallet balance and Flutterwave checkout are ready.");
  }

  function clearCart() {
    if (!items.length) return;
    setItems([]);
    setShowPaymentStep(false);
    setMessage("Booking cart cleared.");
    flyInfo("Booking cart cleared");
  }

  return (
    <Card id="customer-booking" className="glass scroll-mt-24 overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-primary/40 bg-primary/10 text-primary">Customer booking</Badge>
          <Badge>Multi-order checkout</Badge>
        </div>
        <CardTitle className="mt-3 text-2xl">Book shipping inside your account</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Add pickup and delivery details, get the shipping price, add more shipping orders, then pay everything together with wallet or Flutterwave.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        {message && <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500"><CheckCircle2 className="size-4" />{message}</div>}
        {error && <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="size-4" />{error}</div>}

        <form className="grid gap-4 rounded-md border bg-background/35 p-4" onSubmit={addOrder}>
          <div className="grid gap-3 rounded-md border border-primary/25 bg-primary/5 p-4">
            <div>
              <div className="font-semibold">1. Select delivery type</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Choose local Nigeria, international import, or international export before entering pickup and receiver details.
              </p>
            </div>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Delivery type</Label>
                <select value={form.deliveryCategory} onChange={(event) => updateDeliveryCategory(event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                  {deliveryTypeOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <p className="text-xs leading-5 text-muted-foreground">{selectedDeliveryType.detail}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 rounded-md border bg-background/40 p-4">
            <div>
              <div className="font-semibold">2. Sender details</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Your account is the sender. Add the pickup contact and address before entering receiver details.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="grid gap-2">
                <Label>Sender name</Label>
                <Input value={customer?.full_name ?? "Fly Logistics Customer"} disabled />
              </div>
              <div className="grid gap-2">
                <Label>Sender email</Label>
                <Input value={customer?.email ?? ""} disabled />
              </div>
              <div className="grid gap-2">
                <Label>Pickup phone</Label>
                <Input inputMode="tel" value={form.pickupPhone} onChange={(event) => update("pickupPhone", event.target.value)} placeholder="Pickup phone number" required />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <CountryStateSelect
                idPrefix="booking-pickup"
                country={form.pickupCountry}
                state={form.pickupState}
                onCountryChange={(value) => update("pickupCountry", value)}
                onStateChange={(value) => update("pickupState", value)}
                countryLabel="Pickup country"
                stateLabel="Pickup state or province"
                lockCountry={form.deliveryCategory === "international_import" ? undefined : "Nigeria"}
              />
            </div>
            <Input value={form.pickupAddress} onChange={(event) => update("pickupAddress", event.target.value)} placeholder="Pickup street, landmark, city" required />
          </div>

          <div className="grid gap-3 rounded-md border bg-background/40 p-4">
            <div>
              <div className="font-semibold">3. Delivery details</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Enter the receiver’s details exactly as the delivery team should use them.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="grid gap-2">
                <Label>Receiver name</Label>
                <Input value={form.recipientName} onChange={(event) => update("recipientName", event.target.value)} placeholder="Receiver or business" required />
              </div>
              <div className="grid gap-2">
                <Label>Receiver phone</Label>
                <Input inputMode="tel" value={form.deliveryPhone} onChange={(event) => update("deliveryPhone", event.target.value)} placeholder="Receiver phone number" required />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <CountryStateSelect
                idPrefix="booking-destination"
                country={form.destinationCountry}
                state={form.destinationState}
                onCountryChange={(value) => update("destinationCountry", value)}
                onStateChange={(value) => update("destinationState", value)}
                countryLabel="Delivery country"
                stateLabel="Delivery state or province"
                lockCountry={form.deliveryCategory === "international_export" ? undefined : "Nigeria"}
              />
            </div>
            <Input value={form.deliveryAddress} onChange={(event) => update("deliveryAddress", event.target.value)} placeholder="Delivery street, landmark, city" required />
          </div>

          <div className="grid gap-4 rounded-md border bg-background/40 p-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Package type</Label>
              <Input value={form.packageType} onChange={(event) => update("packageType", event.target.value)} placeholder="Documents, food, electronics" required />
            </div>
            <div className="grid gap-2">
              <Label>Weight</Label>
              <Input inputMode="decimal" value={form.weightKg} onChange={(event) => update("weightKg", event.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label>Urgency</Label>
              <select value={form.urgency} onChange={(event) => update("urgency", event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                {pricingUrgencies.map((urgency) => <option key={urgency.value} value={urgency.value}>{urgency.label}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Optional handling notes" />
            </div>
          </div>

          {form.deliveryCategory.includes("international") && (
            <div className="grid gap-4 rounded-md border border-primary/25 bg-primary/5 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="font-semibold">International customs details</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Add declaration details for import/export review. Final duties, taxes, and documentation checks are confirmed by Fly Logistics operations.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Freight mode</Label>
                <select value={form.freightMode} onChange={(event) => update("freightMode", event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                  {freightModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>Preferred quote currency</Label>
                <select value={form.quoteCurrency} onChange={(event) => update("quoteCurrency", event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                  {supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>Freight classification</Label>
                <select value={form.freightClassification} onChange={(event) => update("freightClassification", event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                  {freightClassificationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>Package value</Label>
                <Input inputMode="decimal" value={form.packageValue} onChange={(event) => update("packageValue", event.target.value)} placeholder="Declared value" />
              </div>
              <div className="grid gap-2">
                <Label>Duties and taxes estimate</Label>
                <Input inputMode="decimal" value={form.dutiesTaxesAmount} onChange={(event) => update("dutiesTaxesAmount", event.target.value)} placeholder="Optional estimate" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>Customs information (optional)</Label>
                <Input value={form.customsInformation} onChange={(event) => update("customsInformation", event.target.value)} placeholder="Item description, HS code, restricted item notes" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>Export/import documentation (optional)</Label>
                <textarea
                  value={form.exportImportDocuments}
                  onChange={(event) => update("exportImportDocuments", event.target.value)}
                  placeholder="Commercial invoice, ID, permits, customs declaration, document links..."
                  className="min-h-20 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>
          )}

          <Button type="submit" disabled={loadingPrice}>
            {loadingPrice ? <Loader2 className="animate-spin" /> : <Plus />}
            Get price and add order
          </Button>
        </form>

        <div className="grid gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-black">Booking cart</h3>
            <Badge>{items.length} order{items.length === 1 ? "" : "s"} - {moneyFormatter.format(total)}</Badge>
          </div>

          {items.length === 0 && <div className="rounded-md border bg-background/35 p-4 text-sm text-muted-foreground">No shipping orders yet. Add the first pickup and delivery details above.</div>}
          {items.map((item, index) => (
            <div key={item.id} className="grid gap-3 rounded-md border bg-background/35 p-4 lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Order {index + 1}</Badge>
                  {item.requestId && <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">{item.requestId}</Badge>}
                  <Badge>{item.vehicleType}</Badge>
                </div>
                <div className="mt-3 font-semibold">{item.pickupAddress} to {item.deliveryAddress}</div>
                <p className="mt-1 text-sm text-muted-foreground">{item.packageType} for {item.recipientName}. ETA {item.etaLabel}.</p>
                {item.international && (
                  <div className="mt-2 grid gap-2 rounded-md border border-primary/20 bg-primary/5 p-2 text-xs sm:grid-cols-2">
                    <span>{item.international.freightModeLabel} - {item.international.trackingLabel}</span>
                    <span>{item.international.freightClassificationLabel} - {item.international.formattedQuoteAmount}</span>
                  </div>
                )}
                {item.warnings.length > 0 && <p className="mt-2 text-xs text-primary">{item.warnings.join(" ")}</p>}
              </div>
              <div className="flex flex-col gap-2 text-left lg:text-right">
                <span className="font-mono text-2xl font-black">{item.formattedAmount}</span>
                {!item.requestId && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}>
                    <Trash2 />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))}

          {showPaymentStep && items.length > 0 && (
            <div className="grid gap-4 rounded-md border border-primary/30 bg-primary/10 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-lg font-black">Make payment</h4>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Review your cart total, choose wallet, Flutterwave, or crypto, and Fly Logistics will create tracking details after payment is confirmed.
                  </p>
                </div>
                <Badge className="w-fit border-primary/40 bg-background text-primary">{moneyFormatter.format(total)}</Badge>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="rounded-md border bg-background/65 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">Current wallet balance</span>
                    <span className="font-mono text-xl font-black">{moneyFormatter.format(walletBalance)}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">Wallet payment is instant when your balance covers the cart total.</p>
                  <Button type="button" className="mt-4 w-full" disabled={paying !== null || submitting} onClick={() => void payAll("wallet")}>
                    {paying === "wallet" ? <Loader2 className="animate-spin" /> : <Wallet />}
                    Pay from wallet
                  </Button>
                </div>
                <div className="rounded-md border bg-background/65 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">Card, transfer, or bank payment</span>
                    <CreditCard className="size-5 text-primary" />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">Continue to the branded Fly Logistics checkout page for secure payment.</p>
                  <Button type="button" variant="outline" className="mt-4 w-full" disabled={paying !== null || submitting} onClick={() => void payAll("flutterwave")}>
                    {paying === "flutterwave" ? <Loader2 className="animate-spin" /> : <CreditCard />}
                    Continue to Flutterwave
                  </Button>
                </div>
                <div className="rounded-md border bg-background/65 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">Alternative secure checkout</span>
                    <CreditCard className="size-5 text-primary" />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">Pay with USDT or BTC. Shipment creation starts only after operations confirms the transfer.</p>
                  <select aria-label="Crypto network" value={cryptoNetwork} onChange={(event) => setCryptoNetwork(event.target.value as typeof cryptoNetwork)} className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="TRC20">USDT (TRC20)</option><option value="BEP20">USDT (BEP20)</option><option value="SOL">USDT (Solana)</option><option value="BTC">Bitcoin</option></select>
                  <Button type="button" variant="outline" className="mt-4 w-full" disabled={paying !== null || submitting} onClick={() => void payAll("crypto")}>
                    {paying === "crypto" ? <Loader2 className="animate-spin" /> : <CreditCard />}
                    Pay with crypto
                  </Button>
                </div>
              </div>
              {cryptoPayment && <CryptoPaymentPanel payment={cryptoPayment} authorizedFetch={authorizedFetch} onSubmitted={onChanged} />}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            <Button type="button" disabled={!items.length || paying !== null} onClick={openPaymentStep}>
              <CreditCard />
              Make payment
            </Button>
            <Button type="button" variant="outline" disabled={!items.length || submitting || allSubmitted} onClick={() => void createBookings()}>
              {submitting ? <Loader2 className="animate-spin" /> : <PackagePlus />}
              Book shipping
            </Button>
            <Button type="button" variant="outline" disabled={!items.length || submitting || paying !== null} onClick={clearCart}>
              <Trash2 />
              Remove
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
