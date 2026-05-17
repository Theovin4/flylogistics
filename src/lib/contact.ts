const defaultWhatsAppNumber = "2348000000000";

export function getWhatsAppUrl(message = "Hi Fly Logistics, I need help with an urgent delivery request.") {
  const number = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? defaultWhatsAppNumber).replace(/[^\d]/g, "");
  return `https://wa.me/${number || defaultWhatsAppNumber}?text=${encodeURIComponent(message)}`;
}
