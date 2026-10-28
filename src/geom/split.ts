import type { CrossSection, Manifold } from 'manifold-3d';
import { M } from './manifold';

/** Dowel sizes tried from the biggest: diameter and full length, mm. */
export const DOWELS: [number, number][] = [
  [8, 24],
  [5, 16],
  [3, 10],
];
/** Play around a dowel in its holes, mm. */
export const DOWEL_LUZ = 0.3;
/** Plastic left around a dowel hole, mm. */
const DOWEL_WALL = 2;

/** Turns the solid so `axis` points up: (x, y, z) becomes (-z, y, x) for X and (x, -z, y) for Y. */
function toZ(m: Manifold, axis: 0 | 1 | 2): Manifold {
  return axis === 0 ? m.rotate([0, -90, 0]) : axis === 1 ? m.rotate([90, 0, 0]) : m;
}
/** World point of (u, w) on the cut plane at `at`. */
export function fromPlane(axis: 0 | 1 | 2, u: number, w: number, at: number): [number, number, number] {
  return axis === 0 ? [at, w, -u] : axis === 1 ? [u, at, -w] : [u, w, at];
}

function inside(cs: CrossSection, u: number, w: number) {
  const dot = M().CrossSection.square([0.1, 0.1], true).translate([u, w]);
  const rest = dot.subtract(cs);
  const ok = rest.area() < 1e-4;
  rest.delete();
  dot.delete();
  return ok;
}

/**
 * Where dowels go across the cut at `at`: spots with enough material around the dowel on both sides
 * along its whole length, spread as far apart as possible. Picks the biggest dowel that fits.
 */
export function dowelSpots(body: Manifold, axis: 0 | 1 | 2, at: number, want?: number): { d: number; len: number; spots: [number, number, number][] } | null {
  // After the rotation the cut plane lies at height `at` for every axis.
  const m = toZ(body, axis);
  for (const [d, len] of DOWELS) {
    const r = d / 2 + DOWEL_LUZ / 2 + DOWEL_WALL;
    const half = len / 2 + 0.5;
    let area: CrossSection | null = null;
    for (const dz of [-half + 0.3, -0.2, 0.2, half - 0.3]) {
      const s = m.slice(at + dz).offset(-r, 'Round');
      area = area ? area.intersect(s) : s;
      if (area.isEmpty()) break;
    }
    if (!area || area.isEmpty()) continue;
    const b = area.bounds();
    const step = Math.max(1, Math.sqrt(((b.max[0] - b.min[0]) * (b.max[1] - b.min[1])) / 600));
    const pts: [number, number][] = [];
    for (let u = b.min[0]; u <= b.max[0] + 1e-6; u += step) for (let w = b.min[1]; w <= b.max[1] + 1e-6; w += step) if (inside(area, u, w)) pts.push([u, w]);
    // Narrow strips (thick walls) slip between grid points: walk along the area's outline too.
    for (const c of area.offset(-0.05, 'Round').toPolygons())
      c.forEach((a, i) => {
        const z = c[(i + 1) % c.length];
        const k = Math.max(1, Math.ceil(Math.hypot(z[0] - a[0], z[1] - a[1]) / step));
        for (let j = 0; j < k; j++) pts.push([a[0] + ((z[0] - a[0]) * j) / k, a[1] + ((z[1] - a[1]) * j) / k]);
      });
    if (!pts.length) continue;
    // One dowel per ~4000 mm² of cut, 2–4, and never closer than 3 diameters.
    const n = want ?? Math.max(2, Math.min(4, Math.round(area.area() / 4000) + 1));
    const cu = pts.reduce((s, p) => s + p[0], 0) / pts.length, cw = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const chosen: [number, number][] = [];
    let best = pts[0], bd = -1;
    for (const p of pts) {
      const dd = Math.hypot(p[0] - cu, p[1] - cw);
      if (dd > bd) [best, bd] = [p, dd];
    }
    chosen.push(best);
    while (chosen.length < n) {
      let pick: [number, number] | null = null, far = 3 * d;
      for (const p of pts) {
        const dd = Math.min(...chosen.map((c) => Math.hypot(p[0] - c[0], p[1] - c[1])));
        if (dd > far) [pick, far] = [p, dd];
      }
      if (!pick) break;
      chosen.push(pick);
    }
    return { d, len, spots: chosen.map(([u, w]) => fromPlane(axis, u, w, at)) };
  }
  return null;
}
