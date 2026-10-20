-- Scale configuration surfaces. External DNS and integration calls are never
-- performed by this migration or by storing an integration configuration.

create table if not exists public.cloud_brand_preferences (
  company_id uuid primary key references public.companies(id) on delete cascade,
  platform_branding_removed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.cloud_custom_domains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  hostname text not null unique,
  verification_token text not null,
  status text not null default 'pending_dns' check (status in ('pending_dns', 'verified')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cloud_custom_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  endpoint_url text not null,
  event_types text[] not null default array['shipment.created']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists cloud_custom_integrations_company_created_idx
  on public.cloud_custom_integrations (company_id, created_at desc);

alter table public.cloud_custom_domains enable row level security;
alter table public.cloud_custom_integrations enable row level security;
alter table public.cloud_brand_preferences enable row level security;
revoke all on table public.cloud_custom_domains from anon, authenticated;
revoke all on table public.cloud_custom_integrations from anon, authenticated;
revoke all on table public.cloud_brand_preferences from anon, authenticated;
grant all on table public.cloud_custom_domains to service_role;
grant all on table public.cloud_custom_integrations to service_role;
grant all on table public.cloud_brand_preferences to service_role;
