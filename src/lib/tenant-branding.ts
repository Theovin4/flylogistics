import type { CSSProperties } from "react";
import { hasCloudFeature, resolveCloudEntitlements } from "@/lib/cloud-plans";

export const DEFAULT_TENANT_COLOR = "#ff7900";

export type TenantBrandProfile = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  logo_storage_path?: string | null;
  brand_color?: string | null;
  accent_color?: string | null;
  branding_updated_at?: string | null;
  public_address?: string | null;
  public_phone?: string | null;
  public_whatsapp?: string | null;
  public_support_email?: string | null;
  show_contact_on_tracking?: boolean | null;
  support_email?: string | null;
  support_phone?: string | null;
  country?: string | null;
  timezone?: string | null;
  currency?: string | null;
  locale?: string | null;
  plan?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  subscription_renews_at?: string | null;
};

export type PublicTenantProfile = Pick<
  TenantBrandProfile,
  "name" | "slug" | "logo_url" | "brand_color" | "public_address" | "public_phone" | "public_whatsapp" | "public_support_email" | "show_contact_on_tracking" | "country" | "timezone" | "currency" | "locale"
> & { platform_branding_removed: boolean };

export function normalizeTenantColor(value?: string | null, fallback = DEFAULT_TENANT_COLOR) {
  const color = String(value ?? "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
}

export function tenantForeground(color?: string | null) {
  const hex = normalizeTenantColor(color);
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#111111" : "#ffffff";
}

export function tenantCssVariables(company?: TenantBrandProfile | PublicTenantProfile | null) {
  if (!company) return undefined;
  const primary = normalizeTenantColor(company.brand_color);
  const accent = normalizeTenantColor("accent_color" in company ? company.accent_color : null, primary);
  return {
    "--primary": primary,
    "--primary-foreground": tenantForeground(primary),
    "--ring": primary,
    "--orbit": accent,
    "--tenant-primary": primary,
    "--tenant-primary-foreground": tenantForeground(primary),
    "--tenant-accent": accent
  } as CSSProperties;
}

export function normalizePublicPhone(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return `+${digits}`;
}

export function whatsappDigits(value?: string | null) {
  return normalizePublicPhone(value)?.replace(/\D/g, "") ?? null;
}

export function buildTenantWhatsAppUrl(input: { phone?: string | null; trackingNumber?: string | null; companyName?: string | null }) {
  const phone = whatsappDigits(input.phone);
  if (!phone) return null;
  const companyName = String(input.companyName ?? "our logistics team").trim().slice(0, 120);
  const trackingNumber = String(input.trackingNumber ?? "").trim().replace(/[^a-z0-9-]/gi, "").slice(0, 80);
  const message = trackingNumber
    ? `Hello ${companyName}, I need help with shipment ${trackingNumber}.`
    : `Hello ${companyName}, I need help with a delivery.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function publicTenantProfile(company: TenantBrandProfile, platformBrandingRemoved = false): PublicTenantProfile {
  return {
    name: company.name,
    slug: company.slug,
    logo_url: company.logo_url ?? null,
    brand_color: normalizeTenantColor(company.brand_color),
    public_address: company.public_address?.trim() || null,
    public_phone: normalizePublicPhone(company.public_phone),
    public_whatsapp: normalizePublicPhone(company.public_whatsapp),
    public_support_email: company.public_support_email?.trim().toLowerCase() || null,
    show_contact_on_tracking: company.show_contact_on_tracking === true,
    country: company.country ?? null,
    timezone: company.timezone ?? null,
    currency: company.currency ?? null,
    locale: company.locale ?? null,
    platform_branding_removed: platformBrandingRemoved && hasCloudFeature(resolveCloudEntitlements(company), "remove_platform_branding")
  };
}
