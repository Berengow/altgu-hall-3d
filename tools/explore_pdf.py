"""Обзор векторных примитивов на листах плана: цвета заливки, количество, габариты."""
import sys
from collections import Counter

import pymupdf

# путь к альбому: переменная окружения HALL_PDF или «холл альбом.pdf» в корне проекта
PDF = __import__("os").environ.get("HALL_PDF", str(__import__("pathlib").Path(__file__).resolve().parent.parent / "холл альбом.pdf"))
pages = [int(p) for p in sys.argv[1:]] or [8, 9, 10]

doc = pymupdf.open(PDF)
for pno in pages:
    page = doc[pno - 1]
    drawings = page.get_drawings()
    fills = Counter()
    strokes = Counter()
    for d in drawings:
        f = d.get("fill")
        c = d.get("color")
        key = tuple(round(v, 3) for v in f) if f else None
        fills[key] += 1
        strokes[(tuple(round(v, 3) for v in c) if c else None, round(d.get("width") or 0, 2))] += 1
    print(f"=== page {pno}: {len(drawings)} drawings, images={len(page.get_images())}")
    print("fills:")
    for k, n in fills.most_common(25):
        print("  ", k, n)
    print("strokes:")
    for k, n in strokes.most_common(25):
        print("  ", k, n)
