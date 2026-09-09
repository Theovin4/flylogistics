-- Fly Logistics Cloud commercial SaaS layer
-- Safe to run multiple times in Supabase SQL Editor.
-- No table drops, truncates, or deletes.

alter table public.companies add column if not exists subscription_status text default 'trialing';
alter table public.companies add column if not exists subscription_plan text default 'starter';
alter table public.companies add column if not exists trial_ends_at timestamptz;
alter table public.companies add column if not exists billing_email text;
alter table public.companies add column if not exists billing_currency text default 'NGN';
alter table public.companies add column if not exists billing_amount numeric default 0;
alter table public.companies add column if not exists flutterwave_customer_id text;
alter table public.companies add column if not exists flutterwave_subscription_id text;
alter table public.companies add column if not exists flutterwave_subscription_reference text;
alter table public.companies add column if not exists subscription_started_at timestamptz;
alter table public.companies add column if not exists subscription_renews_at timestamptz;
alter table public.companies add column if not exists last_billing_reference text;
alter table public.companies add column if not exists last_billing_status text;

update public.companies
set
  subscription_status = coalesce(subscription_status, 'active'),
  subscription_plan = coalesce(subscription_plan, plan, 'scale'),
  trial_ends_at = coalesce(trial_ends_at, now() + interval '100 years'),
  billing_currency = coalesce(billing_currency, 'NGN'),
  last_billing_status = coalesce(last_billing_status, 'ACTIVE'),
  updated_at = now()
where slug = 'fly-logistics';

update public.companies
set
  subscription_status = coalesce(subscription_status, 'trialing'),
  subscription_plan = coalesce(subscription_plan, plan, 'starter'),
  trial_ends_at = coalesce(trial_ends_at, coalesce(created_at, now()) + interval '14 days'),
  billing_currency = coalesce(billing_currency, 'NGN'),
  billing_amount = coalesce(billing_amount, 0),
  updated_at = now()
where slug <> 'fly-logistics';

create table if not exists public.cloud_demo_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  team_size text,
  monthly_shipments text,
  preferred_demo_date text,
  message text,
  source text,
  status text default 'new',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.cloud_demo_requests add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.cloud_demo_requests add column if not exists company_name text;
alter table public.cloud_demo_requests add column if not exists contact_name text;
alter table public.cloud_demo_requests add column if not exists email text;
alter table public.cloud_demo_requests add column if not exists phone text;
alter table public.cloud_demo_requests add column if not exists team_size text;
alter table public.cloud_demo_requests add column if not exists monthly_shipments text;
alter table public.cloud_demo_requests add column if not exists preferred_demo_date text;
alter table public.cloud_demo_requests add column if not exists message text;
alter table public.cloud_demo_requests add column if not exists source text;
alter table public.cloud_demo_requests add column if not exists status text default 'new';
alter table public.cloud_demo_requests add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.cloud_demo_requests add column if not exists created_at timestamptz default now();
alter table public.cloud_demo_requests add column if not exists updated_at timestamptz default now();

alter table public.cloud_demo_requests enable row level security;

create index if not exists companies_subscription_status_idx on public.companies (subscription_status);
create index if not exists companies_trial_ends_at_idx on public.companies (trial_ends_at);
create index if not exists cloud_demo_requests_company_idx on public.cloud_demo_requests (company_id);
create index if not exists cloud_demo_requests_status_idx on public.cloud_demo_requests (status);
create index if not exists cloud_demo_requests_created_at_idx on public.cloud_demo_requests (created_at desc);
create index if not exists cloud_demo_requests_email_idx on public.cloud_demo_requests (lower(email));

drop policy if exists "cloud demo public insert" on public.cloud_demo_requests;
create policy "cloud demo public insert"
on public.cloud_demo_requests for insert
to anon, authenticated
with check (true);

drop policy if exists "cloud demo admin read" on public.cloud_demo_requests;
create policy "cloud demo admin read"
on public.cloud_demo_requests for select
to authenticated
using (
  public.current_fly_role() in ('admin', 'moderator', 'customer_care')
  or (company_id is not null and public.current_fly_company_role(company_id) in ('owner', 'admin'))
);

drop policy if exists "cloud demo admin update" on public.cloud_demo_requests;
create policy "cloud demo admin update"
on public.cloud_demo_requests for update
to authenticated
using (
  public.current_fly_role() in ('admin', 'moderator')
  or (company_id is not null and public.current_fly_company_role(company_id) in ('owner', 'admin'))
)
with check (
  public.current_fly_role() in ('admin', 'moderator')
  or (company_id is not null and public.current_fly_company_role(company_id) in ('owner', 'admin'))
);
