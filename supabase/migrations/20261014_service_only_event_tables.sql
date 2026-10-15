-- These tables are accessed only by server routes using the service role.
-- Keep direct browser/Data API access closed while making the intended RLS
-- posture explicit for security review and future schema changes.

alter table public.crypto_payment_requests enable row level security;
alter table public.resend_webhook_events enable row level security;

revoke all on table public.crypto_payment_requests from public, anon, authenticated;
revoke all on table public.resend_webhook_events from public, anon, authenticated;
grant all on table public.crypto_payment_requests to service_role;
grant all on table public.resend_webhook_events to service_role;

drop policy if exists "service role manages crypto payment requests" on public.crypto_payment_requests;
create policy "service role manages crypto payment requests"
on public.crypto_payment_requests
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages resend webhook events" on public.resend_webhook_events;
create policy "service role manages resend webhook events"
on public.resend_webhook_events
for all
to service_role
using (true)
with check (true);
