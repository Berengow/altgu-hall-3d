"""Рисует извлечённые данные plan-data.js сверху в PNG — для сверки с листами альбома."""
import json
import os
import sys

import pymupdf

SRC = os.path.join(os.path.dirname(__file__), "..", "hall-3d", "plan-data.js")
out = sys.argv[1] if len(sys.argv) > 1 else "plan_preview.png"
txt = open(SRC, encoding="utf-8").read()
P = json.loads(txt[txt.index("{"): txt.rindex("}") + 1])

K = 40  # px на метр
W, H = 37 * K, 17.5 * K
doc = pymupdf.open()
page = doc.new_page(width=W, height=H)
sh = page.new_shape()
O = 15


def pt(x, y):
    return pymupdf.Point(O + x * K, O + y * K)


def poly(pts, fill, color=None):
    sh.draw_polyline([pt(*p) for p in pts] + [pt(*pts[0])])
    sh.finish(fill=fill, color=color, closePath=True, width=0.5)


def rect(o, fill):
    sh.draw_rect(pymupdf.Rect(pt(o["cx"] - o["w"] / 2, o["cy"] - o["d"] / 2), pt(o["cx"] + o["w"] / 2, o["cy"] + o["d"] / 2)))
    sh.finish(fill=fill, color=None)


def line(s, color, width=2):
    sh.draw_line(pt(s["x1"], s["y1"]), pt(s["x2"], s["y2"]))
    sh.finish(color=color, width=width)


for w in P["walls"]:
    poly(w, (0.25, 0.25, 0.25))
for c in P["columns"]:
    if c["type"] == "round":
        sh.draw_circle(pt(c["cx"], c["cy"]), c["r"] * K)
        sh.finish(fill=(0.8, 0.2, 0.2), color=None)
    else:
        rect(c, (0.8, 0.2, 0.2))
for s in P["partitions"]:
    line(s, (0.1, 0.6, 0.9), 3)
F = P["furniture"]
for o in F["sofas"]:
    rect(o, (0.55, 0.18, 0.22))
for o in F["chairs"]:
    rect(o, (0.75, 0.3, 0.3))
for o in F["benches"]:
    rect(o, (0.15, 0.2, 0.4))
for o in F["planters"]:
    rect(o, (0.5, 0.5, 0.5))
for o in F["tables"]:
    rect(o, (0.8, 0.65, 0.4))
for o in F["desks"]:
    rect(o, (0.45, 0.3, 0.15))
for o in F["officeChairs"]:
    rect(o, (0.95, 0.8, 0.1))
for o in F["logos"]:
    rect(o, (0, 0.4, 0.8))
for o in F["seatBench"]:
    poly(o["pts"], (0.85, 0.7, 0.45))
for o in F["plants"]:
    sh.draw_circle(pt(o["cx"], o["cy"]), o["r"] * K)
    sh.finish(fill=(0.3, 0.6, 0.25), color=None)
for s in P["railings"]:
    line(s, (0.1, 0.1, 1.0), 1.5)
FC = {"gray": (0.55, 0.75, 1), "bordo": (0.8, 0.1, 0.1), "plaster": (0.2, 0.8, 0.2), "metal": (0, 0.5, 0.5),
      "tile": (0.5, 0, 0), "marble": (1, 0.55, 0.1)}
for s in P["finishes"]:
    line(s, FC[s["kind"]], 3)
L = P["lights"]
for o in L["panels"]:
    rect(o, (1, 0.85, 0.2))
for o in L["linear"]:
    rect(o, (1, 0.6, 0.0))
for o in L["pendants"]:
    sh.draw_circle(pt(o["cx"], o["cy"]), 5)
    sh.finish(fill=(1, 0.3, 0), color=None)
M = P["manual"]
for s in M["doors"]:
    line(s, (0.6, 0.4, 0.1) if s["kind"] == "wood" else (0, 0.8, 0.8), 4)
for s in M["extraWalls"]:
    line(s, (0.25, 0.25, 0.25), 6)
for s in M["windows"] + M["vitrage"]:
    line(s, (0.3, 0.9, 1.0), 3)
for st in M["stairs"]:
    rect(st["flight1"], (0.6, 0.6, 0.65))
    rect(st["flight2"], (0.5, 0.5, 0.6))
    rect(st["landing"], (0.7, 0.7, 0.75))
sh.commit()
page.get_pixmap(dpi=72).save(out)
print("saved", out)
