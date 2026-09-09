import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function withPgbouncerMode(url) {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    parsed.searchParams.set("pgbouncer", "true");
    parsed.searchParams.set("connection_limit", "1");
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}pgbouncer=true&connection_limit=1`;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const databaseUrl = withPgbouncerMode(process.env.DATABASE_URL || process.env.DIRECT_URL);

if (!databaseUrl) {
  throw new Error("DATABASE_URL or DIRECT_URL is not configured.");
}

const expectedTables = [
  "affiliate_partners",
  "email_campaigns",
  "warehouse_inventory",
  "fleet_maintenance_logs",
  "fleet_fuel_logs",
];

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

try {
  const tables = await prisma.$queryRawUnsafe(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      and table_name = any($1::text[])
      order by table_name
    `,
    expectedTables,
  );

  const found = new Set(tables.map((row) => row.table_name));
  for (const table of expectedTables) {
    console.log(`${found.has(table) ? "ok" : "missing"} ${table}`);
  }

  const missing = expectedTables.filter((table) => !found.has(table));
  if (missing.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
