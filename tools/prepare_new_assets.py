"""Extract the supplied soldier and house onto transparent canvases."""

from pathlib import Path
import argparse

import cv2
import numpy as np
from PIL import Image


ASSETS = Path(__file__).resolve().parents[1] / "assets"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("soldier_source", type=Path)
parser.add_argument("house_source", type=Path)
args = parser.parse_args()


def save_cutout(source, name, rectangle, seeds, crop, white_background=False):
    bgr = cv2.imdecode(np.fromfile(source, dtype=np.uint8), cv2.IMREAD_COLOR)
    height, width = bgr.shape[:2]
    mask = np.full((height, width), cv2.GC_BGD, dtype=np.uint8)
    x, y, w, h = rectangle
    mask[y:y + h, x:x + w] = cv2.GC_PR_FGD
    if white_background:
        mask[np.min(bgr, axis=2) > 245] = cv2.GC_BGD
    for polygon in seeds:
        cv2.fillPoly(mask, [np.array(polygon, dtype=np.int32)], cv2.GC_FGD)
    cv2.grabCut(bgr, mask, None, np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 8, cv2.GC_INIT_WITH_MASK)
    alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(alpha)
    largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    alpha[labels != largest] = 0
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.6)
    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = alpha
    left, top, right, bottom = crop
    Image.fromarray(rgba[top:bottom, left:right]).save(ASSETS / name)


save_cutout(
    args.soldier_source, "soldier.png", (165, 95, 420, 860),
    [[(342, 109), (352, 108), (410, 258), (393, 273)],
     [(423, 235), (481, 230), (508, 283), (462, 351), (409, 327)],
     [(324, 370), (416, 344), (480, 442), (450, 644), (288, 620)],
     [(270, 601), (449, 596), (453, 780), (380, 846), (282, 782)],
     [(242, 792), (333, 809), (292, 919), (173, 945)]],
    (165, 100, 580, 638), white_background=True,
)

save_cutout(
    args.house_source, "house.png", (65, 214, 672, 368),
    [[(176, 283), (554, 280), (573, 354), (172, 360)],
     [(90, 457), (714, 449), (712, 564), (89, 565)]],
    (67, 212, 737, 585),
)
