import { siteConfig } from "@/lib/site";

export type FlyEmailDetail = {
  label: string;
  value?: string | number | null;
};

export type FlyEmailCta = {
  label: string;
  url: string;
};

export type FlyEmailOptions = {
  eyebrow: string;
  title: string;
  body: string;
  reference?: string | number | null;
  cta?: FlyEmailCta | null;
  details?: FlyEmailDetail[];
  variant?: "customer" | "admin" | "success" | "warning" | "danger";
};

const emailLogoUrl = "https://flylogistics.com.ng/payment-logo";

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function variantAccent(variant: FlyEmailOptions["variant"]) {
  if (variant === "success") return "#00d084";
  if (variant === "warning") return "#ffb347";
  if (variant === "danger") return "#ff4d4f";
  return "#ff7a00";
}

function detailRows(details: FlyEmailDetail[] = []) {
  const rows = details
    .filter((item) => item.value !== undefined && item.value !== null && String(item.value).trim() !== "")
    .map((item) => `
      <tr>
        <td style="padding:13px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#8f98aa;font-size:12px;letter-spacing:1.8px;text-transform:uppercase">${escapeHtml(item.label)}</td>
        <td align="right" style="padding:13px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#ffffff;font-size:14px;font-weight:800">${escapeHtml(item.value)}</td>
      </tr>
    `)
    .join("");

  if (!rows) return "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0 0">
      ${rows}
    </table>
  `;
}

export function renderFlyEmail(input: FlyEmailOptions) {
  const accent = variantAccent(input.variant);
  const body = escapeHtml(input.body).replace(/\n/g, "<br />");
  const reference = input.reference ? escapeHtml(input.reference) : null;
  const cta = input.cta;

  return `
    <!doctype html>
    <html>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(input.title)}</title>
      </head>
      <body style="margin:0;padding:0;background:#05070c;color:#f8fafc;font-family:Arial,Helvetica,sans-serif">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#05070c">
          <tr>
            <td align="center" style="padding:28px 14px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;border-collapse:collapse;border:1px solid rgba(255,122,0,0.28);border-radius:24px;overflow:hidden;background:#0b0f17;box-shadow:0 24px 80px rgba(0,0,0,0.38)">
                <tr>
                  <td style="padding:0;background:linear-gradient(135deg,#ff7a00 0%,#ffb347 44%,#ff7a00 100%);height:5px;line-height:5px;font-size:0">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:28px 28px 20px;background:#080a10">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
                      <tr>
                        <td style="vertical-align:middle;width:68px">
                          <img src="${emailLogoUrl}" width="56" height="56" alt="Fly Logistics logo" style="display:block;width:56px;height:56px;border:0;border-radius:16px;background:#0b0f17;box-shadow:0 12px 28px rgba(255,122,0,0.26)" />
                        </td>
                        <td style="vertical-align:middle">
                          <div style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:.2px;line-height:1">Fly Logistics</div>
                          <div style="color:#ff7a00;font-size:11px;font-weight:800;letter-spacing:3.6px;text-transform:uppercase;margin-top:8px">AI Freight OS</div>
                        </td>
                        <td align="right" style="vertical-align:middle">
                          <span style="display:inline-block;border:1px solid rgba(255,122,0,0.42);border-radius:999px;color:${accent};font-size:11px;font-weight:800;letter-spacing:2px;padding:8px 10px;text-transform:uppercase">Secure update</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 28px 30px;background:#0b0f17">
                    <div style="border:1px solid rgba(255,255,255,0.08);border-radius:20px;background:linear-gradient(145deg,rgba(255,122,0,0.12),rgba(255,255,255,0.02) 42%,rgba(255,122,0,0.05));padding:26px">
                      <div style="color:${accent};font-size:12px;font-weight:900;letter-spacing:3.2px;text-transform:uppercase">${escapeHtml(input.eyebrow)}</div>
                      <h1 style="margin:14px 0 0;color:#ffffff;font-size:30px;line-height:1.18;font-weight:900;letter-spacing:0">${escapeHtml(input.title)}</h1>
                      <p style="margin:16px 0 0;color:#d7dce8;font-size:16px;line-height:1.72">${body}</p>
                      ${reference ? `<div style="margin-top:22px;border:1px solid rgba(255,122,0,0.24);border-radius:16px;background:#070a10;padding:16px"><div style="color:#8f98aa;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase">Reference</div><div style="margin-top:8px;color:#ff7a00;font-family:Consolas,Menlo,monospace;font-size:18px;font-weight:900">${reference}</div></div>` : ""}
                      ${detailRows(input.details)}
                      ${cta ? `<div style="margin-top:26px"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#ff7a00;color:#070a10;text-decoration:none;font-size:15px;font-weight:900;border-radius:14px;padding:14px 20px;box-shadow:0 12px 28px rgba(255,122,0,0.28)">${escapeHtml(cta.label)}</a></div>` : ""}
                    </div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px">
                      <tr>
                        <td style="color:#8f98aa;font-size:12px;line-height:1.7">
                          <strong style="color:#ffffff">Fly Logistics</strong><br />
                          ${escapeHtml(siteConfig.contact.address)}<br />
                          ${escapeHtml(siteConfig.contact.supportEmail)} | ${escapeHtml(siteConfig.contact.supportPhone)}
                        </td>
                        <td align="right" style="color:#ff7a00;font-size:11px;font-weight:900;letter-spacing:2.6px;text-transform:uppercase;vertical-align:bottom">Track. Move. Deliver.</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <div style="max-width:640px;margin:18px auto 0;color:#6f7787;font-size:11px;line-height:1.6;text-align:center">
                This message was sent by Fly Logistics. We will never ask for your password, OTP, or full card details by email.
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export function renderFlyEmailText(input: FlyEmailOptions) {
  const details = (input.details ?? [])
    .filter((item) => item.value !== undefined && item.value !== null && String(item.value).trim() !== "")
    .map((item) => `${item.label}: ${item.value}`)
    .join("\n");

  return [
    "Fly Logistics",
    input.title,
    "",
    input.body,
    input.reference ? `Reference: ${input.reference}` : null,
    details || null,
    input.cta ? `${input.cta.label}: ${input.cta.url}` : null,
    "",
    `${siteConfig.contact.supportEmail} | ${siteConfig.contact.supportPhone}`
  ].filter(Boolean).join("\n");
}
