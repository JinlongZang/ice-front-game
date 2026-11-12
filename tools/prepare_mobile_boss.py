"""Build the phone boss sprite without stretching the full-height artwork."""

from pathlib import Path

import numpy as np
from PIL import Image


assets = Path(__file__).resolve().parents[1] / "assets"
source = Image.open(assets / "final-boss.png").convert("RGBA")
height = 590
sprite = np.array(source.crop((0, 0, source.width, height)))
fade_start = height - 105
fade = np.clip((height - np.arange(height)) / (height - fade_start), 0, 1)
sprite[:, :, 3] = (sprite[:, :, 3].astype(np.float32) * fade[:, None]).astype(np.uint8)
Image.fromarray(sprite).save(assets / "final-boss-mobile.png")
