import type { Manifold } from 'manifold-3d';
import * as THREE from 'three';
import { M } from '../geom/manifold';
import type { ParamDef, Params } from './def';
import { box, cyl, cylX, num, select } from './util';
import { externalThread, internalThreadCut, threadGap, FITS, type ThreadSpec } from './threads';

/**
 * Ends of stock lying along X (bars, profiles, rods): end A at x = 0, end B at x = L.
 * Every kind of stock has its own list; the parts call `stockEnds` on their bar before centring it.
 */
export type StockKind = 'bar' | 'rhs' | 'rod';

export const STOCK_ENDS: Record<StockKind, [string, string][]> = {
  bar: [
    ['plain', 'Prosty'],
    ['miter', 'Ścięty pod 45°'],
    ['round', 'Zaokrąglony'],
    ['hole', 'Z otworem'],
  ],
  rhs: [
    ['plain', 'Gładki'],
    ['plug', 'Czop (wchodzi w następny profil)'],
    ['pin', 'Otwory na zatrzask U'],
    ['screw', 'Otwór na śrubę'],
    ['click', 'Okienka na klik (do łącznika)'],
    ['cap', 'Zaślepiony'],
  ],
  rod: [
    ['plain', 'Gładki'],
    ['chamfer', 'Fazka'],
    ['thread', 'Gwint zewnętrzny'],
    ['tapped', 'Otwór gwintowany w czole'],
  ],
};

const n = (key: string, label: string, def: number, min: number, max: number, step: number, show: (p: Params) => boolean, hint?: string): ParamDef => ({
  key,
  label,
  type: 'number',
  def,
  min,
  max,
  step,
  unit: 'mm',
  show,
  hint,
});
const has = (p: Params, ...k: string[]) => k.includes(String(p.endA ?? 'plain')) || k.includes(String(p.endB ?? 'plain'));

/** The „Koniec A / Koniec B” selects and the sizes the chosen ends need. */
export function stockEndParams(kind: StockKind): ParamDef[] {
  const ends = STOCK_ENDS[kind];
  const sel = (l: 'A' | 'B'): ParamDef => ({ ...select(`end${l}`, `Koniec ${l}`, 'plain', ends), end: l });
  const out = [sel('A'), sel('B')];
  if (kind === 'bar') {
    out.push(n('endAt', 'Otwór od końca', 10, 2, 500, 0.5, (p) => has(p, 'hole')), n('endD', 'Średnica otworu', 5, 1, 50, 0.1, (p) => has(p, 'hole')));
  } else if (kind === 'rhs') {
    out.push(
      n('plugL', 'Długość czopu', 20, 5, 200, 1, (p) => has(p, 'plug')),
      n('endAt', 'Otwory od końca', 10, 2, 500, 0.5, (p) => has(p, 'pin', 'screw', 'click'), 'Przy oknach na klik: tam, gdzie łapie zaczep łącznika (dobiera się samo w łączniku).'),
      n('endD', 'Średnica otworów', 5, 1, 30, 0.1, (p) => has(p, 'pin', 'screw')),
      n('clickW', 'Szerokość okienek', 9, 2, 40, 0.1, (p) => has(p, 'click')),
    );
  } else {
    out.push(
      n('threadL', 'Długość gwintu / otworu', 15, 3, 200, 0.5, (p) => has(p, 'thread', 'tapped')),
      { ...select('fit', 'Dopasowanie gwintu', 'normal', Object.entries(FITS).map(([k, v]) => [k, v.label] as [string, string])), show: (p) => has(p, 'thread', 'tapped') },
    );
  }
  return out;
}

/** Letters at both ends of a bar lying along X (centred in Y, standing on z = 0). */
export const stockMarks = (_p: Params, bb: THREE.Box3) => {
  const c = bb.getCenter(new THREE.Vector3());
  return [
    { l: 'A', at: [bb.min.x, c.y, c.z] as [number, number, number] },
    { l: 'B', at: [bb.max.x, c.y, c.z] as [number, number, number] },
  ];
};

/** Mirror of a cut made for end A onto end B. */
const toB = (cut: Manifold, L: number) => cut.mirror([1, 0, 0]).translate([L, 0, 0]);

const METRIC_SMALL: ThreadSpec[] = [
  { d: 3, p: 0.5, angle: 60, af: 5.5, label: 'M3' },
  { d: 4, p: 0.7, angle: 60, af: 7, label: 'M4' },
  { d: 5, p: 0.8, angle: 60, af: 8, label: 'M5' },
  { d: 6, p: 1, angle: 60, af: 10, label: 'M6' },
  { d: 8, p: 1.25, angle: 60, af: 13, label: 'M8' },
  { d: 10, p: 1.5, angle: 60, af: 16, label: 'M10' },
  { d: 12, p: 1.75, angle: 60, af: 18, label: 'M12' },
  { d: 16, p: 2, angle: 60, af: 24, label: 'M16' },
  { d: 20, p: 2.5, angle: 60, af: 30, label: 'M20' },
];
/** Thread cut on a rod of diameter D: the standard pitch of the nearest metric size. */
export const rodThread = (D: number): ThreadSpec => {
  const near = METRIC_SMALL.reduce((a, b) => (Math.abs(b.d - D) < Math.abs(a.d - D) ? b : a));
  return { d: D, p: near.p, angle: 60, af: 0, label: `M${Math.round(D * 10) / 10}` };
};
/** Largest metric thread whose hole leaves at least a quarter of the rod around it. */
export const rodTap = (D: number): ThreadSpec | null => [...METRIC_SMALL].reverse().find((t) => t.d <= D * 0.55) ?? null;

export interface StockShape {
  L: number;
  /** Bar: where a vertical hole goes through the base (y) and how tall the stock is. */
  holeY?: number;
  /** rhs: outer width (Y) and height (Z) and wall; the section spans y ±W/2, z 0..H. */
  W?: number;
  H?: number;
  T?: number;
  /** rod: diameter, axis at y = z = 0. */
  D?: number;
}

/** Applies ends A and B to stock lying along X from 0 to L. */
export function stockEnds(m: Manifold, kind: StockKind, p: Params, s: StockShape): Manifold {
  const L = s.L;
  for (const side of ['A', 'B'] as const) {
    const e = String(p[`end${side}`] ?? 'plain');
    if (e === 'plain') continue;
    const b = m.boundingBox();
    const [y0, y1, z0, z1] = [b.min[1], b.max[1], b.min[2], b.max[2]];
    if (kind === 'bar') {
      if (e === 'miter') {
        // Cut in plan view: the edge at y0 keeps the full length, the one at y1 is shorter by the width.
        const w = y1 - y0;
        const wedge = M().Manifold.hull([box(-1, y0 - 0.01, z0 - 1, 0, y0, z1 + 1), box(-1, y1, z0 - 1, w, y1 + 1, z1 + 1), box(-1, y1, z0 - 1, 0, y1 + 1, z1 + 1)]);
        m = m.subtract(side === 'A' ? wedge : toB(wedge, L));
      } else if (e === 'round') {
        const r = (y1 - y0) / 2, yc = (y0 + y1) / 2;
        const corner = box(-1, y0 - 1, z0 - 1, r, y1 + 1, z1 + 1).subtract(cyl(z1 - z0 + 4, r).translate([r, yc, z0 - 2]));
        m = m.subtract(side === 'A' ? corner : toB(corner, L));
      } else if (e === 'hole') {
        const at = Math.min(num(p, 'endAt') || 10, L / 2);
        const h = cyl(z1 - z0 + 4, (num(p, 'endD') || 5) / 2).translate([at, s.holeY ?? (y0 + y1) / 2, z0 - 2]);
        m = m.subtract(side === 'A' ? h : toB(h, L));
      }
    } else if (kind === 'rhs') {
      const W = s.W!, H = s.H!, T = s.T!;
      const at = Math.min(num(p, 'endAt') || 10, L / 2);
      if (e === 'plug') {
        // A hollow plug that slides into the next profile of the same size.
        const g = 0.2, pl = num(p, 'plugL') || 20;
        const pw = W - 2 * T - 2 * g, ph = H - 2 * T - 2 * g;
        if (pw > 2 && ph > 2) {
          const wall = Math.max(1.6, T);
          let plug = box(-pl, -pw / 2, H / 2 - ph / 2, T + 1, pw / 2, H / 2 + ph / 2);
          if (pw - 2 * wall > 1 && ph - 2 * wall > 1) plug = plug.subtract(box(-pl - 1, -pw / 2 + wall, H / 2 - ph / 2 + wall, T + 2, pw / 2 - wall, H / 2 + ph / 2 - wall));
          m = m.add(side === 'A' ? plug : toB(plug, L));
        }
      } else if (e === 'pin' || e === 'screw') {
        // Clip pins come out of the side walls (±Y); a screw goes through top and bottom.
        const r = (num(p, 'endD') || 5) / 2;
        const h = e === 'pin' ? cyl(W + 4, r).rotate([90, 0, 0]).translate([at, W / 2 + 2, H / 2]) : cyl(H + 4, r).translate([at, 0, -2]);
        m = m.subtract(side === 'A' ? h : toB(h, L));
      } else if (e === 'click') {
        // Windows in the top and bottom walls for the hooks of a click fitting (hook 2.5 mm long, 0.3 mm play).
        const w = (num(p, 'clickW') || 9) + 0.6;
        const win = box(at - 0.3, -w / 2, -1, at + 2.8, w / 2, H + 1);
        m = m.subtract(side === 'A' ? win : toB(win, L));
      } else if (e === 'cap') {
        const t = Math.max(T, 1.2);
        const cap = box(0, -W / 2 + 0.01, 0.01, t, W / 2 - 0.01, H - 0.01);
        m = m.add(side === 'A' ? cap : toB(cap, L));
      }
    } else {
      const D = s.D!;
      const len = Math.min(num(p, 'threadL') || 15, L);
      if (e === 'chamfer') {
        const c = Math.min(1, D * 0.15);
        const ring = cylX(-0.01, c, D / 2 + 1).subtract(cylX(-0.02, c + 0.01, D / 2 - c - 0.01, 0, 0, D / 2 + 0.01));
        m = m.subtract(side === 'A' ? ring : toB(ring, L));
      } else if (e === 'thread') {
        const spec = rodThread(D);
        // Built along +Z with its chamfer at the top, turned so the top is the rod's tip.
        const t = externalThread(spec, len, threadGap(p, 'out'), true, false);
        const placed = side === 'A' ? t.rotate([0, -90, 0]).translate([len, 0, 0]) : t.rotate([0, 90, 0]).translate([L - len, 0, 0]);
        const cut = side === 'A' ? cylX(-1, len - 0.05, D / 2 + 1) : cylX(L - len + 0.05, L + 1, D / 2 + 1);
        m = m.subtract(cut).add(placed);
      } else if (e === 'tapped') {
        const spec = rodTap(D);
        if (!spec) continue;
        const c = internalThreadCut(spec, len, threadGap(p, 'in'), true);
        m = m.subtract(side === 'A' ? c.rotate([0, -90, 0]).translate([len, 0, 0]) : c.rotate([0, 90, 0]).translate([L - len, 0, 0]));
      }
    }
  }
  return m;
}
