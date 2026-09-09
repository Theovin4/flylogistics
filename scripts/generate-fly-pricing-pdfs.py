from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT_DIR = Path("public/pricing")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

FEZ_BASE_WEIGHT_KG = 4
LOCAL_BASE_MARKUP = 2500
EXTRA_KG_MARKUP = 800
INTRASTATE_EXTRA_KG = 800
INTERSTATE_EXTRA_KG = 1000
INTERNATIONAL_STANDARD_MARKUP = 15000
INTERNATIONAL_LARGE_MARKUP = 20000

STATES = [
    ("Lagos", "LA", 2700, "Intrastate"),
    ("Ekiti", "EK", 4569, "South West"),
    ("Ondo", "ON", 4569, "South West"),
    ("Oyo", "OY", 4569, "South West"),
    ("Ogun", "OG", 4569, "South West"),
    ("Osun", "OS", 4569, "South West"),
    ("Akwa Ibom", "AK", 6719, "South South"),
    ("Cross River", "CR", 6719, "South South"),
    ("Rivers", "RI", 5644, "South South"),
    ("Delta", "DE", 5644, "South South"),
    ("Edo", "ED", 5644, "South South"),
    ("Bayelsa", "BY", 5644, "South South"),
    ("Niger", "NI", 6450, "North Central"),
    ("Benue", "BE", 6450, "North Central"),
    ("Plateau", "PL", 6450, "North Central"),
    ("Kogi", "KO", 6181, "North Central"),
    ("Abuja / FCT", "FC", 5644, "North Central"),
    ("Kwara", "KW", 6450, "North Central"),
    ("Nasarawa", "NA", 6450, "North Central"),
    ("Enugu", "EN", 5644, "South East"),
    ("Anambra", "AN", 5644, "South East"),
    ("Imo", "IM", 5644, "South East"),
    ("Abia", "AB", 5644, "South East"),
    ("Ebonyi", "EB", 5644, "South East"),
    ("Jigawa", "JI", 6450, "North West"),
    ("Kano", "KN", 6450, "North West"),
    ("Kaduna", "KD", 6450, "North West"),
    ("Zamfara", "ZA", 6450, "North West"),
    ("Sokoto", "SO", 6450, "North West"),
    ("Kebbi", "KE", 6450, "North West"),
    ("Katsina", "KT", 6450, "North West"),
    ("Gombe", "GO", 6450, "North East"),
    ("Bauchi", "BA", 6450, "North East"),
    ("Borno", "BO", 6450, "North East"),
    ("Adamawa", "AD", 6450, "North East"),
    ("Taraba", "TA", 6450, "North East"),
    ("Yobe", "YO", 6450, "North East"),
]


def fmt(amount):
    return f"NGN {amount:,.0f}"


def styles():
    base = getSampleStyleSheet()
    base.add(
        ParagraphStyle(
            name="BrandTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=colors.HexColor("#ff7a00"),
            spaceAfter=8,
        )
    )
    base.add(
        ParagraphStyle(
            name="Deck",
            parent=base["BodyText"],
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#111111"),
        )
    )
    return base


def doc(path, title):
    return SimpleDocTemplate(
        str(path),
        pagesize=landscape(A4),
        rightMargin=12 * mm,
        leftMargin=12 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
        title=title,
        author="Fly Logistics",
    )


def header(title, subtitle):
    s = styles()
    return [
        Paragraph("Fly Logistics", s["BrandTitle"]),
        Paragraph(f"<b>AI Freight OS</b> | {title}", s["Heading2"]),
        Paragraph(subtitle, s["Deck"]),
        Spacer(1, 6 * mm),
    ]


def table_style():
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111111")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fff7ed")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    )


def build_local_pdf():
    rows = [["Destination", "Zone", "Base weight", "Fly base rate", "Extra kg", "Delivery window"]]
    for name, _code, fez_rate, zone in STATES:
        same_state = name == "Lagos"
        extra = (INTRASTATE_EXTRA_KG if same_state else INTERSTATE_EXTRA_KG) + EXTRA_KG_MARKUP
        window = "Next business day after pickup" if same_state else "2-5 business days after pickup"
        rows.append([name, zone, f"0.5-{FEZ_BASE_WEIGHT_KG}kg", fmt(fez_rate + LOCAL_BASE_MARKUP), fmt(extra), window])

    story = header(
        "Local Nigeria Delivery Rates",
        "Published customer rates for Fly Logistics local delivery inside Nigeria. Rates include operational handling, support, routing review, and standard delivery coordination. Terms and conditions apply.",
    )
    table = Table(rows, repeatRows=1, colWidths=[38 * mm, 34 * mm, 26 * mm, 30 * mm, 26 * mm, 54 * mm])
    table.setStyle(table_style())
    story.extend([table, Spacer(1, 5 * mm), Paragraph("Rates are customer-facing estimates. Final billing may change after package size, route access, restricted item review, waiting time, or special handling confirmation.", styles()["Deck"])])
    doc(OUTPUT_DIR / "fly-logistics-local-delivery-rates.pdf", "Fly Logistics Local Delivery Rates").build(story)


def build_international_pdf():
    rows = [
        ["Delivery type", "Starting estimate", "Service handling", "Large shipment handling", "Typical ETA", "Notes"],
        ["International import into Nigeria", "From NGN 115,000 + weight", fmt(INTERNATIONAL_STANDARD_MARKUP), fmt(INTERNATIONAL_LARGE_MARKUP), "4-7 business days", "Customs, duties, documents, and carrier availability apply."],
        ["International export from Nigeria", "From NGN 95,000 + weight", fmt(INTERNATIONAL_STANDARD_MARKUP), fmt(INTERNATIONAL_LARGE_MARKUP), "4-6 business days", "Worldwide delivery subject to destination restrictions and documentation."],
    ]
    story = header(
        "International Import and Export Pricing",
        "Fly Logistics supports worldwide shipping from Nigeria and import delivery into Nigeria. International pricing is confirmed after commodity, declared value, customs, and carrier review.",
    )
    table = Table(rows, repeatRows=1, colWidths=[46 * mm, 38 * mm, 30 * mm, 38 * mm, 30 * mm, 70 * mm])
    table.setStyle(table_style())
    story.extend([table, Spacer(1, 5 * mm), Paragraph("International rates are estimates until customs documentation, declared value, airline or carrier availability, and destination restrictions are confirmed.", styles()["Deck"])])
    doc(OUTPUT_DIR / "fly-logistics-international-delivery-rates.pdf", "Fly Logistics International Delivery Rates").build(story)


def build_summary_pdf():
    rows = [
        ["Pricing area", "Rule"],
        ["Local Nigeria base delivery", "Published Fly Logistics route rate for the first 0.5-4kg"],
        ["Local extra kg", "Published Fly Logistics extra kilogram rate by delivery lane"],
        ["Food/snacks", "Same-day delivery within same Nigerian state only"],
        ["Standard packages", "Next-day delivery within same state; ETA-based interstate delivery"],
        ["International import", "Worldwide origin into Nigeria; customs and document review required"],
        ["International export", "Nigeria to worldwide destinations; destination restrictions apply"],
        ["Payment", "Wallet or secure card/bank payment before pickup"],
        ["Tracking", "Fly Logistics tracking ID is created automatically after confirmed payment"],
    ]
    story = header(
        "Delivery Pricing Policy Summary",
        "This summary is for customers and business accounts using Fly Logistics delivery, freight, import, and export services.",
    )
    table = Table(rows, repeatRows=1, colWidths=[58 * mm, 168 * mm])
    table.setStyle(table_style())
    story.extend([table])
    doc(OUTPUT_DIR / "fly-logistics-pricing-summary.pdf", "Fly Logistics Pricing Summary").build(story)


if __name__ == "__main__":
    build_local_pdf()
    build_international_pdf()
    build_summary_pdf()
    print("Generated Fly Logistics pricing PDFs in public/pricing")
