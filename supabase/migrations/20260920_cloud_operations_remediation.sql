-- Fly Logistics Cloud operational remediation.
-- Additive and idempotent: no tables or production records are removed.

alter table public.companies add column if not exists business_address text;
alter table public.companies add column if not exists country text default 'Nigeria';
alter table public.companies add column if not exists timezone text default 'Africa/Lagos';
alter table public.companies add column if not exists currency text default 'NGN';
alter table public.companies add column if not exists accent_color text;
alter table public.companies add column if not exists onboarding_completed_at timestamptz;

create table if not exists public.cloud_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_type text not null default 'individual' check (customer_type in ('individual', 'business')),
  name text not null,
  email text,
  phone text,
  organization text,
  address_line text,
  city text,
  state text,
  country text default 'Nigeria',
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked')),
  last_shipment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  name text,
  role text not null check (role in ('admin', 'dispatcher', 'driver')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_rate_cards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  service_type text not null default 'standard',
  origin_zone text,
  destination_zone text,
  base_price numeric not null default 0 check (base_price >= 0),
  included_weight_kg numeric not null default 1 check (included_weight_kg > 0),
  extra_kg_price numeric not null default 0 check (extra_kg_price >= 0),
  currency text not null default 'NGN',
  eta_min_hours integer,
  eta_max_hours integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cloud_customers_company_email_idx
  on public.cloud_customers (company_id, lower(email)) where email is not null;
create index if not exists cloud_customers_company_status_idx
  on public.cloud_customers (company_id, status, created_at desc);
create index if not exists cloud_customers_company_name_idx
  on public.cloud_customers (company_id, lower(name));
create unique index if not exists company_invitations_pending_email_idx
  on public.company_invitations (company_id, lower(email)) where status = 'pending';
create index if not exists company_invitations_company_idx
  on public.company_invitations (company_id, created_at desc);
create index if not exists tenant_rate_cards_company_idx
  on public.tenant_rate_cards (company_id, is_active, service_type);

insert into public.cloud_customers (
  company_id, customer_type, name, email, phone, address_line, status, last_shipment_at
)
select distinct on (shipment.company_id, lower(shipment.customer_email))
  shipment.company_id,
  'individual',
  coalesce(nullif(shipment.customer_name, ''), 'Customer'),
  lower(shipment.customer_email),
  shipment.customer_phone,
  shipment.pickup_address,
  'active',
  coalesce(shipment.updated_at, shipment.created_at)
from public.shipments shipment
where shipment.company_id is not null
  and nullif(trim(coalesce(shipment.customer_email, '')), '') is not null
order by shipment.company_id, lower(shipment.customer_email), shipment.created_at desc
on conflict (company_id, lower(email)) where email is not null do update set
  name = excluded.name,
  phone = coalesce(excluded.phone, public.cloud_customers.phone),
  address_line = coalesce(excluded.address_line, public.cloud_customers.address_line),
  last_shipment_at = greatest(excluded.last_shipment_at, public.cloud_customers.last_shipment_at),
  updated_at = now();

alter table public.cloud_customers enable row level security;
alter table public.company_invitations enable row level security;
alter table public.tenant_rate_cards enable row level security;

drop policy if exists "cloud customers staff read" on public.cloud_customers;
create policy "cloud customers staff read"
on public.cloud_customers for select to authenticated
using (public.is_fly_company_staff(company_id));

drop policy if exists "cloud customers staff manage" on public.cloud_customers;
create policy "cloud customers staff manage"
on public.cloud_customers for all to authenticated
using (public.is_fly_company_staff(company_id))
with check (public.is_fly_company_staff(company_id));

drop policy if exists "company invitations admin read" on public.company_invitations;
create policy "company invitations admin read"
on public.company_invitations for select to authenticated
using (public.is_fly_company_admin(company_id));

drop policy if exists "company invitations admin manage" on public.company_invitations;
create policy "company invitations admin manage"
on public.company_invitations for all to authenticated
using (public.is_fly_company_admin(company_id))
with check (public.is_fly_company_admin(company_id));

drop policy if exists "tenant rate cards staff read" on public.tenant_rate_cards;
create policy "tenant rate cards staff read"
on public.tenant_rate_cards for select to authenticated
using (public.is_fly_company_staff(company_id));

drop policy if exists "tenant rate cards admin manage" on public.tenant_rate_cards;
create policy "tenant rate cards admin manage"
on public.tenant_rate_cards for all to authenticated
using (public.is_fly_company_admin(company_id))
with check (public.is_fly_company_admin(company_id));

drop policy if exists "subscriptions company read" on public.subscriptions;
create policy "subscriptions company read"
on public.subscriptions for select to authenticated
using (public.is_fly_company_admin(company_id));

grant select, insert, update, delete on public.cloud_customers to authenticated;
grant select, insert, update, delete on public.company_invitations to authenticated;
grant select, insert, update, delete on public.tenant_rate_cards to authenticated;

