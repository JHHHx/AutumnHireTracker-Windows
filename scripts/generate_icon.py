#!/usr/bin/env python3
"""Generate the exact 秋 app icon as PNG and multi-size Windows ICO."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
FONT_CANDIDATES = (
    Path("/System/Library/Fonts/PingFang.ttc"),
    Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    Path("/System/Library/Fonts/STHeiti Light.ttc"),
    Path("C:/Windows/Fonts/msyh.ttc"),
    Path("C:/Windows/Fonts/msyhbd.ttc"),
)


def font_path() -> Path:
    for candidate in FONT_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("没有找到苹方或微软雅黑字体")


def main() -> None:
    size = 256
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (0, 0, size - 1, size - 1),
        radius=58,
        fill="#bd5b38",
    )
    draw.rounded_rectangle(
        (27, 27, size - 28, size - 28),
        radius=40,
        outline=(255, 250, 245, 32),
        width=3,
    )

    font = ImageFont.truetype(str(font_path()), 124)
    text = "秋"
    bounds = draw.textbbox((0, 0), text, font=font)
    text_width = bounds[2] - bounds[0]
    text_height = bounds[3] - bounds[1]
    position = (
        (size - text_width) / 2 - bounds[0],
        (size - text_height) / 2 - bounds[1] - 3,
    )
    draw.text(position, text, font=font, fill="#fffaf5")

    ASSETS.mkdir(parents=True, exist_ok=True)
    image.save(ASSETS / "icon.png")
    image.save(
        ASSETS / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    main()
