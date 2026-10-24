/*
 * Холл 1 этажа ИГН АлтГУ — 3D-прогулка на Babylon.js.
 *
 * Геометрия берётся из plan-data.js (извлечено из PDF-альбома скриптом tools/extract_plan.py).
 * Координаты плана: x вправо, y вниз (как на листе), метры. В мире Babylon: (x, высота, -y).
 */
(() => {
'use strict';

const P = window.PLAN;
const MAN = P.manual;
const FUR = P.furniture;

// ---------- Константы ----------
const H_HALL = 2.9;        // потолок грильято в пом. 19, 20, 24
const H_LOW = 2.7;         // ГКЛ, балки, существующий потолок пом. 27, 28
const H_WALL = 6.0;        // стены выше потолка скрыты, но нужны в шахтах лестниц
const H_LANDING = 1.54;    // площадки лестниц (лист 05)
const H_UPPER = 3.08;      // верх второго марша
const EYE = 1.62, BODY = 1.8, RADIUS = 0.24, STEP = 0.32;
const WALK = 1.6, RUN = 3.2;

const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches;
const LOW = params.get('q') === 'low' || (params.get('q') !== 'high' && (isTouch || /Quest|Oculus|Pico/i.test(navigator.userAgent)));
if (isTouch) document.body.classList.add('touch');

const canvas = document.getElementById('c');
const engine = new BABYLON.Engine(canvas, true, {
  stencil: true, antialias: true, adaptToDeviceRatio: !LOW, powerPreference: 'high-performance',
});
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.85, 0.86, 0.86, 1);
scene.skipPointerMovePicking = true;

const V3 = BABYLON.Vector3;
const C3 = h => BABYLON.Color3.FromHexString(h);
const W = (x, y, h = 0) => new V3(x, h, -y);          // план → мир
const yawTo = (dx, dy) => Math.atan2(dx, -dy);       // направление на плане → поворот вокруг Y

function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ======================================================================
// Текстуры (процедурные, чтобы сайт не зависел от внешних файлов)
// ======================================================================
function canvasTex(name, w, h, draw, { alpha = false, wrap = true } = {}) {
  const t = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
  const ctx = t.getContext();
  draw(ctx, w, h);
  t.update();
  t.hasAlpha = alpha;
  if (wrap) t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  return t;
}

function speckle(ctx, w, h, n, colors, rMin, rMax, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = rMin + r() * (rMax - rMin);
    ctx.beginPath();
    ctx.ellipse(r() * w, r() * h, s, s * (0.6 + r() * 0.6), r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function clouds(ctx, w, h, n, colors, rMin, rMax, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const rad = rMin + r() * (rMax - rMin);
    const x = r() * w, y = r() * h;
    // рисуем с переносом через края, чтобы текстура тайлилась без швов
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      g.addColorStop(0, colors[i % colors.length]);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
}

// Пол: существующий светлый терраццо с вытянутыми серо-голубыми ромбами (как на визуализациях)
const FLOOR_TILE = 4.8;
const texFloor = canvasTex('floor', 2048, 2048, (c, w, h) => {
  c.fillStyle = '#e9e5dc';
  c.fillRect(0, 0, w, h);
  clouds(c, w, h, 40, ['rgba(220,213,201,.07)', 'rgba(246,243,237,.08)'], 120, 320, 3);
  speckle(c, w, h, 52000, ['#d2cbbf', '#c3bbaf', '#f6f3ee', '#a7abae', '#dccfb9', '#bdb3a4', '#9a9590'], 0.7, 2.6, 1);
  const cw = w / 4, ch = h / 2;
  for (let i = 0; i < 4; i++) {
    for (let j = -1; j < 3; j++) {
      const cx = i * cw + cw / 2, cy = j * ch + (i % 2 ? ch / 2 : 0) + ch / 2;
      c.save();
      c.beginPath();
      c.moveTo(cx, cy - ch / 2); c.lineTo(cx + cw * 0.36, cy); c.lineTo(cx, cy + ch / 2); c.lineTo(cx - cw * 0.36, cy);
      c.closePath();
      c.clip();
      c.fillStyle = 'rgba(150,170,184,0.32)';
      c.fillRect(cx - cw, cy - ch, cw * 2, ch * 2);
      const r = rng(i * 10 + j + 50);
      for (let k = 0; k < 2600; k++) {
        c.fillStyle = r() > 0.5 ? 'rgba(98,122,140,.35)' : 'rgba(235,242,246,.4)';
        c.fillRect(cx - cw * 0.4 + r() * cw * 0.8, cy - ch / 2 + r() * ch, 1.6, 1.6);
      }
      c.restore();
    }
  }
  // швы плит 1.2 м
  c.strokeStyle = 'rgba(150,140,128,.28)';
  c.lineWidth = 2;
  for (let k = 0; k <= 4; k++) {
    c.beginPath(); c.moveTo(k * w / 4, 0); c.lineTo(k * w / 4, h); c.stroke();
    c.beginPath(); c.moveTo(0, k * h / 4); c.lineTo(w, k * h / 4); c.stroke();
  }
});

// Потолок грильято, ячейка 100×100 мм: текстура = 0.6 м
// Потолок грильято: окрашенные рейки (светлые), в ячейках — тёмное межпотолочье
const texGrid = canvasTex('grid', 512, 512, (c, w) => {
  c.fillStyle = '#4c4945';
  c.fillRect(0, 0, w, w);
  const cell = w / 6;
  for (let i = 0; i <= 6; i++) {
    c.fillStyle = '#cdc9c2';
    c.fillRect(i * cell - 7, 0, 14, w);
    c.fillRect(0, i * cell - 7, w, 14);
  }
});

// Существующий гипсовый потолок с 3D-панелями «волна»: карта высот (рельеф делает карта нормалей)
const gypsumHeight = (c, w) => {
  const img = c.createImageData(w, w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / w;
    const h = 0.5 + 0.5 * Math.sin((u * 2 + Math.sin(v * Math.PI * 2) * 0.18) * Math.PI * 2);
    const k = Math.round(h * 255), i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = k; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
};
const texGypsumH = canvasTex('gypsumH', 512, 512, gypsumHeight);
const texGypsum = canvasTex('gypsum', 512, 512, (c, w) => {
  gypsumHeight(c, w);
  // альбедо почти белое: только лёгкая затенённость во впадинах
  c.fillStyle = 'rgba(246,244,240,.88)';
  c.fillRect(0, 0, w, w);
  c.strokeStyle = 'rgba(190,186,180,.35)';
  c.lineWidth = 2;
  c.strokeRect(1, 1, w - 2, w - 2);
});

function paintTex(name, base, seed, strength = 0.022) {
  return canvasTex(name, 512, 512, (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    clouds(c, w, h, 30, [`rgba(0,0,0,${strength * 0.6})`, `rgba(255,255,255,${strength})`], 40, 120, seed + 9);
    speckle(c, w, h, 5000, [`rgba(0,0,0,${strength})`, `rgba(255,255,255,${strength * 1.4})`], 0.4, 1.0, seed);
  });
}

// Декоративная штукатурка «микроцемент»: ровный тон, мелкие поры, едва заметная облачность
const plasterTex = name => canvasTex(name, 1024, 1024, (c, w, h) => {
  c.fillStyle = '#d0cdc7';
  c.fillRect(0, 0, w, h);
  clouds(c, w, h, 160, ['rgba(236,233,228,.12)', 'rgba(160,156,150,.06)'], 40, 140, 7);
  speckle(c, w, h, 16000, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.07)', 'rgba(120,116,110,.08)'], 0.4, 1.2, 8);
});
const texPlaster = plasterTex('plaster');
const texPlasterCol = plasterTex('plasterCol');

// Мрамор: тёплый белый, лёгкие облака и несколько тонких размытых прожилок
const texMarble = canvasTex('marble', 1024, 1024, (c, w, h) => {
  c.fillStyle = '#f2f0ec';
  c.fillRect(0, 0, w, h);
  clouds(c, w, h, 30, ['rgba(214,210,206,.18)', 'rgba(232,228,222,.25)'], 90, 260, 12);
  const r = rng(11);
  c.lineCap = 'round';
  const vein = (x, y, a, len, width, alpha, blur) => {
    alpha *= 0.6;
    c.strokeStyle = `rgba(110,104,112,${alpha})`;
    c.lineWidth = width;
    c.shadowColor = `rgba(110,104,112,${alpha})`;
    c.shadowBlur = blur;
    c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < len; s++) {
      a += (r() - 0.5) * 0.35;
      const nx = x + Math.cos(a) * 14, ny = y + Math.sin(a) * 14;
      c.quadraticCurveTo(x + Math.cos(a + 0.4) * 7, y + Math.sin(a + 0.4) * 7, nx, ny);
      x = nx; y = ny;
      if (r() < 0.04) vein(x, y, a + (r() - 0.5) * 1.6, Math.floor(len * 0.3), width * 0.5, alpha * 0.8, blur);
    }
    c.stroke();
  };
  for (let v = 0; v < 5; v++) vein(r() * w, r() * h, 0.6 + r() * 0.6, 70, 1.2 + r() * 1.2, 0.45, 6);
  for (let v = 0; v < 8; v++) vein(r() * w, r() * h, r() * 6, 35, 0.6, 0.25, 2);
  c.shadowBlur = 0;
});

// Металлическая перфорированная отделка колонн: текстура = 0.4 м
const texMetal = canvasTex('metal', 512, 512, (c, w) => {
  c.fillStyle = '#45433f';
  c.fillRect(0, 0, w, w);
  for (let x = 0; x < w; x += 2) {
    c.fillStyle = `rgba(255,255,255,${0.015 + 0.03 * Math.random()})`;
    c.fillRect(x, 0, 1, w);
  }
  for (let y = 6; y < w; y += 12) for (let x = (y / 12) % 2 ? 6 : 0; x < w; x += 12) {
    c.fillStyle = '#1b1a19';
    c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.08)';
    c.beginPath(); c.arc(x + 0.8, y + 0.8, 2.6, 0, Math.PI); c.fill();
  }
});

// Рифлёный пояс круглых колонн
const texRibs = canvasTex('ribs', 256, 64, (c, w, h) => {
  for (let x = 0; x < w; x += 8) {
    const g = c.createLinearGradient(x, 0, x + 8, 0);
    g.addColorStop(0, '#2a2927'); g.addColorStop(0.5, '#4d4b47'); g.addColorStop(1, '#232220');
    c.fillStyle = g;
    c.fillRect(x, 0, 8, h);
  }
});

// Мелкоформатная керамическая плитка 100×100: текстура = 0.6 м
const texTile = canvasTex('tile', 512, 512, (c, w) => {
  const cell = w / 6;
  const r = rng(21);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const k = 70 + Math.floor(r() * 14);
    const g = c.createLinearGradient(i * cell, j * cell, i * cell + cell, j * cell + cell);
    g.addColorStop(0, `rgb(${k},${k + 10},${k + 6})`);
    g.addColorStop(1, `rgb(${k - 10},${k},${k - 4})`);
    c.fillStyle = g;
    c.fillRect(i * cell, j * cell, cell, cell);
  }
  c.strokeStyle = '#b2b3ad';
  c.lineWidth = 4;
  for (let i = 0; i <= 6; i++) {
    c.beginPath(); c.moveTo(i * cell, 0); c.lineTo(i * cell, w); c.stroke();
    c.beginPath(); c.moveTo(0, i * cell); c.lineTo(w, i * cell); c.stroke();
  }
});

function woodTex(name, base, dark, seed) {
  return canvasTex(name, 1024, 1024, (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const r = rng(seed);
    // доски/ламели по 0.25 текстуры с разным тоном
    for (let b = 0; b < 4; b++) {
      c.fillStyle = `rgba(${r() > 0.5 ? '255,235,210' : '60,35,20'},${0.04 + r() * 0.06})`;
      c.fillRect(0, b * h / 4, w, h / 4);
    }
    for (let i = 0; i < 520; i++) {
      const y = r() * h;
      c.strokeStyle = r() > 0.45 ? dark : 'rgba(255,240,220,.18)';
      c.globalAlpha = 0.12 + r() * 0.3;
      c.lineWidth = 0.6 + r() * 2.2;
      c.beginPath();
      c.moveTo(0, y);
      const ph = r() * 6, amp = 1 + r() * 4;
      for (let x = 0; x <= w; x += 24) c.lineTo(x, y + Math.sin(x * 0.008 + ph) * amp);
      c.stroke();
    }
    c.globalAlpha = 1;
  });
}
const texOak = woodTex('oak', '#b98a5d', 'rgba(105,66,38,.55)', 31);
const texWalnut = woodTex('walnut', '#6b4630', 'rgba(36,20,12,.7)', 32);

function fabricTex(name, base, seed) {
  // ровный тон с мягкой неоднородностью; фактуру ткани даёт карта нормалей texWeave
  return canvasTex(name, 512, 512, (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    clouds(c, w, h, 40, ['rgba(255,255,255,.035)', 'rgba(0,0,0,.05)'], 30, 90, seed);
    speckle(c, w, h, 6000, ['rgba(255,255,255,.04)', 'rgba(0,0,0,.05)'], 0.4, 0.9, seed + 1);
  });
}
// Рогожка: высоты переплетения нитей для карты нормалей
const texWeave = canvasTex('weave', 256, 256, (c, w, h) => {
  c.fillStyle = '#808080';
  c.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
    const odd = ((x + y) / 4) % 2;
    const g = odd ? c.createLinearGradient(x, 0, x + 4, 0) : c.createLinearGradient(0, y, 0, y + 4);
    g.addColorStop(0, '#5a5a5a'); g.addColorStop(0.5, '#d0d0d0'); g.addColorStop(1, '#5a5a5a');
    c.fillStyle = g;
    c.fillRect(x, y, 4, 4);
  }
});

const texGlassBlock = canvasTex('glassblock', 512, 512, (c, w) => {
  const cell = w / 3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const g = c.createLinearGradient(i * cell, j * cell, i * cell + cell, j * cell + cell);
    g.addColorStop(0, 'rgba(232,242,245,.82)');
    g.addColorStop(0.5, 'rgba(250,253,255,.62)');
    g.addColorStop(1, 'rgba(214,230,236,.86)');
    c.fillStyle = g;
    c.fillRect(i * cell, j * cell, cell, cell);
    c.strokeStyle = 'rgba(255,255,255,.55)';
    c.lineWidth = 3;
    for (let k = 1; k < 6; k++) {
      c.beginPath();
      for (let x = 0; x <= cell; x += 8) c.lineTo(i * cell + x, j * cell + k * cell / 6 + Math.sin(x / 14 + k) * 5);
      c.stroke();
    }
  }
  c.strokeStyle = '#ecebe6';
  c.lineWidth = 10;
  for (let i = 0; i <= 3; i++) {
    c.beginPath(); c.moveTo(i * cell, 0); c.lineTo(i * cell, w); c.stroke();
    c.beginPath(); c.moveTo(0, i * cell); c.lineTo(w, i * cell); c.stroke();
  }
}, { alpha: true });

// Матовое (непрозрачное) остекление: светлое сверху, с лёгкой «изморозью»
const texFrost = canvasTex('frost', 256, 512, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#f1f5f7');
  g.addColorStop(1, '#e2e9ec');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  speckle(c, w, h, 3000, ['rgba(255,255,255,.4)', 'rgba(170,190,200,.08)'], 0.5, 1.6, 5);
});

// Деревянные ламели подвесного светильника (вырезы через альфа-тест)
const texSlats = canvasTex('slats', 512, 128, (c, w, h) => {
  c.clearRect(0, 0, w, h);
  for (let i = 0; i < 22; i++) {
    const x = i * w / 22;
    const g = c.createLinearGradient(x, 0, x + w / 22, 0);
    g.addColorStop(0, '#d8d8d8'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#bdbdbd');
    c.fillStyle = g;
    c.fillRect(x + 3, 0, w / 22 - 9, h);
  }
}, { alpha: true });

// Листва: пучок глянцевых листьев на прозрачном фоне
function leafTex(name, seed, hue) {
  return canvasTex(name, 512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const r = rng(seed);
    // веточки
    c.strokeStyle = 'rgba(70,58,40,.85)';
    c.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      c.beginPath();
      c.moveTo(w / 2, h * 0.95);
      c.quadraticCurveTo(w / 2 + (r() - 0.5) * 120, h * 0.6, w * (0.15 + r() * 0.7), h * (0.1 + r() * 0.4));
      c.stroke();
    }
    for (let i = 0; i < 120; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 0.44;
      const x = w / 2 + Math.cos(a) * d * w, y = h * 0.47 + Math.sin(a) * d * h * 0.92;
      const len = 30 + r() * 38, wid = len * (0.38 + r() * 0.12);
      const light = 22 + r() * 22, sat = 40 + r() * 22;
      c.save();
      c.translate(x, y);
      c.rotate(a + Math.PI / 2 + (r() - 0.5) * 1.2);
      // лист с заострённым кончиком
      const g = c.createLinearGradient(-wid / 2, 0, wid / 2, 0);
      g.addColorStop(0, `hsl(${hue + r() * 10}, ${sat}%, ${light - 6}%)`);
      g.addColorStop(0.5, `hsl(${hue + 4}, ${sat}%, ${light + 12}%)`);
      g.addColorStop(1, `hsl(${hue + r() * 10}, ${sat}%, ${light - 2}%)`);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, -len / 2);
      c.bezierCurveTo(wid * 0.7, -len * 0.25, wid * 0.55, len * 0.3, 0, len / 2);
      c.bezierCurveTo(-wid * 0.55, len * 0.3, -wid * 0.7, -len * 0.25, 0, -len / 2);
      c.fill();
      c.strokeStyle = `hsla(${hue}, 30%, 75%, .35)`;
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, -len / 2 + 3); c.lineTo(0, len / 2 - 2); c.stroke();
      c.restore();
    }
  }, { alpha: true, wrap: false });
}

function textTex(name, w, h, draw) {
  return canvasTex(name, w, h, (c) => { c.clearRect(0, 0, w, h); draw(c); }, { alpha: true, wrap: false });
}

// Карта нормалей из яркости другой текстуры (яркость = высота), с бесшовной выборкой по краям
function normalFrom(src, strength = 2, maxSize = 1024) {
  const sc = src.getContext().canvas;
  const size = Math.min(sc.width, maxSize), hgt = Math.round(sc.height * size / sc.width);
  const tmp = document.createElement('canvas');
  tmp.width = size; tmp.height = hgt;
  const tc = tmp.getContext('2d');
  tc.drawImage(sc, 0, 0, size, hgt);
  const data = tc.getImageData(0, 0, size, hgt).data;
  const lum = new Float32Array(size * hgt);
  for (let i = 0; i < lum.length; i++) lum[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) / 255;
  const H = (x, y) => lum[((y + hgt) % hgt) * size + ((x + size) % size)];
  const t = new BABYLON.DynamicTexture(src.name + '-n', { width: size, height: hgt }, scene, true);
  const ctx = t.getContext();
  const out = ctx.createImageData(size, hgt);
  for (let y = 0; y < hgt; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const L = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    out.data[i] = (-dx / L * 0.5 + 0.5) * 255;
    out.data[i + 1] = (dy / L * 0.5 + 0.5) * 255;
    out.data[i + 2] = (1 / L * 0.5 + 0.5) * 255;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  t.update();
  t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  return t;
}

// Фасад вендингового аппарата: ряды упаковок за стеклом
function vendingTex(name, seed, drinks) {
  return canvasTex(name, 256, 512, (c, w, h) => {
    c.fillStyle = '#15171a';
    c.fillRect(0, 0, w, h);
    const r = rng(seed);
    const cols = drinks ? ['#c8102e', '#1f6fb2', '#f2a900', '#2e8b57', '#e8e8e8'] : ['#e4572e', '#f3a712', '#29335c', '#a8c686', '#db2b39', '#8d5a97'];
    for (let row = 0; row < 6; row++) {
      c.fillStyle = 'rgba(255,255,255,.12)';
      c.fillRect(8, 30 + row * 78 + 62, w - 16, 3);
      for (let k = 0; k < 5; k++) {
        c.fillStyle = cols[Math.floor(r() * cols.length)];
        const x = 14 + k * 46;
        if (drinks) {
          c.fillRect(x + 8, 30 + row * 78 + 4, 22, 58);
          c.fillStyle = 'rgba(255,255,255,.35)';
          c.fillRect(x + 10, 30 + row * 78 + 8, 4, 50);
        } else {
          c.fillRect(x, 30 + row * 78 + 14, 38, 48);
          c.fillStyle = 'rgba(255,255,255,.3)';
          c.fillRect(x + 4, 30 + row * 78 + 22, 30, 6);
        }
      }
    }
  }, { wrap: false });
}

// ======================================================================
// Материалы
// ======================================================================
const mats = {};
function std(name, o = {}) {
  const m = new BABYLON.StandardMaterial(name, scene);
  m.diffuseColor = C3(o.color || '#ffffff');
  if (o.tex) m.diffuseTexture = o.tex;
  const s = o.spec ?? 0.04;
  m.specularColor = new BABYLON.Color3(s, s, s);
  m.specularPower = o.gloss ?? 24;
  if (o.emissive) m.emissiveColor = C3(o.emissive);
  if (o.emissiveTex) m.emissiveTexture = o.emissiveTex;
  if (o.alpha !== undefined) m.alpha = o.alpha;
  if (o.unlit) m.disableLighting = true;
  if (o.twoSided) { m.backFaceCulling = false; m.twoSidedLighting = true; }
  if (o.noCull) m.backFaceCulling = false;
  m.maxSimultaneousLights = 3;
  mats[name] = m;
  return m;
}

// Физически корректный материал: альбедо, шероховатость, металличность, рельеф.
// Освещение от окружения (кубкарта самого холла) подключается в setupLighting.
const pbrMats = [];
const lin = h => C3(h).toLinearSpace();
function pbr(name, o = {}) {
  const m = new BABYLON.PBRMaterial(name, scene);
  m.albedoColor = lin(o.color || '#ffffff');
  if (o.tex) m.albedoTexture = o.tex;
  if (o.normal) {
    m.bumpTexture = o.normal;
    m.bumpTexture.level = o.normalLevel ?? 1;
  }
  m.metallic = o.metal ?? 0;
  m.roughness = o.rough ?? 0.7;
  if (o.emissive) m.emissiveColor = lin(o.emissive);
  if (o.emissiveTex) m.emissiveTexture = o.emissiveTex;
  if (o.emissiveIntensity) m.emissiveIntensity = o.emissiveIntensity;
  if (o.alpha !== undefined) {
    m.alpha = o.alpha;
    m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }
  if (o.alphaTest) {
    m.albedoTexture.hasAlpha = true;
    m.useAlphaFromAlbedoTexture = true;
    m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHATEST;
    m.alphaCutOff = 0.45;
  }
  if (o.twoSided) { m.backFaceCulling = false; m.twoSidedLighting = true; }
  if (o.noCull) m.backFaceCulling = false;
  if (o.sheen) {
    // бархатистый отлив обивки
    m.sheen.isEnabled = true;
    m.sheen.intensity = o.sheen;
    m.sheen.color = lin('#ffffff');
    m.sheen.roughness = 0.5;
  }
  if (o.translucent) {
    m.subSurface.isTranslucencyEnabled = true;
    m.subSurface.translucencyIntensity = o.translucent;
    m.subSurface.tintColor = lin('#9fd07a');
  }
  m.environmentIntensity = o.env ?? 1;
  m.maxSimultaneousLights = 3;
  m.useHorizonOcclusion = true;
  mats[name] = m;
  pbrMats.push(m);
  return m;
}
// Синхронный масштаб альбедо и рельефа
function texScale(m, u, v = u) {
  [m.albedoTexture, m.bumpTexture].forEach(t => { if (t) { t.uScale = u; t.vScale = v; } });
}

// Отделка стен (лист 16). Цвета Sanderson — из легенды альбома.
const FINISH_TILE = { gray: 2.0, bordo: 2.0, plaster: 1.6, metal: 0.4, tile: 0.6, marble: 2.2, white: 2.0 };
const texPaintGray = paintTex('t-gray', '#ffffff', 3), texPaintBordo = paintTex('t-bordo', '#ffffff', 4);
const finishMat = {
  gray: pbr('f-gray', { color: '#bec1c1', tex: texPaintGray, normal: normalFrom(texPaintGray, 3), normalLevel: 0.35, rough: 0.88, noCull: true }),
  bordo: pbr('f-bordo', { color: '#8a3e39', tex: texPaintBordo, normal: normalFrom(texPaintBordo, 3), normalLevel: 0.35, rough: 0.85, noCull: true }),
  plaster: pbr('f-plaster', { tex: texPlaster, normal: normalFrom(texPlaster, 4), normalLevel: 0.6, rough: 0.9, noCull: true }),
  metal: pbr('f-metal', { tex: texMetal, normal: normalFrom(texMetal, 6), metal: 0.55, rough: 0.5, noCull: true }),
  tile: pbr('f-tile', { tex: texTile, normal: normalFrom(texTile, 6), rough: 0.22, noCull: true }),
  marble: pbr('f-marble', { tex: texMarble, rough: 0.16, noCull: true }),
  white: pbr('f-white', { color: '#ecebe6', rough: 0.85, noCull: true }),
};

const texConcrete = paintTex('t-conc', '#9a9894', 9, 0.05);
const texStone = paintTex('t-stone', '#c9c4bc', 10, 0.06);
const M = {
  // полированный терраццо — без карты рельефа (иначе облачность текстуры читается как неровности)
  floor: pbr('floor', { tex: texFloor, rough: 0.42, env: 0.8 }),
  grid: pbr('grid', { tex: texGrid, normal: normalFrom(texGrid, 8), rough: 0.55, metal: 0.25, twoSided: true }),
  gkl: pbr('gkl', { color: '#efede8', rough: 0.9 }),
  gypsum: pbr('gypsum', { tex: texGypsum, normal: normalFrom(texGypsumH, 5), rough: 0.9, twoSided: true }),
  shaft: pbr('shaft', { color: '#dedbd5', rough: 0.95, twoSided: true }),
  black: pbr('black', { color: '#1b1b1b', metal: 0.5, rough: 0.38 }),
  blackMatte: pbr('blackMatte', { color: '#232221', rough: 0.75 }),
  steel: pbr('steel', { color: '#b9bdc0', metal: 1, rough: 0.22 }),
  alu: pbr('alu', { color: '#d1d4d6', metal: 1, rough: 0.35 }),
  oak: pbr('oak', { tex: texOak, normal: normalFrom(texOak, 2.5), normalLevel: 0.5, rough: 0.5 }),
  walnut: pbr('walnut', { tex: texWalnut, normal: normalFrom(texWalnut, 2.5), normalLevel: 0.5, rough: 0.38 }),
  mdf: pbr('mdf', { tex: texOak, color: '#efe2cc', rough: 0.55 }),
  bordoFabric: pbr('bordoFabric', { tex: fabricTex('fb', '#7a2730', 5), normal: normalFrom(texWeave, 3), normalLevel: 0.6, rough: 0.92, sheen: 0.12 }),
  navyFabric: pbr('navyFabric', { tex: fabricTex('fn', '#22304f', 6), normal: normalFrom(texWeave, 3), normalLevel: 0.6, rough: 0.92, sheen: 0.12 }),
  yellowFabric: pbr('yellowFabric', { tex: fabricTex('fy', '#c9952a', 7), normal: normalFrom(texWeave, 3), normalLevel: 0.6, rough: 0.92, sheen: 0.1 }),
  leather: pbr('leather', { color: '#2a2624', rough: 0.45 }),
  concrete: pbr('concrete', { tex: texConcrete, normal: normalFrom(texConcrete, 3), normalLevel: 0.4, rough: 0.92 }),
  stone: pbr('stone', { tex: texStone, normal: normalFrom(texStone, 2), normalLevel: 0.3, rough: 0.4 }),
  pvc: pbr('pvc', { color: '#f0f0ed', rough: 0.35 }),
  door: pbr('door', { color: '#e9e6df', rough: 0.45 }),
  // матовое стекло фасада: светится дневным светом, но не «выжигает» кадр
  frost: pbr('frost', { tex: texFrost, color: '#e3e8ea', emissiveTex: texFrost, emissive: '#ffffff', emissiveIntensity: 0.62, rough: 0.35, twoSided: true, env: 0.4 }),
  glass: pbr('glass', { color: '#e6f0f2', alpha: 0.12, rough: 0.04 }),
  glassDark: pbr('glassDark', { color: '#cfdde2', alpha: 0.2, rough: 0.04 }),
  glassBlock: pbr('glassBlockM', { tex: texGlassBlock, normal: normalFrom(texGlassBlock, 4), emissiveTex: texGlassBlock, emissive: '#ffffff', emissiveIntensity: 0.35, rough: 0.12, noCull: true }),
  mirror: pbr('mirror', { color: '#8a8f92', metal: 1, rough: 0.02 }),
  white: pbr('white', { color: '#f0efeb', rough: 0.5 }),
  plantA: pbr('plantA', { tex: leafTex('leafA', 41, 100), rough: 0.5, twoSided: true, alphaTest: true, translucent: 0.5 }),
  plantB: pbr('plantB', { tex: leafTex('leafB', 42, 92), rough: 0.5, twoSided: true, alphaTest: true, translucent: 0.5 }),
  plantC: pbr('plantC', { tex: leafTex('leafC', 43, 84), rough: 0.5, twoSided: true, alphaTest: true, translucent: 0.5 }),
  pot: pbr('pot', { color: '#363532', rough: 0.55 }),
  potLight: pbr('potLight', { tex: paintTex('t-pot', '#bdb8af', 13, 0.06), rough: 0.8 }),
  soil: pbr('soil', { color: '#3b2d22', rough: 1 }),
  trunk: pbr('trunk', { color: '#6e5643', rough: 0.9 }),
  panel: std('panel', { color: '#ffffff', emissive: '#fff6ec', unlit: true }),
  bulb: std('bulb', { color: '#ffffff', emissive: '#ffd79a', unlit: true }),
  ledShelf: std('ledShelf', { color: '#ffffff', emissive: '#fff1da', unlit: true }),
  slatsBlack: pbr('slatsBlack', { tex: texSlats, color: '#2a2a2a', rough: 0.55, noCull: true, alphaTest: true }),
  slatsMustard: pbr('slatsMustard', { tex: texSlats, color: '#c99b2f', rough: 0.55, noCull: true, alphaTest: true }),
  vendingRed: pbr('vendingRed', { color: '#a3242a', rough: 0.3, metal: 0.2 }),
  vendingDark: pbr('vendingDark', { color: '#2b2d30', rough: 0.3, metal: 0.3 }),
  vendFront1: std('vendFront1', { emissiveTex: vendingTex('vt1', 1, false), unlit: true }),
  vendFront2: std('vendFront2', { emissiveTex: vendingTex('vt2', 2, true), unlit: true }),
  product: pbr('product', { color: '#e9e2d4', rough: 0.7 }),
  productA: pbr('productA', { color: '#7a2730', rough: 0.7 }),
  productB: pbr('productB', { color: '#2d4a7a', rough: 0.7 }),
  productC: pbr('productC', { color: '#d9c39a', rough: 0.7 }),
  ceramic: pbr('ceramic', { color: '#f4f1ea', rough: 0.12 }),
  screenFrame: pbr('screenFrame', { color: '#0d0d0d', rough: 0.15 }),
};

// ======================================================================
// Геометрия: скруглённые боксы, токарные тела, трубы
// ======================================================================
// Бокс со скруглёнными рёбрами (r) — блики на кромках делают мебель «настоящей»
function rbox(w, h, d, r = 0.015, n = LOW ? 2 : 3) {
  r = Math.max(0.001, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const half = [w / 2, h / 2, d / 2], inner = [w / 2 - r, h / 2 - r, d / 2 - r];
  const coords = a => {
    const out = [-half[a]];
    for (let k = n - 1; k >= 1; k--) out.push(-inner[a] - r * Math.tan(k / n * Math.PI / 4));
    out.push(-inner[a], inner[a]);
    for (let k = 1; k < n; k++) out.push(inner[a] + r * Math.tan(k / n * Math.PI / 4));
    out.push(half[a]);
    return out;
  };
  // [нормаль, ось u, ось v] — u × v = нормаль
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const axis = v => v.findIndex(c => c !== 0);
  const pos = [], nrm = [], uv = [], idx = [];
  for (const [nv, uvv, vvv] of faces) {
    const na = axis(nv), ua = axis(uvv), va = axis(vvv);
    const us = coords(ua).map(c => c * uvv[ua]), vs = coords(va).map(c => c * vvv[va]);
    const base = pos.length / 3;
    for (let j = 0; j < vs.length; j++) {
      for (let i = 0; i < us.length; i++) {
        const p = [0, 0, 0];
        p[na] = half[na] * nv[na];
        p[ua] = us[i]; p[va] = vs[j];
        const q = p.map((c, k) => Math.max(-inner[k], Math.min(inner[k], c)));
        let dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
        const L = Math.hypot(dx, dy, dz) || 1;
        dx /= L; dy /= L; dz /= L;
        pos.push(q[0] + dx * r, q[1] + dy * r, q[2] + dz * r);
        nrm.push(dx, dy, dz);
        uv.push((us[i] * uvv[ua] + half[ua]) , (vs[j] * vvv[va] + half[va]));
      }
    }
    const nu = us.length;
    for (let j = 0; j < vs.length - 1; j++) {
      for (let i = 0; i < nu - 1; i++) {
        const a = base + j * nu + i, b = a + 1, c = a + nu + 1, d = a + nu;
        idx.push(a, c, b, a, d, c);
      }
    }
  }
  const mesh = new BABYLON.Mesh('rb', scene);
  const vd = new BABYLON.VertexData();
  vd.positions = pos; vd.normals = nrm; vd.uvs = uv; vd.indices = idx;
  vd.applyToMesh(mesh);
  return mesh;
}

// Тело вращения по профилю [[радиус, высота], ...]
function lathe(profile, tess = 32) {
  return BABYLON.MeshBuilder.CreateLathe('lathe', {
    shape: profile.map(([r, y]) => new V3(r, y, 0)), tessellation: tess, sideOrientation: BABYLON.Mesh.DOUBLESIDE,
  }, scene);
}

// Ломаная со скруглёнными углами (для гнутых труб каркасов)
function roundedPath(pts, r, seg = 5) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const da = a.subtract(p), db = b.subtract(p);
    const rr = Math.min(r, da.length() / 2, db.length() / 2);
    const s = p.add(da.normalize().scale(rr)), e = p.add(db.normalize().scale(rr));
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      out.push(s.scale((1 - t) * (1 - t)).add(p.scale(2 * (1 - t) * t)).add(e.scale(t * t)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function tubeMesh(pts, radius, bend = 0.06, tess = 10) {
  return BABYLON.MeshBuilder.CreateTube('tube', {
    path: bend > 0 ? roundedPath(pts, bend) : pts, radius, tessellation: tess, cap: BABYLON.Mesh.CAP_ALL,
  }, scene);
}

// ======================================================================
// Учёт мешей, коллизии
// ======================================================================
const solids = [];      // препятствия для коллизий: отрезки и окружности (координаты плана)
const volumes = [];     // лестницы и площадки: опора + препятствие
const statics = [];     // статические меши, которые потом объединяются по материалу
const casters = [];
const teleportFloors = [];
const mirrorPlanes = [];

function addSeg(ax, ay, bx, by, y0 = 0, y1 = 99, tag = 'wall') {
  solids.push({ t: 'seg', ax, ay, bx, by, y0, y1, tag });
}
function addCircle(cx, cy, r, y0 = 0, y1 = 99, tag = 'obj') {
  solids.push({ t: 'circ', cx, cy, r, y0, y1, tag });
}
function addRectSolid(cx, cy, w, d, y0, y1, tag = 'obj') {
  const x0 = cx - w / 2, x1 = cx + w / 2, yA = cy - d / 2, yB = cy + d / 2;
  addSeg(x0, yA, x1, yA, y0, y1, tag); addSeg(x1, yA, x1, yB, y0, y1, tag);
  addSeg(x1, yB, x0, yB, y0, y1, tag); addSeg(x0, yB, x0, yA, y0, y1, tag);
}

function keep(mesh, mat, opts = {}) {
  mesh.material = mat;
  mesh.isPickable = false;
  if (opts.merge === false) {
    mesh.receiveShadows = true;
    if (opts.cast !== false) casters.push(mesh);
    mesh.freezeWorldMatrix();
  } else {
    statics.push({ mesh, mat, cast: opts.cast !== false });
  }
  return mesh;
}

// Бокс в мире: центр плана (cx, cy), низ на высоте y0
function boxAt(cx, cy, w, d, h, y0, mat, rotY = 0, opts) {
  const b = BABYLON.MeshBuilder.CreateBox('b', { width: w, height: h, depth: d }, scene);
  b.position = W(cx, cy, y0 + h / 2);
  b.rotation.y = rotY;
  return keep(b, mat, opts);
}
function rboxAt(cx, cy, w, d, h, y0, mat, r = 0.015, rotY = 0, opts) {
  const b = rbox(w, h, d, r);
  b.position = W(cx, cy, y0 + h / 2);
  b.rotation.y = rotY;
  return keep(b, mat, opts);
}
// Бокс вдоль отрезка плана (ширина — длина отрезка), со смещением off по нормали
function boxAlong(ax, ay, bx, by, thick, y0, y1, mat, opts = {}) {
  const L = Math.hypot(bx - ax, by - ay);
  const b = opts.round ? rbox(L, y1 - y0, thick, opts.round) : BABYLON.MeshBuilder.CreateBox('s', { width: L, height: y1 - y0, depth: thick }, scene);
  const off = opts.off || 0;
  const nx = (by - ay) / L, ny = -(bx - ax) / L;
  b.position = W((ax + bx) / 2 + nx * off, (ay + by) / 2 + ny * off, (y0 + y1) / 2);
  b.rotation.y = yawTo(bx - ax, by - ay) - Math.PI / 2;
  return keep(b, mat, opts);
}

// Группа для мебели: локальная ось +z — «лицо» предмета, x — его длина
function group(cx, cy, frontX, frontY, y0 = 0) {
  const g = new BABYLON.TransformNode('g', scene);
  g.position = W(cx, cy, y0);
  g.rotation.y = yawTo(frontX, frontY);
  return g;
}
function part(g, mesh, mat, x, y, z, opts) {
  mesh.parent = g;
  mesh.position.set(x, y, z);
  return keep(mesh, mat, opts);
}
function ptube(g, pts, radius, mat, bend = 0.06, opts) {
  const t = tubeMesh(pts.map(p => new V3(p[0], p[1], p[2])), radius, bend);
  t.parent = g;
  return keep(t, mat, opts);
}
const B = (w, h, d) => BABYLON.MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, scene);
const R = (w, h, d, r = 0.015) => rbox(w, h, d, r);
const Cyl = (d, h, tess = 24, dTop) => BABYLON.MeshBuilder.CreateCylinder('c',
  { diameter: d, diameterTop: dTop ?? d, diameterBottom: d, height: h, tessellation: tess }, scene);

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inRect = (x, y, r, m = 0) => Math.abs(x - r.cx) <= r.w / 2 + m && Math.abs(y - r.cy) <= r.d / 2 + m;
const inWall = (x, y) => P.walls.some(w => pointInPoly(x, y, w));

const gypsumPolys = P.ceiling.gypsum;
function ceilingAt(x, y) {
  if (gypsumPolys.some(p => pointInPoly(x, y, p))) return H_LOW;
  if (P.ceiling.gkl.some(r => inRect(x, y, r))) return H_LOW;
  return H_HALL;
}

// Толщина стены в торце проёма: [от, до] вдоль нормали
function wallDepth(x, y, nx, ny) {
  let lo = null, hi = null;
  for (let d = -0.8; d <= 0.8; d += 0.01) {
    if (inWall(x + nx * d, y + ny * d)) { if (lo === null) lo = d; hi = d; }
  }
  return lo === null ? null : [lo - 0.005, hi + 0.005];
}

// ======================================================================
// Стены с отделкой по листу 16 + плинтус
// ======================================================================
const wallBuckets = {};
function bucket(kind) {
  return wallBuckets[kind] || (wallBuckets[kind] = { pos: [], idx: [], nrm: [], uv: [] });
}
// u берётся как проекция на направление ребра — соседние участки одной стены не дают шва
function addQuad(kind, ax, ay, bx, by, y0, y1, nx, ny) {
  const bk = bucket(kind);
  const s = FINISH_TILE[kind] || 2;
  const i = bk.pos.length / 3;
  const L = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / L, uy = (by - ay) / L;
  const u0 = ax * ux + ay * uy;
  bk.pos.push(ax, y0, -ay, bx, y0, -by, bx, y1, -by, ax, y1, -ay);
  for (let k = 0; k < 4; k++) bk.nrm.push(nx, 0, -ny);
  bk.uv.push(u0 / s, y0 / s, (u0 + L) / s, y0 / s, (u0 + L) / s, y1 / s, u0 / s, y1 / s);
  bk.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

function finishIntervals(ax, ay, bx, by, nx, ny, fallback) {
  const L = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / L, uy = (by - ay) / L;
  const hits = [];
  for (const f of P.finishes) {
    const fl = Math.hypot(f.x2 - f.x1, f.y2 - f.y1);
    if (fl < 0.05) continue;
    const fx = (f.x2 - f.x1) / fl, fy = (f.y2 - f.y1) / fl;
    if (Math.abs(ux * fy - uy * fx) > 0.08) continue;
    const mx = (f.x1 + f.x2) / 2 - ax, my = (f.y1 + f.y2) / 2 - ay;
    const dist = mx * nx + my * ny;
    if (dist < -0.04 || dist > 0.2) continue;
    let t1 = (f.x1 - ax) * ux + (f.y1 - ay) * uy;
    let t2 = (f.x2 - ax) * ux + (f.y2 - ay) * uy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    t1 = Math.max(0, t1 - 0.06); t2 = Math.min(L, t2 + 0.06);
    if (t2 - t1 > 0.04) hits.push({ t0: t1, t1: t2, kind: f.kind, dist });
  }
  const cuts = [0, L];
  hits.forEach(h => cuts.push(h.t0, h.t1));
  cuts.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a < 0.005) continue;
    const mid = (a + b) / 2;
    // серая покраска — фон; акцентная отделка поверх неё важнее
    const cover = hits.filter(h => h.t0 <= mid && h.t1 >= mid)
      .sort((p, q) => (p.kind === 'gray') - (q.kind === 'gray') || p.dist - q.dist)[0];
    const kind = cover ? cover.kind : fallback;
    if (out.length && out[out.length - 1].kind === kind) out[out.length - 1].t1 = b;
    else out.push({ t0: a, t1: b, kind });
  }
  return out;
}

function outwardNormal(ax, ay, bx, by, pts) {
  const L = Math.hypot(bx - ax, by - ay);
  let nx = (by - ay) / L, ny = -(bx - ax) / L;
  const mx = (ax + bx) / 2 + nx * 0.01, my = (ay + by) / 2 + ny * 0.01;
  if (pointInPoly(mx, my, pts)) { nx = -nx; ny = -ny; }
  return [nx, ny];
}

// Плинтус 80 мм вдоль грани (кроме металла, плитки и мрамора)
function baseboard(ax, ay, bx, by, nx, ny) {
  const L = Math.hypot(bx - ax, by - ay);
  if (L < 0.08) return;
  const ux = (bx - ax) / L, uy = (by - ay) / L;
  const sx = ax + ux * 0.004, sy = ay + uy * 0.004, ex = bx - ux * 0.004, ey = by - uy * 0.004;
  boxAlong(sx + nx * 0.008, sy + ny * 0.008, ex + nx * 0.008, ey + ny * 0.008, 0.016, 0, 0.08, M.blackMatte, { cast: false });
}

function buildPolygonPrism(pts, y0, y1, fallback, collide = true, skirting = true) {
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 0.01) continue;
    const [nx, ny] = outwardNormal(ax, ay, bx, by, pts);
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    for (const iv of finishIntervals(ax, ay, bx, by, nx, ny, fallback)) {
      const a = [ax + ux * iv.t0, ay + uy * iv.t0], b = [ax + ux * iv.t1, ay + uy * iv.t1];
      addQuad(iv.kind, a[0], a[1], b[0], b[1], y0, y1, nx, ny);
      if (skirting && y0 === 0 && (iv.kind === 'gray' || iv.kind === 'bordo' || iv.kind === 'plaster')) {
        // плинтус только на гранях, обращённых в помещение (не внутрь стен и не наружу фасада)
        const mx = (a[0] + b[0]) / 2 + nx * 0.3, my = (a[1] + b[1]) / 2 + ny * 0.3;
        if (!inWall(mx, my) && my > 0.4 && my < 15.25) baseboard(a[0], a[1], b[0], b[1], nx, ny);
      }
    }
    if (collide) addSeg(ax, ay, bx, by, y0, y1);
  }
}

function buildWalls() {
  P.walls.forEach(pts => buildPolygonPrism(pts, 0, H_WALL, 'gray'));
  MAN.extraWalls.forEach(s => {
    const t = 0.1, L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const nx = (s.y2 - s.y1) / L * t, ny = -(s.x2 - s.x1) / L * t;
    buildPolygonPrism([[s.x1 - nx, s.y1 - ny], [s.x2 - nx, s.y2 - ny], [s.x2 + nx, s.y2 + ny], [s.x1 + nx, s.y1 + ny]], 0, H_WALL, 'gray');
  });
  P.columns.forEach(c => {
    if (c.type === 'round') {
      // Круглые колонны кафе: декоративная штукатурка и тёмный рифлёный пояс сверху (визуализация 31)
      const col = Cyl(c.r * 2, H_LOW, 48);
      col.position = W(c.cx, c.cy, H_LOW / 2);
      keep(col, M.colPlaster);
      const band = lathe([[0, 0], [c.r + 0.045, 0], [c.r + 0.05, 0.02], [c.r + 0.05, 0.43], [c.r + 0.045, 0.45], [0, 0.45]], 48);
      band.position = W(c.cx, c.cy, H_LOW - 0.45);
      keep(band, M.ribs);
      const foot = Cyl(c.r * 2 + 0.03, 0.08, 48);
      foot.position = W(c.cx, c.cy, 0.04);
      keep(foot, M.blackMatte);
      addCircle(c.cx, c.cy, c.r + 0.04);
    } else {
      const x0 = c.cx - c.w / 2, x1 = c.cx + c.w / 2, y0 = c.cy - c.d / 2, y1 = c.cy + c.d / 2;
      buildPolygonPrism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 0, H_HALL + 0.05, 'gray');
      // металлическая облицовка: уголки на рёбрах
      const isMetal = finishIntervals(x0, y0, x1, y0, 0, -1, 'gray').some(i => i.kind === 'metal');
      if (isMetal) {
        [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([x, y]) =>
          rboxAt(x, y, 0.04, 0.04, H_HALL - 0.02, 0, M.black, 0.008));
        // световая полоса внутри перфорации (лист 26: «внутри возможна подсветка»)
        [[(x0 + x1) / 2, y0 - 0.004, 0.012, 0.004], [(x0 + x1) / 2, y1 + 0.004, 0.012, 0.004]].forEach(([x, y, w, d]) =>
          boxAt(x, y, w, d, 2.2, 0.35, M.ledShelf, 0, { cast: false }));
      }
    }
  });
}
M.ribs = pbr('ribs', { tex: texRibs, normal: normalFrom(texRibs, 6), metal: 0.5, rough: 0.4 });
texScale(M.ribs, 24, 1);
// штукатурка колонн: развёртка цилиндра 0..1 по окружности (~1.4 м) и высоте 2.7 м
M.colPlaster = pbr('colPlaster', { tex: texPlasterCol, normal: normalFrom(texPlasterCol, 4), normalLevel: 0.6, rough: 0.9 });
texScale(M.colPlaster, 0.9, 1.7);

function flushWallBuckets() {
  for (const kind in wallBuckets) {
    const bk = wallBuckets[kind];
    const mesh = new BABYLON.Mesh('walls-' + kind, scene);
    const vd = new BABYLON.VertexData();
    vd.positions = bk.pos; vd.indices = bk.idx; vd.normals = bk.nrm; vd.uvs = bk.uv;
    vd.applyToMesh(mesh);
    keep(mesh, finishMat[kind], { merge: false });
  }
}

function alignX(mesh, dir) {
  const q = new BABYLON.Quaternion();
  BABYLON.Quaternion.FromUnitVectorsToRef(new V3(1, 0, 0), dir.normalize(), q);
  mesh.rotationQuaternion = q;
}

// ======================================================================
// Пол, потолки, шахты лестниц, освещение потолка
// ======================================================================
const BOUNDS = { x0: -6.2, x1: 35.25, y0: 0.18, y1: 15.45 };

function buildFloorAndCeilings() {
  const fw = BOUNDS.x1 - BOUNDS.x0, fd = BOUNDS.y1 - BOUNDS.y0;
  const floor = BABYLON.MeshBuilder.CreateGround('floor', { width: fw, height: fd, subdivisions: 1 }, scene);
  floor.position = W((BOUNDS.x0 + BOUNDS.x1) / 2, (BOUNDS.y0 + BOUNDS.y1) / 2, 0);
  texScale(M.floor, fw / FLOOR_TILE, fd / FLOOR_TILE);
  keep(floor, M.floor, { merge: false, cast: false });
  teleportFloors.push(floor);

  // Грильято на 2.9 с вырезами под лестничные шахты
  const v2 = (x, y) => new BABYLON.Vector2(x, -y);
  const outer = [v2(BOUNDS.x0, BOUNDS.y0), v2(BOUNDS.x1, BOUNDS.y0), v2(BOUNDS.x1, BOUNDS.y1), v2(BOUNDS.x0, BOUNDS.y1)];
  const pmb = new BABYLON.PolygonMeshBuilder('ceil', outer, scene, window.earcut);
  MAN.stairs.forEach(s => {
    const r = s.well;
    pmb.addHole([v2(r.cx - r.w / 2, r.cy - r.d / 2), v2(r.cx + r.w / 2, r.cy - r.d / 2),
      v2(r.cx + r.w / 2, r.cy + r.d / 2), v2(r.cx - r.w / 2, r.cy + r.d / 2)].reverse());
  });
  const ceil = pmb.build(false);
  ceil.position.y = H_HALL;
  texScale(M.grid, fw / 0.6, fd / 0.6);
  keep(ceil, M.grid, { merge: false, cast: false });

  // Опуски ГКЛ и обшивка балок (2.7–2.9)
  P.ceiling.gkl.forEach(r => boxAt(r.cx, r.cy, r.w, r.d, H_HALL - H_LOW + 0.02, H_LOW, M.gkl, 0, { cast: false }));

  // Существующий гипсовый потолок кафе
  gypsumPolys.forEach((poly, i) => {
    const b = new BABYLON.PolygonMeshBuilder('gyps' + i, poly.map(p => v2(p[0], p[1])), scene, window.earcut);
    const g = b.build(false);
    g.position.y = H_LOW;
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    texScale(M.gypsum, (Math.max(...xs) - Math.min(...xs)) / 0.6, (Math.max(...ys) - Math.min(...ys)) / 0.6);
    keep(g, M.gypsum, { merge: false, cast: false });
  });

  // Шахты лестниц: стенки от уровня потолка вверх (перекрывают край проёма без щелей) и перекрытие
  MAN.stairs.forEach(s => {
    const r = s.well;
    const x0 = r.cx - r.w / 2, x1 = r.cx + r.w / 2, y0 = r.cy - r.d / 2, y1 = r.cy + r.d / 2;
    [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].forEach(([ax, ay, bx, by]) => {
      boxAlong(ax, ay, bx, by, 0.3, H_LOW - 0.05, H_WALL, M.shaft, { off: 0.15, cast: false });
      boxAlong(ax, ay, bx, by, 0.02, H_HALL - 0.12, H_HALL + 0.02, M.gkl, { off: 0.01, cast: false });
    });
    boxAt(r.cx, r.cy, r.w + 0.6, r.d + 0.6, 0.05, H_WALL, M.shaft, 0, { cast: false });
    rboxAt(r.cx, r.cy, 0.62, 0.62, 0.03, H_WALL - 0.03, M.panel, 0.005, 0, { cast: false });
  });

  // Светильники 600×600 в грильято (алюминиевая рамка + рассеиватель) и накладные линейные
  P.lights.panels.forEach(o => {
    const h = ceilingAt(o.cx, o.cy);
    rboxAt(o.cx, o.cy, 0.6, 0.6, 0.03, h - 0.03, M.alu, 0.006, 0, { cast: false });
    boxAt(o.cx, o.cy, 0.56, 0.56, 0.005, h - 0.034, M.panel, 0, { cast: false });
  });
  P.lights.linear.forEach(o => {
    const h = ceilingAt(o.cx, o.cy);
    const w = Math.max(o.w, 0.06), d = Math.max(o.d, 0.06);
    rboxAt(o.cx, o.cy, w + 0.01, d + 0.01, 0.05, h - 0.05, M.black, 0.008, 0, { cast: false });
    boxAt(o.cx, o.cy, Math.max(w - 0.02, 0.035), Math.max(d - 0.02, 0.035), 0.004, h - 0.053, M.panel, 0, { cast: false });
  });
  P.lights.pendants.forEach((o, i) => {
    const top = ceilingAt(o.cx, o.cy);
    if (o.cy < 5) slatPendant(o.cx, o.cy, top, i % 2 ? M.slatsMustard : M.slatsBlack);
    else archPendant(o.cx, o.cy, top);
  });
}

// Подвесной светильник из деревянных ламелей (лист 12, MD3258-7)
function slatPendant(cx, cy, top, mat) {
  const bottom = 2.0;
  const g = group(cx, cy, 0, 1);
  part(g, Cyl(0.1, 0.02, 24), M.black, 0, top - 0.01, 0, { cast: false });
  part(g, Cyl(0.005, top - bottom - 0.34, 6), M.black, 0, bottom + 0.34 + (top - bottom - 0.34) / 2, 0, { cast: false });
  part(g, Cyl(0.06, 0.05, 16), M.black, 0, bottom + 0.34, 0, { cast: false });
  // колокол: профиль с перегибом, как у ламелей на фото
  const shade = lathe([[0.04, 0.34], [0.09, 0.3], [0.17, 0.2], [0.22, 0.08], [0.215, 0.0]], 40);
  part(g, shade, mat, 0, bottom, 0);
  part(g, BABYLON.MeshBuilder.CreateSphere('bulb', { diameter: 0.11, segments: 12 }, scene), M.bulb, 0, bottom + 0.12, 0, { cast: false });
}

// Линейный подвес «ммм» из чёрной трубки (лист 12)
function archPendant(cx, cy, top) {
  const y = 2.25;
  const g = group(cx, cy, 0, 1);
  const pts = [];
  for (let k = 0; k < 5; k++) {
    const xc = -0.48 + k * 0.24;
    for (let s = 0; s <= 14; s++) {
      const a = Math.PI - s / 14 * Math.PI;
      pts.push(new V3(xc + Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0));
    }
  }
  const tube = BABYLON.MeshBuilder.CreateTube('mmm', { path: pts, radius: 0.017, tessellation: 12, cap: BABYLON.Mesh.CAP_ALL }, scene);
  part(g, tube, M.black, 0, y, 0);
  [-0.36, 0.36].forEach(x => {
    part(g, Cyl(0.005, top - y - 0.12, 6), M.black, x, y + 0.12 + (top - y - 0.12) / 2, 0, { cast: false });
    part(g, Cyl(0.06, 0.015, 16), M.black, x, top - 0.008, 0, { cast: false });
  });
  part(g, B(1.2, 0.01, 0.022), M.bulb, 0, y - 0.006, 0, { cast: false });
}

// ======================================================================
// Окна, витраж, ограждения, перегородки, двери
// ======================================================================
function glassPlane(ax, ay, bx, by, y0, y1, mat = M.glass, off = 0) {
  const L = Math.hypot(bx - ax, by - ay);
  const nx = (by - ay) / L, ny = -(bx - ax) / L;
  const p = BABYLON.MeshBuilder.CreatePlane('glass', { width: L, height: y1 - y0, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
  p.position = W((ax + bx) / 2 + nx * off, (ay + by) / 2 + ny * off, (y0 + y1) / 2);
  p.rotation.y = yawTo(bx - ax, by - ay) - Math.PI / 2;
  p.material = mat;
  p.isPickable = false;
  return p;
}

// Окна в пол с матовым стеклом: белый ПВХ-профиль 70×120, импосты через ~1.45 м, фрамуга на 2.25 м
function buildWindow(s, collide = true) {
  const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  const top = H_HALL + 0.02;
  const ux = (s.x2 - s.x1) / L, uy = (s.y2 - s.y1) / L;
  const frost = glassPlane(s.x1, s.y1, s.x2, s.y2, 0, top);
  keep(frost, M.frost, { cast: false });
  const n = Math.max(1, Math.round(L / 1.45));
  const rot = yawTo(s.x2 - s.x1, s.y2 - s.y1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    rboxAt(s.x1 + (s.x2 - s.x1) * t, s.y1 + (s.y2 - s.y1) * t, 0.12, 0.07, top, 0, M.pvc, 0.008, rot);
  }
  [[0, 0.08], [2.22, 2.3], [top - 0.06, top]].forEach(([h0, h1]) =>
    boxAlong(s.x1 + ux * 0.03, s.y1 + uy * 0.03, s.x2 - ux * 0.03, s.y2 - uy * 0.03, 0.12, h0, h1, M.pvc, { round: 0.008 }));
  // ручки створок — со стороны помещения
  const inward = s.y1 < 8 ? 0.065 : -0.065;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = s.x1 + (s.x2 - s.x1) * t, y = s.y1 + (s.y2 - s.y1) * t;
    rboxAt(x + ux * 0.6, y + uy * 0.6 + inward, 0.02, 0.03, 0.14, 1.1, M.pvc, 0.008, rot, { cast: false });
  }
  if (collide) addSeg(s.x1, s.y1, s.x2, s.y2);
}

// Решётчатая перегородка в чёрном алюминиевом профиле
function crittall(ax, ay, bx, by, y0, y1, opts = {}) {
  const L = Math.hypot(bx - ax, by - ay);
  if (L < 0.05) return;
  const g = glassPlane(ax, ay, bx, by, y0, y1, opts.frosted ? M.frost : M.glassDark);
  if (opts.frosted) keep(g, M.frost, { cast: false });
  const nV = Math.max(1, Math.round(L / (opts.cell || 0.62)));
  const rot = yawTo(bx - ax, by - ay);
  for (let i = 0; i <= nV; i++) {
    const t = i / nV;
    const edge = i === 0 || i === nV;
    rboxAt(ax + (bx - ax) * t, ay + (by - ay) * t, edge ? 0.07 : 0.045, edge ? 0.05 : 0.035, y1 - y0, y0, M.black, 0.006, rot);
  }
  const nH = Math.max(2, Math.round((y1 - y0) / (opts.rowH || 0.55)));
  for (let j = 0; j <= nH; j++) {
    const h = y0 + (y1 - y0) * j / nH;
    boxAlong(ax, ay, bx, by, 0.045, h - 0.018, h + 0.018, M.black, { round: 0.006 });
  }
}

function buildOpenings() {
  MAN.windows.forEach(s => buildWindow(s));
  // Музейный холл слева продолжает фасадное остекление
  buildWindow({ x1: BOUNDS.x0, y1: 0.25, x2: 0.06, y2: 0.25 }, false);
  // Наружные двери тамбура — тоже матовые
  MAN.entranceGlass.forEach(s => {
    crittall(s.x1, s.y1, s.x2, s.y2, 0, H_HALL, { cell: 0.95, rowH: 1.0, frosted: true });
    addSeg(s.x1, s.y1, s.x2, s.y2);
  });
  // Витраж холла музея (новое витражное остекление, лист 07)
  MAN.vitrage.forEach(s => {
    crittall(s.x1, 0.25, s.x2, s.y2, 0, H_HALL, { cell: 1.2, rowH: 0.9 });
    addSeg(s.x1, 0.25, s.x2, s.y2);
  });

  // Ограждения: у окон — чёрный металл h=900, у входной группы — нержавейка h=1000
  P.railings.forEach(r => {
    if (r.kind === 'window') {
      blackRailing(r.x1, r.y1, r.x2, r.y2, 0, 0, 0.9);
      addSeg(r.x1, r.y1, r.x2, r.y2, 0, 0.9, 'rail');
    } else {
      const horizontal = Math.abs(r.y2 - r.y1) < 0.01;
      if (horizontal) {
        // нижняя секция П-ограждения: турникеты у краёв (временные и постоянные пропуска)
        const xa = Math.min(r.x1, r.x2), xb = Math.max(r.x1, r.x2);
        const gaps = [[xa + 0.15, xa + 0.85], [xb - 0.85, xb - 0.15]];
        let cur = xa;
        gaps.forEach(([g0, g1]) => {
          steelRailing(cur, r.y1, g0, r.y1);
          addSeg(cur, r.y1, g0, r.y1, 0, 1.0, 'rail');
          turnstile((g0 + g1) / 2, r.y1);
          cur = g1;
        });
        steelRailing(cur, r.y1, xb, r.y1);
        addSeg(cur, r.y1, xb, r.y1, 0, 1.0, 'rail');
      } else {
        steelRailing(r.x1, r.y1, r.x2, r.y2);
        addSeg(r.x1, r.y1, r.x2, r.y2, 0, 1.0, 'rail');
      }
    }
  });

  // Перегородки вахты и гардероба (лист 07): стекло в чёрном профиле, окрашенные участки — глухие
  const partitionsAll = [...P.partitions, MAN.vakhtaFront];
  partitionsAll.forEach(s => {
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const nx = (s.y2 - s.y1) / L, ny = -(s.x2 - s.x1) / L;
    const ivA = finishIntervals(s.x1, s.y1, s.x2, s.y2, nx, ny, 'glass');
    const ivB = finishIntervals(s.x1, s.y1, s.x2, s.y2, -nx, -ny, 'glass');
    const ux = (s.x2 - s.x1) / L, uy = (s.y2 - s.y1) / L;
    const cuts = [...new Set([0, L, ...ivA.flatMap(i => [i.t0, i.t1]), ...ivB.flatMap(i => [i.t0, i.t1])])].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const t0 = cuts[i], t1 = cuts[i + 1], mid = (t0 + t1) / 2;
      if (t1 - t0 < 0.01) continue;
      const ka = ivA.find(v => v.t0 <= mid && v.t1 >= mid)?.kind || 'glass';
      const kb = ivB.find(v => v.t0 <= mid && v.t1 >= mid)?.kind || 'glass';
      const ax = s.x1 + ux * t0, ay = s.y1 + uy * t0, bx = s.x1 + ux * t1, by = s.y1 + uy * t1;
      const top = ceilingAt((ax + bx) / 2, (ay + by) / 2) + 0.01;
      if (ka === 'glass' && kb === 'glass') {
        crittall(ax, ay, bx, by, 0, top);
      } else {
        // глухой участок — цельный бокс без щелей, отделка с каждой стороны
        boxAlong(ax, ay, bx, by, 0.1, 0, top, finishMat.gray);
        if (ka !== 'glass' && ka !== 'gray') boxAlong(ax, ay, bx, by, 0.004, 0, top, finishMat[ka], { off: 0.052 });
        if (kb !== 'glass' && kb !== 'gray') boxAlong(ax, ay, bx, by, 0.004, 0, top, finishMat[kb], { off: -0.052 });
        boxAlong(ax, ay, bx, by, 0.116, 0, 0.08, M.blackMatte, { cast: false });
      }
    }
    addSeg(s.x1, s.y1, s.x2, s.y2);
  });

  // Перегородка из стеклоблоков 2060×2450 на цоколе 200 мм (листы 07, 23)
  {
    const s = MAN.glassBlocks;
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    boxAlong(s.x1, s.y1, s.x2, s.y2, 0.14, 0, 0.2, finishMat.gray);
    boxAlong(s.x1, s.y1, s.x2, s.y2, 0.1, 0.2, 2.65, M.glassBlock, { cast: false });
    texScale(M.glassBlock, L / 0.57, 2.45 / 0.57);
    boxAlong(s.x1, s.y1, s.x2, s.y2, 0.14, 2.65, H_HALL + 0.02, finishMat.gray);
    addSeg(s.x1, s.y1, s.x2, s.y2);
  }

  // Двери в существующих проёмах (лист 17): перемычка на всю толщину стены, коробка, наличники
  MAN.doors.forEach(s => {
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const ux = (s.x2 - s.x1) / L, uy = (s.y2 - s.y1) / L;
    const nx = (s.y2 - s.y1) / L, ny = -(s.x2 - s.x1) / L;
    const dA = wallDepth(s.x1 - ux * 0.05, s.y1 - uy * 0.05, nx, ny);
    const dB = wallDepth(s.x2 + ux * 0.05, s.y2 + uy * 0.05, nx, ny);
    let lo = Math.min(dA ? dA[0] : -0.12, dB ? dB[0] : -0.12), hi = Math.max(dA ? dA[1] : 0.12, dB ? dB[1] : 0.12);
    const T = hi - lo, mid = (lo + hi) / 2;
    const top = Math.max(ceilingAt((s.x1 + s.x2) / 2 + nx * 0.4, (s.y1 + s.y2) / 2 + ny * 0.4),
      ceilingAt((s.x1 + s.x2) / 2 - nx * 0.4, (s.y1 + s.y2) / 2 - ny * 0.4));
    const leafH = 2.1;
    const glass = s.kind === 'glass';
    // перемычка
    boxAlong(s.x1, s.y1, s.x2, s.y2, T, leafH + 0.06, top + 0.1, glass ? finishMat.marble : finishMat.gray, { off: mid });
    // дверная коробка
    boxAlong(s.x1, s.y1, s.x2, s.y2, T + 0.004, leafH, leafH + 0.06, glass ? M.black : M.door, { off: mid });
    [[0, 1], [L, -1]].forEach(([t, dir]) => {
      const x = s.x1 + ux * t + ux * dir * 0.03, y = s.y1 + uy * t + uy * dir * 0.03;
      rboxAt(x + nx * mid, y + ny * mid, 0.06, T + 0.004, leafH, 0, glass ? M.black : M.door, 0.004, yawTo(nx, ny));
    });
    if (!glass) {
      // наличники с обеих сторон
      [hi + 0.008, lo - 0.008].forEach(off => {
        boxAlong(s.x1 - ux * 0.07, s.y1 - uy * 0.07, s.x2 + ux * 0.07, s.y2 + uy * 0.07, 0.016, leafH + 0.06, leafH + 0.14, M.door, { off, round: 0.004 });
        [-0.035, L + 0.035].forEach(t => rboxAt(s.x1 + ux * t + nx * off, s.y1 + uy * t + ny * off, 0.07, 0.016, leafH + 0.14, 0, M.door, 0.004, yawTo(ux, uy) - Math.PI / 2));
      });
    }
    const inner = L - 0.12;
    if (glass) {
      crittall(s.x1 + ux * 0.06, s.y1 + uy * 0.06, s.x2 - ux * 0.06, s.y2 - uy * 0.06, 0, leafH, { cell: inner / 2, rowH: 1.05 });
    } else {
      const leaves = L > 1.5 ? 2 : 1;
      const lw = inner / leaves;
      for (let k = 0; k < leaves; k++) {
        const t0 = 0.06 + k * lw + 0.003, t1 = 0.06 + (k + 1) * lw - 0.003;
        const cx = s.x1 + ux * (t0 + t1) / 2 + nx * mid, cy = s.y1 + uy * (t0 + t1) / 2 + ny * mid;
        const rot = yawTo(ux, uy) - Math.PI / 2;
        rboxAt(cx, cy, t1 - t0, 0.045, leafH - 0.01, 0.005, M.door, 0.006, rot);
        // филёнки
        [1, -1].forEach(sd => {
          rboxAt(cx + nx * 0.024 * sd, cy + ny * 0.024 * sd, (t1 - t0) - 0.24, 0.006, 0.8, 1.15, M.door, 0.003, rot, { cast: false });
          rboxAt(cx + nx * 0.024 * sd, cy + ny * 0.024 * sd, (t1 - t0) - 0.24, 0.006, 0.75, 0.2, M.door, 0.003, rot, { cast: false });
        });
        // ручка-скоба из нержавейки
        const th = leaves === 2 ? (k === 0 ? t1 - 0.09 : t0 + 0.09) : t1 - 0.1;
        [1, -1].forEach(sd => {
          const hx = s.x1 + ux * th + nx * (mid + 0.05 * sd), hy = s.y1 + uy * th + ny * (mid + 0.05 * sd);
          rboxAt(hx, hy, 0.022, 0.022, 0.32, 0.9, M.steel, 0.009, 0, { cast: false });
        });
      }
    }
    addSeg(s.x1, s.y1, s.x2, s.y2);
  });
}

function blackRailing(ax, ay, bx, by, h0a, h0b, height) {
  const L = Math.hypot(bx - ax, by - ay);
  const n = Math.max(2, Math.round(L / 0.11));
  for (let i = 0; i <= n; i++) {
    const t = i / n, h0 = h0a + (h0b - h0a) * t;
    const bar = Cyl(0.014, height - 0.04, 8);
    bar.position = W(ax + (bx - ax) * t, ay + (by - ay) * t, h0 + 0.02 + (height - 0.04) / 2);
    keep(bar, M.black);
  }
  railBeam(ax, ay, bx, by, h0a + height, h0b + height, 0.045, 0.03, M.black, 0.01);
  railBeam(ax, ay, bx, by, h0a + 0.06, h0b + 0.06, 0.03, 0.02, M.black, 0.006);
}

function steelRailing(ax, ay, bx, by) {
  const L = Math.hypot(bx - ax, by - ay);
  if (L < 0.05) return;
  const n = Math.max(1, Math.round(L / 1.1));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const post = lathe([[0, 0], [0.04, 0], [0.04, 0.012], [0.024, 0.02], [0.024, 1.0], [0.026, 1.01], [0, 1.03]], 20);
    post.position = W(ax + (bx - ax) * t, ay + (by - ay) * t, 0);
    keep(post, M.steel);
  }
  [0.5, 1.0].forEach(h => {
    const tube = BABYLON.MeshBuilder.CreateTube('rail', { path: [W(ax, ay, h), W(bx, by, h)], radius: 0.021, tessellation: 14, cap: BABYLON.Mesh.CAP_ALL }, scene);
    keep(tube, M.steel);
  });
}

// Турникет-трипод из нержавейки
function turnstile(cx, cy) {
  const g = group(cx, cy, 0, 1);
  part(g, R(0.24, 0.95, 0.42, 0.04), M.steel, -0.38, 0.475, 0);
  part(g, R(0.2, 0.02, 0.16, 0.008), M.screenFrame, -0.38, 0.955, 0.06, { cast: false });
  part(g, Cyl(0.09, 0.08, 20), M.steel, -0.24, 0.85, 0).rotation.z = Math.PI / 2;
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2;
    const arm = part(g, Cyl(0.032, 0.48, 12), M.steel, 0, 0.85 + Math.cos(a) * 0.24, Math.sin(a) * 0.24);
    arm.rotation.z = Math.PI / 2;
    arm.position.x = -0.2 + 0.24;
  }
}

// Наклонная балка/поручень между двумя точками плана на высотах h0 и h1
function railBeam(ax, ay, bx, by, h0, h1, w, t, mat, round = 0) {
  const a = W(ax, ay, h0), b = W(bx, by, h1);
  const L = V3.Distance(a, b);
  const beam = round ? rbox(L, t, w, round) : BABYLON.MeshBuilder.CreateBox('beam', { width: L, height: t, depth: w }, scene);
  beam.position = V3.Center(a, b);
  alignX(beam, b.subtract(a));
  return keep(beam, mat);
}

// ======================================================================
// Лестницы: марш 1 → площадка 1540 → марш 2 в шахту
// ======================================================================
function rectEdges(r) {
  return { x0: r.cx - r.w / 2, x1: r.cx + r.w / 2, y0: r.cy - r.d / 2, y1: r.cy + r.d / 2 };
}

function buildStairs() {
  MAN.stairs.forEach(s => {
    const f1 = rectEdges(s.flight1), f2 = rectEdges(s.flight2), ld = rectEdges(s.landing);
    const steps = 10, rise = H_LANDING / steps;
    // Марш 1: монолит со ступенями из камня с выступающей кромкой
    const run1 = (f1.x1 - f1.x0) / steps;
    for (let i = 0; i < steps; i++) {
      const x = f1.x0 + run1 * i;
      boxAt(x + run1 / 2, s.flight1.cy, run1, s.flight1.d, rise * (i + 1) - 0.03, 0, M.concrete);
      rboxAt(x + run1 / 2 - 0.015, s.flight1.cy, run1 + 0.03, s.flight1.d - 0.01, 0.03, rise * (i + 1) - 0.03, M.stone, 0.008);
    }
    volumes.push({ ...f1, top: (x) => Math.min(H_LANDING, rise / 2 + H_LANDING * (x - f1.x0) / (f1.x1 - f1.x0)), bottom: () => 0 });

    // Площадка: плита 250 мм, под ней свободно (лавка, кашпо, комоды)
    const slab = boxAt(s.landing.cx, s.landing.cy, s.landing.w, s.landing.d, 0.22, H_LANDING - 0.25, M.concrete, 0, { merge: false });
    teleportFloors.push(slab);
    rboxAt(s.landing.cx, s.landing.cy, s.landing.w - 0.01, s.landing.d - 0.01, 0.03, H_LANDING - 0.03, M.stone, 0.008);
    volumes.push({ ...ld, top: () => H_LANDING, bottom: () => H_LANDING - 0.25 });

    // Марш 2: ступени на наклонной плите
    const run2 = (f2.x1 - f2.x0) / steps;
    for (let i = 0; i < steps; i++) {
      const x = f2.x1 - run2 * (i + 1);
      const h = H_LANDING + rise * (i + 1);
      boxAt(x + run2 / 2, s.flight2.cy, run2, s.flight2.d, rise + 0.03, h - rise - 0.06, M.concrete);
      rboxAt(x + run2 / 2 + 0.015, s.flight2.cy, run2 + 0.03, s.flight2.d - 0.01, 0.03, h - 0.03, M.stone, 0.008);
    }
    {
      const a = W(f2.x1, s.flight2.cy, H_LANDING - 0.16), b = W(f2.x0, s.flight2.cy, H_UPPER - 0.16);
      const soffit = BABYLON.MeshBuilder.CreateBox('soffit', { width: V3.Distance(a, b) + 0.1, height: 0.16, depth: s.flight2.d }, scene);
      soffit.position = V3.Center(a, b);
      alignX(soffit, b.subtract(a));
      keep(soffit, M.concrete);
    }
    volumes.push({ ...f2, top: (x) => Math.min(H_UPPER, H_LANDING + rise / 2 + (H_UPPER - H_LANDING) * (f2.x1 - x) / (f2.x1 - f2.x0)), bottom: (top) => top - 0.32 });
    addSeg(f2.x0, f2.y0, f2.x0, f2.y1, 2.4, 99);

    // Ограждения: чёрные стойки, деревянный поручень (визуализации 29, 31)
    const mid = (f1.y0 + f2.y1) / 2;
    stairRail(f1.x0, mid, 0, f1.x1, mid, H_LANDING);
    stairRail(f2.x1, mid, H_LANDING, f2.x0, mid, H_UPPER);
    addSeg(f1.x0, mid, f2.x1, mid, 0, 99, 'rail');
    const openNorth = s.flight1.cy > s.flight2.cy && s.landing.cx < 20;
    if (openNorth) {
      stairRail(f2.x1, f2.y0, H_LANDING, f2.x0, f2.y0, H_UPPER);
      stairRail(ld.x0, ld.y0, H_LANDING, ld.x1, ld.y0, H_LANDING);
      addSeg(f2.x0, f2.y0, f2.x1, f2.y0, H_LANDING - 0.3, 99, 'rail');
      addSeg(ld.x0, ld.y0, ld.x1, ld.y0, H_LANDING - 0.3, 99, 'rail');
    } else {
      stairRail(f1.x0, f1.y1, 0, f1.x1, f1.y1, H_LANDING);
      stairRail(ld.x0, ld.y1, H_LANDING, ld.x1, ld.y1, H_LANDING);
      addSeg(f1.x0, f1.y1, f1.x1, f1.y1, 0, 99, 'rail');
      addSeg(ld.x0, ld.y1, ld.x1, ld.y1, H_LANDING - 0.3, 99, 'rail');
    }
  });
}

function stairRail(ax, ay, ha, bx, by, hb) {
  const L = Math.hypot(bx - ax, by - ay);
  const n = Math.max(2, Math.round(L / 0.13));
  for (let i = 0; i <= n; i++) {
    const t = i / n, h = ha + (hb - ha) * t;
    const bar = Cyl(0.016, 0.9, 8);
    bar.position = W(ax + (bx - ax) * t, ay + (by - ay) * t, h + 0.45);
    keep(bar, M.black);
  }
  // круглый деревянный поручень
  const hand = BABYLON.MeshBuilder.CreateTube('hand', { path: [W(ax, ay, ha + 0.93), W(bx, by, hb + 0.93)], radius: 0.028, tessellation: 16, cap: BABYLON.Mesh.CAP_ALL }, scene);
  keep(hand, M.oak);
  railBeam(ax, ay, bx, by, ha + 0.89, hb + 0.89, 0.03, 0.02, M.black);
  railBeam(ax, ay, bx, by, ha + 0.1, hb + 0.1, 0.03, 0.02, M.black);
}

// Свободная высота над точкой (под площадками и маршами)
function clearanceAt(x, y) {
  let c = 99;
  for (const v of volumes) {
    if (x < v.x0 - 0.3 || x > v.x1 + 0.3 || y < v.y0 - 0.3 || y > v.y1 + 0.3) continue;
    const cx = Math.max(v.x0, Math.min(v.x1, x));
    const top = v.top(cx, y);
    const b = v.bottom(top);
    if (b > 0.05) c = Math.min(c, b);
  }
  return c;
}

// ======================================================================
// Мебель (лист 09: Sigma, Mix, Фрайди, PS006.2 и встроенная мебель)
// ======================================================================
function rayDist(x, y, dx, dy, maxD = 3) {
  let best = maxD;
  for (const s of solids) {
    if (s.tag === 'obj') continue;
    if (s.t === 'seg') {
      const ex = s.bx - s.ax, ey = s.by - s.ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((s.ax - x) * ey - (s.ay - y) * ex) / den;
      const u = ((s.ax - x) * dy - (s.ay - y) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    } else {
      const fx = x - s.cx, fy = y - s.cy;
      const b = fx * dx + fy * dy, c = fx * fx + fy * fy - s.r * s.r, disc = b * b - c;
      if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < best) best = t; }
    }
  }
  return best;
}
function frontAwayFromWall(o) {
  const [a, b] = o.w >= o.d ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
  return rayDist(o.cx, o.cy, -a[0], -a[1]) <= rayDist(o.cx, o.cy, -b[0], -b[1]) ? a : b;
}
const nearest = (o, list) => list.reduce((best, t) => {
  const d = Math.hypot(t.cx - o.cx, t.cy - o.cy);
  return d < best.d ? { d, t } : best;
}, { d: Infinity, t: null }).t;

// Диван Sigma 1500×690×790: гнутый чёрный каркас, бордовые подушки
function sofa(o) {
  const [fx, fy] = frontAwayFromWall(o);
  const len = Math.max(o.w, o.d), dep = Math.min(o.w, o.d);
  const g = group(o.cx, o.cy, fx, fy);
  const zf = dep / 2 - 0.03, zb = -dep / 2 + 0.03;
  [-1, 1].forEach(sx => {
    const x = sx * (len / 2 - 0.025);
    ptube(g, [[x, 0.01, zf], [x, 0.6, zf], [x, 0.6, zb], [x, 0.01, zb]], 0.016, M.black, 0.07);
    ptube(g, [[x, 0.25, zf], [x, 0.25, zb]], 0.012, M.black, 0);
    // мягкий подлокотник
    part(g, R(0.07, 0.04, dep - 0.08, 0.018), M.bordoFabric, x - sx * 0.005, 0.625, 0);
  });
  [zf, zb].forEach(z => ptube(g, [[-len / 2 + 0.025, 0.27, z], [len / 2 - 0.025, 0.27, z]], 0.014, M.black, 0));
  part(g, R(len - 0.07, 0.04, dep - 0.08, 0.01), M.blackMatte, 0, 0.3, 0);
  const cw = (len - 0.1) / 2;
  [-1, 1].forEach(k => {
    part(g, R(cw - 0.01, 0.15, dep - 0.13, 0.05), M.bordoFabric, k * cw / 2, 0.395, 0.035);
    const back = part(g, R(cw - 0.01, 0.4, 0.15, 0.06), M.bordoFabric, k * cw / 2, 0.66, zb + 0.09);
    back.rotation.x = -0.14;
  });
  addRectSolid(o.cx, o.cy, o.w, o.d, 0, 0.8);
}

// Банкетка Фрайди 1800×450×400: подушки, чёрный каркас с ручками, полка из дуба
function bench(o) {
  const len = Math.max(o.w, o.d), dep = Math.min(o.w, o.d);
  const g = group(o.cx, o.cy, o.w >= o.d ? 0 : 1, o.w >= o.d ? 1 : 0);
  const n = Math.max(1, Math.round(len / 0.6));
  const seg = (len - 0.12) / n;
  for (let i = 0; i < n; i++) {
    part(g, R(seg - 0.012, 0.1, dep - 0.05, 0.04), M.navyFabric, -len / 2 + 0.06 + seg * (i + 0.5), 0.36, 0);
  }
  part(g, R(len - 0.06, 0.03, dep - 0.07, 0.008), M.oak, 0, 0.12, 0);
  const zf = dep / 2 - 0.025, zb = -dep / 2 + 0.025;
  [-1, 1].forEach(sx => {
    const x = sx * (len / 2 - 0.025);
    ptube(g, [[x, 0.01, zf], [x, 0.31, zf], [x, 0.31, zb], [x, 0.01, zb]], 0.013, M.black, 0.04);
    // ручка-подлокотник
    ptube(g, [[x, 0.31, zf - 0.05], [x + sx * 0.04, 0.55, zf - 0.07], [x + sx * 0.04, 0.55, zb + 0.07], [x, 0.31, zb + 0.05]], 0.011, M.black, 0.06);
  });
  [zf, zb].forEach(z => ptube(g, [[-len / 2 + 0.025, 0.31, z], [len / 2 - 0.025, 0.31, z]], 0.012, M.black, 0));
  addRectSolid(o.cx, o.cy, o.w, o.d, 0, 0.45);
}

// Круглый столик: дубовая столешница с фаской, основание из чёрных ламелей
function loungeTable(o) {
  const d = Math.max(o.w, o.d), small = d < 0.6;
  const h = small ? 0.5 : 0.6, r = d / 2;
  const g = group(o.cx, o.cy, 0, 1);
  part(g, lathe([[0, 0], [r - 0.012, 0], [r, 0.012], [r, 0.026], [r - 0.012, 0.036], [0, 0.036]], 56), M.oak, 0, h - 0.036, 0);
  part(g, lathe([[0, 0], [r * 0.86, 0], [r * 0.86, 0.025], [0, 0.025]], 48), M.oak, 0, 0.07, 0);
  const n = small ? 10 : 20, rr = r * 0.72;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const slat = part(g, R(0.022, h - 0.04, small ? 0.045 : 0.06, 0.006), M.black, Math.sin(a) * rr, (h - 0.04) / 2, Math.cos(a) * rr);
    slat.rotation.y = a;
  }
  addCircle(o.cx, o.cy, r, 0, h);
}

// Барный стол PS006.2 600×600×750: орех, чёрное витое основание
function cafeTable(o) {
  const g = group(o.cx, o.cy, 0, 1);
  part(g, R(o.w, 0.035, o.d, 0.012), M.walnut, 0, 0.735, 0);
  part(g, lathe([[0, 0], [0.23, 0], [0.23, 0.012], [0.2, 0.022], [0, 0.022]], 40), M.black, 0, 0, 0);
  part(g, Cyl(0.12, 0.02, 24), M.black, 0, 0.71, 0);
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let s = 0; s <= 24; s++) {
      const t = s / 24, a = k / 3 * Math.PI * 2 + t * Math.PI * 1.4;
      const rr = 0.05 + Math.sin(t * Math.PI) * 0.035;
      pts.push([Math.cos(a) * rr, 0.02 + t * 0.69, Math.sin(a) * rr]);
    }
    ptube(g, pts, 0.012, M.black, 0);
  }
  addRectSolid(o.cx, o.cy, o.w, o.d, 0, 0.76);
}

// Стул Mix: бордовая обивка, дубовые ножки и подлокотники, чёрная металлическая спинка
function chair(o, tables) {
  const t = nearest(o, tables);
  const g = group(o.cx, o.cy, t ? t.cx - o.cx : 0, t ? t.cy - o.cy : 1);
  const s = 0.48;
  part(g, R(s, 0.08, s - 0.02, 0.03), M.bordoFabric, 0, 0.46, 0.01);
  const back = part(g, R(s - 0.04, 0.26, 0.07, 0.03), M.bordoFabric, 0, 0.74, -s / 2 + 0.04);
  back.rotation.x = -0.12;
  [-1, 1].forEach(sx => {
    [-1, 1].forEach(sz => {
      const leg = part(g, Cyl(0.032, 0.44, 10, 0.024), M.oak, sx * (s / 2 - 0.035), 0.22, sz * (s / 2 - 0.035));
      leg.rotation.z = sx * 0.04; leg.rotation.x = -sz * 0.04;
    });
    part(g, R(0.045, 0.03, s - 0.02, 0.012), M.oak, sx * (s / 2 + 0.005), 0.66, 0.02);
    ptube(g, [[sx * (s / 2 + 0.005), 0.5, s / 2 - 0.07], [sx * (s / 2 + 0.005), 0.65, s / 2 - 0.07]], 0.009, M.black, 0);
    ptube(g, [[sx * (s / 2 - 0.04), 0.5, -s / 2 + 0.03], [sx * (s / 2 - 0.04), 0.86, -s / 2 - 0.0]], 0.01, M.black, 0);
  });
  addRectSolid(o.cx, o.cy, 0.5, 0.5, 0, 0.9);
}

// Офисное кресло (горчичная обивка, крестовина на роликах)
function officeChair(o, targets) {
  const t = nearest(o, targets);
  const g = group(o.cx, o.cy, t ? t.cx - o.cx : 1, t ? t.cy - o.cy : 0);
  part(g, R(0.5, 0.09, 0.48, 0.04), M.yellowFabric, 0, 0.48, 0.02);
  const back = part(g, R(0.46, 0.52, 0.07, 0.05), M.yellowFabric, 0, 0.84, -0.24);
  back.rotation.x = -0.12;
  ptube(g, [[0, 0.46, -0.1], [0, 0.5, -0.25], [0, 0.62, -0.27]], 0.018, M.black, 0.05);
  [-1, 1].forEach(sx => {
    ptube(g, [[sx * 0.24, 0.5, 0.08], [sx * 0.26, 0.66, 0.06], [sx * 0.26, 0.66, -0.14], [sx * 0.24, 0.5, -0.16]], 0.012, M.black, 0.05);
    part(g, R(0.05, 0.025, 0.22, 0.01), M.leather, sx * 0.26, 0.675, -0.04);
  });
  part(g, Cyl(0.05, 0.36, 16), M.black, 0, 0.26, 0);
  part(g, Cyl(0.035, 0.12, 16), M.steel, 0, 0.4, 0);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const leg = part(g, R(0.035, 0.03, 0.3, 0.012), M.black, Math.sin(a) * 0.15, 0.08, Math.cos(a) * 0.15);
    leg.rotation.y = a;
    part(g, BABYLON.MeshBuilder.CreateSphere('caster', { diameter: 0.05, segments: 8 }, scene), M.black, Math.sin(a) * 0.29, 0.025, Math.cos(a) * 0.29);
  }
  addCircle(o.cx, o.cy, 0.3, 0, 1.0);
}

// Стол охранника: столешница из ореха, чёрный каркас, перфорированный экран к посетителям
function guardDesk(o, chairs) {
  const t = nearest(o, chairs);
  const g = group(o.cx, o.cy, t ? t.cx - o.cx : -1, t ? t.cy - o.cy : 0);
  const len = Math.max(o.w, o.d), dep = Math.min(o.w, o.d);
  part(g, R(len, 0.035, dep, 0.01), M.walnut, 0, 0.755, 0);
  [-1, 1].forEach(sx => {
    ptube(g, [[sx * (len / 2 - 0.03), 0.0, dep / 2 - 0.03], [sx * (len / 2 - 0.03), 0.735, dep / 2 - 0.03], [sx * (len / 2 - 0.03), 0.735, -dep / 2 + 0.03], [sx * (len / 2 - 0.03), 0.0, -dep / 2 + 0.03]], 0.015, M.black, 0.03);
  });
  part(g, R(len - 0.08, 0.6, 0.012, 0.004), finishMat.metal, 0, 0.42, -dep / 2 + 0.03);
  part(g, R(0.55, 0.33, 0.025, 0.008), M.screenFrame, 0.15, 1.0, -0.12);
  part(g, Cyl(0.03, 0.18, 12), M.black, 0.15, 0.84, -0.13);
  part(g, R(0.18, 0.012, 0.12, 0.004), M.black, 0.15, 0.775, -0.13);
  part(g, R(0.42, 0.018, 0.14, 0.006), M.blackMatte, -0.2, 0.782, 0.08, { cast: false });
  part(g, R(0.22, 0.04, 0.16, 0.01), M.white, -0.42, 0.79, 0.12, { cast: false });
  addRectSolid(o.cx, o.cy, o.w, o.d, 0, 0.8);
}

// ---------- Растения ----------
function foliage(x, y, h, size, seed) {
  const r = rng(seed);
  const mats = [M.plantA, M.plantB, M.plantC];
  const base = r() * Math.PI;
  for (let i = 0; i < 3; i++) {
    const p = BABYLON.MeshBuilder.CreatePlane('leafCard', { width: size, height: size }, scene);
    p.position = W(x + (r() - 0.5) * size * 0.12, y + (r() - 0.5) * size * 0.12, h + (r() - 0.5) * size * 0.08);
    p.rotation.y = base + i * Math.PI / 3;
    p.rotation.x = (r() - 0.5) * 0.3;
    keep(p, mats[Math.floor(r() * 3)]);
  }
  const top = BABYLON.MeshBuilder.CreatePlane('leafTop', { width: size * 0.75, height: size * 0.75 }, scene);
  top.position = W(x, y, h + size * 0.16);
  top.rotation.x = Math.PI / 2;
  top.rotation.y = r() * 3;
  keep(top, mats[Math.floor(r() * 3)]);
}

function pot(x, y, d, h, mat) {
  const p = lathe([[0, 0], [d * 0.38, 0], [d * 0.42, 0.03], [d / 2, h - 0.05], [d / 2 + 0.012, h - 0.02], [d / 2 + 0.012, h], [d / 2 - 0.02, h], [d / 2 - 0.03, h - 0.04], [0, h - 0.04]], 36);
  p.position = W(x, y, 0);
  keep(p, mat);
}

// Деревце в кашпо у окна или куст; под лестницами — ниже, чтобы не прорастать сквозь марш
function plant(o, seed) {
  const r = rng(seed);
  const clear = clearanceAt(o.cx, o.cy);
  let big = o.r > 0.45 && clear > 2.7;
  const potD = big ? 0.56 : 0.38, potH = big ? 0.56 : 0.36;
  pot(o.cx, o.cy, potD, potH, big ? M.pot : M.potLight);
  if (big) {
    // ствол с изгибом и ветками
    const trunkPts = [W(o.cx, o.cy, potH - 0.05), W(o.cx + 0.04, o.cy - 0.02, 1.0), W(o.cx - 0.02, o.cy + 0.03, 1.55)];
    keep(BABYLON.MeshBuilder.CreateTube('trunk', { path: trunkPts, radius: 0.028, tessellation: 8, cap: BABYLON.Mesh.CAP_ALL }, scene), M.trunk);
    const tips = [];
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + r();
      const tip = [o.cx + Math.cos(a) * 0.3, o.cy + Math.sin(a) * 0.3, 1.75 + r() * 0.45];
      keep(BABYLON.MeshBuilder.CreateTube('branch', { path: [W(o.cx, o.cy, 1.2 + k * 0.08), W(tip[0], tip[1], tip[2])], radius: 0.012, tessellation: 6 }, scene), M.trunk);
      tips.push(tip);
    }
    tips.forEach((t, k) => foliage(t[0], t[1], t[2], 0.8 + r() * 0.25, seed * 7 + k));
    foliage(o.cx, o.cy, 2.25, 0.85, seed * 7 + 9);
    foliage(o.cx, o.cy, 1.45, 0.75, seed * 7 + 10);
  } else {
    const maxH = Math.min(1.2, clear - 0.12);
    const size = Math.max(0.35, Math.min(0.7, maxH - potH));
    foliage(o.cx, o.cy, potH + size * 0.42, size, seed);
    foliage(o.cx + 0.05, o.cy - 0.04, potH + size * 0.25, size * 0.8, seed + 1);
  }
  addCircle(o.cx, o.cy, potD / 2 + 0.02, 0, big ? 2.4 : 1.1);
}

function planter(o, seed) {
  rboxAt(o.cx, o.cy, o.w, o.d, 0.34, 0, M.walnut, 0.012);
  boxAt(o.cx, o.cy, o.w - 0.04, o.d - 0.04, 0.01, 0.335, M.soil, 0, { cast: false });
  const n = Math.round(Math.max(o.w, o.d) / 0.45);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const x = o.w > o.d ? o.cx + t * o.w : o.cx, y = o.w > o.d ? o.cy : o.cy + t * o.d;
    foliage(x, y, 0.6, 0.48, seed + i);
  }
  addRectSolid(o.cx, o.cy, o.w, o.d, 0, 0.8);
}

// Лавка из МДФ под лестницей: сиденье 500–600 мм на существующем каркасе (лист 09)
function seatBench(pts) {
  const shape = pts.map(p => new V3(p[0], 0, -p[1]));
  const top = BABYLON.MeshBuilder.ExtrudePolygon('seat', { shape, depth: 0.05 }, scene, window.earcut);
  top.position.y = 0.46;
  keep(top, M.mdf);
  const inset = insetPolygon(pts, 0.08);
  const base = BABYLON.MeshBuilder.ExtrudePolygon('seatBase', { shape: inset.map(p => new V3(p[0], 0, -p[1])), depth: 0.41 }, scene, window.earcut);
  base.position.y = 0.41;
  keep(base, M.blackMatte);
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    addSeg(ax, ay, bx, by, 0, 0.5, 'obj');
  }
}
function insetPolygon(pts, d) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n, cy = pts.reduce((s, p) => s + p[1], 0) / n;
  return pts.map(([x, y]) => {
    const dx = cx - x, dy = cy - y, L = Math.hypot(dx, dy) || 1;
    return [x + dx / L * d, y + dy / L * d];
  });
}

function buildFurniture() {
  FUR.sofas.forEach(sofa);
  FUR.benches.forEach(bench);
  const inCafe = t => gypsumPolys.some(p => pointInPoly(t.cx, t.cy, p));
  const round = FUR.tables.filter(t => !inCafe(t));
  const square = FUR.tables.filter(inCafe);
  round.forEach(loungeTable);
  square.forEach(cafeTable);
  FUR.chairs.forEach(c => chair(c, square));
  FUR.officeChairs.forEach(c => officeChair(c, [...FUR.desks, MAN.counter]));
  FUR.desks.forEach(d => guardDesk(d, FUR.officeChairs));
  FUR.plants.filter(p => !FUR.planters.some(k => inRect(p.cx, p.cy, k, 0.15)))
    .forEach((p, i) => plant(p, 100 + i));
  FUR.planters.forEach((p, i) => planter(p, 200 + i * 10));
  FUR.seatBench.forEach(b => seatBench(b.pts));
}

// ======================================================================
// Лавка, кафе, стойки, зеркала, экраны, вывески
// ======================================================================
function screenTex(name, title, sub, accent = '#9c534d') {
  return textTex(name, 1024, 576, c => {
    const g = c.createLinearGradient(0, 0, 1024, 576);
    g.addColorStop(0, '#22324f'); g.addColorStop(1, '#0f1626');
    c.fillStyle = g; c.fillRect(0, 0, 1024, 576);
    c.fillStyle = accent; c.fillRect(0, 0, 18, 576);
    c.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(820 + i * 30, 160 - i * 10, 110 - i * 12, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#ffffff';
    c.font = '700 64px "Segoe UI", Arial, sans-serif';
    c.fillText(title, 70, 250);
    c.fillStyle = '#c9d3e6';
    c.font = '400 34px "Segoe UI", Arial, sans-serif';
    c.fillText(sub, 72, 320);
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.font = '500 26px "Segoe UI", Arial, sans-serif';
    c.fillText('asu.ru', 72, 500);
  });
}

const FACE = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };
function wallPlane(s, y0, y1, mat, off = 0.02) {
  const [nx, ny] = FACE[s.face];
  const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  const p = BABYLON.MeshBuilder.CreatePlane('wp', { width: L, height: y1 - y0 }, scene);
  p.position = W((s.x1 + s.x2) / 2 + nx * off, (s.y1 + s.y2) / 2 + ny * off, (y0 + y1) / 2);
  p.rotation.y = Math.atan2(-nx, ny);
  p.material = mat;
  p.isPickable = false;
  return p;
}
function wallBox(s, y0, y1, depth, mat, off = 0, round = 0) {
  const [nx, ny] = FACE[s.face];
  const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  const b = round ? rbox(L, y1 - y0, depth, round) : B(L, y1 - y0, depth);
  b.position = W((s.x1 + s.x2) / 2 + nx * (off + depth / 2), (s.y1 + s.y2) / 2 + ny * (off + depth / 2), (y0 + y1) / 2);
  b.rotation.y = Math.atan2(-nx, ny);
  return keep(b, mat);
}

function posterTex(name, seed) {
  const r = rng(seed);
  return textTex(name, 512, 1024, c => {
    c.fillStyle = '#efe9df'; c.fillRect(0, 0, 512, 1024);
    const cols = ['#c0392b', '#1f4e8c', '#e3b23c', '#2c2c2c', '#e8e3d9', '#7a2730', '#3d7ea6'];
    for (let i = 0; i < 9; i++) {
      c.fillStyle = cols[Math.floor(r() * cols.length)];
      c.beginPath();
      c.moveTo(r() * 512, r() * 1024); c.lineTo(r() * 512, r() * 1024); c.lineTo(r() * 512, r() * 1024);
      c.closePath(); c.fill();
    }
    c.fillStyle = cols[Math.floor(r() * 3)];
    c.fillRect(40 + r() * 200, 80 + r() * 400, 120 + r() * 150, 200 + r() * 250);
  });
}

// Товары на полках: книги, кружки, свёрнутые футболки, коробки
function product(g, x, y, z, r, kind) {
  const cols = [M.product, M.productA, M.productB, M.productC];
  const m = cols[Math.floor(r() * 4)];
  if (kind === 0) {
    for (let k = 0; k < 4; k++) part(g, R(0.03 + r() * 0.015, 0.2 + r() * 0.05, 0.15, 0.004), cols[Math.floor(r() * 4)], x - 0.05 + k * 0.04, y + 0.11, z, { cast: false });
  } else if (kind === 1) {
    part(g, lathe([[0, 0], [0.04, 0], [0.042, 0.095], [0.036, 0.095], [0.034, 0.008], [0, 0.008]], 20), M.ceramic, x, y, z, { cast: false });
  } else if (kind === 2) {
    for (let k = 0; k < 3; k++) part(g, R(0.24, 0.035, 0.18, 0.015), m, x, y + 0.02 + k * 0.036, z, { cast: false });
  } else {
    part(g, R(0.14, 0.12, 0.1, 0.006), m, x, y + 0.06, z, { cast: false });
  }
}

function buildFixtures() {
  // Витрины лавки в чёрном профиле со стеклом и подсветкой полок, h=2300 + планка с вывеской
  MAN.shopVitrines.forEach((v, i) => {
    const g = group(v.cx, v.cy, 1, 0);
    const len = v.d, dep = v.w;
    part(g, R(len, 2.3, 0.03, 0.005), M.blackMatte, 0, 1.15, -dep / 2 + 0.015);
    [-1, 1].forEach(sx => part(g, R(0.035, 2.3, dep, 0.006), M.black, sx * (len / 2 - 0.018), 1.15, 0));
    part(g, R(len, 0.04, dep, 0.006), M.black, 0, 2.28, 0);
    part(g, R(len, i < 2 ? 0.75 : 0.1, dep, 0.008), i < 2 ? M.walnut : M.black, 0, i < 2 ? 0.375 : 0.05, 0);
    const shelves = i < 2 ? [1.05, 1.45, 1.85] : [0.55, 1.0, 1.45, 1.85];
    const r = rng(300 + i);
    shelves.forEach(h => {
      part(g, B(len - 0.07, 0.012, dep - 0.05), M.glassDark, 0, h, 0, { cast: false });
      part(g, B(len - 0.1, 0.006, 0.016), M.ledShelf, 0, h + 0.36, -dep / 2 + 0.05, { cast: false });
      for (let k = 0; k < 3; k++) product(g, -len / 2 + 0.17 + k * (len - 0.3) / 2.1, h + 0.006, 0.02, r, Math.floor(r() * 4));
    });
    const glass = glassPlane(v.cx + dep / 2, v.cy - len / 2, v.cx + dep / 2, v.cy + len / 2, 0.1, 2.26, M.glassDark);
    glass.isPickable = false;
    addRectSolid(v.cx, v.cy, v.w, v.d, 0, 2.3);
  });

  // Прилавок h=1100: светлый камень, столешница из ореха, касса
  {
    const c = MAN.counter;
    rboxAt(c.cx, c.cy, c.w, c.d, 1.04, 0, M.stone, 0.01);
    rboxAt(c.cx, c.cy, c.w + 0.05, c.d + 0.08, 0.04, 1.04, M.walnut, 0.012);
    boxAt(c.cx, c.cy, c.w - 0.02, c.d + 0.004, 0.08, 0, M.blackMatte, 0, { cast: false });
    const g = group(c.cx - 0.5, c.cy, 0, 1);
    part(g, R(0.3, 0.05, 0.26, 0.012), M.screenFrame, 0, 1.105, 0);
    const scr = part(g, R(0.3, 0.22, 0.02, 0.006), M.screenFrame, 0, 1.25, -0.06);
    scr.rotation.x = 0.35;
    part(g, R(0.16, 0.02, 0.1, 0.006), M.white, 0.25, 1.09, 0.05, { cast: false });
    addRectSolid(c.cx, c.cy, c.w, c.d, 0, 1.1);
  }
  // Холодильные витрины (торговое оборудование)
  MAN.fridgeVitrines.forEach((v, i) => {
    rboxAt(v.cx, v.cy, v.w, v.d, 0.8, 0, M.blackMatte, 0.015);
    boxAt(v.cx, v.cy, v.w - 0.04, v.d - 0.04, 0.02, 0.8, M.steel);
    const g = group(v.cx, v.cy, 0, 1);
    const r = rng(400 + i);
    for (let k = 0; k < 6; k++) product(g, (r() - 0.5) * (v.w - 0.2), 0.82, (r() - 0.5) * (v.d - 0.2), r, 3);
    const gb = BABYLON.MeshBuilder.CreateBox('fg', { width: v.w, height: 0.42, depth: v.d }, scene);
    gb.position = W(v.cx, v.cy, 1.03);
    gb.material = M.glassDark;
    gb.isPickable = false;
    // тонкая чёрная рамка по верхнему периметру стеклянного колпака
    const x0 = v.cx - v.w / 2, x1 = v.cx + v.w / 2, y0 = v.cy - v.d / 2, y1 = v.cy + v.d / 2;
    [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].forEach(([ax, ay, bx, by]) =>
      boxAlong(ax, ay, bx, by, 0.02, 1.225, 1.245, M.black, { round: 0.005, cast: false }));
    addRectSolid(v.cx, v.cy, v.w, v.d, 0, 1.25);
  });

  // Барная стойка h=1200 вдоль окон кафе и высокие стулья
  {
    const b = MAN.barTop;
    rboxAt(b.cx, b.cy, b.w, b.d, 0.045, 1.1, M.oak, 0.012);
    const n = Math.round(b.w / 1.5);
    for (let i = 0; i <= n; i++) {
      const x = b.cx - b.w / 2 + 0.08 + (b.w - 0.16) * i / n;
      rboxAt(x, b.cy, 0.05, b.d - 0.12, 1.1, 0, M.black, 0.01);
    }
    ptube(group(b.cx, b.cy, 0, 1), [[-b.w / 2 + 0.1, 0.25, -b.d / 2 + 0.06], [b.w / 2 - 0.1, 0.25, -b.d / 2 + 0.06]], 0.016, M.black, 0);
    addRectSolid(b.cx, b.cy, b.w, b.d, 0.9, 1.15);
    const roundCols = P.columns.filter(c => c.type === 'round');
    for (let x = b.cx - b.w / 2 + 0.35; x < b.cx + b.w / 2 - 0.3; x += 0.55) {
      const y = b.cy - b.d / 2 - 0.32;
      if (roundCols.some(c => Math.hypot(c.cx - x, c.cy - y) < 0.6)) continue;
      const g = group(x, y, 0, 1);
      part(g, lathe([[0, 0], [0.175, 0], [0.18, 0.02], [0.17, 0.05], [0, 0.055]], 32), M.leather, 0, 0.73, 0);
      const back = part(g, R(0.32, 0.16, 0.03, 0.012), M.leather, 0, 0.93, -0.15);
      back.rotation.x = -0.15;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => {
        ptube(g, [[a * 0.12, 0.73, c * 0.12], [a * 0.17, 0, c * 0.17]], 0.011, M.black, 0);
      });
      ptube(g, [[-0.12, 0.73, -0.12], [-0.12, 0.95, -0.15], [0.12, 0.95, -0.15], [0.12, 0.73, -0.12]], 0.009, M.black, 0.04);
      ptube(g, [[-0.15, 0.28, 0.15], [0.15, 0.28, 0.15]], 0.01, M.black, 0);
      addCircle(x, y, 0.2, 0, 1.0);
    }
  }

  // Вендинговые аппараты (снеки — красный, напитки — тёмный)
  MAN.vending.forEach((v, i) => {
    const g = group(v.cx, v.cy, -1, 0);
    const len = v.d, dep = v.w;
    part(g, R(len, 1.85, dep, 0.02), i ? M.vendingDark : M.vendingRed, 0, 0.925, 0);
    const front = BABYLON.MeshBuilder.CreatePlane('vf', { width: len * 0.6, height: 1.25 }, scene);
    front.rotation.y = Math.PI;
    part(g, front, i ? M.vendFront2 : M.vendFront1, -len * 0.12, 1.15, dep / 2 + 0.004, { cast: false });
    part(g, R(len * 0.62, 1.29, 0.02, 0.008), M.glassDark, -len * 0.12, 1.15, dep / 2 + 0.008, { cast: false });
    part(g, R(0.1, 0.3, 0.02, 0.006), M.screenFrame, len * 0.32, 1.3, dep / 2 + 0.01, { cast: false });
    part(g, R(len * 0.5, 0.18, 0.03, 0.01), M.screenFrame, -len * 0.12, 0.3, dep / 2 + 0.012, { cast: false });
    addRectSolid(v.cx, v.cy, v.w, v.d, 0, 1.9);
  });

  // Комоды под площадкой, навесные шкафы, встроенный мусорный бак
  {
    const s = MAN.storageUnderStair;
    rboxAt(s.cx, s.cy, s.w, s.d, 1.1, 0, M.oak, 0.008);
    const n = Math.round(s.w / 0.5);
    for (let i = 0; i < n; i++) {
      const x = s.cx - s.w / 2 + (i + 0.5) * s.w / n;
      rboxAt(x, s.cy + s.d / 2 + 0.004, s.w / n - 0.006, 0.01, 1.04, 0.04, M.oak, 0.003, 0, { cast: false });
      rboxAt(x, s.cy + s.d / 2 + 0.014, 0.14, 0.012, 0.014, 0.95, M.black, 0.005, 0, { cast: false });
    }
    addRectSolid(s.cx, s.cy, s.w, s.d, 0, 1.1);
    const w = MAN.wallCabinets;
    rboxAt(w.cx, w.cy, w.w, w.d, 0.7, 1.65, M.oak, 0.008);
    boxAt(w.cx, w.cy, w.w - 0.02, 0.02, 0.01, 1.64, M.ledShelf, 0, { cast: false });
    const t = MAN.trashBin;
    rboxAt(t.cx, t.cy, t.w, t.d, 0.9, 0, M.oak, 0.008);
    rboxAt(t.cx - t.w / 2 + 0.005, t.cy, 0.012, t.d * 0.6, 0.06, 0.74, M.blackMatte, 0.004, 0, { cast: false });
    addRectSolid(t.cx, t.cy, t.w, t.d, 0, 0.9);
  }

  // Информационные стойки (белые пилоны с афишами) и экран на стойке у входа
  MAN.infoStands.forEach(o => {
    rboxAt(o.cx, o.cy, 0.5, 0.14, 2.1, 0, M.white, 0.03);
    const poster = BABYLON.MeshBuilder.CreatePlane('ip', { width: 0.42, height: 1.4 }, scene);
    poster.position = W(o.cx, o.cy + 0.072, 1.25);
    poster.material = std('infoPoster' + o.cx.toFixed(1), { emissiveTex: posterTex('ipt' + o.cx, Math.round(o.cx * 10)), unlit: true });
    addRectSolid(o.cx, o.cy, 0.5, 0.14, 0, 2.1);
  });
  {
    const s = MAN.screen;
    const g = group(s.cx, s.cy, 0, 1);
    part(g, R(0.06, 1.1, 0.06, 0.012), M.black, 0, 0.55, -0.05);
    part(g, R(0.55, 0.03, 0.38, 0.01), M.black, 0, 0.015, -0.05);
    part(g, R(s.w, 0.72, 0.05, 0.012), M.screenFrame, 0, 1.45, 0);
    const scr = BABYLON.MeshBuilder.CreatePlane('scr', { width: s.w - 0.05, height: 0.66 }, scene);
    scr.parent = g; scr.position.set(0, 1.45, 0.027); scr.rotation.y = Math.PI;
    scr.material = std('screen1', { emissiveTex: screenTex('st1', 'Добро пожаловать', 'Институт гуманитарных наук АлтГУ'), unlit: true });
    addRectSolid(s.cx, s.cy, s.w, 0.3, 0, 1.9);
  }

  // ТВ на кронштейнах
  MAN.tvs.forEach((t, i) => {
    wallBox(t, 1.4, 2.1, 0.045, M.screenFrame, 0.06, 0.01);
    // кронштейн за экраном
    const mx = (t.x1 + t.x2) / 2, my = (t.y1 + t.y2) / 2, alongY = t.face[1] === 'x';
    wallBox({ face: t.face, x1: alongY ? mx : mx - 0.15, x2: alongY ? mx : mx + 0.15, y1: alongY ? my - 0.15 : my, y2: alongY ? my + 0.15 : my }, 1.6, 1.9, 0.06, M.black);
    const p = wallPlane(t, 1.43, 2.07, std('tv' + i, {
      emissiveTex: screenTex('tvt' + i, i ? 'Расписание событий' : 'Новости ИГН', i ? 'Конференции · лекции · выставки' : 'Приёмная кампания 2025', i ? '#c79a2e' : '#9c534d'),
      unlit: true,
    }), 0.107);
    p.scaling.x = 0.95;
  });

  // Зеркала и декоративные рамы в объёмной металлической раме 2500×100, h от пола 200
  MAN.mirrors.forEach((m, i) => {
    wallBox(m, 0.2, 2.7, 0.1, M.black, 0, 0.012);
    if (m.kind === 'mirror') {
      const p = wallPlane(m, 0.26, 2.64, M.mirror, 0.102);
      p.scaling.x = 0.92;
      mirrorPlanes.push(p);
    } else {
      const p = wallPlane(m, 0.5, 2.3, pbr('poster' + i, { tex: posterTex('pt' + i, 900 + i), rough: 0.6 }), 0.102);
      p.scaling.x = 0.8;
      keep(p, p.material);
    }
  });

  // Логотип АлтГУ: пластик с подсветкой, d=1600, низ на 1000 мм
  FUR.logos.forEach(l => {
    const s = { x1: l.cx - l.w / 2, y1: l.cy, x2: l.cx + l.w / 2, y2: l.cy, face: '-y' };
    const disc = lathe([[0, 0], [0.79, 0], [0.8, 0.01], [0.8, 0.05], [0.79, 0.06], [0, 0.06]], 72);
    disc.rotation.x = -Math.PI / 2;
    disc.position = W(l.cx, l.cy - 0.025, 1.8);
    disc.material = std('logoEdge', { color: '#ffffff', emissive: '#d8e4f5', unlit: true });
    disc.isPickable = false;
    wallPlane(s, 1.0, 2.6, std('logo', { emissiveTex: logoTex(), unlit: true }), 0.088);
  });

  // Надписи: «предъявите пропуск» и вывеска лавки на деревянной планке
  MAN.signs.forEach((s, i) => {
    if (i === 1) wallBox(s, s.h0, s.h1, 0.04, M.walnut, 0, 0.008);
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const h = s.h1 - s.h0;
    const H = Math.round(1024 * h / L);
    const t = textTex('sign' + i, 1024, H, c => {
      c.fillStyle = i ? '#f1e2c6' : '#ffffff';
      const lines = s.text.split('\n');
      const font = sz => `${i ? 500 : 600} ${sz}px "Segoe UI", Arial, sans-serif`;
      c.font = font(100);
      const widest = Math.max(...lines.map(ln => c.measureText(ln).width));
      const size = Math.min(100 * 1024 * 0.9 / widest, H * 0.8 / lines.length / 1.15);
      c.font = font(size);
      c.textBaseline = 'middle';
      const cy = i ? H / 2 : H * 0.28;
      lines.forEach((ln, k) => c.fillText(ln, 1024 * 0.06, cy + (k - (lines.length - 1) / 2) * size * 1.15));
    });
    const m = std('signM' + i, { emissiveTex: t, unlit: true });
    m.opacityTexture = t;
    wallPlane(s, s.h0, s.h1, m, i ? 0.045 : 0.06);
  });
  {
    const t = MAN.tvs[1];
    const tex = textTex('slashes', 256, 256, c => {
      c.fillStyle = '#f1e2c6';
      c.font = '700 200px "Segoe UI", Arial, sans-serif';
      c.fillText('//', 40, 190);
    });
    const m = std('slashM', { emissiveTex: tex, unlit: true });
    m.opacityTexture = tex;
    wallPlane({ x1: t.x1, y1: t.y2 + 0.2, x2: t.x2, y2: t.y2 + 0.6, face: t.face }, 1.7, 2.1, m, 0.03);
  }
}

function logoTex() {
  return textTex('logoT', 1024, 1024, c => {
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(512, 512, 505, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#1f4e9c'; c.lineWidth = 10;
    c.beginPath(); c.arc(512, 512, 470, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(512, 512, 330, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#1f4e9c';
    c.font = '700 64px "Segoe UI", Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const text = 'АЛТАЙСКИЙ ГОСУДАРСТВЕННЫЙ УНИВЕРСИТЕТ';
    const arc = Math.PI * 1.55;
    for (let i = 0; i < text.length; i++) {
      const a = -Math.PI / 2 - arc / 2 + arc * i / (text.length - 1);
      c.save(); c.translate(512 + Math.cos(a) * 400, 512 + Math.sin(a) * 400); c.rotate(a + Math.PI / 2);
      c.fillText(text[i], 0, 0); c.restore();
    }
    c.font = '700 58px "Segoe UI", Arial, sans-serif';
    c.fillText('· 1973 ·', 512, 905);
    c.beginPath();
    c.moveTo(300, 560); c.quadraticCurveTo(420, 380, 520, 470); c.quadraticCurveTo(600, 330, 740, 380);
    c.quadraticCurveTo(640, 420, 610, 520); c.quadraticCurveTo(560, 640, 470, 650); c.quadraticCurveTo(420, 580, 300, 560);
    c.fill();
    c.font = '700 96px "Segoe UI", Arial, sans-serif';
    c.fillText('АлтГУ', 512, 760);
  });
}

// ======================================================================
// Холл музея за витражом
// ======================================================================
function buildMuseum() {
  const x0 = BOUNDS.x0;
  addQuad('gray', x0, 0.25, x0, 7.67, 0, H_HALL, 1, 0);
  addQuad('gray', x0, 7.67, 0.06, 7.67, 0, H_HALL, 0, -1);
  baseboard(x0, 0.25, x0, 7.67, 1, 0);
  baseboard(x0, 7.67, 0.06, 7.67, 0, -1);
  [[-1.4, 1.9], [-1.4, 3.8], [-1.4, 5.7], [-4.2, 3.8]].forEach(([x, y], i) => {
    rboxAt(x, y, 1.2, 0.6, 0.85, 0, M.blackMatte, 0.01);
    const gb = BABYLON.MeshBuilder.CreateBox('mv', { width: 1.2, height: 0.4, depth: 0.6 }, scene);
    gb.position = W(x, y, 1.05);
    gb.material = M.glassDark;
    gb.isPickable = false;
    rboxAt(x - 0.25, y, 0.18, 0.12, 0.1 + i * 0.04, 0.86, M.productC, 0.01);
    rboxAt(x + 0.2, y, 0.22, 0.2, 0.06, 0.86, M.product, 0.01);
  });
  [1.6, 3.8, 6.0].forEach(y => rboxAt(x0 + 0.04, y, 0.04, 1.1, 1.3, 1.0, M.white, 0.01));
  [[-1.6, 2.4], [-1.6, 5.4], [-4.4, 2.4], [-4.4, 5.4]].forEach(([x, y]) =>
    boxAt(x, y, 0.6, 0.6, 0.025, H_HALL - 0.022, M.panel, 0, { cast: false }));
}

// ======================================================================
// Сборка сцены
// ======================================================================
function build() {
  buildWalls();
  buildOpenings();
  buildStairs();
  buildFloorAndCeilings();
  buildFurniture();
  buildFixtures();
  buildMuseum();
  flushWallBuckets();

  // Объединение статики по материалу: десятки draw call'ов вместо тысяч
  const byMat = new Map();
  statics.forEach(s => {
    if (!byMat.has(s.mat)) byMat.set(s.mat, { cast: [], nocast: [] });
    byMat.get(s.mat)[s.cast ? 'cast' : 'nocast'].push(s.mesh);
  });
  byMat.forEach((g, mat) => {
    [['cast', true], ['nocast', false]].forEach(([k, cast]) => {
      const list = g[k];
      if (!list.length) return;
      const m = list.length === 1 ? list[0] : BABYLON.Mesh.MergeMeshes(list, true, true);
      if (!m) return;
      m.setParent(null);
      m.material = mat;
      m.receiveShadows = true;
      m.isPickable = false;
      if (cast) casters.push(m);
      m.freezeWorldMatrix();
    });
  });
  scene.transformNodes.slice().forEach(t => {
    t.getChildren().slice().forEach(ch => ch.setParent(null));
    t.dispose();
  });
}

// ======================================================================
// Свет, тени, отражения, постобработка
// ======================================================================
let camera, pipeline, hemi;
function setupLighting() {
  // Заполняющий свет нужен только пока не снято окружение; потом его заменяет кубкарта холла
  hemi = new BABYLON.HemisphericLight('hemi', new V3(0, 1, 0), scene);
  hemi.intensity = 0.9;
  hemi.diffuse = C3('#fff8ee');
  hemi.groundColor = C3('#8d8880');
  hemi.specular = BABYLON.Color3.Black();

  // Ключевой свет почти сверху — от потолочных панелей: мягкие тени под мебелью
  const key = new BABYLON.DirectionalLight('key', new V3(0.08, -1, 0.12).normalize(), scene);
  key.position = W(15, 8, 12);
  key.intensity = 0.7;
  key.diffuse = C3('#fff2e2');
  key.specular = C3('#fff2e2');
  key.autoCalcShadowZBounds = true;
  const sg = new BABYLON.ShadowGenerator(LOW ? 2048 : 4096, key);
  sg.usePercentageCloserFiltering = true;
  sg.filteringQuality = LOW ? BABYLON.ShadowGenerator.QUALITY_LOW : BABYLON.ShadowGenerator.QUALITY_HIGH;
  sg.bias = 0.0005;
  sg.normalBias = 0.012;
  sg.darkness = 0.25;
  // контактные тени от мебели и деталей у пола; стены (уходят выше потолка), абажуры и листва
  // давали бы длинные пятна через весь холл
  const noShadow = new Set([...Object.values(finishMat), M.slatsBlack, M.slatsMustard, M.plantA, M.plantB, M.plantC, M.trunk, M.frost, M.pvc]);
  casters.filter(m => !noShadow.has(m.material)).forEach(m => sg.addShadowCaster(m, false));

  // Рассеянный дневной свет от матовых окон фасада (без теней)
  const day = new BABYLON.DirectionalLight('day', new V3(0.15, -0.35, -1).normalize(), scene);
  day.intensity = 0.35;
  day.diffuse = C3('#eef3f7');
  day.specular = BABYLON.Color3.Black();

  const glow = new BABYLON.GlowLayer('glow', scene, { mainTextureSamples: LOW ? 1 : 2, blurKernelSize: 48 });
  glow.intensity = 0.32;
  glow.customEmissiveColorSelector = (mesh, sub, mat, result) => {
    if (mat === M.panel || mat === M.bulb || mat === M.ledShelf) result.copyFromFloats(1, 0.95, 0.88, 1);
    else result.set(0, 0, 0, 0);
  };
}

// Окружение для PBR: кубкарта холла, снятая один раз из его центра (HDR, линейное пространство).
// Коробочная проекция на объём холла делает отражения в полу, металле и зеркалах «на своих местах».
function captureEnvironment(onDone) {
  if (params.has('noenv')) { onDone(); return; }
  const probe = new BABYLON.ReflectionProbe('probe', LOW ? 128 : 256, scene, true, true, true);
  probe.position = W(17.6, 4.1, 1.6);
  probe.refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  scene.meshes.forEach(m => { if (!mirrorPlanes.includes(m)) probe.renderList.push(m); });
  const env = probe.cubeTexture;
  env.boundingBoxSize = new V3(35.5, 2.9, 7.7);
  env.boundingBoxPosition = W(17.6, 4.1, 1.45);
  env.onAfterUnbindObservable.addOnce(() => {
    // снимок готов — больше не перерисовываем его (иначе материалы читали бы текстуру, в которую пишут)
    const i = scene.reflectionProbes.indexOf(probe);
    if (i >= 0) scene.reflectionProbes.splice(i, 1);
    // заранее считаем рассеянную составляющую (сферические гармоники) — чтение пикселей кубкарты
    // не должно совпасть с кадром, где она уже подключена к материалам
    const t0 = performance.now();
    const waitSH = () => {
      if (!env.sphericalPolynomial && performance.now() - t0 < 3000) { setTimeout(waitSH, 30); return; }
      apply();
    };
    setTimeout(waitSH, 0);
    const apply = () => {
      scene.environmentTexture = env;
      scene.environmentIntensity = 0.55;
      pbrMats.forEach(m => {
        if (!LOW) {
          m.realTimeFiltering = true;
          m.realTimeFilteringQuality = BABYLON.Constants.TEXTURE_FILTERING_QUALITY_LOW;
        }
      });
      hemi.intensity = 0.12;
      onDone();
    };
  });
  // снимаем вне кадра основной отрисовки, чтобы её буферы не были привязаны в этот момент
  setTimeout(() => env.render(), 0);
}

function setupCamera() {
  camera = new BABYLON.UniversalCamera('cam', W(0, 0, EYE), scene);
  camera.inputs.clear();
  camera.minZ = 0.05;
  camera.maxZ = 120;
  camera.fov = isTouch ? 1.1 : 1.05;
  scene.activeCamera = camera;

  pipeline = new BABYLON.DefaultRenderingPipeline('dp', true, scene, [camera]);
  pipeline.samples = LOW ? 1 : 4;
  pipeline.fxaaEnabled = LOW;
  pipeline.imageProcessingEnabled = true;
  const ip = pipeline.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 0.95;
  ip.contrast = 1.18;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 0.7;
  ip.vignetteColor = new BABYLON.Color4(0.08, 0.06, 0.05, 0);
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.92;
  pipeline.bloomWeight = 0.14;
  pipeline.bloomKernel = 64;
  pipeline.bloomScale = 0.5;
  pipeline.sharpenEnabled = !LOW;
  if (!LOW) pipeline.sharpen.edgeAmount = 0.1;

  if (!LOW && BABYLON.SSAO2RenderingPipeline.IsSupported) {
    const ssao = new BABYLON.SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.75, blurRatio: 1 }, [camera]);
    ssao.radius = 0.7;
    ssao.totalStrength = 1.0;
    ssao.base = 0.15;
    ssao.samples = 24;
    ssao.maxZ = 60;
    ssao.expensiveBlur = true;
  }
}

// ======================================================================
// Игрок: движение, столкновения, опора на лестницы
// ======================================================================
const player = { x: 12.9, y: 4.2, feet: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0.05, bob: 0 };
const keys = new Set();
let started = false, flying = null, inXR = false, tour = null;
const touchMove = { x: 0, y: 0 };

function groundAt(x, y, feet) {
  let g = 0;
  for (const v of volumes) {
    if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
    const t = v.top(Math.max(v.x0, Math.min(v.x1, x)), y);
    if (t <= feet + STEP && t > g) g = t;
  }
  return g;
}
const blocks = (y0, y1, feet) => y0 < feet + BODY && y1 > feet + STEP;

function resolve(px, py, feet) {
  for (let iter = 0; iter < 4; iter++) {
    for (const s of solids) {
      if (!blocks(s.y0, s.y1, feet)) continue;
      if (s.t === 'seg') {
        const ex = s.bx - s.ax, ey = s.by - s.ay;
        const len2 = ex * ex + ey * ey || 1e-9;
        let t = ((px - s.ax) * ex + (py - s.ay) * ey) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = s.ax + ex * t, cy = s.ay + ey * t;
        let dx = px - cx, dy = py - cy;
        const d = Math.hypot(dx, dy);
        if (d < RADIUS) {
          if (d < 1e-6) { dx = -ey; dy = ex; }
          const k = (RADIUS - d) / (Math.hypot(dx, dy) || 1);
          px += dx * k; py += dy * k;
        }
      } else {
        const dx = px - s.cx, dy = py - s.cy, d = Math.hypot(dx, dy), min = s.r + RADIUS;
        if (d < min && d > 1e-6) { px = s.cx + dx / d * min; py = s.cy + dy / d * min; }
      }
    }
    for (const v of volumes) {
      const cx = Math.max(v.x0, Math.min(v.x1, px)), cy = Math.max(v.y0, Math.min(v.y1, py));
      const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
      if (d >= RADIUS) continue;
      const top = v.top(cx, cy), bottom = v.bottom(top);
      if (!blocks(bottom, top, feet)) continue;
      if (d > 1e-6) {
        px = cx + dx / d * RADIUS; py = cy + dy / d * RADIUS;
      } else {
        const o = [[px - v.x0, -1, 0], [v.x1 - px, 1, 0], [py - v.y0, 0, -1], [v.y1 - py, 0, 1]].sort((a, b) => a[0] - b[0])[0];
        px += o[1] * (o[0] + RADIUS); py += o[2] * (o[0] + RADIUS);
      }
    }
  }
  return [px, py];
}

function isFree(x, y) {
  const [rx, ry] = resolve(x, y, 0);
  return Math.hypot(rx - x, ry - y) < 0.02 && x > BOUNDS.x0 + 6.3 && y > 0.3 && y < 15.3;
}

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function update(dt) {
  if (flying) {
    flying.t = Math.min(1, flying.t + dt / flying.dur);
    const e = ease(flying.t);
    player.x = flying.x0 + (flying.x1 - flying.x0) * e;
    player.y = flying.y0 + (flying.y1 - flying.y0) * e;
    player.feet = flying.f0 + (flying.f1 - flying.f0) * e;
    let dyaw = flying.yaw1 - flying.yaw0;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    player.yaw = flying.yaw0 + dyaw * e;
    player.pitch = flying.p0 + (flying.p1 - flying.p0) * e;
    if (flying.t >= 1) { const done = flying.onDone; flying = null; if (done) done(); }
    player.vx = player.vy = 0;
    return;
  }
  if (tour && tour.dwell > 0) {
    tour.dwell -= dt;
    player.yaw += dt * 0.06;     // медленная панорама на остановке экскурсии
    if (tour.dwell <= 0) tourNext();
  }
  let mx = 0, my = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  mx += touchMove.x; my += touchMove.y;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  const usingJoy = touchMove.x !== 0 || touchMove.y !== 0;
  const speed = usingJoy ? 2.0 : (keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK);
  const fx = Math.sin(player.yaw), fy = -Math.cos(player.yaw);
  const rx = Math.cos(player.yaw), ry = Math.sin(player.yaw);
  const tvx = (fx * my + rx * mx) * speed, tvy = (fy * my + ry * mx) * speed;
  const acc = ml > 0.01 ? 9 : 11;
  player.vx += (tvx - player.vx) * Math.min(1, dt * acc);
  player.vy += (tvy - player.vy) * Math.min(1, dt * acc);

  const steps = Math.ceil(Math.hypot(player.vx, player.vy) * dt / 0.08) || 1;
  for (let i = 0; i < steps; i++) {
    const nx = player.x + player.vx * dt / steps, ny = player.y + player.vy * dt / steps;
    [player.x, player.y] = resolve(nx, ny, player.feet);
    const g = groundAt(player.x, player.y, player.feet);
    if (g > player.feet) player.feet = Math.min(g, player.feet + Math.max(0.02, (g - player.feet) * 0.6));
  }
  const g = groundAt(player.x, player.y, player.feet);
  if (g < player.feet) {
    player.vz = Math.min(player.vz + 9.8 * dt, 8);
    player.feet = Math.max(g, player.feet - player.vz * dt);
  } else player.vz = 0;
  player.bob += Math.hypot(player.vx, player.vy) * dt * 5.2;
}

function applyCamera() {
  const v = Math.hypot(player.vx, player.vy);
  const bob = Math.sin(player.bob) * 0.02 * Math.min(1, v / WALK);
  camera.position.copyFrom(W(player.x, player.y, player.feet + EYE + bob));
  camera.rotation.set(player.pitch, player.yaw, Math.sin(player.bob * 0.5) * 0.004 * Math.min(1, v / WALK));
}

function flyTo(x, y, lookX, lookY, pitch = 0.05, feet = 0, onDone, slow = false) {
  const dist = Math.hypot(x - player.x, y - player.y);
  flying = {
    t: 0, dur: slow ? Math.min(5, 1.6 + dist * 0.18) : Math.min(1.8, 0.6 + dist * 0.05),
    x0: player.x, y0: player.y, x1: x, y1: y, f0: player.feet, f1: feet,
    yaw0: player.yaw, yaw1: yawTo(lookX - x, lookY - y), p0: player.pitch, p1: pitch, onDone,
  };
}

// ======================================================================
// Ввод
// ======================================================================
const SENS = 0.0022;
function lockPointer() {
  if (isTouch || document.pointerLockElement === canvas || !canvas.requestPointerLock) return;
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (e) { /* захват недоступен — работает перетаскивание */ }
}
function look(dx, dy, k = SENS) {
  player.yaw += dx * k;
  player.pitch = Math.max(-1.3, Math.min(1.3, player.pitch + dy * k));
}
function userActed() { if (tour) stopTour(); }

function setupInput() {
  addEventListener('keydown', e => {
    if (!started) return;
    keys.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyM') mapWrap.style.display = mapWrap.style.display === 'none' ? '' : 'none';
    if (e.code === 'KeyH') document.body.classList.toggle('hide-ui');
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code) || e.code.startsWith('Arrow')) userActed();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', e => {
    if (!started || e.pointerType === 'touch') return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.focus();
    lockPointer();
    userActed();
  });
  addEventListener('pointerup', () => { dragging = false; });
  addEventListener('pointermove', e => {
    if (!started || flying || e.pointerType === 'touch') return;
    if (document.pointerLockElement === canvas) look(e.movementX, e.movementY);
    else if (dragging) { look(e.clientX - lastX, e.clientY - lastY, 0.0025); lastX = e.clientX; lastY = e.clientY; }
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    document.body.classList.toggle('locked', locked);
    document.getElementById('paused').style.display = started && !locked && !isTouch ? 'block' : 'none';
  });

  const joy = document.getElementById('joy'), base = document.getElementById('joy-base'), knob = document.getElementById('joy-knob');
  let joyId = null, jx = 0, jy = 0;
  joy.addEventListener('pointerdown', e => {
    joyId = e.pointerId; jx = e.clientX; jy = e.clientY;
    try { joy.setPointerCapture(e.pointerId); } catch (err) { /* без захвата тоже работает */ }
    base.style.display = knob.style.display = 'block';
    base.style.left = knob.style.left = jx + 'px';
    base.style.top = knob.style.top = jy + 'px';
    userActed();
  });
  joy.addEventListener('pointermove', e => {
    if (e.pointerId !== joyId) return;
    let dx = e.clientX - jx, dy = e.clientY - jy;
    const d = Math.hypot(dx, dy), max = 55;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    knob.style.left = jx + dx + 'px'; knob.style.top = jy + dy + 'px';
    touchMove.x = dx / max; touchMove.y = -dy / max;
  });
  const endJoy = e => {
    if (e.pointerId !== joyId) return;
    joyId = null; touchMove.x = touchMove.y = 0;
    base.style.display = knob.style.display = 'none';
  };
  joy.addEventListener('pointerup', endJoy);
  joy.addEventListener('pointercancel', endJoy);

  const lookTouches = new Map();
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    lookTouches.set(e.pointerId, [e.clientX, e.clientY]);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* без захвата тоже работает */ }
    userActed();
  });
  canvas.addEventListener('pointermove', e => {
    const p = lookTouches.get(e.pointerId);
    if (!p || flying) return;
    look(e.clientX - p[0], e.clientY - p[1], 0.005);
    lookTouches.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const endLook = e => lookTouches.delete(e.pointerId);
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);
}

// ======================================================================
// Зоны, экскурсия, подписи, мини-карта
// ======================================================================
const ZONES = [
  { name: 'Вход', pos: [14.3, 3.75], look: [22, 2.6],
    info: 'Входная группа: проходы по временным и постоянным пропускам, ограждение из нержавеющей стали h=1000.' },
  { name: 'Вахта', pos: [10.4, 4.25], look: [6.4, 2.2],
    info: 'Помещение вахтёра за стеклянной перегородкой в чёрном профиле: ключи и оформление пропусков. Акцент — Sanderson Bengal Red.' },
  { name: 'Зона отдыха', pos: [18.2, 5.7], look: [24.5, 1.5],
    info: 'Диваны Sigma, банкетки Фрайди и столики с ламелями у окон. Колонны в перфорированном металле, подвесы из деревянных ламелей.' },
  { name: 'Зеркала и лого', pos: [19.5, 4.2], look: [21.5, 7.6],
    info: 'Зеркала в объёмных металлических рамах 2500 мм и логотип АлтГУ с подсветкой, d=1600 мм.' },
  { name: 'Кафе', pos: [26.0, 9.0], look: [32, 13.8],
    info: 'Стулья Mix за столами PS006.2, барная стойка h=1200 вдоль окон, светильники «ммм» между колоннами.' },
  { name: 'Лавка', pos: [26.0, 13.3], look: [22.6, 12.0],
    info: 'Университетская лавка: витрины с подсветкой полок h=2650, прилавок h=1100 и холодильные витрины.' },
  { name: 'Лестница', pos: [4.5, 6.85], look: [9.3, 6.85], pitch: -0.18,
    info: 'Лестница на второй этаж, площадка на отметке +1,540. Под площадкой — лавка из МДФ и кашпо с зеленью.' },
  { name: 'Музей', pos: [1.6, 4.0], look: [-3.5, 4.0],
    info: 'Новый витраж в холл музея.' },
];

const caption = document.getElementById('caption');
let captionTimer = 0;
function showCaption(z) {
  caption.innerHTML = `<b>${z.name}</b><span>${z.info}</span>`;
  caption.classList.add('show');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => caption.classList.remove('show'), 7000);
}

function goZone(z, slow = false, onDone) {
  flyTo(z.pos[0], z.pos[1], z.look[0], z.look[1], z.pitch ?? 0.04, 0, () => { showCaption(z); if (onDone) onDone(); }, slow);
}

const tourBtn = document.getElementById('tour');
function startTour() {
  tour = { i: -1, dwell: 0 };
  tourBtn.textContent = '■ Стоп';
  tourBtn.classList.add('active');
  tourNext();
}
function tourNext() {
  if (!tour) return;
  tour.i = (tour.i + 1) % ZONES.length;
  tour.dwell = 0;
  goZone(ZONES[tour.i], true, () => { if (tour) tour.dwell = 6; });
}
function stopTour() {
  tour = null;
  tourBtn.textContent = '▶ Экскурсия';
  tourBtn.classList.remove('active');
}

const mapCanvas = document.getElementById('map');
const mapWrap = document.getElementById('map-wrap');
let mapScale = 1, mapCtx, mapBg;
const MAP = { x0: -1, x1: 35.6, y0: -0.4, y1: 15.9 };

function setupMap() {
  const w = isTouch ? 210 : 300;
  mapScale = w / (MAP.x1 - MAP.x0);
  const h = Math.round((MAP.y1 - MAP.y0) * mapScale);
  const dpr = Math.min(2, devicePixelRatio || 1);
  mapCanvas.width = w * dpr; mapCanvas.height = h * dpr;
  mapCanvas.style.width = w + 'px'; mapCanvas.style.height = h + 'px';
  mapCtx = mapCanvas.getContext('2d');
  mapCtx.scale(dpr, dpr);
  mapBg = document.createElement('canvas');
  mapBg.width = w * dpr; mapBg.height = h * dpr;
  const c = mapBg.getContext('2d');
  c.scale(dpr, dpr);
  const X = x => (x - MAP.x0) * mapScale, Y = y => (y - MAP.y0) * mapScale;
  c.fillStyle = 'rgba(232,227,218,.16)';
  c.fillRect(X(0), Y(0.25), X(28.9) - X(0), Y(7.95) - Y(0.25));
  c.fillRect(X(28.9), Y(5.3), X(35) - X(28.9), Y(7.95) - Y(5.3));
  c.fillRect(X(22.4), Y(7.65), X(35) - X(22.4), Y(15.3) - Y(7.65));
  const rect = (o, col) => { c.fillStyle = col; c.fillRect(X(o.cx - o.w / 2), Y(o.cy - o.d / 2), o.w * mapScale, o.d * mapScale); };
  MAN.stairs.forEach(s => {
    [s.flight1, s.flight2].forEach(f => {
      rect(f, 'rgba(200,195,186,.35)');
      c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 0.6;
      for (let i = 1; i < 10; i++) {
        const x = X(f.cx - f.w / 2 + f.w * i / 10);
        c.beginPath(); c.moveTo(x, Y(f.cy - f.d / 2)); c.lineTo(x, Y(f.cy + f.d / 2)); c.stroke();
      }
    });
    rect(s.landing, 'rgba(200,195,186,.25)');
  });
  [...FUR.sofas, ...FUR.chairs].forEach(o => rect(o, '#9c534d'));
  FUR.benches.forEach(o => rect(o, '#4a5d8a'));
  FUR.tables.forEach(o => rect(o, '#c9a77c'));
  [...MAN.shopVitrines, MAN.counter, MAN.barTop, ...MAN.vending, ...MAN.fridgeVitrines].forEach(o => rect(o, 'rgba(255,255,255,.35)'));
  c.fillStyle = '#6b9a52';
  FUR.plants.forEach(p => { c.beginPath(); c.arc(X(p.cx), Y(p.cy), Math.max(1.5, p.r * mapScale * 0.7), 0, 7); c.fill(); });
  c.strokeStyle = 'rgba(220,232,238,.9)'; c.lineWidth = 1.5;
  [...MAN.windows, ...MAN.vitrage].forEach(s => { c.beginPath(); c.moveTo(X(s.x1), Y(s.y1)); c.lineTo(X(s.x2), Y(s.y2)); c.stroke(); });
  c.fillStyle = '#e9e5de';
  P.walls.forEach(pts => {
    c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))); c.closePath(); c.fill();
  });
  P.columns.forEach(o => {
    if (o.type === 'round') { c.beginPath(); c.arc(X(o.cx), Y(o.cy), o.r * mapScale, 0, 7); c.fill(); }
    else rect(o, '#e9e5de');
  });
  c.strokeStyle = '#e9e5de'; c.lineWidth = 1.2;
  [...P.partitions, MAN.vakhtaFront, MAN.glassBlocks, ...MAN.extraWalls].forEach(s => { c.beginPath(); c.moveTo(X(s.x1), Y(s.y1)); c.lineTo(X(s.x2), Y(s.y2)); c.stroke(); });
  c.strokeStyle = '#b48a5a';
  MAN.doors.forEach(s => { c.beginPath(); c.moveTo(X(s.x1), Y(s.y1)); c.lineTo(X(s.x2), Y(s.y2)); c.stroke(); });

  mapCanvas.addEventListener('click', e => {
    const r = mapCanvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / mapScale + MAP.x0, y = (e.clientY - r.top) / mapScale + MAP.y0;
    if (!started) return;
    userActed();
    if (isFree(x, y)) flyTo(x, y, x + Math.sin(player.yaw), y - Math.cos(player.yaw), player.pitch);
  });
}

function drawMap() {
  if (mapWrap.style.display === 'none') return;
  mapCtx.save();
  mapCtx.setTransform(1, 0, 0, 1, 0, 0);
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  mapCtx.drawImage(mapBg, 0, 0);
  mapCtx.restore();
  const X = (player.x - MAP.x0) * mapScale, Y = (player.y - MAP.y0) * mapScale;
  mapCtx.save();
  mapCtx.translate(X, Y);
  mapCtx.rotate(player.yaw);
  mapCtx.fillStyle = 'rgba(255,214,120,.22)';
  mapCtx.beginPath(); mapCtx.moveTo(0, 0); mapCtx.arc(0, 0, 34, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); mapCtx.closePath(); mapCtx.fill();
  mapCtx.fillStyle = '#ffd36e';
  mapCtx.beginPath(); mapCtx.moveTo(0, -7); mapCtx.lineTo(5, 5); mapCtx.lineTo(0, 2.5); mapCtx.lineTo(-5, 5); mapCtx.closePath(); mapCtx.fill();
  mapCtx.restore();
}

function setupZones() {
  const nav = document.getElementById('zones');
  ZONES.forEach(z => {
    const b = document.createElement('button');
    b.textContent = z.name;
    b.addEventListener('click', () => {
      if (!started) return;
      stopTour();
      goZone(z);
      canvas.focus();
    });
    nav.appendChild(b);
  });
  tourBtn.addEventListener('click', () => { if (!started) return; tour ? stopTour() : startTour(); });
  const q = document.getElementById('quality');
  q.textContent = LOW ? 'Качество: обычное' : 'Качество: высокое';
  q.addEventListener('click', () => {
    const u = new URL(location.href);
    u.searchParams.set('q', LOW ? 'high' : 'low');
    location.href = u.toString();
  });
}

// ======================================================================
// VR (WebXR): телепорт по полу и площадкам
// ======================================================================
async function setupXR() {
  if (!navigator.xr) return;
  try {
    const supported = await navigator.xr.isSessionSupported('immersive-vr');
    if (!supported) return;
    const xr = await scene.createDefaultXRExperience({
      floorMeshes: teleportFloors,
      uiOptions: { sessionMode: 'immersive-vr' },
    });
    // при входе Babylon сам переносит VR-камеру в текущую точку обзора
    xr.baseExperience.onStateChangedObservable.add(state => {
      inXR = state === BABYLON.WebXRState.IN_XR;
      document.body.classList.toggle('hide-ui', inXR);
    });
  } catch (e) {
    console.warn('WebXR недоступен:', e);
  }
}

// ======================================================================
// Запуск
// ======================================================================
const startBtn = document.getElementById('start');
setTimeout(() => {
  build();
  setupCamera();
  setupLighting();
  setupInput();
  setupMap();
  setupZones();
  setupXR();
  const z = ZONES[0];
  player.x = z.pos[0]; player.y = z.pos[1];
  player.yaw = yawTo(z.look[0] - z.pos[0], z.look[1] - z.pos[1]);
  applyCamera();

  let last = performance.now(), mapTick = 0;
  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!inXR) {
      if (started) update(dt);
      applyCamera();
      if ((mapTick += dt) > 1 / 30) { mapTick = 0; drawMap(); }
    }
    scene.render();
  });
  // 1) все шейдеры готовы → 2) снимаем окружение → 3) материалы пересобираются с ним → можно гулять
  startBtn.textContent = 'Строим освещение…';
  scene.executeWhenReady(() => captureEnvironment(() => scene.executeWhenReady(() => {
    startBtn.disabled = false;
    startBtn.textContent = isTouch ? 'Начать прогулку' : 'Начать прогулку — клик захватит мышь';
  })));
}, 30);

startBtn.addEventListener('click', () => {
  started = true;
  document.getElementById('intro').style.display = 'none';
  canvas.focus();
  lockPointer();
  showCaption(ZONES[0]);
});
addEventListener('resize', () => engine.resize());

window.HALL = { scene, player, flyTo, solids, volumes, isFree, ZONES, goZone };
})();
