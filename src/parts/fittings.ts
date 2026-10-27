import type { Manifold } from 'manifold-3d';
import { M } from '../geom/manifold';
import type { Params, PartDef } from './def';
import { block, clearance, cyl, hex, num, select, union } from './util';
import { THREADS, internalThreadCut, threadSolid, type ThreadSpec } from './threads';

// ------------------------------------------------------------------ cable gland
/** Gland sizes with the cable range each one seals. */
const GLANDS: { key: string; thread: string; min: number; max: number }[] = [
  { key: 'M12', thread: 'M12x1.5', min: 3, max: 6.5 },
  { key: 'PG7', thread: 'PG7', min: 3, max: 6.5 },
  { key: 'M16', thread: 'M16x1.5', min: 4, max: 8 },
  { key: 'PG9', thread: 'PG9', min: 4, max: 8 },
  { key: 'M20', thread: 'M20x1.5', min: 6, max: 12 },
  { key: 'M25', thread: 'M25x1.5', min: 9, max: 16 },
];

export function glandSize(p: Params) {
  const cable = num(p, 'cable');
  if (p.size !== 'auto') return GLANDS.find((g) => g.key === p.size) ?? GLANDS[0];
  return GLANDS.filter((g) => !g.key.startsWith('PG')).find((g) => cable <= g.max) ?? GLANDS[GLANDS.length - 1];
}

/**
 * Gland in its own frame: the wall's outer surface is z = 0, the wall goes down to z = -wall.
 * Body (flange outside, threads both sides), lock nut inside, cap nut squeezing a TPU seal.
 */
function gland(p: Params): Manifold {
  const g = glandSize(p);
  const s: ThreadSpec = THREADS[g.thread];
  const d = s.d, P = s.p, luz = num(p, 'luz');
  const cable = num(p, 'cable'), wall = num(p, 'wall');
  const af = Math.round(d * 1.35 + 3);
  const fh = 4; // flange height
  const nutH = Math.max(4, Math.round(d * 0.4));
  const lowerL = wall + nutH + 1.5;
  const upperL = 10;
  const minor = d - 2 * 0.62 * P;
  const sealOD = Math.max(cable + 1.6, minor - 2.4);
  const sealH = 8;
  const top = fh + upperL;
  const bore = cable + 1;
  switch (p.piece) {
    case 'hole':
      return cyl(wall + 1, (d + 0.6) / 2).translate([0, 0, -wall - 0.5]);
    case 'nut':
      return hex(af, nutH).subtract(internalThreadCut(s, nutH, luz, true, true, -wall - nutH - 0.01)).translate([0, 0, -wall - nutH - 0.01]);
    case 'seal':
      return cyl(sealH + 1, sealOD / 2 - 0.15).subtract(cyl(sealH + 3, (cable + 0.2) / 2).translate([0, 0, -1])).translate([0, 0, top - sealH]);
    case 'cap': {
      const ceil = top + 1;
      const cone = Math.max(0.6, Math.min(1.5, (sealOD - cable) / 4));
      const c0 = fh + 1;
      const capTop = ceil + cone + 2;
      let m = hex(af + 2, capTop - c0).translate([0, 0, c0]);
      m = m.subtract(internalThreadCut(s, ceil - c0 + 0.01, luz, true, true, c0 - 0.01).translate([0, 0, c0 - 0.01]));
      m = m.subtract(cyl(cone + 0.01, sealOD / 2, cable / 2 + 0.3).translate([0, 0, ceil - 0.005]));
      return m.subtract(cyl(capTop + 2, (cable + 0.6) / 2).translate([0, 0, -1]));
    }
    default: {
      const lower = threadSolid(s, lowerL + 0.01, 0, -lowerL).translate([0, 0, -lowerL]);
      const upper = threadSolid(s, upperL + 0.01, 0, fh - 0.01).translate([0, 0, fh - 0.01]);
      let m = union([lower, hex(af, fh), upper]);
      m = m.subtract(cyl(lowerL + top + 2, bore / 2).translate([0, 0, -lowerL - 1]));
      return m.subtract(cyl(sealH + 1, sealOD / 2).translate([0, 0, top - sealH]));
    }
  }
}

// ------------------------------------------------------------------ hose barb
const HOSES: Record<string, number> = { '1/2': 12.7, '5/8': 15.9, '3/4': 19.05 };

function hoseBarb(p: Params): Manifold {
  const id = HOSES[String(p.hose)] ?? 12.7;
  const rMax = id / 2 + 0.8, rMin = id / 2 - 0.6;
  const n = Math.max(1, Math.round(num(p, 'barbs')));
  const seg = Math.max(3, num(p, 'seg'));
  const boreR = Math.max(1, num(p, 'bore') / 2);
  let base: Manifold | null = null;
  let z0 = 0;
  if (p.base === 'thread') {
    const s = THREADS[String(p.thread)] ?? THREADS['G1/2'];
    const tl = num(p, 'threadL');
    base = union([threadSolid(s, tl + 0.01), hex(s.af, 6).translate([0, 0, tl])]);
    z0 = tl + 6;
  } else if (p.base === 'flange') {
    const fd = id * 2.6, ft = 3;
    base = cyl(ft, fd / 2);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      base = base.subtract(cyl(ft + 2, 1.7).translate([Math.cos(a) * fd * 0.38, Math.sin(a) * fd * 0.38, -1]));
    }
    z0 = ft;
  }
  // Saw-tooth profile (radius, z): sharp step facing the base, ramp narrowing towards the tip.
  const neck = 4;
  const pts: [number, number][] = [
    [boreR, z0 - 0.01],
    [rMin, z0 - 0.01],
    [rMin, z0 + neck],
  ];
  for (let i = 0; i < n; i++) {
    const zb = z0 + neck + i * seg;
    pts.push([rMax, zb + 0.01], [rMin, zb + seg]);
  }
  const zt = z0 + neck + n * seg;
  pts.push([boreR, zt]);
  const barbs = M().Manifold.revolve(M().CrossSection.ofPolygons([pts]), 96);
  let m = base ? base.add(barbs) : barbs;
  return m.subtract(cyl(zt + 2, boreR).translate([0, 0, -1]));
}

export const FITTING_DEFS: PartDef[] = [
  {
    type: 'gland',
    label: 'Dławik kablowy',
    category: 'fittings',
    hole: false,
    description: 'Szczelne przejście kabla przez ściankę: otwór, korpus, nakrętka kontrująca, nakrętka dociskowa i uszczelka (drukuj z TPU). Rozmiar dobiera się sam do średnicy kabla.',
    pieces: [
      { value: 'body', label: 'korpus', hole: false, body: 'new' },
      { value: 'nut', label: 'nakrętka kontrująca', hole: false, body: 'new' },
      { value: 'cap', label: 'nakrętka dociskowa', hole: false, body: 'new' },
      { value: 'seal', label: 'uszczelka (TPU)', hole: false, body: 'new' },
      { value: 'hole', label: 'otwór w ściance', hole: true, body: 'sel' },
    ],
    params: [
      { key: 'cable', label: 'Średnica kabla', type: 'number', def: 5, min: 2, max: 16, step: 0.1, unit: 'mm' },
      select('size', 'Rozmiar', 'auto', [
        ['auto', 'Automatycznie wg kabla'],
        ['M12', 'M12×1,5 (kabel 3–6,5)'],
        ['PG7', 'PG7 (kabel 3–6,5)'],
        ['M16', 'M16×1,5 (kabel 4–8)'],
        ['PG9', 'PG9 (kabel 4–8)'],
        ['M20', 'M20×1,5 (kabel 6–12)'],
        ['M25', 'M25×1,5 (kabel 9–16)'],
      ]),
      { key: 'wall', label: 'Grubość ścianki', type: 'number', def: 3, min: 1, max: 15, step: 0.2, unit: 'mm' },
      clearance(0.3, 'Luz gwintu nakrętek.'),
    ],
    build: gland,
  },
  {
    type: 'cableSlot',
    label: 'Przepust na wtyczkę',
    category: 'fittings',
    hole: true,
    description: 'Otwór typu keyhole: duży otwór przepuści wtyczkę, a kabel wsuwa się w wąską szczelinę.',
    params: [
      { key: 'plug', label: 'Średnica wtyczki', type: 'number', def: 14, min: 3, max: 60, step: 0.5, unit: 'mm' },
      { key: 'cable', label: 'Szerokość szczeliny (kabel)', type: 'number', def: 6, min: 1, max: 30, step: 0.1, unit: 'mm' },
      { key: 'len', label: 'Odległość szczeliny', type: 'number', def: 14, min: 0, max: 100, unit: 'mm' },
      { key: 'H', label: 'Głębokość', type: 'number', def: 10, min: 0.5, max: 200, unit: 'mm' },
    ],
    build: (p) => {
      const D = num(p, 'plug'), w = num(p, 'cable'), l = num(p, 'len'), h = num(p, 'H');
      const cs = M().CrossSection.union([
        M().CrossSection.circle(D / 2),
        M().CrossSection.square([l, w], true).translate([l / 2, 0]),
        M().CrossSection.circle(w / 2).translate([l, 0]),
      ]);
      return cs.extrude(h);
    },
  },
  {
    type: 'cableClamp',
    label: 'Odciążka kabla',
    category: 'fittings',
    hole: false,
    description: 'Mostek przykręcany dwiema śrubami, dociska kabel do ścianki, żeby szarpnięcie nie wyrwało przewodów.',
    params: [
      { key: 'cable', label: 'Średnica kabla', type: 'number', def: 6, min: 2, max: 30, step: 0.1, unit: 'mm' },
      { key: 'W', label: 'Szerokość', type: 'number', def: 10, min: 4, max: 60, unit: 'mm' },
      { key: 'squeeze', label: 'Docisk', type: 'number', def: 0.5, min: 0, max: 3, step: 0.1, unit: 'mm' },
      select('screw', 'Śruba', 'M3', [
        ['M2.5', 'M2,5'],
        ['M3', 'M3'],
        ['M4', 'M4'],
      ]),
    ],
    build: (p) => {
      const d = num(p, 'cable'), w = num(p, 'W'), sq = num(p, 'squeeze');
      const m = parseFloat(String(p.screw).slice(1)) || 3;
      const ear = m * 2 + 3;
      const lx = d + 2 * ear + 2;
      const h = d - sq + 2;
      let c = block(lx, w, h).subtract(M().Manifold.cylinder(w + 2, d / 2).rotate([90, 0, 0]).translate([0, w / 2 + 1, d / 2 - sq]));
      for (const sx of [-1, 1]) c = c.subtract(cyl(h + 2, (m + 0.4) / 2).translate([sx * (d / 2 + 1 + ear / 2), 0, -1]));
      return c;
    },
  },
  {
    type: 'hoseBarb',
    label: 'Końcówka na wąż',
    category: 'fittings',
    hole: false,
    description: 'Karbowana końcówka na wąż ogrodowy. Podstawa z gwintem G wkręca się w otwór gwintowany G lub w nakrętkę. Do wody drukuj z PETG.',
    params: [
      select('hose', 'Wąż', '1/2', [
        ['1/2', '1/2" (12,5 mm)'],
        ['5/8', '5/8" (15 mm)'],
        ['3/4', '3/4" (19 mm)'],
      ]),
      { key: 'barbs', label: 'Liczba karbów', type: 'number', def: 3, min: 1, max: 8, step: 1 },
      { key: 'seg', label: 'Długość karbu', type: 'number', def: 6, min: 3, max: 15, step: 0.5, unit: 'mm' },
      { key: 'bore', label: 'Otwór przepływu', type: 'number', def: 8, min: 2, max: 16, step: 0.5, unit: 'mm' },
      select('base', 'Podstawa', 'thread', [
        ['thread', 'Gwint rurowy G + sześciokąt'],
        ['flange', 'Kołnierz z otworami'],
        ['none', 'Brak'],
      ]),
      { ...select('thread', 'Gwint podstawy', 'G1/2', [
        ['G1/4', 'G 1/4"'],
        ['G3/8', 'G 3/8"'],
        ['G1/2', 'G 1/2"'],
        ['G3/4', 'G 3/4"'],
      ]), show: (p: Params) => p.base === 'thread' },
      { key: 'threadL', label: 'Długość gwintu', type: 'number', def: 10, min: 4, max: 40, unit: 'mm', show: (p: Params) => p.base === 'thread' },
    ],
    build: hoseBarb,
  },
  {
    type: 'oring',
    label: 'Rowek na o-ring',
    category: 'fittings',
    hole: true,
    description: 'Pierścieniowy rowek pod uszczelkę o-ring (czołowy). Szerokość 1,4 × przekrój, głębokość 0,75 × przekrój.',
    params: [
      { key: 'ID', label: 'Średnica wewn. o-ringu', type: 'number', def: 20, min: 2, max: 300, step: 0.5, unit: 'mm' },
      { key: 'CS', label: 'Przekrój o-ringu', type: 'number', def: 2, min: 0.5, max: 10, step: 0.1, unit: 'mm' },
    ],
    build: (p) => {
      const id = num(p, 'ID'), cs = num(p, 'CS');
      const h = cs * 0.75;
      return cyl(h, id / 2 + cs * 1.4).subtract(cyl(h + 2, id / 2).translate([0, 0, -1]));
    },
  },
];
