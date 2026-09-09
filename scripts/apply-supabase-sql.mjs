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

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function sliceSql(sql, fromMarker, fromLine) {
  if (fromMarker) {
    const index = sql.indexOf(fromMarker);
    if (index === -1) {
      throw new Error(`Could not find marker: ${fromMarker}`);
    }
    return sql.slice(index);
  }

  if (fromLine) {
    const lineNumber = Number(fromLine);
    if (!Number.isInteger(lineNumber) || lineNumber < 1) {
      throw new Error("--from-line must be a positive integer");
    }
    return sql.split(/\r?\n/).slice(lineNumber - 1).join("\n");
  }

  return sql;
}

function startsDollarQuote(sql, index) {
  if (sql[index] !== "$") {
    return null;
  }

  const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
  return match ? match[0] : null;
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let singleQuote = false;
  let doubleQuote = false;
  let lineComment = false;
  let blockComment = false;
  let dollarQuote = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      current += char;
      if (char === "\n") {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }

    if (dollarQuote) {
      if (sql.startsWith(dollarQuote, index)) {
        current += dollarQuote;
        index += dollarQuote.length - 1;
        dollarQuote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (singleQuote) {
      current += char;
      if (char === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (char === "'") {
        singleQuote = false;
      }
      continue;
    }

    if (doubleQuote) {
      current += char;
      if (char === '"' && next === '"') {
        current += next;
        index += 1;
      } else if (char === '"') {
        doubleQuote = false;
      }
      continue;
    }

    if (char === "-" && next === "-") {
      current += char + next;
      index += 1;
      lineComment = true;
      continue;
    }

    if (char === "/" && next === "*") {
      current += char + next;
      index += 1;
      blockComment = true;
      continue;
    }

    const dollarTag = startsDollarQuote(sql, index);
    if (dollarTag) {
      current += dollarTag;
      index += dollarTag.length - 1;
      dollarQuote = dollarTag;
      continue;
    }

    if (char === "'") {
      current += char;
      singleQuote = true;
      continue;
    }

    if (char === '"') {
      current += char;
      doubleQuote = true;
      continue;
    }

    if (char === ";") {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) {
    statements.push(tail);
  }

  return statements;
}

function preview(statement) {
  return statement
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 160);
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

function withPgbouncerMode(url) {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("pgbouncer")) {
      parsed.searchParams.set("pgbouncer", "true");
    }
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", "1");
    }
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}pgbouncer=true&connection_limit=1`;
  }
}

const useDirect = process.argv.includes("--direct");
const databaseUrl = useDirect
  ? process.env.DIRECT_URL || process.env.DATABASE_URL
  : withPgbouncerMode(process.env.DATABASE_URL || process.env.DIRECT_URL);

if (!databaseUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL is not configured in .env.local or .env");
}

const filePath = resolve(process.cwd(), getArg("file", "supabase-schema.sql"));
const fromMarker = getArg("from-marker", "");
const fromLine = getArg("from-line", "");
const sql = sliceSql(readFileSync(filePath, "utf8"), fromMarker, fromLine);
const statements = splitSqlStatements(sql);

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

try {
  console.log(`Applying ${statements.length} SQL statement(s) from ${filePath}`);

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    await prisma.$executeRawUnsafe(statement);

    if ((index + 1) % 25 === 0 || index === statements.length - 1) {
      console.log(`Applied ${index + 1}/${statements.length}`);
    }
  }

  console.log("SQL apply complete.");
} catch (error) {
  console.error("SQL apply failed.");
  console.error(error instanceof Error ? error.message : error);
  const failedIndex = statements.findIndex((statement) => statement.includes(error?.meta?.query ?? ""));
  if (failedIndex >= 0) {
    console.error(`Failed near statement ${failedIndex + 1}: ${preview(statements[failedIndex])}`);
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
