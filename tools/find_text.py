"""Ищет текст на листе и печатает его координаты в пикселях рендера 110 dpi."""
import sys

import pymupdf

# путь к альбому: переменная окружения HALL_PDF или «холл альбом.pdf» в корне проекта
PDF = __import__("os").environ.get("HALL_PDF", str(__import__("pathlib").Path(__file__).resolve().parent.parent / "холл альбом.pdf"))
pno = int(sys.argv[1])
needle = sys.argv[2]
k = 110 / 72
page = pymupdf.open(PDF)[pno - 1]
for b in page.get_text("dict")["blocks"]:
    for line in b.get("lines", []):
        txt = "".join(s["text"] for s in line["spans"])
        if needle in txt:
            x0, y0, x1, y1 = line["bbox"]
            print(f"{txt!r}: px110=({x0*k:.0f},{y0*k:.0f})-({x1*k:.0f},{y1*k:.0f})")
