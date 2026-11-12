/**
 * The shop's maker's mark: the owner's slanted „f” (from znak-f.svg, 5.71 × 10 mm, y up), engraved small and
 * shallow on a calm flat spot of every model. On a textured face it sits in a smooth field cleared of the relief.
 */
import type { CrossSection, Manifold } from 'manifold-3d';
import { M } from '../geom/manifold';

const F_PTS = [0.255,0,1.004,5.332,0,5.332,0.257,7.164,1.262,7.164,1.303,7.463,1.328,7.623,1.357,7.777,1.389,7.925,1.425,8.067,1.465,8.204,1.509,8.334,1.557,8.459,1.608,8.578,1.663,8.691,1.722,8.799,1.785,8.9,1.851,8.996,1.921,9.086,1.994,9.172,2.07,9.253,2.149,9.33,2.23,9.402,2.315,9.469,2.402,9.532,2.493,9.59,2.586,9.643,2.682,9.692,2.782,9.736,2.884,9.776,2.988,9.812,3.095,9.845,3.204,9.874,3.315,9.9,3.428,9.924,3.543,9.944,3.661,9.961,3.78,9.975,3.902,9.986,4.025,9.994,4.151,9.998,4.279,10,4.313,10,4.348,9.999,4.384,9.998,4.421,9.996,4.459,9.994,4.498,9.992,4.538,9.988,4.578,9.985,4.62,9.981,4.662,9.976,4.705,9.971,4.749,9.966,4.793,9.96,4.838,9.954,4.882,9.948,4.926,9.941,4.971,9.934,5.015,9.927,5.059,9.92,5.103,9.912,5.147,9.904,5.191,9.895,5.235,9.887,5.279,9.878,5.323,9.869,5.364,9.859,5.405,9.85,5.444,9.84,5.482,9.83,5.519,9.82,5.554,9.81,5.588,9.799,5.62,9.789,5.652,9.778,5.681,9.767,5.71,9.756,5.487,8.168,4.863,8.168,4.79,8.167,4.721,8.164,4.655,8.158,4.594,8.149,4.536,8.139,4.482,8.126,4.431,8.111,4.385,8.093,4.342,8.073,4.302,8.05,4.267,8.026,4.235,7.999,4.206,7.969,4.179,7.936,4.153,7.901,4.129,7.862,4.107,7.821,4.087,7.776,4.068,7.729,4.051,7.679,4.036,7.626,4.023,7.57,4.011,7.511,4.002,7.449,3.962,7.164,5.346,7.164,5.088,5.332,3.704,5.332,2.955,0];
const F_W = 5.71, F_H = 10;

/** The mark `h` mm tall, centred on the origin; `mirror` flips it for a face read from below. */
export function markOutline(h: number, mirror = false): CrossSection {
  const s = h / F_H, pts: [number, number][] = [];
  for (let i = 0; i < F_PTS.length; i += 2) pts.push([(F_PTS[i] - F_W / 2) * s * (mirror ? -1 : 1), (F_PTS[i + 1] - F_H / 2) * s]);
  return new (M().CrossSection)([pts], 'NonZero');
}
export const markWidth = (h: number) => (F_W / F_H) * h;

type Corner = 'br' | 'bl' | 'tr' | 'tl' | 'b' | 't';
/**
 * Where a mark `h` tall fits inside `free` (with a 1.5 mm clear border), searched from the preferred corners
 * inward. Null when no spot holds it.
 */
export function findSpot(free: CrossSection, h: number, prefs: Corner[] = ['br', 'b', 'bl', 'tr', 'tl', 't']): [number, number] | null {
  const C = M().CrossSection;
  const w = markWidth(h) + 3, hh = h + 3;
  const bb = free.bounds();
  const x0 = bb.min[0] + w / 2, x1 = bb.max[0] - w / 2, y0 = bb.min[1] + hh / 2, y1 = bb.max[1] - hh / 2;
  if (x1 < x0 || y1 < y0) return null;
  const box = C.square([w, hh], true);
  const area = box.area();
  const fits = (x: number, y: number) => {
    const t = box.translate([x, y]);
    const i = free.intersect(t);
    const ok = i.area() > area - 0.01;
    t.delete();
    i.delete();
    return ok;
  };
  // Candidate centres: along the outline of the free area shrunk by half the field's shorter side (where a field
  // hugs the edges), every millimetre; the exact test then keeps the ones the whole field fits around.
  const er = free.offset(-(Math.min(w, hh) / 2 + 0.05), 'Round');
  const pts: [number, number][] = [];
  for (const poly of er.toPolygons()) {
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
      for (let q = 0; q < n; q++) pts.push([a[0] + ((b[0] - a[0]) * q) / n, a[1] + ((b[1] - a[1]) * q) / n]);
    }
  }
  er.delete();
  try {
    for (const c of prefs) {
      const ax = c.endsWith('r') ? x1 : c.endsWith('l') ? x0 : (x0 + x1) / 2;
      const ay = c.startsWith('b') ? y0 : y1;
      const d = (p: [number, number]) => Math.hypot(p[0] - ax, (p[1] - ay) * 1.5);
      const cand = [...pts].sort((a, b) => d(a) - d(b));
      for (const [x, y] of cand.slice(0, 200)) if (fits(x, y)) return [x, y];
    }
    return null;
  } finally {
    box.delete();
  }
}

/**
 * Engraves the mark into a flat face at height `z` (facing +Z, or −Z with `down`), centred at (x, y):
 * first a smooth field (the relief above the face is cleared), then the letter `depth` deep.
 */
export function engrave(m: Manifold, at: [number, number], z: number, h: number, opts: { down?: boolean; depth?: number } = {}): Manifold {
  const C = M().CrossSection;
  const depth = opts.depth ?? 0.6;
  const r = 1.2;
  const field = C.square([markWidth(h) + 3 - 2 * r, h + 3 - 2 * r], true).offset(r, 'Round', undefined, 12);
  const f = markOutline(h, opts.down);
  // The field: from the face out by 3 mm (only the texture's relief stands there).
  const fieldM = field.extrude(3).translate([at[0], at[1], 0]);
  const letter = f.extrude(depth + 3).translate([at[0], at[1], -depth]);
  const place = (s: Manifold) => {
    const t = opts.down ? s.mirror([0, 0, 1]).translate([0, 0, z]) : s.translate([0, 0, z]);
    s.delete();
    return t;
  };
  const cut = place(fieldM).add(place(letter));
  const out = m.subtract(cut);
  [field, f, cut].forEach((x) => x.delete());
  return out;
}

type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/**
 * Engraves the mark into any flat face: `p` a point on it (the mark's centre), `n` its outward normal, `up` the
 * mark's up along the face. Read from outside, unmirrored.
 */
export function engraveAt(m: Manifold, p: V3, n: V3, up: V3, h: number, depth = 0.6): Manifold {
  const right = cross([-n[0], -n[1], -n[2]], up);
  const letter = markOutline(h).extrude(depth + 3).translate([0, 0, -depth]);
  // Columns: the mark's x → right, y → up, z → out of the face; then to p.
  const mat = [...right, 0, ...up, 0, ...n, 0, ...p, 1] as unknown as Parameters<Manifold['transform']>[0];
  const placed = letter.transform(mat);
  const out = m.subtract(placed);
  letter.delete();
  placed.delete();
  return out;
}
