alter table public.companies
  add column if not exists locale text not null default 'en-NG';

alter table public.companies
  drop constraint if exists companies_locale_format_check;

alter table public.companies
  add constraint companies_locale_format_check
  check (locale ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$') not valid;

create table if not exists public.cloud_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan text not null check (plan in ('starter', 'growth', 'scale')),
  currency varchar(3) not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(18,2) not null check (amount > 0),
  provider text not null default 'flutterwave' check (provider = 'flutterwave'),
  provider_plan_id text not null check (length(trim(provider_plan_id)) > 0),
  price_version text not null check (length(trim(price_version)) > 0),
  billing_interval text not null default 'monthly' check (billing_interval = 'monthly'),
  active boolean not null default false,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan, currency, price_version)
);

create unique index if not exists cloud_plan_prices_one_active_currency_idx
  on public.cloud_plan_prices (plan, currency)
  where active;

create index if not exists cloud_plan_prices_active_lookup_idx
  on public.cloud_plan_prices (currency, plan, effective_from desc)
  where active;

alter table public.cloud_plan_prices enable row level security;

revoke all on table public.cloud_plan_prices from public, anon, authenticated;
grant select, insert, update, delete on table public.cloud_plan_prices to service_role;

create table if not exists public.cloud_fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency varchar(3) not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency varchar(3) not null check (quote_currency ~ '^[A-Z]{3}$'),
  rate numeric(24,10) not null check (rate > 0),
  provider text not null check (length(trim(provider)) > 0),
  retrieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (base_currency <> quote_currency),
  unique (base_currency, quote_currency, provider)
);

create index if not exists cloud_fx_rates_pair_retrieved_idx
  on public.cloud_fx_rates (base_currency, quote_currency, retrieved_at desc);

alter table public.cloud_fx_rates enable row level security;

revoke all on table public.cloud_fx_rates from public, anon, authenticated;
grant select, insert, update, delete on table public.cloud_fx_rates to service_role;

alter table public.subscriptions
  add column if not exists price_version text,
  add column if not exists provider text,
  add column if not exists provider_plan_id text,
  add column if not exists billing_interval text,
  add column if not exists provider_transaction_id text;

create unique index if not exists subscriptions_provider_transaction_id_idx
  on public.subscriptions (provider, provider_transaction_id)
  where provider is not null and provider_transaction_id is not null;
