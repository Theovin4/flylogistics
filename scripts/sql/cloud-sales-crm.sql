-- Fly Logistics Cloud sales CRM
-- Safe to run multiple times in Supabase SQL Editor.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  city text,
  country text,
  fleet_size text,
  monthly_deliveries text,
  source text default 'website',
  status text default 'new',
  assigned_to uuid references auth.users(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.leads add column if not exists company_name text;
alter table public.leads add column if not exists contact_name text;
alter table public.leads add column if not exists email text;
alter table public.leads add column if not exists phone text;
alter table public.leads add column if not exists city text;
alter table public.leads add column if not exists country text;
alter table public.leads add column if not exists fleet_size text;
alter table public.leads add column if not exists monthly_deliveries text;
alter table public.leads add column if not exists source text default 'website';
alter table public.leads add column if not exists status text default 'new';
alter table public.leads add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.leads add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.leads add column if not exists created_at timestamptz default now();
alter table public.leads add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_status_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_status_check
      check (status in ('new','contacted','demo_scheduled','demo_completed','proposal_sent','negotiating','won','lost'));
  end if;
end $$;

create table if not exists public.sales_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  activity_type text not null default 'note',
  title text,
  notes text,
  due_at timestamptz,
  completed_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.sales_activities add column if not exists lead_id uuid references public.leads(id) on delete cascade;
alter table public.sales_activities add column if not exists activity_type text default 'note';
alter table public.sales_activities add column if not exists title text;
alter table public.sales_activities add column if not exists notes text;
alter table public.sales_activities add column if not exists due_at timestamptz;
alter table public.sales_activities add column if not exists completed_at timestamptz;
alter table public.sales_activities add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.sales_activities add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.sales_activities add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.sales_activities add column if not exists created_at timestamptz default now();

create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  company_name text,
  contact_name text,
  email text,
  phone text,
  city text,
  country text,
  fleet_size text,
  monthly_deliveries text,
  preferred_demo_date text,
  scheduled_at timestamptz,
  message text,
  status text default 'requested',
  source text default 'cloud-demo',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.demo_requests add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.demo_requests add column if not exists company_name text;
alter table public.demo_requests add column if not exists contact_name text;
alter table public.demo_requests add column if not exists email text;
alter table public.demo_requests add column if not exists phone text;
alter table public.demo_requests add column if not exists city text;
alter table public.demo_requests add column if not exists country text;
alter table public.demo_requests add column if not exists fleet_size text;
alter table public.demo_requests add column if not exists monthly_deliveries text;
alter table public.demo_requests add column if not exists preferred_demo_date text;
alter table public.demo_requests add column if not exists scheduled_at timestamptz;
alter table public.demo_requests add column if not exists message text;
alter table public.demo_requests add column if not exists status text default 'requested';
alter table public.demo_requests add column if not exists source text default 'cloud-demo';
alter table public.demo_requests add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.demo_requests add column if not exists created_at timestamptz default now();
alter table public.demo_requests add column if not exists updated_at timestamptz default now();

create table if not exists public.sales_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  note text not null,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.sales_notes add column if not exists lead_id uuid references public.leads(id) on delete cascade;
alter table public.sales_notes add column if not exists note text;
alter table public.sales_notes add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.sales_notes add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.sales_notes add column if not exists created_at timestamptz default now();

create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_source_idx on public.leads (source);
create index if not exists leads_assigned_to_idx on public.leads (assigned_to);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx on public.leads (lower(email));
create index if not exists sales_activities_lead_id_idx on public.sales_activities (lead_id);
create index if not exists sales_activities_due_at_idx on public.sales_activities (due_at);
create index if not exists sales_activities_created_at_idx on public.sales_activities (created_at desc);
create index if not exists demo_requests_lead_id_idx on public.demo_requests (lead_id);
create index if not exists demo_requests_status_idx on public.demo_requests (status);
create index if not exists demo_requests_created_at_idx on public.demo_requests (created_at desc);
create index if not exists demo_requests_email_idx on public.demo_requests (lower(email));
create index if not exists sales_notes_lead_id_idx on public.sales_notes (lead_id);
create index if not exists sales_notes_created_at_idx on public.sales_notes (created_at desc);

alter table public.leads enable row level security;
alter table public.sales_activities enable row level security;
alter table public.demo_requests enable row level security;
alter table public.sales_notes enable row level security;

drop policy if exists "leads admin manage" on public.leads;
create policy "leads admin manage"
on public.leads for all
to authenticated
using (public.current_fly_role() = 'admin')
with check (public.current_fly_role() = 'admin');

drop policy if exists "sales activities admin manage" on public.sales_activities;
create policy "sales activities admin manage"
on public.sales_activities for all
to authenticated
using (public.current_fly_role() = 'admin')
with check (public.current_fly_role() = 'admin');

drop policy if exists "demo requests admin manage" on public.demo_requests;
create policy "demo requests admin manage"
on public.demo_requests for all
to authenticated
using (public.current_fly_role() = 'admin')
with check (public.current_fly_role() = 'admin');

drop policy if exists "sales notes admin manage" on public.sales_notes;
create policy "sales notes admin manage"
on public.sales_notes for all
to authenticated
using (public.current_fly_role() = 'admin')
with check (public.current_fly_role() = 'admin');
