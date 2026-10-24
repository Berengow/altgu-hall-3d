"""Вырезает фрагмент листа в высоком разрешении. Координаты — в пикселях рендера 110 dpi."""
import sys

import pymupdf

# путь к альбому: переменная окружения HALL_PDF или «холл альбом.pdf» в корне проекта
PDF = __import__("os").environ.get("HALL_PDF", str(__import__("pathlib").Path(__file__).resolve().parent.parent / "холл альбом.pdf"))
pno, x0, y0, x1, y1 = (int(v) for v in sys.argv[1:6])
out = sys.argv[6]
dpi = int(sys.argv[7]) if len(sys.argv) > 7 else 300
k = 72 / 110
page = pymupdf.open(PDF)[pno - 1]
clip = pymupdf.Rect(x0 * k, y0 * k, x1 * k, y1 * k)
page.get_pixmap(dpi=dpi, clip=clip).save(out)
print("saved", out)
