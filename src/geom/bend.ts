import type { Manifold } from 'manifold-3d';
import type { Bend } from '../types';

export const DEFAULT_BEND: Bend = { on: true, mode: 'wrap', axis: 'x', dir: 'down', D: 32, luz: 0.3, at: 0, angle: 90, r: 3 };

/** Where along the bent axis the shape changes: the whole length for a wrap, the bend zone for a fold. */
export function bendZone(b: Bend, lo: number, hi: number, t: number): [number, number] {
  if (b.mode === 'wrap') return [lo, hi];
  return [b.at, b.at + ((b.angle * Math.PI) / 180) * (b.r + t / 2)];
}

/**
 * Bends a finished body (world coordinates, holes already cut).
 * wrap: the length along `axis` rolls around a pipe of diameter D (+ play): the bottom face hugs it
 * ("down", ends go down) or the top face does ("up", ends go up), centred on the body.
 * angle: from the line `at` on, the body folds by `angle` degrees round an inner radius `r`; the
 * neutral layer (half the thickness) keeps its length, so flat dimensions stay true.
 * The result keeps the flat body's lowest point and centre, so it stays where it was.
 */
export function applyBend(m: Manifold, b: Bend): Manifold {
  const box = m.boundingBox();
  const ax = b.axis === 'x' ? 0 : 1;
  const lo = box.min[ax], hi = box.max[ax];
  const zb = box.min[2], zt = box.max[2], t = zt - zb;
  if (hi - lo < 0.1 || t <= 0) return m;
  const down = b.dir === 'down';
  let warp: (u: number, z: number) => [number, number];
  let edge: number;
  if (b.mode === 'wrap') {
    const R = Math.max(0.5, b.D / 2 + b.luz);
    const c = (lo + hi) / 2;
    edge = Math.max(0.4, Math.min(2, R * 0.08));
    warp = (u, z) => {
      // The middle layer keeps its length, as in a real bent strip.
      const th = (u - c) / (R + t / 2);
      const rho = down ? R + (z - zb) : R + (zt - z);
      return down ? [c + rho * Math.sin(th), zb - R + rho * Math.cos(th)] : [c + rho * Math.sin(th), zt + R - rho * Math.cos(th)];
    };
  } else {
    const a = (Math.max(0, Math.min(180, b.angle)) * Math.PI) / 180;
    const r = Math.max(0, b.r), rn = r + t / 2;
    if (a <= 0 || b.at <= lo || b.at >= hi) return m;
    edge = Math.max(0.3, Math.min(1.5, (rn * a) / 16));
    warp = (u, z) => {
      const s = u - b.at;
      if (s <= 0) return [u, z];
      const th = Math.min(s / rn, a), rest = Math.max(0, s - a * rn);
      const rho = down ? r + (z - zb) : r + (zt - z);
      const cz = down ? zb - r : zt + r, sg = down ? 1 : -1;
      // Point on the arc, then straight on along the bent leg.
      return [b.at + rho * Math.sin(th) + rest * Math.cos(a), cz + sg * rho * Math.cos(th) - sg * rest * Math.sin(a)];
    };
  }
  const bent = m.refineToLength(edge).warp((v) => {
    const [u, z] = warp(v[ax], v[2]);
    v[ax] = u;
    v[2] = z;
  });
  // Keep the lowest point where the flat body's was, so a part on the bed stays on the bed.
  const nb = bent.boundingBox();
  return bent.translate([0, 0, zb - nb.min[2]]);
}
