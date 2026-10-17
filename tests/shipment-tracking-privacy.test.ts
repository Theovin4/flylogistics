import assert from "node:assert/strict";
import test from "node:test";
import { normalizeShipment, type ShipmentRecord } from "../src/lib/shipments";

const record: ShipmentRecord = {
  id: 45,
  tracking_id: "FLY-CERT-PRIVATE",
  status: "IN_TRANSIT",
  pickup_address: "123 Private Pickup Street",
  delivery_address: "987 Private Delivery Road",
  pickup_state: "Lagos",
  destination_state: "Ogun",
  pickup_country: "Nigeria",
  destination_country: "Nigeria",
  delivery_category: "local_nigeria",
  freight_mode: "air_freight",
  quote_currency: "NGN",
  freight_classification: "electronics",
  commercial_invoice: { privateInvoice: "INVOICE-CERT-PRIVATE" },
  customs_information: "PRIVATE-CUSTOMS-CERT",
  package_value: 250000,
  duties_taxes_amount: 15000,
  export_import_documents: "PRIVATE-DOCUMENT-CERT",
  package_type: "Private electronics",
  customer_name: "Synthetic sender",
  customer_email: "private-cert@example.invalid",
  customer_phone: "00000000000",
  recipient_name: "Synthetic recipient",
  recipient_signature_url: "https://example.invalid/private-signature.png",
  package_image_url: "https://example.invalid/private-package.png",
  proof_image_url: "https://example.invalid/private-proof.png",
  internal_notes: "PRIVATE-OPS-CERT",
  customer_status_message: "PRIVATE-STATUS-CERT",
  carrier_cost_amount: 8000,
  carrier_profit_amount: 1200,
  driver_id: 29,
  current_lat: 6.42,
  current_lng: 3.41,
  assigned_driver: {
    id: 29,
    name: "Synthetic driver",
    phone: "00000000001",
    current_latitude: 6.43,
    current_longitude: 3.42,
    vehicle_type: "bike",
    last_location_at: "2026-10-17T00:00:00.000Z"
  },
  timeline: [{ label: "Proof of delivery uploaded", location: "Private address", completed: true }]
};

test("public tracking omits shipment, contact, driver, proof, and fulfilment details", () => {
  const result = normalizeShipment(record, { publicTracking: true, includeProof: false });
  const serialized = JSON.stringify(result);

  assert.equal(result.customerName, "Customer");
  assert.equal(result.recipientName, null);
  assert.equal(result.pickupAddress, "Pickup details protected");
  assert.equal(result.deliveryAddress, "Delivery details protected");
  assert.equal(result.packageType, "Package");
  assert.equal(result.assignedDriver, null);
  assert.equal(result.vehicle.lat, null);
  assert.equal(result.vehicle.lng, null);
  assert.equal(result.operationsChecklist?.length, 0);
  assert.equal("proofImageUrl" in result, false);
  for (const privateValue of [
    "Private Pickup Street",
    "Private Delivery Road",
    "Synthetic sender",
    "Synthetic recipient",
    "private-cert@example.invalid",
    "PRIVATE-CUSTOMS-CERT",
    "PRIVATE-DOCUMENT-CERT",
    "PRIVATE-OPS-CERT",
    "PRIVATE-STATUS-CERT",
    "INVOICE-CERT-PRIVATE",
    "Synthetic driver",
    "00000000001",
    "private-signature.png",
    "private-package.png",
    "carrier_cost_amount"
  ]) {
    assert.equal(serialized.includes(privateValue), false, `public response exposed ${privateValue}`);
  }
});

test("authenticated shipment details retain fields hidden from public tracking", () => {
  const result = normalizeShipment(record, { includeProof: true });
  assert.equal(result.customerName, "Synthetic sender");
  assert.equal(result.deliveryAddress, "987 Private Delivery Road");
  assert.equal(result.proofImageUrl, "https://example.invalid/private-proof.png");
  assert.equal(result.assignedDriver?.id, 29);
});
