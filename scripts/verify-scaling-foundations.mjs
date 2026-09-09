import { existsSync, readFileSync } from "node:fs";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function withPgbouncerMode(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("pgbouncer")) parsed.searchParams.set("pgbouncer", "true");
    if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", "1");
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}pgbouncer=true&connection_limit=1`;
  }
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: withPgbouncerMode(process.env.DATABASE_URL || process.env.DIRECT_URL)
    }
  }
});

try {
  const tables = await prisma.$queryRaw`
    select c.relname as table_name, c.relrowsecurity as rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('admin_analytics_snapshots', 'background_jobs')
    order by c.relname
  `;
  const policies = await prisma.$queryRaw`
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('admin_analytics_snapshots', 'background_jobs')
    order by tablename, policyname
  `;
  console.log(JSON.stringify({ tables, policies }, null, 2));
} finally {
  await prisma.$disconnect();
}
