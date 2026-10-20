import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import { cloudIntegrationEvents } from "@/lib/cloud-plans";
export { cloudIntegrationEvents } from "@/lib/cloud-plans";

export function normalizeCustomDomain(value: string) {
  const input = value.trim().toLowerCase().replace(/\.$/, "");
  if (!input || input.includes("://") || input.includes("/") || input.includes(":")) return null;

  const hostname = domainToASCII(input);
  if (
    !hostname ||
    hostname.length > 253 ||
    !hostname.includes(".") ||
    isIP(hostname) ||
    hostname === "localhost" ||
    /\.(localhost|local|internal|test|invalid|example|lan|onion)$/.test(hostname) ||
    hostname.endsWith(".home.arpa")
  ) {
    return null;
  }

  const labels = hostname.split(".");
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  if (!/^[a-z]{2,63}$/.test(labels.at(-1) ?? "")) return null;
  return hostname;
}

export function normalizeIntegrationEndpoint(value: string) {
  try {
    const endpoint = new URL(value.trim());
    if (
      endpoint.protocol !== "https:" ||
      !endpoint.hostname ||
      endpoint.username ||
      endpoint.password ||
      endpoint.port ||
      endpoint.search ||
      endpoint.hash ||
      isIP(endpoint.hostname) ||
      endpoint.hostname === "localhost" ||
      /\.(localhost|local|internal|test|invalid|example|lan|onion)$/.test(endpoint.hostname) ||
      endpoint.hostname.endsWith(".home.arpa")
    ) {
      return null;
    }

    return endpoint.toString();
  } catch {
    return null;
  }
}

export function normalizeIntegrationEvents(events: string[]) {
  if (events.length === 0 || events.some((event) => !cloudIntegrationEvents.includes(event as typeof cloudIntegrationEvents[number]))) {
    return null;
  }

  return [...new Set(events)];
}
