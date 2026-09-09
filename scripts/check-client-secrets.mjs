import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src/app", "src/components", "src/lib"];
const forbidden = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLOUDINARY_API_SECRET",
  "FLUTTERWAVE_SECRET_KEY",
  "FLUTTERWAVE_ENCRYPTION_KEY",
  "FLUTTERWAVE_WEBHOOK_SECRET_HASH",
  "FLUTTERWAVE_SUBACCOUNT_ID",
  "TWILIO_AUTH_TOKEN",
  "WHATSAPP_CLOUD_ACCESS_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "META_APP_SECRET",
  "RESEND_API_KEY",
  "REDIS_URL",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "SENDBOX_API_KEY",
  "EASYSHIP_API_KEY",
  "FEZ_API_KEY",
  "FEZ_AUTH_TOKEN",
  "FEZ_USER_ID",
  "FEZ_PASSWORD",
  "FEZ_WEBHOOK_SECRET",
  "CARRIER_WEBHOOK_SECRET",
  "WEBHOOK_SECRET"
];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return walk(path);
    return /\.(ts|tsx|js|jsx)$/.test(entry) ? [path] : [];
  });
}

const violations = [];

for (const root of roots) {
  for (const file of walk(root)) {
    const contents = readFileSync(file, "utf8");
    const isClientFile = contents.startsWith("\"use client\"") || contents.startsWith("'use client'");
    if (!isClientFile && !file.includes(join("src", "components"))) continue;

    for (const key of forbidden) {
      if (contents.includes(key)) {
        violations.push(`${file}: references private env ${key}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Private environment variable references found in client-facing files:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("No private environment variables found in client-facing files.");
