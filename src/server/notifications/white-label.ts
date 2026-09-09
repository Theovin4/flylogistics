const PARTNER_NAME_PATTERN = /\b(?:fez(?:\s+logistics)?|sendbox|easyship)\b/i;
const INTERNAL_CARRIER_DETAIL_PATTERN =
  /\b(?:carrier[\s_-]*(?:order|tracking|shipment|provider|reference|status|id)|external\s+tracking|fulfil(?:l)?ment\s+provider|waybill)\b/i;

function cleanLines(value: string) {
  return value
    .split(/\r?\n/)
    .filter((line) => !PARTNER_NAME_PATTERN.test(line) && !INTERNAL_CARRIER_DETAIL_PATTERN.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function whiteLabelCustomerText(value?: string | null, fallback = "Fly Logistics is processing your update.") {
  const cleaned = cleanLines(String(value ?? ""));
  return cleaned || fallback;
}

export function isWhiteLabelCustomerText(value?: string | null) {
  const text = String(value ?? "");
  return !PARTNER_NAME_PATTERN.test(text) && !INTERNAL_CARRIER_DETAIL_PATTERN.test(text);
}
