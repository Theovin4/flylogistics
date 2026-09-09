import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && !process.env[key]) process.env[key] = value;
  }
}

loadEnv(resolve(process.cwd(), ".env.local"));
loadEnv(resolve(process.cwd(), ".env"));

function withPgbouncerMode(value) {
  if (!value) return "";
  const parsed = new URL(value);
  parsed.searchParams.set("pgbouncer", "true");
  parsed.searchParams.set("connection_limit", "1");
  return parsed.toString();
}

const databaseUrl = withPgbouncerMode(process.env.DATABASE_URL || process.env.DIRECT_URL);
if (!databaseUrl) throw new Error("DIRECT_URL or DATABASE_URL is required.");

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

try {
  const summary = await prisma.$queryRawUnsafe(`
    with ledger as (
      select
        wallet_id,
        coalesce(sum(case when upper(status) = 'COMPLETED' and lower(transaction_type) = 'credit' then amount else 0 end), 0) as credits,
        coalesce(sum(case when upper(status) = 'COMPLETED' and lower(transaction_type) = 'debit' then amount else 0 end), 0) as debits
      from public.wallet_transactions
      group by wallet_id
    )
    select
      count(*)::int as wallet_count,
      count(*) filter (where abs(coalesce(w.balance, 0) - (coalesce(l.credits, 0) - coalesce(l.debits, 0))) > 0.005)::int as mismatched_wallets,
      count(*) filter (where coalesce(w.balance, 0) < 0)::int as negative_wallets,
      coalesce(sum(w.balance), 0)::text as stored_total,
      coalesce(sum(coalesce(l.credits, 0) - coalesce(l.debits, 0)), 0)::text as ledger_total
    from public.customer_wallets w
    left join ledger l on l.wallet_id = w.id
  `);

  const target = await prisma.$queryRawUnsafe(`
    with ledger as (
      select
        wallet_id,
        coalesce(sum(case when upper(status) = 'COMPLETED' and lower(transaction_type) = 'credit' then amount else 0 end), 0) as credits,
        coalesce(sum(case when upper(status) = 'COMPLETED' and lower(transaction_type) = 'debit' then amount else 0 end), 0) as debits,
        count(*) filter (where upper(status) = 'PENDING')::int as pending_count
      from public.wallet_transactions
      group by wallet_id
    )
    select
      p.email,
      w.id::text as wallet_id,
      w.balance::text as stored_balance,
      (coalesce(l.credits, 0) - coalesce(l.debits, 0))::text as ledger_balance,
      coalesce(l.pending_count, 0)::int as pending_transactions
    from public.user_profiles p
    join public.customer_wallets w on w.user_id = p.id
    left join ledger l on l.wallet_id = w.id
    where lower(p.email) = lower('theovincenzo@yahoo.co.uk')
  `);

  const wallets = await prisma.$queryRawUnsafe(`
    with ledger as (
      select wallet_id,
        coalesce(sum(case when upper(status) = 'COMPLETED' and lower(transaction_type) = 'credit' then amount else 0 end), 0)
        - coalesce(sum(case when upper(status) = 'COMPLETED' and lower(transaction_type) = 'debit' then amount else 0 end), 0) as ledger_balance
      from public.wallet_transactions
      group by wallet_id
    )
    select
      w.id::text as wallet_id,
      concat(left(coalesce(p.email, ''), 2), '***@', split_part(coalesce(p.email, ''), '@', 2)) as masked_email,
      w.balance::text as stored_balance,
      coalesce(l.ledger_balance, 0)::text as ledger_balance
    from public.customer_wallets w
    left join public.user_profiles p on p.id = w.user_id
    left join ledger l on l.wallet_id = w.id
    order by w.id
  `);

  console.log(JSON.stringify({ summary: summary[0] ?? null, customer: target[0] ?? null, wallets }, null, 2));
} finally {
  await prisma.$disconnect();
}
