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
  "cloud_customers",
  "company_invitations",
  "email_campaigns",
  "warehouse_inventory",
  "fleet_maintenance_logs",
  "fleet_fuel_logs",
  "tenant_rate_cards",
  "merchant_recipients",
];

const expectedRlsTables = [
  "cloud_customers",
  "company_invitations",
  "tenant_rate_cards",
  "merchant_recipients",
];

const expectedBusinessAccountColumns = [
  "business_type",
  "city",
  "state",
  "country",
  "monthly_shipment_volume",
  "website_social",
  "verification_status",
  "pricing_tier",
  "discount_rate",
  "onboarding_key",
  "onboarding_completed_at",
  "created_by",
];

const expectedMerchantPricingColumns = [
  "standard_price",
  "discountable_amount",
  "discount_rate",
  "discount_amount",
  "final_price",
  "pricing_rule_version",
];

const expectedCompanyColumns = [
  "accent_color",
  "business_address",
  "country",
  "currency",
  "logo_storage_path",
  "onboarding_completed_at",
  "public_address",
  "public_phone",
  "public_support_email",
  "public_whatsapp",
  "show_contact_on_tracking",
  "branding_updated_at",
  "timezone",
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
  const rlsRows = await prisma.$queryRawUnsafe(
    `
      select relname as table_name, relrowsecurity as rls_enabled
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where pg_namespace.nspname = 'public'
      and relname = any($1::text[])
    `,
    expectedRlsTables,
  );
  const rlsByTable = new Map(rlsRows.map((row) => [row.table_name, row.rls_enabled]));
  for (const table of expectedRlsTables) {
    console.log(`${rlsByTable.get(table) === true ? "ok" : "missing"} rls ${table}`);
  }

  const companyColumns = await prisma.$queryRawUnsafe(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
      and table_name = 'companies'
      and column_name = any($1::text[])
    `,
    expectedCompanyColumns,
  );
  const foundCompanyColumns = new Set(companyColumns.map((row) => row.column_name));
  for (const column of expectedCompanyColumns) {
    console.log(`${foundCompanyColumns.has(column) ? "ok" : "missing"} companies.${column}`);
  }

  const merchantColumns = await prisma.$queryRawUnsafe(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
      and (
        (table_name = 'business_accounts' and column_name = any($1::text[]))
        or (table_name in ('quote_requests', 'shipments') and column_name = any($2::text[]))
      )
    `,
    expectedBusinessAccountColumns,
    expectedMerchantPricingColumns,
  );
  const merchantColumnKeys = new Set(merchantColumns.map((row) => `${row.table_name}.${row.column_name}`));
  const expectedMerchantColumnKeys = [
    ...expectedBusinessAccountColumns.map((column) => `business_accounts.${column}`),
    ...expectedMerchantPricingColumns.flatMap((column) => [
      `quote_requests.${column}`,
      `shipments.${column}`,
    ]),
  ];
  for (const key of expectedMerchantColumnKeys) {
    console.log(`${merchantColumnKeys.has(key) ? "ok" : "missing"} ${key}`);
  }

  const missingRls = expectedRlsTables.filter((table) => rlsByTable.get(table) !== true);
  const missingCompanyColumns = expectedCompanyColumns.filter((column) => !foundCompanyColumns.has(column));
  const missingMerchantColumns = expectedMerchantColumnKeys.filter((key) => !merchantColumnKeys.has(key));
  if (missing.length > 0 || missingRls.length > 0 || missingCompanyColumns.length > 0 || missingMerchantColumns.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
