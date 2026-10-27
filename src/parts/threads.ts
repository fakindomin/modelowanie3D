import type { Manifold } from 'manifold-3d';
import { M } from '../geom/manifold';
import type { ParamDef, Params, PartDef } from './def';
import { clearance, cyl, hex, knurled, num, select } from './util';

export interface ThreadSpec {
  d: number;
  p: number;
  /** Flank angle in degrees: 60 metric, 55 Whitworth pipe (G), 80 PG. */
  angle: number;
  /** Hex size across flats for heads and nuts. */
  af: number;
  label: string;
}

export const THREADS: Record<string, ThreadSpec> = {
  M6: { d: 6, p: 1, angle: 60, af: 10, label: 'M6' },
  M8: { d: 8, p: 1.25, angle: 60, af: 13, label: 'M8' },
  M10: { d: 10, p: 1.5, angle: 60, af: 16, label: 'M10' },
  M12: { d: 12, p: 1.75, angle: 60, af: 18, label: 'M12' },
  M14: { d: 14, p: 2, angle: 60, af: 21, label: 'M14' },
  M16: { d: 16, p: 2, angle: 60, af: 24, label: 'M16' },
  M20: { d: 20, p: 2.5, angle: 60, af: 30, label: 'M20' },
  M24: { d: 24, p: 3, angle: 60, af: 36, label: 'M24' },
  M30: { d: 30, p: 3.5, angle: 60, af: 46, label: 'M30' },
  'M12x1.5': { d: 12, p: 1.5, angle: 60, af: 18, label: 'M12×1,5 (drobny)' },
  'M16x1.5': { d: 16, p: 1.5, angle: 60, af: 24, label: 'M16×1,5 (drobny)' },
  'M20x1.5': { d: 20, p: 1.5, angle: 60, af: 30, label: 'M20×1,5 (drobny)' },
  'M25x1.5': { d: 25, p: 1.5, angle: 60, af: 36, label: 'M25×1,5 (drobny)' },
  PG7: { d: 12.5, p: 1.27, angle: 80, af: 15, label: 'PG7 (dławiki)' },
  PG9: { d: 15.2, p: 1.41, angle: 80, af: 19, label: 'PG9 (dławiki)' },
  PG11: { d: 18.6, p: 1.41, angle: 80, af: 22, label: 'PG11 (dławiki)' },
  'G1/4': { d: 13.157, p: 1.337, angle: 55, af: 19, label: 'G 1/4" (rurowy)' },
  'G3/8': { d: 16.662, p: 1.337, angle: 55, af: 22, label: 'G 3/8" (rurowy)' },
  'G1/2': { d: 20.955, p: 1.814, angle: 55, af: 27, label: 'G 1/2" (rurowy)' },
  'G3/4': { d: 26.441, p: 1.814, angle: 55, af: 32, label: 'G 3/4" (rurowy)' },
  G1: { d: 33.249, p: 2.309, angle: 55, af: 41, label: 'G 1" (rurowy)' },
};

/** Thread for a part's params: a table entry or the custom D/P fields. */
export function specOf(p: Params): ThreadSpec {
  const s = THREADS[String(p.size)];
  if (s) return s;
  const d = num(p, 'D') || 10;
  return { d, p: num(p, 'P') || 1.5, angle: 60, af: Math.round(1.5 * d + 1), label: 'własny' };
}

/** Thread depth as a fraction of the pitch (ISO basic external profile). */
function depthFactor(angle: number) {
  return angle === 55 ? 0.64 : angle === 80 ? 0.43 : 0.6134;
}

/**
 * Right-hand helical thread from z = 0 to z = length.
 * `grow` enlarges the radius (internal cut = bolt shape + clearance); `z0` is the height the solid will
 * be moved to, so threads built for the same frame (gland body and its nuts) mesh with each other.
 * Built as a twisted extrusion of a cross-section whose radius follows the thread profile.
 */
export function threadSolid(spec: { d: number; p: number; angle: number }, length: number, grow = 0, z0 = 0): Manifold {
  const { d, p, angle } = spec;
  const h = depthFactor(angle) * p;
  const rMaj = d / 2 + grow;
  const rMin = rMaj - h;
  const flank = Math.min(0.45, (h * Math.tan(((angle / 2) * Math.PI) / 180)) / p);
  const rest = 1 - 2 * flank;
  const root = rest * 0.55;
  const crest = rest * 0.45;
  const prof = (u: number) => {
    if (u < root) return rMin;
    if (u < root + flank) return rMin + ((u - root) / flank) * h;
    if (u < root + flank + crest) return rMaj;
    return rMaj - ((u - root - flank - crest) / flank) * h;
  };
  const n = d > 24 ? 120 : 90;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const u = (((-th / (Math.PI * 2)) % 1) + 1) % 1;
    const r = prof(u);
    pts.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  const turns = length / p;
  // z0 = where this solid will be moved to; turning the start keeps mating threads in phase.
  const cs = M().CrossSection.ofPolygons([pts]).rotate((360 * z0) / p);
  return cs.extrude(length, Math.max(2, Math.ceil(turns * 24)), turns * 360);
}

/** Bolt shank with chamfered ends so the thread starts cleanly. */
function externalThread(spec: ThreadSpec, length: number, shrink: number, chamferTop = true, chamferBottom = false): Manifold {
  let t = threadSolid(spec, length, -shrink / 2);
  const h = depthFactor(spec.angle) * spec.p;
  const r = spec.d / 2 - shrink / 2;
  const c = h + 0.2;
  // Intersect with a cylinder whose ends are cones: removes the sharp thread start.
  const bottom = chamferBottom ? cyl(c, r - c, r + 0.01) : cyl(c, r + 0.01);
  const top = chamferTop ? cyl(c, r + 0.01, r - c).translate([0, 0, length - c]) : cyl(c, r + 0.01).translate([0, 0, length - c]);
  const body = M().Manifold.union([bottom, cyl(Math.max(length - 2 * c, 0.01), r + 0.01).translate([0, 0, c]), top]);
  t = t.intersect(body);
  return t;
}

/** Shape to subtract for a threaded hole, with a lead-in countersink at the entry (top). */
export function internalThreadCut(spec: ThreadSpec, depth: number, luz: number, chamfer = true, bothEnds = false, z0 = 0): Manifold {
  let cut = threadSolid(spec, depth + 0.02, luz / 2, z0 - 0.01).translate([0, 0, -0.01]);
  const h = depthFactor(spec.angle) * spec.p;
  const r = spec.d / 2 + luz / 2;
  if (chamfer) {
    const c = h + 0.5;
    cut = cut.add(cyl(c + 0.01, r - h, r + 0.5).translate([0, 0, depth - c]));
    if (bothEnds) cut = cut.add(cyl(c + 0.01, r + 0.5, r - h).translate([0, 0, -0.01]));
  }
  return cut;
}

const sizeParam: ParamDef = select(
  'size',
  'Gwint',
  'M10',
  [...Object.entries(THREADS).map(([k, v]) => [k, v.label] as [string, string]), ['custom', 'Własny (średnica i skok)']],
);
const custom = (p: Params) => p.size === 'custom';
const customD: ParamDef = { key: 'D', label: 'Średnica gwintu', type: 'number', def: 10, min: 3, max: 120, step: 0.1, unit: 'mm', show: custom };
const customP: ParamDef = { key: 'P', label: 'Skok', type: 'number', def: 1.5, min: 0.5, max: 8, step: 0.05, unit: 'mm', show: custom };

export const THREAD_DEFS: PartDef[] = [
  {
    type: 'threadHole',
    label: 'Otwór z gwintem',
    category: 'threads',
    hole: true,
    description: 'Drukowany gwint wewnętrzny (od M6 w górę). „Dodaj pasującą śrubę” zrobi śrubę do tego otworu.',
    params: [
      sizeParam,
      customD,
      customP,
      { key: 'H', label: 'Głębokość', type: 'number', def: 12, min: 2, max: 300, unit: 'mm' },
      clearance(0.3, 'Luz gwintu dodawany do średnicy. 0,3 mm pasuje do większości drukarek.'),
      { key: 'chamfer', label: 'Fazka na wejściu', type: 'bool', def: true },
    ],
    build: (p) => internalThreadCut(specOf(p), num(p, 'H'), num(p, 'luz'), Boolean(p.chamfer)),
  },
  {
    type: 'bolt',
    label: 'Śruba / pręt gwintowany',
    category: 'threads',
    hole: false,
    description: 'Drukowana śruba z łbem sześciokątnym, radełkowanym albo bez łba (pręt gwintowany). Z otworem w środku robi się króciec.',
    params: [
      sizeParam,
      customD,
      customP,
      { key: 'L', label: 'Długość gwintu', type: 'number', def: 20, min: 3, max: 300, unit: 'mm' },
      select('head', 'Łeb', 'hex', [
        ['hex', 'Sześciokątny'],
        ['knurl', 'Walcowy radełkowany'],
        ['none', 'Bez łba (pręt)'],
      ]),
      { key: 'bore', label: 'Otwór w środku', type: 'number', def: 0, min: 0, max: 100, step: 0.5, unit: 'mm', hint: '0 = pełna śruba. Większy otwór robi króciec / złączkę.' },
      clearance(0, 'Zmniejsza średnicę śruby, jeśli wchodzi za ciasno.'),
    ],
    build: (p) => {
      const s = specOf(p);
      const L = num(p, 'L');
      const headH = p.head === 'none' ? 0 : Math.max(3, Math.round(s.d * 0.65 * 2) / 2);
      let m = externalThread(s, L, num(p, 'luz'), true, p.head === 'none').translate([0, 0, headH]);
      if (p.head === 'hex') m = m.add(hex(s.af, headH + 0.01));
      if (p.head === 'knurl') m = m.add(knurled(s.af * 1.1, headH + 0.01));
      const bore = num(p, 'bore');
      if (bore > 0) m = m.subtract(cyl(L + headH + 2, bore / 2).translate([0, 0, -1]));
      return m;
    },
  },
  {
    type: 'threadNut',
    label: 'Nakrętka',
    category: 'threads',
    hole: false,
    description: 'Drukowana nakrętka z gwintem wewnętrznym (też nakrętka kontrująca do dławika lub złączki).',
    params: [
      sizeParam,
      customD,
      customP,
      { key: 'H', label: 'Wysokość', type: 'number', def: 0, min: 0, max: 100, unit: 'mm', hint: '0 = wysokość standardowa (0,8 × średnica).' },
      select('shape', 'Kształt', 'hex', [
        ['hex', 'Sześciokątna'],
        ['knurl', 'Radełkowana (ręczna)'],
      ]),
      clearance(0.3, 'Luz gwintu dodawany do średnicy.'),
    ],
    build: (p) => {
      const s = specOf(p);
      const h = num(p, 'H') || Math.max(4, Math.round(s.d * 0.8));
      const outer = p.shape === 'knurl' ? knurled(s.af * 1.15, h) : hex(s.af, h);
      return outer.subtract(internalThreadCut(s, h, num(p, 'luz'), true, true));
    },
  },
  {
    type: 'pilot',
    label: 'Otwór pod wkręcenie',
    category: 'threads',
    hole: true,
    description: 'Mały otwór (ok. 0,8 × średnicy), w który śruba M2–M5 sama wcina gwint w plastiku.',
    params: [
      select('size', 'Śruba', 'M3', [
        ['M2', 'M2'],
        ['M2.5', 'M2,5'],
        ['M3', 'M3'],
        ['M4', 'M4'],
        ['M5', 'M5'],
      ]),
      { key: 'H', label: 'Głębokość', type: 'number', def: 10, min: 1, max: 200, unit: 'mm' },
    ],
    build: (p) => {
      const m = parseFloat(String(p.size).slice(1)) || 3;
      return cyl(num(p, 'H'), (m * 0.8) / 2);
    },
  },
];
