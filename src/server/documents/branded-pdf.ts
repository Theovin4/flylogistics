import { canonicalSiteUrl, siteConfig } from "@/lib/site";
import { formatMoney, formatTenantDateTime } from "@/lib/tenant-locale";

type PdfRow = {
  label: string;
  value: unknown;
};

type PdfSection = {
  title: string;
  rows: PdfRow[];
};

export type BrandedPdfInput = {
  title: string;
  documentNumber: string;
  status?: string | null;
  brandName?: string | null;
  brandSubtitle?: string | null;
  brandColor?: string | null;
  tenantLogoUrl?: string | null;
  issuedTo?: string | null;
  sections: PdfSection[];
  lineItems?: Array<{
    description: string;
    reference?: string | null;
    quantity?: number | string | null;
    amount?: unknown;
  }>;
  totalAmount?: unknown;
  currency?: string | null;
  locale?: string | null;
  timezone?: string | null;
  issuedAt?: string | number | Date | null;
  notes?: string[];
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 46;
const TOP = 748;
const BOTTOM = 54;

function pdfText(value: unknown, max = 118) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .slice(0, max);
}

function rgbFromHex(hex: string | null | undefined) {
  const normalized = String(hex ?? "#ff7a00").replace("#", "").trim();
  const fallback = { r: 1, g: 0.478, b: 0 };
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return fallback;
  return {
    r: parseInt(normalized.slice(0, 2), 16) / 255,
    g: parseInt(normalized.slice(2, 4), 16) / 255,
    b: parseInt(normalized.slice(4, 6), 16) / 255
  };
}

function money(value: unknown, currency = "NGN", locale = "en-NG") {
  return formatMoney(Number(value ?? 0), currency, locale, { maximumFractionDigits: 0 });
}

class PdfPainter {
  private commands: string[] = [];
  private y = TOP;

  constructor(private readonly accent: { r: number; g: number; b: number }) {}

  addPageIfNeeded(height = 42) {
    if (this.y - height > BOTTOM) return;
    this.y = BOTTOM + height;
  }

  rect(x: number, y: number, width: number, height: number, fill: "accent" | "dark" | "panel" | "line") {
    const color =
      fill === "accent"
        ? `${this.accent.r.toFixed(3)} ${this.accent.g.toFixed(3)} ${this.accent.b.toFixed(3)} rg`
        : fill === "dark"
          ? "0.027 0.035 0.067 rg"
          : fill === "panel"
            ? "0.965 0.965 0.965 rg"
            : "0.870 0.870 0.870 rg";
    this.commands.push("q", color, `${x} ${y} ${width} ${height} re f`, "Q");
  }

  line(x1: number, y1: number, x2: number, y2: number, tone: "accent" | "muted" = "muted") {
    const color = tone === "accent" ? `${this.accent.r.toFixed(3)} ${this.accent.g.toFixed(3)} ${this.accent.b.toFixed(3)} RG` : "0.700 0.700 0.700 RG";
    this.commands.push("q", color, `${x1} ${y1} m ${x2} ${y2} l S`, "Q");
  }

  text(value: unknown, x: number, y: number, size = 10, tone: "dark" | "muted" | "white" | "accent" = "dark") {
    const color =
      tone === "white"
        ? "1 1 1 rg"
        : tone === "accent"
          ? `${this.accent.r.toFixed(3)} ${this.accent.g.toFixed(3)} ${this.accent.b.toFixed(3)} rg`
          : tone === "muted"
            ? "0.430 0.450 0.500 rg"
            : "0.070 0.078 0.105 rg";
    this.commands.push("BT", color, `/F1 ${size} Tf`, `${x} ${y} Td`, `(${pdfText(value)}) Tj`, "ET");
  }

  paragraph(value: unknown, x: number, width: number, size = 9, tone: "dark" | "muted" = "dark", lineHeight = 14) {
    const words = String(value ?? "").split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    const maxChars = Math.max(26, Math.floor(width / (size * 0.48)));
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    for (const line of lines.slice(0, 6)) {
      this.addPageIfNeeded(lineHeight + 6);
      this.text(line, x, this.y, size, tone);
      this.y -= lineHeight;
    }
  }

  move(amount: number) {
    this.y -= amount;
  }

  currentY() {
    return this.y;
  }

  setY(value: number) {
    this.y = value;
  }

  section(title: string) {
    this.addPageIfNeeded(58);
    this.text(title.toUpperCase(), LEFT, this.y, 10, "accent");
    this.line(LEFT, this.y - 8, PAGE_WIDTH - LEFT, this.y - 8, "muted");
    this.move(28);
  }

  keyValue(label: string, value: unknown, x: number, width: number) {
    this.addPageIfNeeded(38);
    this.text(label.toUpperCase(), x, this.y, 7, "muted");
    this.text(value || "Not set", x, this.y - 15, 10, "dark");
    return width;
  }

  body() {
    return this.commands.join("\n");
  }
}

function buildPdfDocument(content: string) {
  const stream = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    stream
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return body;
}

export function buildBrandedPdf(input: BrandedPdfInput) {
  const brandName = input.brandName || siteConfig.name;
  const brandSubtitle = input.brandSubtitle || "AI Freight OS";
  const currency = input.currency || "NGN";
  const accent = rgbFromHex(input.brandColor);
  const painter = new PdfPainter(accent);

  painter.rect(0, PAGE_HEIGHT - 124, PAGE_WIDTH, 124, "dark");
  painter.rect(LEFT, PAGE_HEIGHT - 94, 48, 48, "accent");
  painter.text("F", LEFT + 17, PAGE_HEIGHT - 77, 22, "white");
  painter.text(brandName, LEFT + 64, PAGE_HEIGHT - 62, 20, "white");
  painter.text(brandSubtitle, LEFT + 64, PAGE_HEIGHT - 82, 9, "accent");
  painter.text(input.title.toUpperCase(), PAGE_WIDTH - 240, PAGE_HEIGHT - 58, 12, "white");
  painter.text(input.documentNumber, PAGE_WIDTH - 240, PAGE_HEIGHT - 80, 10, "accent");
  if (input.status) painter.text(`Status: ${input.status}`, PAGE_WIDTH - 240, PAGE_HEIGHT - 100, 9, "white");
  painter.setY(PAGE_HEIGHT - 152);

  painter.section("Document summary");
  const summaryY = painter.currentY();
  painter.keyValue("Issued to", input.issuedTo ?? "Fly Logistics customer", LEFT, 250);
  painter.keyValue("Issued on", formatTenantDateTime(input.issuedAt ?? new Date(), input.timezone ?? "Africa/Lagos", input.locale ?? "en-NG"), LEFT + 270, 250);
  painter.setY(summaryY - 48);
  painter.keyValue("Support", `${siteConfig.contact.supportEmail} | ${siteConfig.contact.supportPhone}`, LEFT, 520);
  painter.setY(summaryY - 96);
  if (input.tenantLogoUrl) {
    painter.paragraph(`Tenant logo: ${input.tenantLogoUrl}`, LEFT, 520, 8, "muted", 12);
  }

  for (const section of input.sections) {
    painter.section(section.title);
    for (let index = 0; index < section.rows.length; index += 2) {
      const y = painter.currentY();
      const left = section.rows[index];
      const right = section.rows[index + 1];
      painter.keyValue(left.label, left.value, LEFT, 250);
      if (right) painter.keyValue(right.label, right.value, LEFT + 270, 250);
      painter.setY(y - 42);
    }
  }

  if (input.lineItems?.length) {
    painter.section("Line items");
    input.lineItems.slice(0, 24).forEach((item, index) => {
      painter.addPageIfNeeded(46);
      const y = painter.currentY();
      painter.text(`${index + 1}. ${item.description}`, LEFT, y, 10, "dark");
      painter.text(item.reference ?? "", LEFT, y - 15, 8, "muted");
      painter.text(item.quantity ? `Qty ${item.quantity}` : "", PAGE_WIDTH - 190, y, 8, "muted");
      painter.text(item.amount != null ? money(item.amount, currency, input.locale ?? "en-NG") : "", PAGE_WIDTH - 130, y, 10, "dark");
      painter.line(LEFT, y - 25, PAGE_WIDTH - LEFT, y - 25, "muted");
      painter.setY(y - 40);
    });
  }

  painter.section("Totals");
  painter.rect(LEFT, painter.currentY() - 36, PAGE_WIDTH - LEFT * 2, 52, "panel");
  painter.text("Total amount", LEFT + 18, painter.currentY() - 5, 10, "muted");
  painter.text(money(input.totalAmount, currency, input.locale ?? "en-NG"), PAGE_WIDTH - 220, painter.currentY() - 7, 22, "accent");
  painter.move(68);

  if (input.notes?.length) {
    painter.section("Notes");
    input.notes.forEach((note) => painter.paragraph(note, LEFT, PAGE_WIDTH - LEFT * 2, 9, "muted"));
  }

  painter.line(LEFT, 42, PAGE_WIDTH - LEFT, 42, "muted");
  painter.text(`${siteConfig.name} | ${siteConfig.contact.address}`, LEFT, 28, 8, "muted");
  painter.text(`${canonicalSiteUrl}/payment-logo`, PAGE_WIDTH - 210, 28, 8, "muted");

  return buildPdfDocument(painter.body());
}

export function pdfResponse(pdf: string, filename: string) {
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename.replace(/[^a-z0-9_.-]/gi, "-")}.pdf"`
    }
  });
}

export function formatPdfMoney(value: unknown, currency = "NGN") {
  return money(value, currency);
}
