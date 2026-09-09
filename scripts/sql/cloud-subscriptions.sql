create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  plan text default 'starter',
  flutterwave_customer_id text,
  flutterwave_subscription_id text,
  status text default 'pending',
  started_at timestamptz,
  renewal_date timestamptz,
  cancelled_at timestamptz,
  amount numeric(14, 2) default 0,
  currency text default 'NGN',
  payment_reference text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.subscriptions add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.subscriptions add column if not exists plan text default 'starter';
alter table public.subscriptions add column if not exists flutterwave_customer_id text;
alter table public.subscriptions add column if not exists flutterwave_subscription_id text;
alter table public.subscriptions add column if not exists status text default 'pending';
alter table public.subscriptions add column if not exists started_at timestamptz;
alter table public.subscriptions add column if not exists renewal_date timestamptz;
alter table public.subscriptions add column if not exists cancelled_at timestamptz;
alter table public.subscriptions add column if not exists amount numeric(14, 2) default 0;
alter table public.subscriptions add column if not exists currency text default 'NGN';
alter table public.subscriptions add column if not exists payment_reference text;
alter table public.subscriptions add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.subscriptions add column if not exists created_at timestamptz default now();
alter table public.subscriptions add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_plan_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_plan_check
      check (plan in ('starter', 'growth', 'scale'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_status_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_status_check
      check (status in ('pending', 'trialing', 'active', 'past_due', 'payment_failed', 'cancelled', 'expired'));
  end if;
end $$;

create unique index if not exists subscriptions_payment_reference_uidx
on public.subscriptions (payment_reference)
where payment_reference is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_payment_reference_key'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_payment_reference_key unique (payment_reference);
  end if;
end $$;

create index if not exists subscriptions_company_idx on public.subscriptions (company_id);
create index if not exists subscriptions_plan_idx on public.subscriptions (plan);
create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_renewal_date_idx on public.subscriptions (renewal_date);
create index if not exists subscriptions_created_at_idx on public.subscriptions (created_at desc);
create index if not exists subscriptions_flutterwave_subscription_idx on public.subscriptions (flutterwave_subscription_id);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions company read" on public.subscriptions;
create policy "subscriptions company read"
on public.subscriptions for select
to authenticated
using (
  public.is_fly_company_member(company_id)
  or public.current_fly_role() = 'admin'
);

drop policy if exists "subscriptions company admin manage" on public.subscriptions;
create policy "subscriptions company admin manage"
on public.subscriptions for all
to authenticated
using (
  public.is_fly_company_admin(company_id)
  or public.current_fly_role() = 'admin'
)
with check (
  public.is_fly_company_admin(company_id)
  or public.current_fly_role() = 'admin'
);

create or replace function public.cloud_plan_user_limit(plan_name text)
returns integer
language sql
stable
as $$
  select case lower(coalesce(plan_name, 'starter'))
    when 'starter' then 5
    when 'growth' then 20
    when 'scale' then null
    else 5
  end
$$;

create or replace function public.cloud_plan_driver_limit(plan_name text)
returns integer
language sql
stable
as $$
  select case lower(coalesce(plan_name, 'starter'))
    when 'starter' then 10
    when 'growth' then 100
    when 'scale' then null
    else 10
  end
$$;

create or replace function public.enforce_cloud_company_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit integer;
  v_count integer;
begin
  if new.role not in ('owner', 'admin', 'dispatcher') then
    return new;
  end if;

  select coalesce(subscription_plan, plan, 'starter')
  into v_plan
  from public.companies
  where id = new.company_id;

  v_limit := public.cloud_plan_user_limit(v_plan);
  if v_limit is null then
    return new;
  end if;

  select count(*)
  into v_count
  from public.company_members
  where company_id = new.company_id
    and role in ('owner', 'admin', 'dispatcher')
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_count >= v_limit then
    raise exception 'Cloud plan staff user limit reached for plan %', v_plan
      using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists enforce_cloud_company_member_limit_trigger on public.company_members;
create trigger enforce_cloud_company_member_limit_trigger
before insert or update of role, company_id on public.company_members
for each row execute function public.enforce_cloud_company_member_limit();

create or replace function public.enforce_cloud_driver_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit integer;
  v_count integer;
begin
  if new.company_id is null then
    return new;
  end if;

  select coalesce(subscription_plan, plan, 'starter')
  into v_plan
  from public.companies
  where id = new.company_id;

  v_limit := public.cloud_plan_driver_limit(v_plan);
  if v_limit is null then
    return new;
  end if;

  select count(*)
  into v_count
  from public.drivers
  where company_id = new.company_id
    and id <> coalesce(new.id, -1);

  if v_count >= v_limit then
    raise exception 'Cloud plan driver limit reached for plan %', v_plan
      using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists enforce_cloud_driver_limit_trigger on public.drivers;
create trigger enforce_cloud_driver_limit_trigger
before insert or update of company_id on public.drivers
for each row execute function public.enforce_cloud_driver_limit();
