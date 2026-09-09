import fs from "node:fs";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}

loadEnvFile(".env.local");

const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim() || process.env.WHATSAPP_ACCESS_TOKEN?.trim();
const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim() || process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const version = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || process.env.WHATSAPP_API_VERSION?.trim() || "v25.0";
const recipient = normalizePhone(process.env.WHATSAPP_TEST_RECIPIENT);
const templateName = process.env.WHATSAPP_TEST_TEMPLATE_NAME?.trim() || "hello_world";

if (!token || !phoneNumberId || !recipient) {
  console.error(JSON.stringify({
    ok: false,
    message: "WhatsApp Cloud API credentials or WHATSAPP_TEST_RECIPIENT are missing. Set an explicitly approved test recipient before sending."
  }));
  process.exit(2);
}

const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: { name: templateName, language: { code: "en_US" } }
  })
});

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(JSON.stringify({
    ok: false,
    status: response.status,
    code: body?.error?.code ?? null,
    message: body?.error?.message ?? "WhatsApp Cloud API send failed.",
    recipient,
    template: templateName
  }));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  status: response.status,
  messageId: body?.messages?.[0]?.id ?? null,
  recipient,
  template: templateName
}));
