"""
Извлекает геометрию холла из векторного PDF-альбома и пишет hall-3d/plan-data.js.

Источники (листы альбома, масштаб 1:90):
  10 — план расстановки мебели: стены, колонны, мебель, ограждения
  11 — план потолка: зоны ГКЛ и существующего потолка
  12 — план освещения: панели 600×600, линейные и подвесные светильники
  16 — план финишных покрытий стен: покраска, штукатурка, мрамор, металл, плитка

Выходные координаты — метры в системе плана: x вправо, y вниз,
начало в левом верхнем углу помещения. Сцена переводит y в -z.

Запуск:  python tools/extract_plan.py
"""
import json
import math
import os
import sys
from collections import defaultdict

import pymupdf

# путь к альбому: переменная окружения HALL_PDF или «холл альбом.pdf» в корне проекта
PDF = __import__("os").environ.get("HALL_PDF", str(__import__("pathlib").Path(__file__).resolve().parent.parent / "холл альбом.pdf"))
OUT = os.path.join(os.path.dirname(__file__), "..", "hall-3d", "plan-data.js")

# 1 pt листа = 0.3528 мм бумаги, в масштабе 1:90 — 31.75 мм натуры
S = 25.4 / 72 * 90 / 1000
# Пиксели рендера 110 dpi (по ним удобно сверяться с картинками листов) → pt
PX = 72 / 110
ORIGIN_PT = (103 * PX, 35 * PX)
# Всё, что ниже этой линии на листе, — легенды и подписи, не план
PLAN_MAX_Y_PT = 790 * PX


def m(pt):
    """pt листа → метры плана."""
    return ((pt[0] - ORIGIN_PT[0]) * S, (pt[1] - ORIGIN_PT[1]) * S)


def px(x, y):
    """Пиксели рендера 110 dpi → метры плана (для ручных правок ниже)."""
    return m((x * PX, y * PX))


def r3(c):
    return tuple(round(v, 3) for v in c) if c else None


def rnd(v, n=3):
    if isinstance(v, (list, tuple)):
        return [rnd(x, n) for x in v]
    if isinstance(v, dict):
        return {k: rnd(x, n) for k, x in v.items()}
    if isinstance(v, float):
        return round(v, n)
    return v


# ---------- чтение примитивов ----------

def subpaths(drawing):
    """Разбивает путь на замкнутые подпути (списки точек в pt)."""
    paths, cur, last = [], [], None
    has_curve = False
    for it in drawing["items"]:
        kind = it[0]
        if kind == "re":
            r = it[1]
            paths.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)])
            continue
        if kind == "qu":
            q = it[1]
            paths.append([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)])
            continue
        if kind == "c":
            has_curve = True
            p0, p3 = it[1], it[4]
            pts = [p0, it[2], it[3], p3]
        else:
            p0, p3 = it[1], it[2]
            pts = [p0, p3]
        if last is None or abs(p0.x - last.x) > 0.05 or abs(p0.y - last.y) > 0.05:
            if cur:
                paths.append(cur)
            cur = [(p0.x, p0.y)]
        if kind == "c":
            # кривая Безье — сэмплируем
            for t in (0.25, 0.5, 0.75, 1.0):
                a = (1 - t) ** 3
                b = 3 * (1 - t) ** 2 * t
                c = 3 * (1 - t) * t ** 2
                d = t ** 3
                cur.append((a * pts[0].x + b * pts[1].x + c * pts[2].x + d * pts[3].x,
                            a * pts[0].y + b * pts[1].y + c * pts[2].y + d * pts[3].y))
        else:
            cur.append((p3.x, p3.y))
        last = p3
    if cur:
        paths.append(cur)
    clean = []
    for p in paths:
        if len(p) > 1 and abs(p[0][0] - p[-1][0]) < 0.05 and abs(p[0][1] - p[-1][1]) < 0.05:
            p = p[:-1]
        if len(p) >= 3:
            clean.append(p)
    # окружности ArchiCAD иногда выгружает ломаной из множества отрезков
    if any(len(p) > 10 for p in clean):
        has_curve = True
    return clean, has_curve


def bbox(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def area(poly):
    a = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        a += x1 * y2 - x2 * y1
    return a / 2


_drawings = {}


def drawings(page):
    if page.number not in _drawings:
        _drawings[page.number] = page.get_drawings()
    return _drawings[page.number]


def fills(page, color):
    """Все залитые фигуры данного цвета в зоне плана: [(points_pt, has_curve)]."""
    out = []
    for d in drawings(page):
        if r3(d.get("fill")) != color:
            continue
        for p, curve in [(sp, subpaths(d)[1]) for sp in subpaths(d)[0]]:
            if bbox(p)[3] <= PLAN_MAX_Y_PT and bbox(p)[0] > 60 * PX:
                out.append((p, curve))
    return out


def cluster(items, gap_m=0.03):
    """Объединяет фигуры с пересекающимися (с допуском) габаритами. items: [(bbox_m, payload)]."""
    n = len(items)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n):
        a = items[i][0]
        for j in range(i + 1, n):
            b = items[j][0]
            if a[0] - gap_m <= b[2] and b[0] - gap_m <= a[2] and a[1] - gap_m <= b[3] and b[1] - gap_m <= a[3]:
                parent[find(i)] = find(j)
    groups = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(items[i])
    result = []
    for g in groups.values():
        bx = (min(b[0][0] for b in g), min(b[0][1] for b in g), max(b[0][2] for b in g), max(b[0][3] for b in g))
        result.append((bx, [b[1] for b in g]))
    return result


def to_m(poly):
    return [m(p) for p in poly]


def bbox_m(poly_pt):
    x0, y0, x1, y1 = bbox(poly_pt)
    a, b = m((x0, y0)), m((x1, y1))
    return (a[0], a[1], b[0], b[1])


def rect_obj(b):
    return {"cx": (b[0] + b[2]) / 2, "cy": (b[1] + b[3]) / 2, "w": b[2] - b[0], "d": b[3] - b[1]}


# ---------- извлечение ----------

doc = pymupdf.open(PDF)
p10, p11, p12, p16 = doc[9], doc[10], doc[11], doc[15]

data = {"source": "холл альбом.pdf, листы 10, 11, 12, 16; масштаб 1:90", "units": "m"}

# Стены: серая заливка 0.6
walls = []
for poly, _ in fills(p10, (0.6, 0.6, 0.6)):
    pm = to_m(poly)
    if abs(area(pm)) < 0.01:
        continue
    walls.append(pm)
data["walls"] = walls

# Колонны и новые перегородки: заливка 0.749
columns, partitions = [], []
for poly, curve in fills(p10, (0.749, 0.749, 0.749)):
    b = bbox_m(poly)
    w, d = b[2] - b[0], b[3] - b[1]
    if curve:
        columns.append({"type": "round", "cx": (b[0] + b[2]) / 2, "cy": (b[1] + b[3]) / 2, "r": max(w, d) / 2})
    elif min(w, d) < 0.12:
        if max(w, d) < 0.3:
            continue  # торцы перегородок

        # тонкая длинная — стеклянная перегородка в алюминиевом профиле
        if w > d:
            partitions.append({"x1": b[0], "y1": (b[1] + b[3]) / 2, "x2": b[2], "y2": (b[1] + b[3]) / 2})
        else:
            partitions.append({"x1": (b[0] + b[2]) / 2, "y1": b[1], "x2": (b[0] + b[2]) / 2, "y2": b[3]})
    else:
        columns.append({"type": "box", **rect_obj(b)})
data["columns"] = columns
data["partitions"] = partitions


def clustered(page, color, gap=0.03):
    items = [(bbox_m(p), (p, c)) for p, c in fills(page, color)]
    return cluster(items, gap)


furniture = defaultdict(list)

# Розовые: диваны Sigma и стулья Mix — различаем по размеру
for b, parts in clustered(p10, (0.953, 0.714, 0.694)):
    o = rect_obj(b)
    if max(o["w"], o["d"]) > 1.0:
        furniture["sofas"].append(o)
    else:
        furniture["chairs"].append(o)

# Голубые: банкетки Фрайди (из нескольких подушек)
for b, parts in clustered(p10, (0.816, 0.882, 0.957), gap=0.04):
    furniture["benches"].append(rect_obj(b))

# Зелёные: растения (на листе 09 они нарисованы полнее, чем на 10)
p09 = doc[8]
for color in [(0.659, 0.808, 0.62), (0.408, 0.702, 0.325)]:
    for b, parts in clustered(p09, color, gap=0.05):
        o = rect_obj(b)
        furniture["plants"].append({"cx": o["cx"], "cy": o["cy"], "r": max(o["w"], o["d"]) / 2})

# Светло-серые: кашпо для цветов
for b, parts in clustered(p10, (0.91, 0.91, 0.91)):
    furniture["planters"].append(rect_obj(b))

# Бежевые: столы (круглые и прямоугольные) и лавка-сидение из МДФ
for poly, curve in fills(p10, (0.839, 0.804, 0.655)):
    b = bbox_m(poly)
    o = rect_obj(b)
    if max(o["w"], o["d"]) > 2.5:
        furniture["seatBench"].append({"pts": to_m(poly)})
    else:
        o["round"] = bool(curve)
        furniture["tables"].append(o)
# объединяем дубли столов (столешница + контур)
uniq = []
for t in furniture["tables"]:
    if not any(abs(t["cx"] - u["cx"]) < 0.05 and abs(t["cy"] - u["cy"]) < 0.05 for u in uniq):
        uniq.append(t)
furniture["tables"] = uniq

# Коричневый: стол охранника
for b, parts in clustered(p10, (0.741, 0.659, 0.533)):
    furniture["desks"].append(rect_obj(b))

# Жёлтые: офисные кресла
for b, parts in clustered(p10, (0.992, 0.973, 0.82), gap=0.05):
    furniture["officeChairs"].append(rect_obj(b))

# Синий: логотип АлтГУ на стене (вид сверху — полоска)
for b, parts in clustered(p10, (0.0, 0.467, 0.69)):
    furniture["logos"].append(rect_obj(b))

data["furniture"] = furniture

# Ограждения: синие штриховые линии (у окон h=900 металл, у входа h=1000 нержавейка)
segs = []
for d in drawings(p10):
    if d.get("fill") is not None or r3(d.get("color")) != (0.369, 0.369, 1.0):
        continue
    for it in d["items"]:
        if it[0] == "l":
            segs.append((bbox_m([(it[1].x, it[1].y), (it[2].x, it[2].y)]), None))
railings = []
for b, _ in cluster(segs, gap_m=0.06):
    w, d = b[2] - b[0], b[3] - b[1]
    if max(w, d) < 0.3:
        continue
    if w > 0.3 and d > 0.3:
        # П-образное ограждение входной группы: открыто сверху
        railings += [
            {"x1": b[0], "y1": b[1], "x2": b[0], "y2": b[3], "kind": "steel"},
            {"x1": b[0], "y1": b[3], "x2": b[2], "y2": b[3], "kind": "steel"},
            {"x1": b[2], "y1": b[3], "x2": b[2], "y2": b[1], "kind": "steel"},
        ]
    elif w > d:
        cy = (b[1] + b[3]) / 2
        railings.append({"x1": b[0], "y1": cy, "x2": b[2], "y2": cy, "kind": "window"})
    else:
        cx = (b[0] + b[2]) / 2
        railings.append({"x1": cx, "y1": b[1], "x2": cx, "y2": b[3], "kind": "window"})
data["railings"] = railings

# Потолок: зелёные — ГКЛ и обшивка балок (опуск), голубой — существующий гипсовый
data["ceiling"] = {
    "gkl": [rect_obj(bbox_m(p)) for p, _ in fills(p11, (0.588, 0.882, 0.588))],
    "gypsum": [to_m(p) for p, _ in fills(p11, (0.502, 0.839, 1.0)) if abs(area(to_m(p))) > 5],
}

# Свет: панели 600×600 в грильято и линейные светильники
lights = defaultdict(list)
for b, parts in clustered(p12, (0.996, 0.635, 0.608), gap=0.01):
    o = rect_obj(b)
    if max(o["w"], o["d"]) < 0.3:
        continue
    if abs(o["w"] - o["d"]) < 0.15:
        lights["panels"].append(o)
    else:
        lights["linear"].append(o)
# Подвесные: красные окружности с крестом (обводка)
pend = []
for d in drawings(p12):
    if r3(d.get("color")) != (0.659, 0.059, 0.008) or d.get("fill") is not None:
        continue
    if not any(it[0] == "c" for it in d["items"]):
        continue
    r = d["rect"]
    w, h = r.width * S, r.height * S
    if 0.15 < w < 0.4 and 0.15 < h < 0.4 and r.y1 <= PLAN_MAX_Y_PT:
        c = m(((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))
        if not any(abs(c[0] - q[0]) < 0.1 and abs(c[1] - q[1]) < 0.1 for q in pend):
            pend.append(c)
lights["pendants"] = [{"cx": c[0], "cy": c[1]} for c in pend]
data["lights"] = lights

# Отделка стен: тонкие цветные полосы вдоль стен
FINISH = {
    (0.718, 0.851, 1.0): "gray",       # покраска Sanderson Kent Gray
    (0.992, 0.514, 0.475): "bordo",    # покраска Sanderson Bengal Red
    (0.588, 0.882, 0.588): "plaster",  # декоративная штукатурка
    (0.0, 0.502, 0.502): "metal",      # металлическая отделка колонн
    (0.659, 0.059, 0.008): "tile",     # мелкоформатная плитка
    (1.0, 0.6, 0.333): "marble",       # существующий мрамор
    (1.0, 0.4, 0.0): "marble",
}
finishes = []
for color, kind in FINISH.items():
    for poly, _ in fills(p16, color):
        b = bbox_m(poly)
        w, d = b[2] - b[0], b[3] - b[1]
        if max(w, d) < 0.05 or b[3] > 25:
            continue
        # легенда листа лежит под планом — её отсекает PLAN_MAX_Y_PT
        if w >= d:
            cy = (b[1] + b[3]) / 2
            finishes.append({"kind": kind, "x1": b[0], "y1": cy, "x2": b[2], "y2": cy})
        else:
            cx = (b[0] + b[2]) / 2
            finishes.append({"kind": kind, "x1": cx, "y1": b[1], "x2": cx, "y2": b[3]})
data["finishes"] = finishes

# ---------- ручные дополнения по чертежам и развёрткам ----------
# Эти объекты на плане нарисованы только линиями, поэтому координаты сняты вручную
# с листов 09/10 (пиксели рендера 110 dpi), а размеры — из подписей и развёрток.


def seg_px(x1, y1, x2, y2, **kw):
    a, b = px(x1, y1), px(x2, y2)
    return {"x1": a[0], "y1": a[1], "x2": b[0], "y2": b[1], **kw}


def rect_px(x0, y0, x1, y1, **kw):
    a, b = px(x0, y0), px(x1, y1)
    return {**rect_obj((a[0], a[1], b[0], b[1])), **kw}


data["manual"] = {
    # Проёмы в существующих стенах, закрытые дверями (лист 17)
    "doors": [
        seg_px(155, 414, 227, 414, kind="wood"),
        seg_px(737, 414, 855, 414, kind="wood"),
        seg_px(885, 414, 1005, 414, kind="wood"),
        seg_px(1688, 285, 1730, 285, kind="wood"),
        seg_px(1282, 446, 1282, 490, kind="wood"),
        seg_px(610, 114, 698, 114, kind="glass"),   # вход по временным пропускам
        seg_px(747, 114, 834, 114, kind="glass"),   # вход по постоянным пропускам
    ],
    # Глухие участки, которых нет в заливке листа 10 (граница чертежа)
    "extraWalls": [
        seg_px(1783, 300, 1783, 405),
    ],
    # Наружные стеклянные двери тамбура
    "entranceGlass": [seg_px(579, 38, 866, 38)],
    # Фасадное остекление (окна в пол) и витраж холла музея слева
    "windows": [
        seg_px(103, 47, 579, 47),
        seg_px(866, 47, 1491, 47),
        seg_px(1170, 772, 1783, 772),
    ],
    "vitrage": [seg_px(106, 62, 106, 405)],
    # Перегородка вахты со стороны холла: стекло, дверь и окно выдачи
    "vakhtaFront": seg_px(255, 170, 428, 170),
    # Перегородка из стеклоблоков (листы 07, 23): 2060×2450, h от пола 200,
    # в проёме между коридором и кафе, перед ней диван
    "glassBlocks": seg_px(1493, 405.5, 1592, 405.5),
    # Лестницы: марш 1 от пола до площадки 1540, площадка, марш 2 вверх (листы 05, 10)
    "stairs": [
        {
            "flight1": rect_px(400, 331, 550, 404), "dir1": "+x",
            "landing": rect_px(550, 255, 710, 404),
            "flight2": rect_px(400, 255, 550, 330), "dir2": "-x",
            "well": rect_px(400, 240, 710, 405),
        },
        {
            "flight1": rect_px(1493, 502, 1650, 575), "dir1": "+x",
            "landing": rect_px(1650, 425, 1778, 575),
            "flight2": rect_px(1493, 425, 1650, 500), "dir2": "-x",
            "well": rect_px(1493, 425, 1778, 575),
        },
    ],
    # Кафе и лавка (лист 09, развёртки 24, 25)
    "counter": rect_px(1230, 634, 1330, 652),                     # прилавок h=1100
    "fridgeVitrines": [rect_px(1295, 537, 1330, 584), rect_px(1295, 587, 1330, 634)],
    "shopVitrines": [rect_px(1180, 560, 1200, 603), rect_px(1180, 606, 1200, 650),
                     rect_px(1180, 653, 1200, 693), rect_px(1180, 696, 1200, 736)],
    "barTop": rect_px(1325, 720, 1757, 745),                       # стол h=1200 вдоль окон
    "vending": [rect_px(1748, 578, 1778, 607), rect_px(1748, 610, 1778, 640)],
    "storageUnderStair": rect_px(1655, 430, 1776, 572),            # комоды под площадкой h≈1100 (лист 27)
    "wallCabinets": rect_px(1755, 645, 1778, 760),                 # навесные шкафы
    "trashBin": rect_px(1748, 642, 1778, 660),
    # Стойки информации и экран у входа
    "infoStands": [rect_px(1035, 70, 1062, 100), rect_px(1450, 70, 1478, 100)],
    "screen": rect_px(920, 98, 978, 112),
    # Зеркала в объёмной металлической раме 2500×100, h от пола 200 (лист 09)
    # face — куда смотрит лицевая сторона в координатах плана
    "mirrors": [
        seg_px(856, 403, 886, 403, face="-y", kind="mirror"),
        seg_px(1004, 403, 1034, 403, face="-y", kind="mirror"),
        seg_px(1240, 403, 1292, 403, face="-y", kind="mirror"),
        seg_px(1293, 404, 1293, 432, face="+x", kind="mirror"),
        seg_px(1487, 232, 1487, 285, face="-x", kind="mirror"),
        seg_px(1487, 128, 1487, 176, face="-x", kind="poster"),
        seg_px(1487, 180, 1487, 228, face="-x", kind="poster"),
    ],
    # ТВ на кронштейнах
    "tvs": [
        seg_px(260, 403, 316, 403, face="-y"),
        seg_px(732, 296, 732, 344, face="+x"),
    ],
    # Надписи: бордовая панель у вахты и вывеска над витринами лавки
    "signs": [
        # h0/h1 — высота низа и верха надписи над полом, м
        {"text": "предъявите\nпропуск", **seg_px(431, 128, 431, 170), "face": "+x", "h0": 1.0, "h1": 2.2},
        {"text": "университетская ЛАВКА", **seg_px(1201, 557, 1201, 737), "face": "+x", "h0": 2.3, "h1": 2.65},
    ],
}

js = "// Сгенерировано tools/extract_plan.py — не редактировать вручную.\nwindow.PLAN = " + \
    json.dumps(rnd(data), ensure_ascii=False, separators=(",", ":")) + ";\n"
with open(OUT, "w", encoding="utf-8") as f:
    f.write(js)

print("walls", len(walls), "columns", len(columns), "partitions", len(partitions))
print({k: len(v) for k, v in furniture.items()})
print("railings", len(railings), "finishes", len(finishes))
print("ceiling", {k: len(v) for k, v in data["ceiling"].items()})
print("lights", {k: len(v) for k, v in lights.items()})
print("written", os.path.abspath(OUT), os.path.getsize(OUT), "bytes")
