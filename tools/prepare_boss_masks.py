"""Bake small alpha hit masks for browsers opening index.html directly."""

import base64
import json
from pathlib import Path

import numpy as np
from PIL import Image


assets = Path(__file__).resolve().parents[1] / "assets"
masks = {}
for name, file in (("final", "final-boss.png"), ("finalMobile", "final-boss-mobile.png")):
    alpha = Image.open(assets / file).convert("RGBA").getchannel("A")
    small = alpha.resize((128, 128), Image.Resampling.BILINEAR)
    bits = np.packbits(np.asarray(small) > 32, bitorder="little")
    masks[name] = {"width": 128, "height": 128, "bits": base64.b64encode(bits.tobytes()).decode("ascii")}
(assets / "boss-masks.js").write_text(
    "window.BOSS_MASKS = " + json.dumps(masks, separators=(",", ":")) + ";\n",
    encoding="ascii",
)
