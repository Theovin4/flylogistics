-- Additive Cloud white-label and explicitly public contact settings.
alter table public.companies add column if not exists logo_storage_path text;
alter table public.companies add column if not exists public_address text;
alter table public.companies add column if not exists public_phone text;
alter table public.companies add column if not exists public_whatsapp text;
alter table public.companies add column if not exists public_support_email text;
alter table public.companies add column if not exists show_contact_on_tracking boolean not null default false;
alter table public.companies add column if not exists branding_updated_at timestamptz default now();

create index if not exists company_members_user_company_idx
on public.company_members (user_id, company_id);

create index if not exists shipments_company_created_idx
on public.shipments (company_id, created_at desc);

create index if not exists shipments_company_status_idx
on public.shipments (company_id, status);

revoke all on table public.companies from anon;
grant select on table public.companies to authenticated;
grant all on table public.companies to service_role;

alter table public.companies enable row level security;

drop policy if exists "company members read own company" on public.companies;
create policy "company members read own company"
on public.companies for select
to authenticated
using (
  exists (
    select 1 from public.company_members member
    where member.company_id = public.companies.id
      and member.user_id = (select auth.uid())
  )
);

drop policy if exists "company owners update own company" on public.companies;
create policy "company owners update own company"
on public.companies for update
to authenticated
using (
  exists (
    select 1 from public.company_members member
    where member.company_id = public.companies.id
      and member.user_id = (select auth.uid())
      and lower(member.role) in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.company_members member
    where member.company_id = public.companies.id
      and member.user_id = (select auth.uid())
      and lower(member.role) in ('owner', 'admin')
  )
);
