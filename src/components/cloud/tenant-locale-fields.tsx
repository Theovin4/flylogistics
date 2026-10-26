"use client";

import { useId, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tenantCountryOptions, tenantCurrencyOptions, tenantTimezoneOptions } from "@/lib/tenant-locale";

type TenantLocaleFieldsProps = {
  country: string;
  timezone: string;
  currency: string;
  onCountryChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  disabled?: boolean;
  prefix?: string;
};

const timezoneLabels: Record<string, string> = {
  "Africa/Johannesburg": "Johannesburg",
  "Africa/Lagos": "Lagos",
  "Africa/Nairobi": "Nairobi",
  "America/New_York": "New York",
  "America/Toronto": "Toronto",
  "Asia/Dubai": "Dubai",
  "Asia/Kolkata": "Kolkata",
  "Asia/Shanghai": "Shanghai",
  "Europe/London": "London",
  "Europe/Paris": "Paris",
  UTC: "UTC"
};

export function TenantLocaleFields({
  country,
  timezone,
  currency,
  onCountryChange,
  onTimezoneChange,
  onCurrencyChange,
  disabled = false,
  prefix
}: TenantLocaleFieldsProps) {
  const generated = useId().replaceAll(":", "");
  const id = prefix ?? generated;
  const countries = useMemo(() => tenantCountryOptions(), []);
  const timezones = useMemo(() => tenantTimezoneOptions(), []);
  const currencies = useMemo(() => tenantCurrencyOptions(), []);

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-country`}>Country</Label>
        <Input
          id={`${id}-country`}
          list={`${id}-countries`}
          value={country}
          onChange={(event) => onCountryChange(event.target.value.toUpperCase())}
          placeholder="Search by ISO code, for example GB"
          autoComplete="country"
          disabled={disabled}
          required
        />
        <datalist id={`${id}-countries`}>
          {countries.map((item) => <option key={item.code} value={item.code}>{item.name} — {item.code}</option>)}
        </datalist>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-timezone`}>Operational timezone</Label>
        <Input
          id={`${id}-timezone`}
          list={`${id}-timezones`}
          value={timezone}
          onChange={(event) => onTimezoneChange(event.target.value)}
          placeholder="Search IANA timezones"
          disabled={disabled}
          required
        />
        <datalist id={`${id}-timezones`}>
          {timezones.map((item) => <option key={item} value={item}>{timezoneLabels[item] ? `${timezoneLabels[item]} — ${item}` : item}</option>)}
        </datalist>
        <p className="text-xs text-muted-foreground">Stored as an IANA timezone. Daylight-saving changes are handled automatically.</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-currency`}>Operating currency</Label>
        <Input
          id={`${id}-currency`}
          list={`${id}-currencies`}
          value={currency}
          onChange={(event) => onCurrencyChange(event.target.value.toUpperCase())}
          placeholder="ISO currency, for example USD"
          maxLength={3}
          disabled={disabled}
          required
        />
        <datalist id={`${id}-currencies`}>
          {currencies.map((item) => <option key={item} value={item}>{item}</option>)}
        </datalist>
      </div>
    </>
  );
}
