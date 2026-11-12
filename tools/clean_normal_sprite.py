"""Remove the two backdrop remnants from the transparent normal-zombie sprite."""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


sprite_path = Path(__file__).resolve().parents[1] / "assets" / "normal-zombie.png"
image = Image.open(sprite_path).convert("RGBA")
scale = 4
mask = Image.new("L", (image.width * scale, image.height * scale), 255)
draw = ImageDraw.Draw(mask)
for polygon in (
    [(50, 60), (56, 63), (55, 103), (26, 103), (27, 91), (33, 83), (40, 76), (45, 69)],
    [(94, 84), (104, 84), (113, 99), (116, 104), (99, 104), (94, 98)],
    [(69, 214), (77, 214), (78, 267), (68, 267), (66, 246)],
):
    draw.polygon([(x * scale, y * scale) for x, y in polygon], fill=0)
mask = mask.resize(image.size, Image.Resampling.LANCZOS)
image.putalpha(ImageChops.multiply(image.getchannel("A"), mask))
image.save(sprite_path)
