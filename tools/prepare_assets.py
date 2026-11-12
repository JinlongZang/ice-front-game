"""Rebuild transparent character sprites from the provided reference images."""

from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ASSETS = Path(__file__).resolve().parents[1] / "assets"


def grabcut_sprite(source, output, rect, sure_foreground, crop, iterations=8, outline=None, color_distance=0, local_background=None):
    bgr = cv2.imdecode(np.fromfile(ASSETS / source, dtype=np.uint8), cv2.IMREAD_COLOR)
    if bgr is None:
        raise FileNotFoundError(source)
    height, width = bgr.shape[:2]
    x, y, w, h = rect
    mask = np.zeros((height, width), np.uint8)
    mask[y:y + h, x:x + w] = cv2.GC_PR_FGD

    # Interior seeds preserve limbs whose colors match the backdrop.
    for polygon in sure_foreground:
        cv2.fillPoly(mask, [np.array(polygon, np.int32)], cv2.GC_FGD)

    background = np.zeros((1, 65), np.float64)
    foreground = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, mask, None, background, foreground, iterations, cv2.GC_INIT_WITH_MASK)
    alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    if color_distance or local_background:
        border = np.concatenate((bgr[:, :35, :], bgr[:, -35:, :]), axis=1)
        row_background = np.median(border, axis=1).astype(np.int16)[:, None, :]
        difference = np.max(np.abs(bgr.astype(np.int16) - row_background), axis=2)
        if color_distance:
            alpha[difference < color_distance] = 0
        if local_background:
            left, top, right, bottom, threshold = local_background
            region = alpha[top:bottom, left:right]
            region[difference[top:bottom, left:right] < threshold] = 0
    if outline:
        allowed = np.zeros_like(alpha)
        polygons = outline if isinstance(outline[0][0], (list, tuple)) else [outline]
        for polygon in polygons:
            cv2.fillPoly(allowed, [np.array(polygon, np.int32)], 255)
        alpha = cv2.bitwise_and(alpha, allowed)
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    contours, hierarchy = cv2.findContours(alpha.copy(), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is not None:
        for contour, item in zip(contours, hierarchy[0]):
            if item[3] >= 0 and cv2.contourArea(contour) < 380:
                cv2.drawContours(alpha, [contour], -1, 255, -1)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.65)
    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = alpha
    left, top, right, bottom = crop
    Image.fromarray(rgba[top:bottom, left:right]).save(ASSETS / output)


grabcut_sprite(
    "zombie-source.png", "normal-zombie.png", (177, 43, 137, 285),
    [
        [(252, 58), (266, 56), (277, 74), (268, 92), (251, 91), (247, 75)],
        [(238, 108), (267, 102), (288, 137), (273, 168), (220, 154), (220, 127)],
        [(231, 170), (263, 170), (267, 222), (245, 245), (225, 216)],
        [(231, 247), (249, 241), (248, 310), (239, 319), (226, 296)],
        [(269, 168), (283, 168), (275, 266), (260, 274), (260, 230)],
        [(205, 133), (213, 131), (205, 189), (195, 192)],
        [(288, 128), (298, 137), (303, 219), (291, 222)],
    ],
    (178, 43, 314, 330),
    outline=[
        [(250, 46), (270, 46), (284, 75), (277, 98), (246, 105), (242, 79)],
        [(227, 90), (272, 87), (292, 110), (290, 158), (272, 179), (231, 168), (210, 141), (210, 107)],
        [(209, 106), (230, 112), (213, 151), (207, 193), (186, 194), (179, 183), (193, 139)],
        [(277, 100), (297, 108), (305, 148), (304, 188), (313, 218), (309, 235), (293, 224), (287, 171)],
        [(228, 153), (282, 151), (283, 207), (267, 245), (242, 250), (228, 211)],
        [(230, 215), (255, 215), (251, 291), (259, 319), (248, 332), (227, 318), (225, 264)],
        [(257, 204), (282, 202), (279, 267), (258, 282), (250, 254)],
    ],
    color_distance=0,
    local_background=(205, 145, 296, 275, 26),
)

grabcut_sprite(
    "final-boss-source.png", "final-boss.png", (46, 6, 600, 1048),
    [
        [(295, 160), (342, 122), (407, 160), (422, 246), (350, 285), (288, 244)],
        [(255, 267), (443, 268), (480, 379), (419, 522), (238, 381)],
        [(172, 159), (204, 153), (190, 239), (276, 294), (266, 318), (170, 257)],
        [(500, 147), (535, 174), (526, 259), (443, 319), (430, 289), (496, 229)],
        [(238, 389), (270, 401), (204, 549), (121, 620), (105, 599)],
        [(448, 391), (480, 410), (563, 571), (618, 608), (592, 637)],
        [(270, 499), (345, 502), (320, 697), (215, 871), (157, 987), (123, 991)],
        [(365, 510), (438, 503), (497, 735), (541, 896), (565, 973), (531, 984)],
    ],
    (48, 6, 646, 1054),
    10,
    color_distance=22,
)

grabcut_sprite(
    "frozen-weapon-source.png", "frozen-weapon.png", (43, 176, 1102, 545),
    [
        [(80, 446), (206, 360), (378, 324), (706, 279), (782, 313), (617, 456), (104, 511)],
        [(84, 538), (313, 500), (619, 477), (751, 518), (621, 674), (143, 689)],
        [(702, 291), (786, 204), (835, 215), (868, 331), (789, 470), (679, 447)],
        [(922, 235), (1078, 217), (1115, 249), (1092, 361), (984, 382), (904, 338)],
        [(769, 431), (900, 411), (923, 583), (805, 604), (743, 549)],
    ],
    (44, 176, 1145, 715),
    8,
    color_distance=16,
)
