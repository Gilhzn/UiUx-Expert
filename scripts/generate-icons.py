"""Generate AdaptiveUI extension icons (16/32/48/128 PNGs).

Re-run only if the brand needs to change:
    server/.venv/bin/python scripts/generate-icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZES = (16, 32, 48, 128)
BG = (47, 109, 246, 255)      # accent blue (matches the popup primary)
BG_DEEP = (29, 89, 227, 255)  # bottom of the diagonal gradient
DOT_LIGHT = (255, 255, 255, 235)
DOT_MED = (255, 255, 255, 150)
DOT_DARK = (255, 255, 255, 70)

OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "icon"


def gradient_background(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    pixels = img.load()
    assert pixels is not None
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1)) if size > 1 else 0
            r = int(BG[0] + (BG_DEEP[0] - BG[0]) * t)
            g = int(BG[1] + (BG_DEEP[1] - BG[1]) * t)
            b = int(BG[2] + (BG_DEEP[2] - BG[2]) * t)
            pixels[x, y] = (r, g, b, 255)
    return img


def round_corners(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radius=radius, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def draw_glyph(img: Image.Image, size: int) -> None:
    """Three dots, ascending — represents the adaptive lift the extension does."""
    d = ImageDraw.Draw(img)
    cx = size / 2
    cy = size / 2

    if size <= 16:
        radius = max(1, size // 6)
        spacing = size // 3.2
    elif size <= 32:
        radius = max(2, size // 7)
        spacing = size // 3.4
    else:
        radius = max(3, size // 8)
        spacing = size // 3.6

    dots = [
        (cx - spacing, cy + spacing * 0.55, DOT_DARK),
        (cx,           cy,                  DOT_MED),
        (cx + spacing, cy - spacing * 0.55, DOT_LIGHT),
    ]
    for x, y, color in dots:
        d.ellipse(
            (x - radius, y - radius, x + radius, y + radius),
            fill=color,
        )

    # Subtle stroke between dots — implies a curve being smoothed.
    line_w = max(1, size // 32)
    if line_w > 0 and size >= 24:
        d.line(
            [(cx - spacing, cy + spacing * 0.55), (cx, cy), (cx + spacing, cy - spacing * 0.55)],
            fill=(255, 255, 255, 110),
            width=line_w,
        )


def build_icon(size: int) -> Image.Image:
    bg = gradient_background(size)
    draw_glyph(bg, size)
    return round_corners(bg, radius=max(2, size // 6))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for s in SIZES:
        icon = build_icon(s)
        # Antialias the smallest sizes by rendering 2x then downsampling.
        if s <= 32:
            big = build_icon(s * 4).filter(ImageFilter.SMOOTH)
            icon = big.resize((s, s), Image.LANCZOS)
        path = OUT_DIR / f"{s}.png"
        icon.save(path)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
