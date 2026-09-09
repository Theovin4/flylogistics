import type { ShipmentRecord } from "@/lib/shipments";

export function moneyValue(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function shipmentRevenue(shipment: Pick<ShipmentRecord, "payment_amount" | "quoted_price">) {
  return moneyValue(shipment.payment_amount ?? shipment.quoted_price);
}

export function shipmentDriverPayout(shipment: Pick<ShipmentRecord, "driver_payout_amount">) {
  return moneyValue(shipment.driver_payout_amount);
}

export function shipmentCarrierCost(shipment: Pick<ShipmentRecord, "carrier_cost_amount" | "carrier_rate_amount" | "carrier_provider">) {
  const provider = String(shipment.carrier_provider ?? "internal_fly_logistics");
  if (provider === "internal_fly_logistics") return moneyValue(shipment.carrier_cost_amount);
  return moneyValue(shipment.carrier_cost_amount ?? shipment.carrier_rate_amount);
}

export function shipmentProfit(shipment: ShipmentRecord) {
  return shipmentRevenue(shipment) - shipmentDriverPayout(shipment) - shipmentCarrierCost(shipment);
}

export function shipmentMarginPercent(shipment: ShipmentRecord) {
  const revenue = shipmentRevenue(shipment);
  if (revenue <= 0) return 0;
  return Number(((shipmentProfit(shipment) / revenue) * 100).toFixed(2));
}

export function shipmentFinanceSnapshot(shipment: ShipmentRecord) {
  const revenue = shipmentRevenue(shipment);
  const driverPayout = shipmentDriverPayout(shipment);
  const carrierCost = shipmentCarrierCost(shipment);
  const profit = revenue - driverPayout - carrierCost;
  return {
    revenue,
    driverPayout,
    carrierCost,
    profit,
    marginPercent: revenue > 0 ? Number(((profit / revenue) * 100).toFixed(2)) : 0
  };
}
