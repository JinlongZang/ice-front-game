"""Create compact phone assets for the house and frozen weapon."""

from pathlib import Path

from PIL import Image


assets = Path(__file__).resolve().parents[1] / "assets"
for source, output, width in (
    ("house.png", "house-mobile.png", 320),
    ("frozen-weapon.png", "frozen-weapon-mobile.png", 400),
):
    image = Image.open(assets / source).convert("RGBA")
    height = round(image.height * width / image.width)
    image.resize((width, height), Image.Resampling.LANCZOS).save(assets / output, optimize=True)
