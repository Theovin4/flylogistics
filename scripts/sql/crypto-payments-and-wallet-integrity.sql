begin;

-- This migration is copied from the matching section in supabase-schema.sql.
-- It is additive and does not delete customer or shipment data.
create or replace function public.apply_customer_wallet_transaction(
  p_reference text, p_status text, p_provider_reference text default null
) returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_tx public.wallet_transactions%rowtype;
  v_wallet public.customer_wallets%rowtype;
  v_delta numeric;
  v_status text := upper(trim(coalesce(p_status, '')));
begin
  if v_status not in ('COMPLETED','FAILED','CANCELLED') then raise exception 'Unsupported wallet transaction status'; end if;
  select * into v_tx from public.wallet_transactions where reference = p_reference for update;
  if not found then raise exception 'Wallet transaction not found'; end if;
  if v_tx.status <> 'PENDING' then return; end if;
  if v_status = 'COMPLETED' then
    select * into v_wallet from public.customer_wallets where id = v_tx.wallet_id for update;
    if not found then raise exception 'Customer wallet not found'; end if;
    v_delta := case when lower(v_tx.transaction_type) = 'debit' then -abs(v_tx.amount) else abs(v_tx.amount) end;
    if coalesce(v_wallet.balance,0) + v_delta < 0 then raise exception 'Insufficient wallet balance'; end if;
    update public.customer_wallets set balance = coalesce(balance,0) + v_delta, updated_at = now() where id = v_tx.wallet_id;
  end if;
  update public.wallet_transactions set status = v_status,
    provider_reference = coalesce(p_provider_reference, provider_reference),
    completed_at = case when v_status = 'COMPLETED' then now() else completed_at end
  where id = v_tx.id;
  return;
end; $$;

revoke execute on function public.apply_customer_wallet_transaction(text,text,text) from public, anon, authenticated;
grant execute on function public.apply_customer_wallet_transaction(text,text,text) to service_role;

create table if not exists public.crypto_payment_requests (
  id uuid primary key default gen_random_uuid(), company_id uuid references public.companies(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_kind text not null check (payment_kind in ('booking','shipment','wallet')),
  request_ids jsonb not null default '[]'::jsonb, tracking_id text,
  asset text not null check (asset in ('USDT','BTC')),
  network text not null check (network in ('TRC20','BEP20','SOL','BTC')),
  deposit_address text not null, amount_ngn numeric not null check (amount_ngn > 0),
  market_rate_ngn numeric not null check (market_rate_ngn > 0), applied_rate_ngn numeric not null check (applied_rate_ngn > 0),
  surcharge_percent numeric not null default 2 check (surcharge_percent >= 0), crypto_amount numeric not null check (crypto_amount > 0),
  tx_hash text, status text not null default 'PENDING' check (status in ('PENDING','SUBMITTED','APPROVED','REJECTED','CANCELLED')),
  rejection_reason text, reviewed_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz, reviewed_at timestamptz, expires_at timestamptz not null default (now() + interval '2 hours'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists crypto_payment_requests_tx_hash_idx on public.crypto_payment_requests (lower(tx_hash)) where tx_hash is not null;
create index if not exists crypto_payment_requests_user_status_idx on public.crypto_payment_requests (user_id,status,created_at desc);
create index if not exists crypto_payment_requests_company_status_idx on public.crypto_payment_requests (company_id,status,created_at desc);
alter table public.crypto_payment_requests enable row level security;
revoke all on table public.crypto_payment_requests from anon, authenticated;
grant all on table public.crypto_payment_requests to service_role;

-- Reconcile only if a historical balance differs from its completed ledger.
with ledger as (
  select wallet_id,
    coalesce(sum(case when upper(status)='COMPLETED' and lower(transaction_type)='credit' then amount
                      when upper(status)='COMPLETED' and lower(transaction_type)='debit' then -amount else 0 end),0) balance
  from public.wallet_transactions group by wallet_id
)
update public.customer_wallets w set balance = l.balance, updated_at = now()
from ledger l where w.id = l.wallet_id and w.balance is distinct from l.balance;

commit;
