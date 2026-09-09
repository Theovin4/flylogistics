import fs from "node:fs";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(process.env.FLY_ENV_FILE || ".env.local");

const apiKey = process.env.RESEND_API_KEY;
const configuredFrom = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "";
const from = configuredFrom.toLowerCase().includes("@flylogistics.ng") && !configuredFrom.toLowerCase().includes("@flylogistics.com.ng")
  ? "Fly Logistics <notifications@flylogistics.com.ng>"
  : configuredFrom || "Fly Logistics <notifications@flylogistics.com.ng>";
const replyTo = process.env.EMAIL_REPLY_TO || "support@flylogistics.com.ng";
const to = process.env.ADMIN_NOTIFICATION_EMAIL || "vincenttheoikechukwu@gmail.com";
const logo = "https://flylogistics.com.ng/payment-logo";
const tracking = "FLY-TEST-DELIVERY";
const trackingUrl = `https://flylogistics.com.ng/tracking?trackingId=${encodeURIComponent(tracking)}`;

if (!apiKey) {
  console.error(JSON.stringify({ ok: false, message: "RESEND_API_KEY is missing." }));
  process.exit(2);
}

const html = `
  <div style="margin:0;background:#050608;color:#f8fafc;font-family:Arial,Helvetica,sans-serif;padding:34px 18px">
    <div style="max-width:720px;margin:0 auto;border-radius:24px;overflow:hidden;border:1px solid rgba(255,122,0,.28);background:linear-gradient(145deg,#090b10,#11141d 68%,#231104);box-shadow:0 32px 70px rgba(0,0,0,.32)">
      <div style="padding:28px 30px;border-bottom:1px solid rgba(255,255,255,.08);background:radial-gradient(circle at top left,rgba(255,122,0,.35),transparent 36%),#080a10">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr>
            <td width="74" style="width:74px;vertical-align:middle">
              <img src="${logo}" width="62" height="62" alt="Fly Logistics logo" style="display:block;width:62px;height:62px;border:0;border-radius:18px;background:#0b0d12" />
            </td>
            <td style="vertical-align:middle">
              <div style="color:#ffffff;font-weight:900;font-size:24px;letter-spacing:.2px">Fly Logistics</div>
              <div style="color:#ff7a00;font-size:12px;letter-spacing:4px;text-transform:uppercase;font-weight:900;margin-top:5px">AI Freight OS</div>
            </td>
          </tr>
        </table>
      </div>
      <div style="padding:32px 30px 30px">
        <span style="display:inline-block;border:1px solid rgba(16,185,129,.35);background:rgba(16,185,129,.12);color:#10b981;border-radius:999px;padding:8px 12px;font-size:12px;text-transform:uppercase;letter-spacing:3px;font-weight:900">Delivery verified</span>
        <h1 style="margin:22px 0 12px;color:#ffffff;font-size:32px;line-height:1.12;font-weight:900">Delivery completed securely.</h1>
        <p style="margin:0 0 24px;line-height:1.75;color:#cbd5e1;font-size:16px">
          This is a branded Fly Logistics Resend test email. Shipment <strong style="color:#ffffff">${tracking}</strong> has been delivered and completion has been recorded by Fly Logistics operations.
        </p>
        <div style="border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(0,0,0,.32);padding:18px;margin:0 0 24px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr>
              <td style="padding:8px 0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px">Tracking ID</td>
              <td style="padding:8px 0;color:#ff7a00;font-size:18px;font-family:Menlo,Consolas,monospace;font-weight:900;text-align:right">${tracking}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px">Receiver</td>
              <td style="padding:8px 0;color:#ffffff;font-size:15px;font-weight:700;text-align:right">Test recipient</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px">Status</td>
              <td style="padding:8px 0;color:#10b981;font-size:15px;font-weight:900;text-align:right">Delivered</td>
            </tr>
          </table>
        </div>
        <a href="${trackingUrl}" style="display:inline-block;background:#ff7a00;color:#080a10;text-decoration:none;font-weight:900;border-radius:14px;padding:15px 20px">View Fly tracking</a>
        <p style="margin:26px 0 0;color:#94a3b8;font-size:13px;line-height:1.7">Bolade Oshodi, Mafoluku, Lagos, Nigeria<br />support@flylogistics.com.ng | +234 706 107 2929</p>
      </div>
    </div>
  </div>
`;

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Idempotency-Key": `admin-resend-health-${new Date().toISOString().slice(0, 10)}`
  },
  body: JSON.stringify({
    from,
    to,
    reply_to: replyTo,
    subject: "Fly Logistics: delivery email test",
    html,
    text: `Fly Logistics delivery email test\n\nShipment ${tracking} delivered.\n${trackingUrl}`
  })
});

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(JSON.stringify({ ok: false, status: response.status, message: body.message || body.error || "Resend send failed." }));
  process.exit(1);
}

const emailId = body.id || body.data?.id || null;
let deliveryStatus = null;

if (emailId) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const statusResponse = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (statusResponse.ok) {
    const statusBody = await statusResponse.json().catch(() => ({}));
    deliveryStatus = statusBody.last_event || null;
  }
}

console.log(JSON.stringify({ ok: true, status: response.status, id: emailId, deliveryStatus, to }));
