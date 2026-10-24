"""Рисует векторные слои плана по категориям в отдельный PNG, чтобы понять, что есть что."""
import sys

import pymupdf

# путь к альбому: переменная окружения HALL_PDF или «холл альбом.pdf» в корне проекта
PDF = __import__("os").environ.get("HALL_PDF", str(__import__("pathlib").Path(__file__).resolve().parent.parent / "холл альбом.pdf"))
pno = int(sys.argv[1]) if len(sys.argv) > 1 else 10
out = sys.argv[2] if len(sys.argv) > 2 else "debug.png"
mode = sys.argv[3] if len(sys.argv) > 3 else "fills"

doc = pymupdf.open(PDF)
page = doc[pno - 1]
drawings = page.get_drawings()

dst = pymupdf.open()
dpage = dst.new_page(width=page.rect.width, height=page.rect.height)
shape = dpage.new_shape()


def r3(c):
    return tuple(round(v, 3) for v in c) if c else None


WANT_FILLS = {
    (0.6, 0.6, 0.6): (0.2, 0.2, 0.2),
    (0.749, 0.749, 0.749): (0.9, 0.1, 0.1),
    (0.953, 0.714, 0.694): (1.0, 0.4, 0.6),
    (0.816, 0.882, 0.957): (0.2, 0.4, 1.0),
    (0.659, 0.808, 0.62): (0.1, 0.7, 0.1),
    (0.408, 0.702, 0.325): (0.0, 0.5, 0.0),
    (0.992, 0.973, 0.82): (0.9, 0.8, 0.0),
    (0.839, 0.804, 0.655): (0.7, 0.5, 0.2),
    (0.741, 0.659, 0.533): (0.5, 0.3, 0.1),
    (0.0, 0.467, 0.69): (0.0, 0.9, 0.9),
    (0.91, 0.91, 0.91): (0.6, 0.0, 0.8),
    (0.0, 0.0, 0.0): (0.0, 0.0, 0.0),
}
WANT_STROKES = {
    (0.369, 0.369, 1.0): (0.2, 0.2, 1.0),
    (0.502, 0.839, 1.0): (0.0, 0.8, 0.8),
    (0.0, 0.467, 0.69): (0.0, 0.6, 0.6),
    (0.498, 0.498, 0.498): (0.5, 0.5, 0.5),
}

for d in drawings:
    f, c = r3(d.get("fill")), r3(d.get("color"))
    if mode == "fills":
        if f not in WANT_FILLS:
            continue
        col = WANT_FILLS[f]
        for it in d["items"]:
            if it[0] == "re":
                shape.draw_rect(it[1])
            elif it[0] == "qu":
                shape.draw_quad(it[1])
            elif it[0] == "l":
                shape.draw_line(it[1], it[2])
            elif it[0] == "c":
                shape.draw_bezier(it[1], it[2], it[3], it[4])
        shape.finish(fill=col, color=None, closePath=True)
    else:
        if f is not None or c not in WANT_STROKES:
            continue
        col = WANT_STROKES[c]
        for it in d["items"]:
            if it[0] == "l":
                shape.draw_line(it[1], it[2])
            elif it[0] == "re":
                shape.draw_rect(it[1])
            elif it[0] == "qu":
                shape.draw_quad(it[1])
            elif it[0] == "c":
                shape.draw_bezier(it[1], it[2], it[3], it[4])
        shape.finish(color=col, width=0.5)
shape.commit()
dpage.get_pixmap(dpi=110).save(out)
print("saved", out)
