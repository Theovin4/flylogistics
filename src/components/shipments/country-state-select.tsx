"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";

type LocationOption = { code: string; name: string };

const nigeria = { code: "NG", name: "Nigeria" };

export function CountryStateSelect({
  idPrefix,
  country,
  state,
  onCountryChange,
  onStateChange,
  countryLabel,
  stateLabel,
  countryRequired = true,
  stateRequired = true,
  lockCountry
}: {
  idPrefix: string;
  country: string;
  state: string;
  onCountryChange: (countryName: string) => void;
  onStateChange: (stateCode: string) => void;
  countryLabel: string;
  stateLabel: string;
  countryRequired?: boolean;
  stateRequired?: boolean;
  lockCountry?: string;
}) {
  const [countries, setCountries] = useState<LocationOption[]>(lockCountry ? [nigeria] : []);
  const [states, setStates] = useState<LocationOption[]>([]);
  const selectedCountry = useMemo(
    () => countries.find((item) => item.name.toLowerCase() === country.toLowerCase()) ?? (country === "Nigeria" ? nigeria : null),
    [countries, country]
  );

  useEffect(() => {
    if (lockCountry) return;
    const controller = new AbortController();
    void fetch("/api/locations", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load countries.")))
      .then((data: { items?: LocationOption[] }) => setCountries(data.items ?? []))
      .catch(() => setCountries([nigeria]));
    return () => controller.abort();
  }, [lockCountry]);

  useEffect(() => {
    const code = selectedCountry?.code;
    if (!code) {
      setStates([]);
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/locations?country=${encodeURIComponent(code)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load states.")))
      .then((data: { items?: LocationOption[] }) => setStates(data.items ?? []))
      .catch(() => setStates([]));
    return () => controller.abort();
  }, [selectedCountry?.code]);

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-country`}>{countryLabel}</Label>
        <select
          id={`${idPrefix}-country`}
          value={country}
          onChange={(event) => {
            onCountryChange(event.target.value);
            onStateChange("");
          }}
          required={countryRequired}
          disabled={Boolean(lockCountry)}
          className="h-11 w-full rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Select country</option>
          {(lockCountry ? [nigeria] : countries).map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-state`}>{stateLabel}</Label>
        <select
          id={`${idPrefix}-state`}
          value={state}
          onChange={(event) => onStateChange(event.target.value)}
          required={stateRequired}
          disabled={!selectedCountry || states.length === 0}
          className="h-11 w-full rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{states.length ? "Select state or province" : "No state list available"}</option>
          {states.map((item) => <option key={`${selectedCountry?.code}-${item.code}`} value={item.code}>{item.name}</option>)}
        </select>
      </div>
    </>
  );
}
