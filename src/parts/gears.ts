import type { CrossSection, Manifold } from 'manifold-3d';
import { M } from '../geom/manifold';
import { latticeHoles } from '../geom/lattice';
import type { ParamDef, Params, PartDef } from './def';
import { cyl, hex, num, select, union } from './util';

type Pt = [number, number];

const DEG = Math.PI / 180;
const PA = 20 * DEG;
const inv = (a: number) => Math.tan(a) - a;

/** Play between meshing teeth, per gear (the pair gets twice this), as tooth thickness taken off at the pitch circle. */
export const GEAR_FITS: Record<string, { label: string; b: number }> = {
  tight: { label: 'Ciasne', b: 0.05 },
  normal: { label: 'Normalne', b: 0.1 },
  loose: { label: 'Luźne', b: 0.2 },
};
export const backlash = (p: Params) => (GEAR_FITS[String(p.fit ?? 'normal')] ?? GEAR_FITS.normal).b;

/**
 * Involute gear outline, one tooth centred on angle 0. `ha`/`hf` are the addendum and dedendum,
 * `b` thins every tooth by b mm at the pitch circle (negative thickens: the cut of an internal gear).
 */
export function gearOutline(m: number, z: number, b: number, ha = m, hf = 1.25 * m): Pt[] {
  const rp = (m * z) / 2, rb = rp * Math.cos(PA);
  const ra = rp + ha, rf = Math.max(0.5, rp - hf);
  const psiP = Math.PI / (2 * z) - b / (2 * rp);
  const psi = (r: number) => psiP + inv(PA) - inv(Math.acos(Math.min(1, rb / r)));
  const r0 = Math.max(rb, rf);
  // The flank stops where the tooth would come to a point.
  let rTop = ra;
  while (rTop > r0 + 0.01 && psi(rTop) < 0.15 / rTop) rTop -= 0.02 * m;
  const N = 10;
  const flank: { r: number; a: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const r = r0 + ((rTop - r0) * i) / N;
    flank.push({ r, a: psi(r) });
  }
  const pitch = (2 * Math.PI) / z;
  const out: Pt[] = [];
  const at = (r: number, a: number) => out.push([r * Math.cos(a), r * Math.sin(a)]);
  for (let k = 0; k < z; k++) {
    const c = k * pitch;
    // Root from the middle of the gap before this tooth to the start of its right flank.
    const g0 = c - pitch / 2, f0 = c - flank[0].a;
    const steps = Math.max(1, Math.ceil(((f0 - g0) * rf) / (0.4 * m)));
    for (let i = 0; i < steps; i++) at(rf, g0 + ((f0 - g0) * i) / steps);
    if (rf < r0) at(rf, f0);
    for (const q of flank) at(q.r, c - q.a);
    const tip = flank[N].a;
    for (let i = 1; i < 4; i++) at(rTop, c - tip + (2 * tip * i) / 4);
    for (let i = N; i >= 0; i--) at(flank[i].r, c + flank[i].a);
    if (rf < r0) at(rf, c + flank[0].a);
    const g1 = c + pitch / 2, f1 = c + flank[0].a;
    for (let i = 1; i < steps; i++) at(rf, f1 + ((g1 - f1) * i) / steps);
  }
  return out;
}

const section = (pts: Pt[]) => M().CrossSection.ofPolygons([pts], 'Positive');

/**
 * Extrudes a gear section: straight, twisted (helical) or twisted both ways (herringbone).
 * `beta` is the helix angle in degrees, positive = right hand (teeth turn anticlockwise going up).
 */
function extrudeGear(cs: CrossSection, h: number, rp: number, beta: number, kind: string): Manifold {
  if (kind === 'spur' || !beta) return cs.extrude(h);
  const twist = (h * Math.tan(beta * DEG)) / rp / DEG;
  if (kind === 'helical') return cs.extrude(h, Math.max(4, Math.ceil(Math.abs(twist) / 2)), twist);
  const half = cs.extrude(h / 2, Math.max(4, Math.ceil(Math.abs(twist) / 4)), twist / 2);
  return half.add(half.mirror([0, 0, 1]).translate([0, 0, h]));
}

// ------------------------------------------------------------------ shared parameters

const fitParam = (): ParamDef => ({
  ...select('fit', 'Luz zębów', 'normal', Object.entries(GEAR_FITS).map(([k, v]) => [k, v.label] as [string, string])),
  hint: 'Ciasne: mniej luzu, ale może zacinać się na nierównym wydruku. Normalne obraca się lekko po wydruku na 0,4 mm.',
});

const moduleParam = (def = 1.5): ParamDef => ({ key: 'm', label: 'Moduł (wielkość zęba)', type: 'number', def, min: 0.5, max: 10, step: 0.25, unit: 'mm', hint: 'Dwie zębatki zazębiają się tylko przy tym samym module. Do druku 1–2 mm; większy = mocniejszy ząb.' });

export const BORES: [string, string][] = [
  ['round', 'Okrągły'],
  ['dflat', 'Ze spłaszczeniem (wał silnika)'],
  ['hex', 'Sześciokątny (nakrętka/wał)'],
  ['608', 'Łożysko 608 (22×7)'],
  ['625', 'Łożysko 625 (16×5)'],
  ['none', 'Bez otworu'],
];

const boreParams = (d = 5): ParamDef[] => [
  select('boreT', 'Otwór w środku', 'round', BORES),
  { key: 'bore', label: 'Średnica otworu', type: 'number', def: d, min: 1, max: 100, step: 0.1, unit: 'mm', show: (p) => ['round', 'dflat', 'hex'].includes(String(p.boreT)), hint: 'Dla sześciokąta: rozmiar pod klucz. Luz 0,2 mm jest już dodany.' },
  { key: 'hubD', label: 'Piasta: średnica', type: 'number', def: 0, min: 0, max: 200, step: 0.5, unit: 'mm', hint: '0 = bez piasty. Piasta wystaje nad zębatkę i trzyma wał pewniej.' },
  { key: 'hubH', label: 'Piasta: wysokość', type: 'number', def: 6, min: 1, max: 100, step: 0.5, unit: 'mm', show: (p) => num(p, 'hubD') > 0 },
  { key: 'screw', label: 'Otwór na śrubę M3 w piaście', type: 'bool', def: false, show: (p) => num(p, 'hubD') > 0, hint: 'Poprzeczny otwór 2,8 mm: śruba M3 wkręcona w plastik dociska wał.' },
];

/** Hole through a gear of height h (and its hub): shaft, motor flat, hex or a bearing seat. */
export function boreCut(p: Params, h: number): Manifold | null {
  const t = String(p.boreT ?? 'round');
  const H = h + (num(p, 'hubD') > 0 ? num(p, 'hubH') : 0);
  const d = num(p, 'bore') + 0.2;
  const through = (r: number) => cyl(H + 2, r).translate([0, 0, -1]);
  if (t === 'none') return null;
  if (t === 'round') return through(d / 2);
  if (t === 'hex') return hex(d, H + 2).translate([0, 0, -1]);
  if (t === 'dflat') {
    // Motor shafts (e.g. 5 mm) have a flat 0,5 mm deep.
    const flat = M().Manifold.cube([d, d, H + 2], true).translate([0, d / 2 + d / 2 - 0.5, H / 2]);
    return through(d / 2).subtract(flat);
  }
  const [od, w, id] = t === '608' ? [22.15, 7, 10] : [16.15, 5, 7];
  return union([cyl(Math.min(w, h) + 1, od / 2).translate([0, 0, -1]), through(id / 2)]);
}

const hubParts = (p: Params, h: number): Manifold | null => {
  const D = num(p, 'hubD');
  return D > 0 ? cyl(num(p, 'hubH') + 0.01, D / 2).translate([0, 0, h - 0.01]) : null;
};

const screwHole = (p: Params, h: number): Manifold | null =>
  num(p, 'hubD') > 0 && p.screw ? cyl(num(p, 'hubD'), 1.4).rotate([0, 90, 0]).translate([0, 0, h + num(p, 'hubH') / 2]) : null;

/** Fill of the disc between hub and teeth: solid, spokes, round holes, truss; through or a thin web. */
const webParams = (): ParamDef[] => [
  select('web', 'Wypełnienie', 'full', [
    ['full', 'Pełne'],
    ['spokes', 'Szprychy'],
    ['holes', 'Otwory'],
    ['truss', 'Kratownica'],
  ]),
  { key: 'spokes', label: 'Liczba szprych / otworów', type: 'number', def: 5, min: 3, max: 12, step: 1, show: (p) => p.web === 'spokes' || p.web === 'holes' },
  { key: 'rib', label: 'Szerokość szprychy / żebra', type: 'number', def: 3, min: 0.8, max: 30, step: 0.2, unit: 'mm', show: (p) => p.web !== undefined && p.web !== 'full', hint: 'Co najmniej 2 ścieżki dyszy (0,8 mm przy dyszy 0,4).' },
  { key: 'rim', label: 'Wieniec pod zębami', type: 'number', def: 2.5, min: 1, max: 30, step: 0.5, unit: 'mm', show: (p) => p.web !== undefined && p.web !== 'full', hint: 'Pełny pierścień pod zębami, żeby ząb się nie wyłamał.' },
  { key: 'webT', label: 'Grubość środnika', type: 'number', def: 0, min: 0, max: 50, step: 0.2, unit: 'mm', show: (p) => p.web !== undefined && p.web !== 'full', hint: '0 = otwory przelotowe. Więcej = cienka ścianka w środku wysokości (kieszenie z obu stron).' },
];

/** Openings of the web in the ring rIn…rOut, as a solid to subtract from a gear of height h. */
function webCut(p: Params, rIn: number, rOut: number, h: number): Manifold | null {
  const kind = String(p.web ?? 'full');
  if (kind === 'full' || rOut - rIn < 2.5) return null;
  const rib = Math.max(0.8, num(p, 'rib') || 3);
  const n = Math.max(3, Math.round(num(p, 'spokes') || 5));
  const C = M().CrossSection;
  const ring = C.circle(rOut, 96).subtract(C.circle(rIn, 64));
  let holes: CrossSection | null = null;
  if (kind === 'spokes') {
    const bars = Array.from({ length: n }, (_, i) => C.square([rOut * 2 + 2, rib], true).translate([rOut + 1, 0]).rotate((360 * i) / n));
    holes = ring.subtract(C.union(bars));
  } else if (kind === 'holes') {
    const rm = (rIn + rOut) / 2;
    const d = Math.min(rOut - rIn - rib, 2 * rm * Math.sin(Math.PI / n) - rib);
    if (d < 1) return null;
    holes = C.union(Array.from({ length: n }, (_, i) => C.circle(d / 2, 32).translate([rm * Math.cos((2 * Math.PI * i) / n), rm * Math.sin((2 * Math.PI * i) / n)])));
  } else {
    const cell = Math.max(rib * 3, (rOut - rIn) * 0.9);
    const lat = latticeHoles('tri', cell, rib, rOut + cell);
    if (!lat) return null;
    // Keep a strut around the inner and outer edge too.
    const inner = C.circle(rOut - rib / 2, 96).subtract(C.circle(rIn + rib / 2, 64));
    holes = lat.intersect(inner);
  }
  if (!holes || holes.isEmpty()) return null;
  const t = Math.min(num(p, 'webT') || 0, h - 0.8);
  if (t <= 0) return holes.extrude(h + 2).translate([0, 0, -1]);
  const pocket = (h - t) / 2;
  return union([holes.extrude(pocket + 1).translate([0, 0, -1]), holes.extrude(pocket + 1).translate([0, 0, h - pocket])]);
}

/** Inner radius left solid around the bore (or the hub). */
function hubRadius(p: Params): number {
  const t = String(p.boreT ?? 'round');
  const bore = t === '608' ? 22.15 : t === '625' ? 16.15 : t === 'none' ? 0 : num(p, 'bore') + 0.2;
  return Math.max(num(p, 'hubD') / 2, bore / 2 + Math.max(2, num(p, 'rib') || 3));
}

/** Finishes a toothed disc of height h: hub on top, web openings, bore, set-screw hole. */
function finish(gear: Manifold, p: Params, h: number, rRoot: number): Manifold {
  let m = gear;
  const hub = hubParts(p, h);
  if (hub) m = m.add(hub);
  const web = webCut(p, hubRadius(p), rRoot - Math.max(1, num(p, 'rim') || 2.5), h);
  if (web) m = m.subtract(web);
  const bore = boreCut(p, h);
  if (bore) m = m.subtract(bore);
  const screw = screwHole(p, h);
  if (screw) m = m.subtract(screw);
  return m;
}

// ------------------------------------------------------------------ geometry used by the pairing code

export const pitchRadius = (p: Params) => (num(p, 'm') * num(p, 'z')) / 2;

/** Helix angle of a gear (worm wheels take it from their worm). */
export function helixOf(p: Params, type: string): number {
  if (type === 'wormWheel') {
    const lead = Math.max(1, Math.round(num(p, 'starts') || 1)) * Math.PI * num(p, 'm');
    const g = Math.atan(lead / (Math.PI * num(p, 'dw'))) / DEG;
    return p.hand === 'left' ? -g : g;
  }
  if (p.kind === 'spur' || p.kind === undefined) return 0;
  const b = num(p, 'beta') || 20;
  return p.hand === 'left' ? -b : b;
}

/** Bevel gear cone: pitch angle (rad) and apex height above the back face. */
export function bevelCone(p: Params) {
  const z = num(p, 'z'), zm = num(p, 'zMate') || z;
  const delta = Math.atan2(z, zm);
  const rp = (num(p, 'm') * z) / 2;
  return { delta, apex: rp / Math.tan(delta), rp };
}

// ------------------------------------------------------------------ parts

const teeth = (def: number, min = 6): ParamDef => ({ key: 'z', label: 'Liczba zębów', type: 'number', def, min, max: 300, step: 1, hint: 'Poniżej 17 zębów podstawa zęba jest podcięta (słabszy ząb); od 13 w górę zwykle działa dobrze.' });

export const GEAR_DEFS: PartDef[] = [
  {
    type: 'gear',
    label: 'Zębatka walcowa',
    category: 'gears',
    hole: false,
    description: 'Koło zębate z zębem ewolwentowym: proste, skośne albo jodełka. „Dodaj pasującą zębatkę” ustawia drugie koło w dobrej odległości; po zmianie liczby zębów para sama się rozsuwa.',
    params: [
      moduleParam(),
      teeth(20),
      { key: 'h', label: 'Grubość', type: 'number', def: 8, min: 1, max: 200, step: 0.5, unit: 'mm' },
      select('kind', 'Zęby', 'spur', [
        ['spur', 'Proste'],
        ['helical', 'Skośne (cichsze)'],
        ['herring', 'Jodełka (bez nacisku w bok)'],
      ]),
      { key: 'beta', label: 'Kąt pochylenia zębów', type: 'number', def: 20, min: 5, max: 45, step: 1, unit: '°', show: (p) => p.kind !== 'spur' },
      { ...select('hand', 'Kierunek', 'right', [['right', 'Prawy'], ['left', 'Lewy']]), show: (p) => p.kind !== 'spur', hint: 'Dwie zazębione zębatki skośne mają przeciwne kierunki; pasująca zębatka dostaje go sama.' },
      fitParam(),
      ...boreParams(5),
      ...webParams(),
    ],
    build: (p) => {
      const m = num(p, 'm'), z = Math.round(num(p, 'z')), h = num(p, 'h');
      const rp = (m * z) / 2;
      const g = extrudeGear(section(gearOutline(m, z, backlash(p))), h, rp, helixOf(p, 'gear'), String(p.kind));
      return finish(g, p, h, rp - 1.25 * m);
    },
  },
  {
    type: 'ringGear',
    label: 'Wieniec zębaty (wewnętrzny)',
    category: 'gears',
    hole: false,
    description: 'Pierścień z zębami od środka, np. do przekładni planetarnej albo obrotnicy. Zębatka w środku musi mieć co najmniej 12 zębów mniej.',
    params: [
      moduleParam(),
      teeth(48, 12),
      { key: 'h', label: 'Grubość', type: 'number', def: 8, min: 1, max: 200, step: 0.5, unit: 'mm' },
      { key: 'wall', label: 'Ścianka na zewnątrz', type: 'number', def: 4, min: 1, max: 50, step: 0.5, unit: 'mm' },
      fitParam(),
    ],
    build: (p) => ringGear(num(p, 'm'), Math.round(num(p, 'z')), num(p, 'h'), num(p, 'wall'), backlash(p), 0),
  },
  {
    type: 'rack',
    label: 'Listwa zębata',
    category: 'gears',
    hole: false,
    description: 'Prosta listwa z zębami: z kołem zębatym zamienia obrót na przesuw. „Dodaj pasującą zębatkę” stawia koło nad listwą.',
    params: [
      moduleParam(),
      { key: 'n', label: 'Liczba zębów', type: 'number', def: 20, min: 2, max: 500, step: 1, hint: 'Długość = liczba zębów × 3,14 × moduł.' },
      { key: 'h', label: 'Grubość', type: 'number', def: 8, min: 1, max: 200, step: 0.5, unit: 'mm' },
      { key: 'base', label: 'Grzbiet pod zębami', type: 'number', def: 5, min: 1, max: 100, step: 0.5, unit: 'mm' },
      fitParam(),
      { key: 'holes', label: 'Otwory na śruby M3', type: 'number', def: 0, min: 0, max: 50, step: 1, hint: 'Rozłożone równo w grzbiecie, przelotowe od góry.' },
    ],
    build: (p) => {
      const m = num(p, 'm'), n = Math.max(2, Math.round(num(p, 'n'))), h = num(p, 'h'), base = num(p, 'base');
      let r = section(rackOutline(m, n, base, backlash(p))).extrude(h);
      const k = Math.round(num(p, 'holes'));
      const L = n * Math.PI * m;
      const yh = -1.25 * m - base / 2;
      for (let i = 0; i < k; i++) {
        const x = -L / 2 + (L * (i + 0.5)) / k;
        r = r.subtract(cyl(base + 2, 1.7).rotate([90, 0, 0]).translate([x, yh + base / 2 + 1, h / 2]));
      }
      return r;
    },
  },
  {
    type: 'bevelGear',
    label: 'Zębatka stożkowa',
    category: 'gears',
    hole: false,
    description: 'Przenosi obrót pod kątem 90°. Ustaw liczbę zębów drugiej zębatki; „Dodaj pasującą zębatkę” zrobi ją i ustawi prostopadle. Kształt zęba uproszczony, dobry do druku.',
    params: [
      moduleParam(),
      teeth(20, 8),
      { key: 'zMate', label: 'Zęby drugiej zębatki', type: 'number', def: 20, min: 8, max: 200, step: 1, hint: 'Od tego zależy kąt stożka (np. 20 i 20 = 45°).' },
      { key: 'b', label: 'Szerokość zęba', type: 'number', def: 8, min: 1, max: 100, step: 0.5, unit: 'mm', hint: 'Najwyżej 1/3 długości stożka; więcej jest przycinane.' },
      { key: 'back', label: 'Podstawa pod zębami', type: 'number', def: 2, min: 0, max: 50, step: 0.5, unit: 'mm' },
      fitParam(),
      ...boreParams(5),
    ],
    build: (p) => {
      const m = num(p, 'm'), z = Math.round(num(p, 'z'));
      const { apex, rp } = bevelCone(p);
      const cone = Math.hypot(apex, rp);
      const b = Math.min(num(p, 'b'), cone / 3);
      // Each section is the back face scaled towards the apex, so the pitch cone comes out right.
      const h = (b * apex) / cone;
      const k = (apex - h) / apex;
      const back = num(p, 'back');
      let g = section(gearOutline(m, z, backlash(p))).extrude(h, 8, 0, [k, k]).translate([0, 0, back]);
      if (back > 0) g = g.add(cyl(back + 0.01, rp - 1.25 * m));
      return finish(g, { ...p, web: 'full' }, back + h, rp);
    },
  },
  {
    type: 'worm',
    label: 'Ślimak',
    category: 'gears',
    hole: false,
    description: 'Śruba napędowa do ślimacznicy: duże przełożenie (obrót ślimaka = 1 ząb koła) i przekładnia sama się nie cofa. Drukuj na stojąco.',
    params: [
      moduleParam(),
      { key: 'dw', label: 'Średnica podziałowa', type: 'number', def: 15, min: 4, max: 200, step: 0.5, unit: 'mm', hint: 'Zwykle 10 × moduł. Ślimacznica musi mieć tę samą wartość.' },
      { key: 'starts', label: 'Liczba zwojów', type: 'number', def: 1, min: 1, max: 4, step: 1, hint: '1 = największe przełożenie i samohamowność.' },
      { key: 'L', label: 'Długość', type: 'number', def: 25, min: 3, max: 300, step: 0.5, unit: 'mm' },
      select('hand', 'Kierunek', 'right', [['right', 'Prawy'], ['left', 'Lewy']]),
      fitParam(),
      ...boreParams(5).filter((d) => !['hubD', 'hubH', 'screw'].includes(d.key)),
    ],
    build: (p) => {
      const m = num(p, 'm'), dw = num(p, 'dw'), L = num(p, 'L');
      const starts = Math.max(1, Math.round(num(p, 'starts')));
      let w = wormSolid(m, dw, starts, L, backlash(p), p.hand === 'left');
      const bore = boreCut({ ...p, hubD: 0 }, L);
      if (bore) w = w.subtract(bore);
      return w;
    },
  },
  {
    type: 'wormWheel',
    label: 'Ślimacznica',
    category: 'gears',
    hole: false,
    description: 'Koło do ślimaka (zęby skośne pod kątem zwoju ślimaka). Moduł, średnica ślimaka i liczba zwojów muszą być takie same jak w ślimaku.',
    params: [
      moduleParam(),
      teeth(30, 12),
      { key: 'h', label: 'Grubość', type: 'number', def: 8, min: 1, max: 200, step: 0.5, unit: 'mm' },
      { key: 'dw', label: 'Średnica ślimaka', type: 'number', def: 15, min: 4, max: 200, step: 0.5, unit: 'mm' },
      { key: 'starts', label: 'Zwoje ślimaka', type: 'number', def: 1, min: 1, max: 4, step: 1 },
      select('hand', 'Kierunek', 'right', [['right', 'Prawy'], ['left', 'Lewy']]),
      fitParam(),
      ...boreParams(5),
      ...webParams(),
    ],
    build: (p) => {
      const m = num(p, 'm'), z = Math.round(num(p, 'z')), h = num(p, 'h');
      const rp = (m * z) / 2;
      const g = extrudeGear(section(gearOutline(m, z, backlash(p))), h, rp, helixOf(p, 'wormWheel'), 'helical');
      return finish(g, p, h, rp - 1.25 * m);
    },
  },
  {
    type: 'planetary',
    label: 'Przekładnia planetarna',
    category: 'gears',
    hole: false,
    description: 'Gotowy zestaw: słońce w środku, satelity, wieniec i jarzmo z bolcami. Przełożenie (wieniec stoi) = 1 + zęby wieńca / zęby słońca.',
    pieces: [
      { value: 'sun', label: 'słońce', hole: false, body: 'new' },
      { value: 'planets', label: 'satelity', hole: false, body: 'new' },
      { value: 'ring', label: 'wieniec', hole: false, body: 'new' },
      { value: 'carrier', label: 'jarzmo', hole: false, body: 'new' },
    ],
    params: [
      moduleParam(1.5),
      { key: 'zs', label: 'Zęby słońca', type: 'number', def: 15, min: 8, max: 120, step: 1 },
      { key: 'zp', label: 'Zęby satelity', type: 'number', def: 15, min: 8, max: 120, step: 1, hint: 'Wieniec ma zęby słońca + 2 × zęby satelity.' },
      { key: 'n', label: 'Liczba satelitów', type: 'number', def: 3, min: 2, max: 6, step: 1 },
      { key: 'h', label: 'Grubość', type: 'number', def: 8, min: 2, max: 100, step: 0.5, unit: 'mm' },
      { key: 'wall', label: 'Ścianka wieńca', type: 'number', def: 4, min: 1, max: 30, step: 0.5, unit: 'mm' },
      { key: 'pin', label: 'Bolce jarzma', type: 'number', def: 4, min: 1.5, max: 30, step: 0.5, unit: 'mm' },
      { key: 'ct', label: 'Grubość jarzma', type: 'number', def: 3, min: 1, max: 30, step: 0.5, unit: 'mm' },
      fitParam(),
      select('boreT', 'Otwór w słońcu', 'dflat', BORES.filter(([k]) => k !== '608' && k !== '625')),
      { key: 'bore', label: 'Średnica otworu', type: 'number', def: 5, min: 1, max: 50, step: 0.1, unit: 'mm', show: (p) => p.boreT !== 'none' },
    ],
    build: (p) => planetaryPiece(p, String(p.piece ?? 'sun')),
  },
  {
    type: 'gt2Pulley',
    label: 'Koło pasowe GT2',
    category: 'gears',
    hole: false,
    description: 'Koło do paska zębatego GT2 (podziałka 2 mm, pasek 6 lub 10 mm), z kołnierzami i piastą na wał silnika.',
    params: [
      { key: 'z', label: 'Liczba zębów', type: 'number', def: 20, min: 10, max: 200, step: 1 },
      { key: 'w', label: 'Szerokość paska', type: 'number', def: 6, min: 3, max: 30, step: 1, unit: 'mm' },
      { key: 'flange', label: 'Kołnierze', type: 'bool', def: true },
      ...boreParams(5).map((d): ParamDef => (d.key === 'hubD' && d.type === 'number' ? { ...d, def: 16 } : d.key === 'screw' && d.type === 'bool' ? { ...d, def: true } : d)),
    ],
    build: (p) => gt2(p),
  },
];

/**
 * Turn of a gear with z2 teeth whose centre lies in direction t (radians) from a gear with z1 teeth
 * (tooth on angle 0), so that its teeth fall into the other's gaps.
 */
export const matePhase = (t: number, z1: number, z2: number) => t + Math.PI + Math.PI / z2 + (t * z1) / z2;

/** Pitch radius of each planetary piece's gears and where the planets sit. */
export function planetLayout(p: Params) {
  const m = num(p, 'm'), zs = Math.round(num(p, 'zs')), zp = Math.round(num(p, 'zp'));
  const zr = zs + 2 * zp;
  const n = Math.max(2, Math.round(num(p, 'n')));
  const a = (m * (zs + zp)) / 2;
  // Planets go where the teeth line up; equal spacing when (zs + zr) divides by n.
  const angles = Array.from({ length: n }, (_, k) => (Math.round(((zs + zr) * k) / n) * 2 * Math.PI) / (zs + zr));
  return { m, zs, zp, zr, n, a, angles };
}

function planetaryPiece(p: Params, piece: string): Manifold {
  const { m, zs, zp, zr, a, angles } = planetLayout(p);
  const h = num(p, 'h'), b = backlash(p);
  const pin = num(p, 'pin');
  if (piece === 'ring') return ringGear(m, zr, h, num(p, 'wall'), b, (Math.PI * (zp + 1)) / zr);
  if (piece === 'sun') {
    let s = section(gearOutline(m, zs, b)).extrude(h);
    const bore = boreCut({ ...p, hubD: 0 }, h);
    if (bore) s = s.subtract(bore);
    return s;
  }
  if (piece === 'planets') {
    const one = section(gearOutline(m, zp, b)).extrude(h).subtract(cyl(h + 2, pin / 2 + 0.25).translate([0, 0, -1]));
    return union(angles.map((t) => one.rotate([0, 0, matePhase(t, zs, zp) / DEG]).translate([a * Math.cos(t), a * Math.sin(t), 0])));
  }
  // Carrier: a plate over the gears with pins going down into the planets.
  const ct = num(p, 'ct'), gap = 0.4;
  const R = a + (m * zp) / 2 * 0.5 + pin / 2;
  let c = cyl(ct, R).translate([0, 0, h + gap]);
  const pins = angles.map((t) => cyl(h + gap + 0.01, pin / 2, pin / 2, 24).translate([a * Math.cos(t), a * Math.sin(t), gap]));
  c = union([c, ...pins]);
  const bore = num(p, 'bore');
  return c.subtract(cyl(h * 2 + ct + 4, Math.max(1, bore / 2 + 0.6)).translate([0, 0, -1]));
}

/** Ring with inner teeth: a disc minus the teeth of an imaginary gear made a little fatter (the play). */
function ringGear(m: number, z: number, h: number, wall: number, b: number, phase: number): Manifold {
  const rp = (m * z) / 2;
  const cut = section(gearOutline(m, z, -b, 1.25 * m, m)).rotate(phase / DEG);
  return cyl(h, rp + 1.25 * m + wall, undefined, 128).subtract(cut.extrude(h + 2).translate([0, 0, -1]));
}

/** Rack outline: teeth pointing +Y with the pitch line on y = 0, centred on x = 0. */
function rackOutline(m: number, n: number, base: number, b: number): Pt[] {
  const p = Math.PI * m, L = n * p;
  const s = p / 2 - b;
  const t = Math.tan(PA);
  const yb = -1.25 * m;
  const out: Pt[] = [[L / 2, yb - base], [L / 2, yb]];
  // Walk from right to left; tooth k centred at x = (k - (n - 1) / 2) p.
  for (let k = n - 1; k >= 0; k--) {
    const c = (k - (n - 1) / 2) * p;
    const half = (y: number) => s / 2 - y * t;
    out.push([c + half(yb), yb], [c + Math.max(0.05, half(m)), m], [c - Math.max(0.05, half(m)), m], [c - half(yb), yb]);
  }
  out.push([-L / 2, yb], [-L / 2, yb - base]);
  // Clip flanks that run past the ends.
  return out.map(([x, y]) => [Math.max(-L / 2, Math.min(L / 2, x)), y]);
}

/** Worm: a rack-shaped thread wound around the axis (Z), lead = starts × π × m. */
function wormSolid(m: number, dw: number, starts: number, L: number, b: number, left: boolean): Manifold {
  const pAx = Math.PI * m, lead = starts * pAx;
  const rp = dw / 2;
  const s = pAx / 2 - b;
  const t = Math.tan(PA);
  const prof = (x: number) => {
    const d = Math.abs(x - pAx / 2);
    return rp + Math.max(-1.25 * m, Math.min(m, (s / 2 - d) / t));
  };
  const n = 120;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const x = ((((left ? th : -th) / (2 * Math.PI)) * lead) % pAx + pAx) % pAx;
    const r = prof(x);
    pts.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  const turns = L / lead;
  const w = section(pts).extrude(L, Math.max(2, Math.ceil(turns * 36)), (left ? -1 : 1) * turns * 360);
  // Chamfer the ends so the thread starts cleanly.
  const ra = rp + m, c = 1.25 * m;
  const body = union([cyl(c, ra - c, ra + 0.01), cyl(Math.max(0.01, L - 2 * c), ra + 0.01).translate([0, 0, c]), cyl(c, ra + 0.01, ra - c).translate([0, 0, L - c])]);
  return w.intersect(body);
}

/** GT2 pulley: 2 mm pitch, 0,75 mm deep rounded grooves, outer diameter = pitch diameter − 0,51. */
function gt2(p: Params): Manifold {
  const z = Math.round(num(p, 'z')), w = num(p, 'w');
  const ro = (z * 2) / Math.PI / 2 - 0.254;
  const C = M().CrossSection;
  const groove = C.circle(0.555, 16).translate([ro - 0.195, 0]).add(C.square([1, 1.11], true).translate([ro + 0.3, 0]));
  const teethCs = C.circle(ro, Math.max(48, z * 4)).subtract(C.union(Array.from({ length: z }, (_, i) => groove.rotate((360 * i) / z))));
  const fl = p.flange ? 1.2 : 0;
  const parts: Manifold[] = [teethCs.extrude(w + 1).translate([0, 0, fl])];
  if (fl) {
    parts.push(cyl(fl + 0.01, ro + 1.5, ro + 1.5, 64));
    parts.push(cyl(fl, ro + 1.5, ro + 1.5, 64).translate([0, 0, fl + w + 1 - 0.01]));
  }
  const h = fl * 2 + w + 1;
  return finish(union(parts), { ...p, web: 'full' }, h, ro);
}
