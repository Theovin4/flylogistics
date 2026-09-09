from __future__ import annotations

import math
import random
import shutil
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "brand-assets" / "fly-logistics-commercial-pack"
ZIP_PATH = ROOT / "public" / "brand-assets" / "fly-logistics-commercial-pack.zip"
WIDTH = 1600
HEIGHT = 1200
ORANGE = (255, 115, 0)
ORANGE_LIGHT = (255, 168, 72)
BLACK = (5, 6, 10)
INK = (16, 18, 25)
WHITE = (248, 250, 252)
MUTED = (164, 172, 185)


CAMPAIGNS = [
    ("Same-Day Delivery", "Lagos speed. Enterprise control.", "Move urgent parcels with live pickup visibility."),
    ("AI Freight OS", "Smarter decisions for every route.", "Pricing, tracking, dispatch, and delivery proof in one flow."),
    ("Business Logistics", "Daily delivery built for operators.", "Reliable movement for retailers, teams, and growing brands."),
    ("Interstate Delivery", "Nigeria-wide freight coordination.", "Route confidence, ETA guidance, and customer updates."),
    ("International Import", "Bring shipments into Nigeria smoothly.", "Coordinated handling for global supplier shipments."),
    ("International Export", "Ship from Nigeria to the world.", "Worldwide shipping preparation with Fly Logistics oversight."),
    ("Live Tracking", "Know where every shipment stands.", "Customer-friendly updates from pickup to delivery."),
    ("Wallet Payments", "Fund, pay, and reconcile faster.", "Secure wallet payments for delivery bookings."),
    ("Proof of Delivery", "Every completion recorded clearly.", "Photo, timestamp, driver, and status history for operations."),
    ("Driver Network", "Riders, vans, and trucks in sync.", "Real-time rider visibility for active delivery operations."),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


FONT_TINY = font(28)
FONT_SMALL = font(34)
FONT_BODY = font(42)
FONT_TITLE = font(78, True)
FONT_HERO = font(106, True)
FONT_MONO = font(36, True)


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def gradient_background(seed: int) -> Image.Image:
    random.seed(seed)
    small_width = WIDTH // 4
    small_height = HEIGHT // 4
    base = Image.new("RGB", (small_width, small_height), BLACK)
    pixels = base.load()
    tone = random.choice([(19, 12, 7), (9, 12, 18), (14, 10, 16), (8, 13, 15), (16, 13, 9)])
    accent = random.choice([(255, 115, 0), (255, 142, 32), (235, 87, 12), (255, 170, 78)])
    for y in range(small_height):
        for x in range(small_width):
            t = (x / small_width) * 0.55 + (y / small_height) * 0.45
            pulse = math.sin((x + seed * 31) / 170) * 0.04 + math.cos((y + seed * 11) / 140) * 0.04
            amount = max(0, min(1, t + pulse))
            r = lerp(tone[0], accent[0] // 3, amount)
            g = lerp(tone[1], accent[1] // 4, amount)
            b = lerp(tone[2], accent[2] // 5, amount)
            pixels[x, y] = (r, g, b)
    return base.resize((WIDTH, HEIGHT), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(0.4))


def rounded(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], fill, outline=None, width=1, radius=28):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def draw_logo(draw: ImageDraw.ImageDraw, x: int, y: int, scale: float = 1.0, wordmark: bool = True):
    w = int(96 * scale)
    h = int(72 * scale)
    draw.polygon(
        [(x, y + h), (x + int(w * 0.24), y + int(h * 0.08)), (x + int(w * 0.82), y), (x + int(w * 0.64), y + int(h * 0.24)), (x + int(w * 0.36), y + int(h * 0.30)), (x + int(w * 0.30), y + int(h * 0.46)), (x + int(w * 0.72), y + int(h * 0.42)), (x + int(w * 0.50), y + int(h * 0.62)), (x + int(w * 0.24), y + int(h * 0.62)), (x + int(w * 0.16), y + h)],
        fill=WHITE,
    )
    draw.polygon(
        [(x + int(w * 0.18), y + int(h * 0.68)), (x + int(w * 0.88), y + int(h * 0.34)), (x + int(w * 0.76), y + int(h * 0.54)), (x + int(w * 0.32), y + int(h * 0.82))],
        fill=ORANGE,
    )
    if wordmark:
        draw.text((x + int(125 * scale), y + int(4 * scale)), "Fly Logistics", fill=WHITE, font=font(int(44 * scale), True))
        draw.text((x + int(128 * scale), y + int(58 * scale)), "AI FREIGHT OS", fill=ORANGE_LIGHT, font=font(int(22 * scale), True))


def draw_route_network(draw: ImageDraw.ImageDraw, seed: int):
    random.seed(seed)
    points = []
    for _ in range(8):
        points.append((random.randint(150, WIDTH - 150), random.randint(190, HEIGHT - 170)))
    for idx in range(len(points) - 1):
        x1, y1 = points[idx]
        x2, y2 = points[idx + 1]
        mid = ((x1 + x2) // 2 + random.randint(-150, 150), (y1 + y2) // 2 + random.randint(-90, 90))
        draw.line([points[idx], mid, points[idx + 1]], fill=(255, 115, 0, 150), width=5, joint="curve")
        draw.line([points[idx], mid, points[idx + 1]], fill=(255, 186, 94, 75), width=12, joint="curve")
    for index, (x, y) in enumerate(points):
        color = ORANGE if index % 2 == 0 else WHITE
        draw.ellipse((x - 14, y - 14, x + 14, y + 14), fill=color)
        draw.ellipse((x - 30, y - 30, x + 30, y + 30), outline=(255, 115, 0), width=3)


def draw_vehicle(draw: ImageDraw.ImageDraw, x: int, y: int, kind: str, scale: float = 1.0):
    if kind == "bike":
        r = int(24 * scale)
        draw.ellipse((x, y + 58, x + r * 2, y + 58 + r * 2), outline=WHITE, width=int(5 * scale))
        draw.ellipse((x + int(112 * scale), y + 58, x + int(112 * scale) + r * 2, y + 58 + r * 2), outline=WHITE, width=int(5 * scale))
        draw.line((x + r, y + 74, x + int(78 * scale), y + 28, x + int(134 * scale), y + 74, x + int(52 * scale), y + 74), fill=ORANGE, width=int(9 * scale))
        draw.line((x + int(78 * scale), y + 28, x + int(112 * scale), y + 28), fill=WHITE, width=int(6 * scale))
        draw.rectangle((x + int(52 * scale), y, x + int(105 * scale), y + int(36 * scale)), fill=ORANGE)
    elif kind == "truck":
        rounded(draw, (x, y + 30, x + int(210 * scale), y + int(118 * scale)), ORANGE, radius=int(18 * scale))
        rounded(draw, (x + int(210 * scale), y + int(54 * scale), x + int(310 * scale), y + int(118 * scale)), WHITE, radius=int(16 * scale))
        draw.rectangle((x + int(232 * scale), y + int(68 * scale), x + int(282 * scale), y + int(96 * scale)), fill=INK)
        for wheel_x in (x + int(56 * scale), x + int(238 * scale)):
            draw.ellipse((wheel_x, y + int(104 * scale), wheel_x + int(54 * scale), y + int(158 * scale)), fill=BLACK, outline=WHITE, width=int(5 * scale))
    else:
        rounded(draw, (x, y + 42, x + int(270 * scale), y + int(128 * scale)), WHITE, radius=int(24 * scale))
        draw.polygon([(x + int(88 * scale), y + 42), (x + int(152 * scale), y), (x + int(224 * scale), y + 42)], fill=ORANGE)
        draw.rectangle((x + int(44 * scale), y + int(62 * scale), x + int(116 * scale), y + int(98 * scale)), fill=INK)
        draw.rectangle((x + int(170 * scale), y + int(62 * scale), x + int(232 * scale), y + int(98 * scale)), fill=INK)
        for wheel_x in (x + int(48 * scale), x + int(190 * scale)):
            draw.ellipse((wheel_x, y + int(110 * scale), wheel_x + int(50 * scale), y + int(160 * scale)), fill=BLACK, outline=ORANGE, width=int(5 * scale))


def draw_dashboard_cards(draw: ImageDraw.ImageDraw, x: int, y: int, seed: int):
    random.seed(seed)
    labels = ["ETA", "ON TIME", "ROUTE", "CONFIDENCE"]
    values = [f"{random.randint(2, 48)}h", f"{random.randint(92, 99)}%", f"FLY-{random.randint(100, 999)}", f"{random.randint(94, 99)}%"]
    for idx in range(4):
        px = x + (idx % 2) * 245
        py = y + (idx // 2) * 155
        rounded(draw, (px, py, px + 215, py + 120), (255, 255, 255, 24), outline=(255, 255, 255, 48), width=2)
        draw.text((px + 22, py + 20), labels[idx], fill=ORANGE_LIGHT, font=FONT_TINY)
        draw.text((px + 22, py + 58), values[idx], fill=WHITE, font=FONT_BODY)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, font_obj: ImageFont.FreeTypeFont) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=font_obj)[2] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def make_image(index: int):
    title, subtitle, body = CAMPAIGNS[(index - 1) % len(CAMPAIGNS)]
    seed = 20260530 + index
    image = gradient_background(seed).convert("RGBA")
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    draw.rectangle((0, 0, WIDTH, HEIGHT), fill=(0, 0, 0, 70))
    for offset in range(-300, WIDTH, 120):
        draw.line((offset, HEIGHT, offset + 720, 0), fill=(255, 255, 255, 10), width=2)

    draw_route_network(draw, seed)

    layout = index % 5
    if layout in (0, 2):
        rounded(draw, (82, 112, 760, 1010), (4, 5, 8, 198), outline=(255, 115, 0, 80), width=2, radius=34)
        text_x = 138
        visual_x = 880
    else:
        rounded(draw, (820, 112, 1518, 1010), (4, 5, 8, 198), outline=(255, 115, 0, 80), width=2, radius=34)
        text_x = 876
        visual_x = 160

    draw_logo(draw, text_x, 165, 0.78, True)
    draw.text((text_x, 310), title, fill=ORANGE_LIGHT, font=FONT_TINY)
    title_lines = wrap_text(draw, subtitle, 540, FONT_HERO)
    y = 360
    for line in title_lines[:3]:
        draw.text((text_x, y), line, fill=WHITE, font=FONT_HERO)
        y += 112
    for line in wrap_text(draw, body, 560, FONT_BODY)[:3]:
        draw.text((text_x, y + 20), line, fill=MUTED, font=FONT_BODY)
        y += 52

    rounded(draw, (text_x, 870, text_x + 410, 945), (255, 115, 0, 235), radius=20)
    draw.text((text_x + 30, 888), "Book with Fly Logistics", fill=BLACK, font=FONT_SMALL)

    random.seed(seed)
    kind = random.choice(["bike", "van", "truck"])
    draw_vehicle(draw, visual_x + random.randint(0, 80), 650 + random.randint(-40, 40), kind, random.choice([1.2, 1.35, 1.5]))
    draw_dashboard_cards(draw, visual_x + 20, 210, seed)

    for pulse in range(4):
        cx = visual_x + 390 + pulse * 48
        cy = 520 + int(math.sin(index + pulse) * 30)
        draw.ellipse((cx - 18, cy - 18, cx + 18, cy + 18), fill=(255, 115, 0, 180))
        draw.ellipse((cx - 42, cy - 42, cx + 42, cy + 42), outline=(255, 115, 0, 65), width=3)

    draw.text((82, 1080), f"FLY COMMERCIAL ASSET {index:03d}", fill=(255, 255, 255, 110), font=FONT_TINY)
    draw.text((WIDTH - 490, 1080), "flylogistics.com.ng", fill=(255, 255, 255, 140), font=FONT_TINY)
    image = Image.alpha_composite(image, overlay).convert("RGB")
    image.save(OUTPUT / "images" / f"fly-logistics-commercial-{index:03d}.png", quality=95)


def make_logo_pngs():
    logo_dir = OUTPUT / "logos"
    logo_dir.mkdir(parents=True, exist_ok=True)
    for name in ("logo.svg", "logo-dark.svg", "logo-light.svg", "favicon.svg"):
        source = ROOT / "public" / name
        if source.exists():
            shutil.copy2(source, logo_dir / name)

    for variant, bg, wordmark in [
        ("dark", BLACK, True),
        ("light", WHITE, True),
        ("transparent", (0, 0, 0, 0), True),
        ("icon-dark", BLACK, False),
    ]:
        canvas = Image.new("RGBA", (1200, 600), bg)
        draw = ImageDraw.Draw(canvas, "RGBA")
        if variant == "light":
            draw.rounded_rectangle((24, 24, 1176, 576), radius=44, fill=(255, 255, 255, 255), outline=(255, 115, 0, 90), width=3)
            draw_logo(draw, 130, 220, 1.55, wordmark)
        elif variant == "icon-dark":
            draw.rounded_rectangle((250, 50, 950, 550), radius=88, fill=(8, 9, 14, 255), outline=(255, 115, 0, 110), width=5)
            draw_logo(draw, 420, 250, 2.2, False)
        else:
            draw_logo(draw, 110, 220, 1.55, wordmark)
        canvas.save(logo_dir / f"fly-logistics-logo-{variant}.png")


def make_manifest():
    lines = [
        "Fly Logistics Commercial Brand Asset Pack",
        "Format: PNG, 4:3, 1600x1200",
        "Brand: Fly Logistics AI Freight OS",
        "Usage: website, social posts, paid ads, pitch decks, operations docs",
        "",
        "Included:",
        "- 200 commercial brand images",
        "- SVG logo files copied from the app",
        "- PNG logo variants",
        "",
        "Do not use third-party carrier names in customer-facing creative.",
    ]
    (OUTPUT / "README.txt").write_text("\n".join(lines), encoding="utf-8")


def package_zip():
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file_path in OUTPUT.rglob("*"):
            if file_path.is_file():
                archive.write(file_path, file_path.relative_to(OUTPUT.parent))


def main():
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    (OUTPUT / "images").mkdir(parents=True, exist_ok=True)
    make_logo_pngs()
    for index in range(1, 201):
        make_image(index)
    make_manifest()
    package_zip()
    print(f"Created {OUTPUT}")
    print(f"Created {ZIP_PATH}")


if __name__ == "__main__":
    main()
