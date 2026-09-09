update public.shipments
set
  status = 'PENDING_PICKUP',
  customer_status_message = 'Payment is confirmed. Your shipment is pending pickup by Fly Logistics operations.',
  updated_at = now()
where carrier_provider = 'fez_logistics'
  and status = 'PICKED_UP'
  and lower(replace(coalesce(carrier_status, ''), '-', ' ')) like '%pending%pick%';
