import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function etaFromDistance(distanceKm: number, urgency: "standard" | "priority" | "critical") {
  const speed = urgency === "critical" ? 74 : urgency === "priority" ? 62 : 48;
  return Math.max(1, Math.round(distanceKm / speed));
}
