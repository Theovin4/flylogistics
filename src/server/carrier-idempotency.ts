type CarrierShipmentReference = {
  carrier_provider?: string | null;
  carrier_order_no?: string | null;
  carrier_order_id?: string | null;
  carrier_tracking_id?: string | null;
  carrier_waybill_no?: string | null;
  carrier_shipment_id?: string | null;
};

export function existingExternalCarrierReference(
  shipment: CarrierShipmentReference,
  requestedProvider: string
) {
  if (String(shipment.carrier_provider ?? "").trim() !== requestedProvider) return null;

  return [
    shipment.carrier_order_no,
    shipment.carrier_order_id,
    shipment.carrier_tracking_id,
    shipment.carrier_waybill_no,
    shipment.carrier_shipment_id
  ].find((value) => {
    const reference = String(value ?? "").trim();
    return reference.length > 0 && !reference.toUpperCase().startsWith("FLY-");
  }) ?? null;
}
