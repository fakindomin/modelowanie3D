import type { CrossSection, Manifold } from 'manifold-3d';
import { M } from '../geom/manifold';
import type { ParamDef, Params, PartDef } from './def';
import { box, cyl, num, select, union } from './util';

type Pt = [number, number];

const DEG = Math.PI / 180;

/** A line of width 2r through the points (round joints and ends). */
export function stroke(pts: Pt[], r: number, r2 = r): CrossSection {
  const C = M().CrossSection;
  const dot = (p: Pt, rr: number) => C.circle(rr, 16).translate(p);
  const segs: CrossSection[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = i / Math.max(1, pts.length - 1), t1 = (i + 1) / Math.max(1, pts.length - 1);
    segs.push(C.hull([dot(pts[i], r + (r2 - r) * t0), dot(pts[i + 1], r + (r2 - r) * t1)]));
  }
  return C.union(segs);
}

/** Ring sector between radii ri and ro from angle a0 to a1 (degrees), in the XY plane. */
export function sector(ri: number, ro: number, a0: number, a1: number): CrossSection {
  const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 4));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * DEG;
    pts.push([ro * Math.cos(a), ro * Math.sin(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = (a0 + ((a1 - a0) * i) / n) * DEG;
    pts.push([ri * Math.cos(a), ri * Math.sin(a)]);
  }
  return M().CrossSection.ofPolygons([pts]);
}

export const ring = (ri: number, ro: number, h: number, z0 = 0) => cyl(h, ro).subtract(cyl(h + 2, ri).translate([0, 0, -1])).translate([0, 0, z0]);

/**
 * Helical coil along Z from 0 to h: a wire of radial width ro − ri and axial height hw,
 * rising P per turn. A ring sector spanning hw/P of a turn, twisted as it is extruded, sweeps it.
 */
export function coil(ri: number, ro: number, P: number, hw: number, h: number): Manifold {
  const phi = (360 * Math.min(hw, P * 0.95)) / P;
  const turns = h / P;
  return sector(ri, ro, 0, phi).extrude(h, Math.max(8, Math.ceil(turns * 40)), (360 * h) / P);
}

/** Smallest gap between turns that prints without fusing. */
export const MIN_GAP = 0.4;

/** Compression spring: active coils between flat end rings, from z = 0 to L. */
export function compressionSpring(D: number, w: number, hw: number, n: number, L: number, ends: boolean): Manifold {
  const ro = D / 2, ri = Math.max(0.5, ro - w);
  const e = ends ? hw : 0;
  const P = Math.max(hw + MIN_GAP, (L - hw) / Math.max(1, n));
  const H = Math.max(L, n * P + hw);
  let m = coil(ri, ro, P, hw, H);
  if (ends) m = union([m, ring(ri, ro, e), ring(ri, ro, e, H - e)]);
  return m;
}

/** Pitch and free gap of a compression spring, for hints and the model check. */
export function coilPitch(p: Params) {
  const hw = num(p, 'hw'), n = Math.max(1, Math.round(num(p, 'n')));
  const P = Math.max(hw + MIN_GAP, (num(p, 'L') - hw) / n);
  return { P, gap: P - hw, stroke: n * (P - hw) - 0.2 * n };
}

/**
 * Torsion spring along Z with two straight legs leaving along the coil's tangent: leg A at the
 * bottom, leg B at the top, `ang` degrees further round.
 */
export function torsionSpring(D: number, w: number, hw: number, n: number, gap: number, ang: number, La: number): Manifold {
  const ro = D / 2, ri = Math.max(0.5, ro - w), rm = (ri + ro) / 2;
  const P = hw + Math.max(MIN_GAP, gap);
  const phi = (360 * hw) / P;
  const turns = Math.max(1, Math.round(n)) + ang / 360;
  const H = turns * P + hw;
  const m = coil(ri, ro, P, hw, H);
  // A leg starts on the wire at angle a and runs along its tangent: back (A) or forward (B).
  const leg = (a: number, z0: number, back: boolean) =>
    box(-0.5, -w / 2, z0, La, w / 2, z0 + hw)
      .rotate([0, 0, a + (back ? -90 : 90)])
      .translate([rm * Math.cos(a * DEG), rm * Math.sin(a * DEG), 0]);
  // The wire is fully there (bottom to top of its height) at angle phi on the first turn.
  const a0 = phi, a1 = phi + 360 * turns;
  return union([m, leg(a0, 0, true), leg(a1, H - hw, false)]);
}

/** Flat zigzag or wave spring along X, lying in XY and extruded H high. */
export function flatSpring(L: number, B: number, n: number, t: number, H: number, wave: boolean, pads: boolean): Manifold {
  const pad = pads ? Math.max(1.5, t * 1.5) : 0;
  const x0 = -L / 2 + pad, x1 = L / 2 - pad;
  const amp = Math.max(0.2, (B - t) / 2);
  const k = Math.max(1, Math.round(n));
  const pts: Pt[] = [];
  if (wave) {
    const N = k * 12;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      pts.push([x0 + (x1 - x0) * s, amp * Math.sin(Math.PI * k * s)]);
    }
  } else {
    pts.push([x0, 0]);
    for (let i = 0; i < k; i++) pts.push([x0 + ((x1 - x0) * (i + 0.5)) / k, (i % 2 ? -1 : 1) * amp]);
    pts.push([x1, 0]);
  }
  let cs = stroke(pts, t / 2);
  const C = M().CrossSection;
  if (pads) cs = C.union([cs, C.square([pad + t / 2, B], true).translate([-L / 2 + pad / 2 + t / 4, 0]), C.square([pad + t / 2, B], true).translate([L / 2 - pad / 2 - t / 4, 0])]);
  else cs = cs.intersect(C.square([L, B + 2 * t], true));
  return cs.extrude(H);
}

/** Archimedean spiral (clock spring) with a hub in the middle and an eye at the outer end. */
export function spiralSpring(p: Params): Manifold {
  const n = Math.max(1, num(p, 'n')), t = num(p, 't'), g = num(p, 'g'), H = num(p, 'H');
  const ri = num(p, 'hub') / 2 + t / 2;
  const a = t + g; // radius gained per turn
  const N = Math.ceil(n * 72);
  const r = (th: number) => ri + (a * th) / (2 * Math.PI);
  const outer: Pt[] = [], inner: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * n * 2 * Math.PI;
    outer.push([(r(th) + t / 2) * Math.cos(th), (r(th) + t / 2) * Math.sin(th)]);
    inner.push([(r(th) - t / 2) * Math.cos(th), (r(th) - t / 2) * Math.sin(th)]);
  }
  const C = M().CrossSection;
  let cs = C.ofPolygons([[...outer, ...inner.reverse()]], 'Positive');
  const end = n * 2 * Math.PI, re = r(end);
  const eye = num(p, 'eye');
  const ep: Pt = [(re + eye / 2 + 1.2) * Math.cos(end), (re + eye / 2 + 1.2) * Math.sin(end)];
  cs = C.union([cs, C.circle(ri + t / 2, 48), C.hull([C.circle(eye / 2 + 1.2, 24).translate(ep), C.circle(t / 2, 12).translate([re * Math.cos(end), re * Math.sin(end)])])]);
  let m = cs.extrude(H);
  m = m.subtract(cyl(H + 2, eye / 2, eye / 2, 20).translate([ep[0], ep[1], -1]));
  const s = num(p, 'shaft');
  if (p.shaftT === 'square') m = m.subtract(box(-s / 2, -s / 2, -1, s / 2, s / 2, H + 1));
  else if (p.shaftT === 'dflat') m = m.subtract(cyl(H + 2, s / 2 + 0.1).translate([0, 0, -1]).subtract(box(s / 2 - s * 0.2, -s, -2, s, s, H + 2)));
  else if (p.shaftT === 'round') m = m.subtract(cyl(H + 2, s / 2 + 0.15).translate([0, 0, -1]));
  return m;
}

/** Typical bought springs: outer diameter and free length. */
export const BOUGHT: Record<string, { label: string; D: number; L: number }> = {
  pen: { label: 'Z długopisu (ok. 4 × 25 mm)', D: 4, L: 25 },
  s6: { label: 'Mała 6 × 15 mm', D: 6, L: 15 },
  s8: { label: 'Średnia 8 × 20 mm', D: 8, L: 20 },
  s10: { label: 'Duża 10 × 30 mm', D: 10, L: 30 },
  custom: { label: 'Własne wymiary', D: 6, L: 15 },
};

const wireParams = (D: number, w: number): ParamDef[] => [
  { key: 'D', label: 'Średnica zewnętrzna', type: 'number', def: D, min: 3, max: 200, step: 0.5, unit: 'mm' },
  { key: 'w', label: 'Szerokość drutu', type: 'number', def: w, min: 0.6, max: 20, step: 0.1, unit: 'mm', hint: 'Mierzona w poprzek osi. Grubszy drut = twardsza sprężyna.' },
  { key: 'hw', label: 'Wysokość drutu', type: 'number', def: w, min: 0.6, max: 20, step: 0.1, unit: 'mm', hint: 'Mierzona wzdłuż osi. Prostokątny drut drukuje się lepiej niż okrągły.' },
];

export const SPRING_DEFS: PartDef[] = [
  {
    type: 'springFlat',
    label: 'Sprężyna płaska (zygzak, fala)',
    category: 'springs',
    hole: false,
    description: 'Drukuje się na płasko, więc wychodzi najpewniej. Do zatrzasków, klawiszy i dociskania. Najlepiej z PETG albo TPU; PLA z czasem traci siłę.',
    params: [
      select('style', 'Kształt', 'zigzag', [['zigzag', 'Zygzak'], ['wave', 'Fala']]),
      { key: 'L', label: 'Długość', type: 'number', def: 40, min: 5, max: 300, step: 0.5, unit: 'mm' },
      { key: 'B', label: 'Szerokość', type: 'number', def: 12, min: 2, max: 100, step: 0.5, unit: 'mm' },
      { key: 'n', label: 'Liczba zgięć', type: 'number', def: 6, min: 1, max: 40, step: 1 },
      { key: 't', label: 'Grubość pasa', type: 'number', def: 1.2, min: 0.4, max: 10, step: 0.1, unit: 'mm', hint: 'Cieńszy = miększa sprężyna. Najmniej 2 ścieżki dyszy (0,8 mm przy 0,4).' },
      { key: 'H', label: 'Wysokość', type: 'number', def: 6, min: 0.6, max: 100, step: 0.2, unit: 'mm' },
      { key: 'pads', label: 'Stopki na końcach', type: 'bool', def: true },
    ],
    build: (p) => flatSpring(num(p, 'L'), num(p, 'B'), num(p, 'n'), num(p, 't'), num(p, 'H'), p.style === 'wave', !!p.pads),
  },
  {
    type: 'springCoil',
    label: 'Sprężyna śrubowa (ściskana)',
    category: 'springs',
    hole: false,
    description: 'Klasyczna sprężyna naciskowa z drutem o prostokątnym przekroju i płaskimi końcami. Drukuj na stojąco, z PETG albo TPU.',
    params: [
      ...wireParams(12, 1.6),
      { key: 'n', label: 'Liczba zwojów', type: 'number', def: 6, min: 1, max: 60, step: 1 },
      { key: 'L', label: 'Długość (luźna)', type: 'number', def: 30, min: 3, max: 400, step: 0.5, unit: 'mm', hint: 'Skok to w przybliżeniu suma przerw między zwojami. Przerwa musi mieć co najmniej 0,4 mm.' },
      { key: 'ends', label: 'Płaskie końce', type: 'bool', def: true },
    ],
    build: (p) => compressionSpring(num(p, 'D'), num(p, 'w'), num(p, 'hw'), Math.round(num(p, 'n')), num(p, 'L'), !!p.ends),
  },
  {
    type: 'springTorsion',
    label: 'Sprężyna skrętna',
    category: 'springs',
    hole: false,
    description: 'Zwoje z dwoma ramionami, do zawiasów i klapek, które same się zamykają, oraz klamerek. Kąt ramion to położenie bez naprężenia.',
    params: [
      ...wireParams(10, 1.6),
      { key: 'n', label: 'Liczba zwojów', type: 'number', def: 3, min: 1, max: 30, step: 1 },
      { key: 'gap', label: 'Przerwa między zwojami', type: 'number', def: 0.5, min: MIN_GAP, max: 5, step: 0.1, unit: 'mm' },
      { key: 'ang', label: 'Kąt między ramionami', type: 'number', def: 90, min: 0, max: 359, step: 5, unit: '°' },
      { key: 'La', label: 'Długość ramion', type: 'number', def: 15, min: 2, max: 200, step: 0.5, unit: 'mm' },
    ],
    build: (p) => torsionSpring(num(p, 'D'), num(p, 'w'), num(p, 'hw'), num(p, 'n'), num(p, 'gap'), num(p, 'ang'), num(p, 'La')),
  },
  {
    type: 'springSpiral',
    label: 'Sprężyna spiralna (zegarowa)',
    category: 'springs',
    hole: false,
    description: 'Płaska spirala z piastą na wałek i oczkiem na końcu. Sprawia, że pokrętło albo korbka wraca do pozycji. Drukuj na płasko.',
    params: [
      { key: 'n', label: 'Liczba zwojów', type: 'number', def: 4, min: 1, max: 20, step: 0.25 },
      { key: 't', label: 'Grubość pasa', type: 'number', def: 1, min: 0.4, max: 5, step: 0.1, unit: 'mm' },
      { key: 'g', label: 'Przerwa między zwojami', type: 'number', def: 1.5, min: MIN_GAP, max: 10, step: 0.1, unit: 'mm', hint: 'Większa przerwa = więcej obrotu, zanim zwoje się zetkną.' },
      { key: 'H', label: 'Wysokość', type: 'number', def: 5, min: 0.6, max: 50, step: 0.2, unit: 'mm' },
      { key: 'hub', label: 'Średnica piasty', type: 'number', def: 10, min: 3, max: 100, step: 0.5, unit: 'mm' },
      select('shaftT', 'Otwór w piaście', 'square', [['square', 'Kwadratowy'], ['dflat', 'Okrągły ze ścięciem (D)'], ['round', 'Okrągły'], ['none', 'Bez otworu']]),
      { key: 'shaft', label: 'Wymiar otworu', type: 'number', def: 4, min: 1, max: 50, step: 0.1, unit: 'mm', show: (p) => p.shaftT !== 'none' },
      { key: 'eye', label: 'Oczko na końcu', type: 'number', def: 3, min: 1, max: 20, step: 0.1, unit: 'mm', hint: 'Średnica otworu na bolec, który trzyma zewnętrzny koniec.' },
    ],
    build: (p) => spiralSpring(p),
  },
  {
    type: 'springPocket',
    label: 'Gniazdo na kupną sprężynę',
    category: 'springs',
    hole: true,
    description: 'Kieszeń z bolcem prowadzącym pod typową sprężynkę (np. z długopisu). Kupna stalowa sprężyna jest najtrwalsza. Wstaw w ściankę albo dno.',
    params: [
      select('kind', 'Sprężyna', 'pen', Object.entries(BOUGHT).map(([k, v]) => [k, v.label] as [string, string])),
      { key: 'D', label: 'Średnica sprężyny', type: 'number', def: 4, min: 1.5, max: 60, step: 0.1, unit: 'mm' },
      { key: 'depth', label: 'Głębokość kieszeni', type: 'number', def: 10, min: 1, max: 200, step: 0.5, unit: 'mm', hint: 'Zwykle 1/3–1/2 długości sprężyny, żeby się nie wyginała.' },
      { key: 'pin', label: 'Bolec prowadzący w środku', type: 'bool', def: true },
      { key: 'pinH', label: 'Wysokość bolca', type: 'number', def: 6, min: 0.5, max: 200, step: 0.5, unit: 'mm', show: (p) => !!p.pin },
      { key: 'luz', label: 'Luz', type: 'number', def: 0.4, min: 0, max: 2, step: 0.05, unit: 'mm' },
    ],
    normalize: (prev, next) => {
      if (next.kind === prev.kind || next.kind === 'custom') return next;
      const b = BOUGHT[String(next.kind)];
      if (!b) return next;
      const depth = Math.round(b.L * 0.4 * 2) / 2;
      return { ...next, D: b.D, depth, pinH: Math.round(depth * 0.6 * 2) / 2 };
    },
    build: (p) => {
      const D = num(p, 'D'), d = num(p, 'depth'), g = num(p, 'luz');
      let m = cyl(d + 0.01, (D + g) / 2, (D + g) / 2, 40);
      if (p.pin) {
        // The pin stays as material: a bit thinner than the spring's inside.
        const wire = Math.max(0.3, D * 0.1);
        const pr = Math.max(0.5, D / 2 - wire - 0.35);
        m = m.subtract(cyl(Math.min(num(p, 'pinH'), d - 0.2), pr, pr * 0.85, 24).translate([0, 0, -0.01]));
      }
      return m;
    },
  },
];
