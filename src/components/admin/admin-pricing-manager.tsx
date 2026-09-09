"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Fuel, Loader2, RefreshCw, Route, SlidersHorizontal, Truck } from "lucide-react";
import { nigerianStates } from "@/lib/pricing";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PricingAdjustments = {
  globalMultiplier: number;
  fuelSurchargePercent: number;
  holidaySurgePercent: number;
  promotionalDiscountPercent: number;
};

type VehicleTypeRow = {
  code: string;
  name: string;
  maxWeightKg?: number;
  max_weight_kg?: number;
};

type PricingRouteRow = {
  id?: number;
  pickup_state_code: string;
  destination_state_code: string;
  route_type?: string | null;
  base_price?: number | string | null;
  price_per_kg?: number | string | null;
  estimated_eta_hours?: number | string | null;
  vehicle_type_code?: string | null;
  override_price?: number | string | null;
  is_active?: boolean | null;
};

type PricingResponse = {
  vehicleTypes?: VehicleTypeRow[];
  routes?: PricingRouteRow[];
  adjustments?: PricingAdjustments;
  warning?: string;
  error?: string;
};

const defaultAdjustments: PricingAdjustments = {
  globalMultiplier: 1,
  fuelSurchargePercent: 0,
  holidaySurgePercent: 0,
  promotionalDiscountPercent: 0
};

const emptyRouteForm = {
  pickupStateCode: "LA",
  destinationStateCode: "LA",
  basePrice: "2800",
  pricePerKg: "260",
  estimatedEtaHours: "24",
  vehicleTypeCode: "van",
  overridePrice: "",
  isActive: true
};

const currency = new Intl.NumberFormat("en-NG", { currency: "NGN", maximumFractionDigits: 0, style: "currency" });

function stateName(code?: string | null) {
  return nigerianStates.find((state) => state.code === code)?.name ?? code ?? "Unknown";
}

function money(value?: number | string | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? currency.format(amount) : "Not set";
}

export function AdminPricingManager() {
  const [routes, setRoutes] = useState<PricingRouteRow[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeRow[]>([]);
  const [adjustments, setAdjustments] = useState<PricingAdjustments>(defaultAdjustments);
  const [routeForm, setRouteForm] = useState(emptyRouteForm);
  const [loading, setLoading] = useState(true);
  const [savingAdjustments, setSavingAdjustments] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

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

  const activeRoutes = useMemo(() => routes.filter((route) => route.is_active !== false).length, [routes]);
  const metricCards = [
    { label: "Active routes", value: activeRoutes, icon: Route },
    { label: "Vehicle types", value: vehicleTypes.length || 4, icon: Truck },
    { label: "Fuel surcharge", value: `${adjustments.fuelSurchargePercent}%`, icon: Fuel },
    { label: "Global multiplier", value: `${adjustments.globalMultiplier}x`, icon: SlidersHorizontal }
  ] as const;

  const loadPricing = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch("/api/admin/pricing");
      const data = (await response.json()) as PricingResponse;
      if (!response.ok) throw new Error(data.error ?? "Unable to load pricing controls.");

      setRoutes(data.routes ?? []);
      setVehicleTypes(data.vehicleTypes ?? []);
      setAdjustments(data.adjustments ?? defaultAdjustments);
      setWarning(data.warning ?? null);
      setRouteForm((current) => ({
        ...current,
        vehicleTypeCode: data.vehicleTypes?.[0]?.code ?? current.vehicleTypeCode
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load pricing controls.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadPricing();
  }, [loadPricing]);

  function updateAdjustment<Key extends keyof PricingAdjustments>(field: Key, value: string) {
    setAdjustments((current) => ({ ...current, [field]: Number(value) }));
  }

  function updateRouteField<Key extends keyof typeof routeForm>(field: Key, value: (typeof routeForm)[Key]) {
    setRouteForm((current) => ({ ...current, [field]: value }));
  }

  async function saveAdjustments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAdjustments(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch("/api/admin/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "adjustments", ...adjustments })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to update pricing adjustments.");
      setMessage("Pricing multipliers and surcharges updated.");
      await loadPricing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update pricing adjustments.");
    } finally {
      setSavingAdjustments(false);
    }
  }

  async function saveRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRoute(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch("/api/admin/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "route",
          pickupStateCode: routeForm.pickupStateCode,
          destinationStateCode: routeForm.destinationStateCode,
          basePrice: Number(routeForm.basePrice),
          pricePerKg: Number(routeForm.pricePerKg),
          estimatedEtaHours: Number(routeForm.estimatedEtaHours),
          vehicleTypeCode: routeForm.vehicleTypeCode,
          overridePrice: routeForm.overridePrice ? Number(routeForm.overridePrice) : 0,
          isActive: routeForm.isActive
        })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to update route pricing.");
      setMessage("Route pricing updated.");
      await loadPricing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update route pricing.");
    } finally {
      setSavingRoute(false);
    }
  }

  return (
    <section className="mt-8 grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Pricing engine</Badge>
          <h2 className="mt-3 text-2xl font-black tracking-normal sm:text-3xl">Delivery pricing controls</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Manage Nigerian route rates, fuel surcharge, holiday surge, promotional discount, and operational overrides for quote calculations.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={loadPricing} disabled={loading} className="w-full sm:w-auto">
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh pricing
        </Button>
      </div>

      {message && (
        <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {message}
        </div>
      )}
      {warning && (
        <div className="flex gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {warning}
        </div>
      )}
      {error && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <Card key={card.label} className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between font-mono text-2xl">
                {card.value}
                <card.icon className="size-5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{card.label}</CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-5 text-primary" />
              Global adjustments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(event) => void saveAdjustments(event)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="globalMultiplier">Global multiplier</Label>
                  <Input id="globalMultiplier" type="number" step="0.01" min="0.5" max="3" value={adjustments.globalMultiplier} onChange={(event) => updateAdjustment("globalMultiplier", event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fuelSurchargePercent">Fuel surcharge %</Label>
                  <Input id="fuelSurchargePercent" type="number" step="0.1" min="0" max="100" value={adjustments.fuelSurchargePercent} onChange={(event) => updateAdjustment("fuelSurchargePercent", event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="holidaySurgePercent">Holiday surge %</Label>
                  <Input id="holidaySurgePercent" type="number" step="0.1" min="0" max="100" value={adjustments.holidaySurgePercent} onChange={(event) => updateAdjustment("holidaySurgePercent", event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="promotionalDiscountPercent">Promotional discount %</Label>
                  <Input id="promotionalDiscountPercent" type="number" step="0.1" min="0" max="80" value={adjustments.promotionalDiscountPercent} onChange={(event) => updateAdjustment("promotionalDiscountPercent", event.target.value)} />
                </div>
              </div>
              <Button type="submit" disabled={savingAdjustments || loading} className="w-full sm:w-auto">
                {savingAdjustments ? <Loader2 className="animate-spin" /> : <Fuel />}
                Save adjustments
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="size-5 text-primary" />
              Route pricing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(event) => void saveRoute(event)}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-2 text-sm font-medium">
                  Pickup state
                  <select value={routeForm.pickupStateCode} onChange={(event) => updateRouteField("pickupStateCode", event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                    {nigerianStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Destination state
                  <select value={routeForm.destinationStateCode} onChange={(event) => updateRouteField("destinationStateCode", event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                    {nigerianStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Vehicle type
                  <select value={routeForm.vehicleTypeCode} onChange={(event) => updateRouteField("vehicleTypeCode", event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                    {(vehicleTypes.length ? vehicleTypes : [{ code: "bike", name: "Dispatch bike" }, { code: "car", name: "Express car" }, { code: "van", name: "Cargo van" }, { code: "truck", name: "Freight truck" }]).map((vehicle) => (
                      <option key={vehicle.code} value={vehicle.code}>{vehicle.name}</option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-2">
                  <Label htmlFor="basePrice">Base price</Label>
                  <Input id="basePrice" type="number" min="0" value={routeForm.basePrice} onChange={(event) => updateRouteField("basePrice", event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pricePerKg">Price per kg</Label>
                  <Input id="pricePerKg" type="number" min="0" value={routeForm.pricePerKg} onChange={(event) => updateRouteField("pricePerKg", event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="estimatedEtaHours">ETA hours</Label>
                  <Input id="estimatedEtaHours" type="number" min="1" value={routeForm.estimatedEtaHours} onChange={(event) => updateRouteField("estimatedEtaHours", event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="overridePrice">Override price</Label>
                  <Input id="overridePrice" type="number" min="0" value={routeForm.overridePrice} onChange={(event) => updateRouteField("overridePrice", event.target.value)} placeholder="Optional" />
                </div>
                <label className="flex items-center gap-2 rounded-md border bg-background/35 px-3 py-2 text-sm font-medium">
                  <input type="checkbox" checked={routeForm.isActive} onChange={(event) => updateRouteField("isActive", event.target.checked)} />
                  Route enabled
                </label>
              </div>
              <Button type="submit" disabled={savingRoute || loading} className="w-full sm:w-auto">
                {savingRoute ? <Loader2 className="animate-spin" /> : <Route />}
                Save route
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle>Configured routes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-3 rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              Loading delivery rates...
            </div>
          ) : routes.length === 0 ? (
            <div className="rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">
              No route overrides have been configured yet. The quote engine is using the national fallback pricing model.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <tr>
                    <th className="border-b px-3 py-3">Route</th>
                    <th className="border-b px-3 py-3">Base</th>
                    <th className="border-b px-3 py-3">Per kg</th>
                    <th className="border-b px-3 py-3">ETA</th>
                    <th className="border-b px-3 py-3">Vehicle</th>
                    <th className="border-b px-3 py-3">Override</th>
                    <th className="border-b px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((route) => (
                    <tr key={`${route.pickup_state_code}-${route.destination_state_code}`} className="border-b last:border-b-0">
                      <td className="px-3 py-3 font-semibold">{stateName(route.pickup_state_code)} to {stateName(route.destination_state_code)}</td>
                      <td className="px-3 py-3">{money(route.base_price)}</td>
                      <td className="px-3 py-3">{money(route.price_per_kg)}</td>
                      <td className="px-3 py-3">{route.estimated_eta_hours ?? "Not set"}h</td>
                      <td className="px-3 py-3">{route.vehicle_type_code ?? "auto"}</td>
                      <td className="px-3 py-3">{route.override_price ? money(route.override_price) : "None"}</td>
                      <td className="px-3 py-3">
                        <Badge className={route.is_active === false ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"}>
                          {route.is_active === false ? "Disabled" : "Enabled"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
