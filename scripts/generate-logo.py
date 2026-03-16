from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
BRANDING_DIR = ROOT / "branding"
FRONTEND_FAVICON = ROOT / "frontend" / "public" / "favicon.svg"
FRONTEND_LOGO = ROOT / "frontend" / "public" / "logo-mark.svg"
TAURI_ICON_PNG = ROOT / "src-tauri" / "icons" / "icon.png"
TAURI_ICON_ICO = ROOT / "src-tauri" / "icons" / "icon.ico"


CANVAS = 512
SCALE = CANVAS / 256


COLORS = {
    "bg_top": "#16263a",
    "bg_bottom": "#0f1724",
    "border": "#223652",
    "glow": "#8ed5ff",
    "tile": "#f8fbff",
    "tile_fold": "#d8e7ff",
    "tile_bar": "#38bdf8",
    "left": "#fb923c",
    "middle": "#22c5f6",
    "right": "#2563eb",
    "output": "#0ea5e9",
    "output_tip": "#2563eb",
    "shadow": "#09111d",
}


def p(value: float) -> int:
    return round(value * SCALE)


def hex_rgba(color: str, alpha: int) -> tuple[int, int, int, int]:
    color = color.lstrip("#")
    return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def ensure_dirs() -> None:
    BRANDING_DIR.mkdir(exist_ok=True)
    FRONTEND_FAVICON.parent.mkdir(parents=True, exist_ok=True)
    TAURI_ICON_PNG.parent.mkdir(parents=True, exist_ok=True)


def icon_svg() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <defs>
    <linearGradient id="bg" x1="40" y1="20" x2="210" y2="238" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{COLORS["bg_top"]}"/>
      <stop offset="1" stop-color="{COLORS["bg_bottom"]}"/>
    </linearGradient>
    <linearGradient id="out" x1="128" y1="188" x2="128" y2="226" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{COLORS["output"]}"/>
      <stop offset="1" stop-color="{COLORS["output_tip"]}"/>
    </linearGradient>
    <filter id="shadow" x="0" y="0" width="256" height="256" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="{COLORS["shadow"]}" flood-opacity="0.28"/>
    </filter>
    <filter id="glow" x="0" y="0" width="256" height="256" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <rect x="16" y="16" width="224" height="224" rx="64" fill="url(#bg)"/>
    <rect x="16.5" y="16.5" width="223" height="223" rx="63.5" stroke="{COLORS["border"]}"/>
  </g>
  <ellipse cx="84" cy="64" rx="48" ry="26" fill="{COLORS["glow"]}" fill-opacity="0.14" filter="url(#glow)"/>
  <path d="M72 60V86C72 98.15 81.85 108 94 108H108V126" stroke="{COLORS["left"]}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M128 48V126" stroke="{COLORS["middle"]}" stroke-width="18" stroke-linecap="round"/>
  <path d="M184 60V86C184 98.15 174.15 108 162 108H148V126" stroke="{COLORS["right"]}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="86" y="126" width="84" height="62" rx="18" fill="{COLORS["tile"]}"/>
  <path d="M150 126H170V146" fill="{COLORS["tile_fold"]}"/>
  <rect x="104" y="160" width="48" height="10" rx="5" fill="{COLORS["tile_bar"]}"/>
  <path d="M128 188V206" stroke="url(#out)" stroke-width="18" stroke-linecap="round"/>
  <path d="M106 204L128 226L150 204" fill="url(#out)"/>
</svg>
"""


def horizontal_logo_svg() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240" viewBox="0 0 640 240" fill="none">
  <rect width="640" height="240" rx="36" fill="#F5F7FA"/>
  <g transform="translate(36 24)">
    {icon_svg().replace('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">', '').replace('</svg>', '')}
  </g>
</svg>
"""


def write_svgs() -> None:
    (BRANDING_DIR / "logo-mark.svg").write_text(icon_svg(), encoding="utf-8")
    (BRANDING_DIR / "logo-panel.svg").write_text(horizontal_logo_svg(), encoding="utf-8")
    FRONTEND_LOGO.write_text(icon_svg(), encoding="utf-8")
    FRONTEND_FAVICON.write_text(icon_svg(), encoding="utf-8")


def vertical_gradient(size: int, top: str, bottom: str) -> Image.Image:
    top_rgb = tuple(int(top[i : i + 2], 16) for i in (1, 3, 5))
    bottom_rgb = tuple(int(bottom[i : i + 2], 16) for i in (1, 3, 5))
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        blend = y / max(size - 1, 1)
        color = tuple(round(top_rgb[i] + (bottom_rgb[i] - top_rgb[i]) * blend) for i in range(3)) + (255,)
        for x in range(size):
            pixels[x, y] = color
    return image


def rounded_rect_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((p(16), p(16), p(240), p(240)), radius=p(64), fill=255)
    return mask


def create_icon_png() -> Image.Image:
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))

    base = vertical_gradient(CANVAS, COLORS["bg_top"], COLORS["bg_bottom"])
    mask = rounded_rect_mask(CANVAS)
    image.alpha_composite(Image.composite(base, Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0)), mask))

    highlight = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    highlight_draw = ImageDraw.Draw(highlight)
    highlight_draw.ellipse(
        (p(36), p(38), p(132), p(90)),
        fill=hex_rgba(COLORS["glow"], 55),
    )
    highlight = highlight.filter(ImageFilter.GaussianBlur(p(10)))
    image.alpha_composite(highlight)

    shadow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (p(86), p(132), p(170), p(194)),
        radius=p(18),
        fill=hex_rgba(COLORS["shadow"], 70),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(p(5)))
    image.alpha_composite(shadow, dest=(0, p(4)))

    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (p(16), p(16), p(240), p(240)),
        radius=p(64),
        outline=COLORS["border"],
        width=p(1.5),
    )

    line_width = p(18)
    draw.line((p(72), p(60), p(72), p(86)), fill=COLORS["left"], width=line_width)
    draw.arc((p(72), p(86), p(116), p(130)), start=180, end=270, fill=COLORS["left"], width=line_width)
    draw.line((p(94), p(108), p(108), p(108)), fill=COLORS["left"], width=line_width)
    draw.line((p(108), p(108), p(108), p(126)), fill=COLORS["left"], width=line_width)

    draw.line((p(128), p(48), p(128), p(126)), fill=COLORS["middle"], width=line_width)

    draw.line((p(184), p(60), p(184), p(86)), fill=COLORS["right"], width=line_width)
    draw.arc((p(140), p(86), p(184), p(130)), start=270, end=360, fill=COLORS["right"], width=line_width)
    draw.line((p(162), p(108), p(148), p(108)), fill=COLORS["right"], width=line_width)
    draw.line((p(148), p(108), p(148), p(126)), fill=COLORS["right"], width=line_width)

    draw.rounded_rectangle(
        (p(86), p(126), p(170), p(188)),
        radius=p(18),
        fill=COLORS["tile"],
    )
    draw.polygon(
        ((p(150), p(126)), (p(170), p(126)), (p(170), p(146))),
        fill=COLORS["tile_fold"],
    )
    draw.rounded_rectangle(
        (p(104), p(160), p(152), p(170)),
        radius=p(5),
        fill=COLORS["tile_bar"],
    )

    draw.line((p(128), p(188), p(128), p(206)), fill=COLORS["output"], width=line_width)
    draw.polygon(
        ((p(106), p(204)), (p(128), p(226)), (p(150), p(204))),
        fill=COLORS["output_tip"],
    )

    return image


def create_preview(icon: Image.Image) -> Image.Image:
    preview = Image.new("RGBA", (1200, 900), "#f5f7fa")
    shadow = Image.new("RGBA", preview.size, (0, 0, 0, 0))
    shadow.paste(icon.resize((420, 420), Image.Resampling.LANCZOS), (390, 180))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    shadow = ImageChops.multiply(shadow, Image.new("RGBA", preview.size, hex_rgba(COLORS["shadow"], 160)))
    preview.alpha_composite(shadow, dest=(0, 16))
    preview.alpha_composite(icon.resize((420, 420), Image.Resampling.LANCZOS), dest=(390, 160))
    return preview


def write_raster_assets() -> None:
    icon = create_icon_png()
    icon.save(TAURI_ICON_PNG)
    icon.save(
        TAURI_ICON_ICO,
        sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
    )
    create_preview(icon).save(BRANDING_DIR / "logo-preview.png")


def main() -> None:
    ensure_dirs()
    write_svgs()
    write_raster_assets()


if __name__ == "__main__":
    main()
