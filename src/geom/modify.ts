import type { Manifold } from 'manifold-3d';
import type { Part, Shell, Xform } from '../types';
import { M } from './manifold';

export const DEFAULT_SHELL: Shell = { on: true, t: 2, open: 'none' };
export const DEFAULT_XFORM: Xform = { mirror: 'none', scale: [100, 100, 100] };

export const xformActive = (x?: Xform) => !!x && (x.mirror !== 'none' || x.scale.some((v) => Math.abs(v - 100) > 1e-6));

/** The body's shape moves away from its flat parts: holes and outlines no longer sit where drawn. */
export const warped = (p: Part) => !p.hole && (!!p.bend?.on || xformActive(p.xform));

/** The body is shown (and checked) as a finished piece because a modifier works on the whole of it. */
export const finishing = (p: Part) => warped(p) || (!p.hole && !!p.shell?.on);

/** Every direction to a corner, an edge middle or a face of a cube, scaled to length t. */
function directions(t: number, lateral: boolean) {
  const out: [number, number, number][] = [];
  for (const x of [-1, 0, 1])
    for (const y of [-1, 0, 1])
      for (const z of lateral ? [0] : [-1, 0, 1]) {
        if (!x && !y && !z) continue;
        const l = Math.hypot(x, y, z);
        out.push([(x / l) * t, (y / l) * t, (z / l) * t]);
      }
  return out;
}

/** Points that stay inside when the solid is pushed t in every direction: a close inward offset. */
function erode(m: Manifold, t: number, lateral: boolean): Manifold {
  const copies = directions(t, lateral).map((d) => m.translate(d));
  const out = M().Manifold.intersection([m, ...copies]);
  copies.forEach((c) => c.delete());
  return out;
}

/**
 * Hollows a solid, leaving walls about `t` thick. "top"/"bottom" also removes the wall over the
 * cavity on that side (a box from a block). Returns the input when the solid is too thin to hollow.
 */
export function applyShell(m: Manifold, s: Shell): Manifold {
  const t = Math.max(0.4, s.t);
  let cavity = erode(m, t, false);
  if (cavity.isEmpty() || cavity.volume() < 0.5) {
    cavity.delete();
    return m;
  }
  if (s.open !== 'none') {
    const b = m.boundingBox();
    const c = cavity.boundingBox();
    const mid = (c.min[2] + c.max[2]) / 2;
    const z0 = s.open === 'top' ? mid : b.min[2] - 1;
    const z1 = s.open === 'top' ? b.max[2] + 1 : mid;
    const slab = M()
      .Manifold.cube([b.max[0] - b.min[0] + 2, b.max[1] - b.min[1] + 2, z1 - z0], false)
      .translate([b.min[0] - 1, b.min[1] - 1, z0]);
    const side = erode(m, t, true);
    const column = side.intersect(slab);
    const next = cavity.add(column);
    [side, slab, column, cavity].forEach((x) => x.delete());
    cavity = next;
  }
  const out = m.subtract(cavity);
  cavity.delete();
  return out;
}

/** Mirrors and scales a solid about the middle of its base; it keeps standing where it stood. */
export function applyXform(m: Manifold, x: Xform): Manifold {
  if (!xformActive(x)) return m;
  const b = m.boundingBox();
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, z0 = b.min[2];
  const k = x.scale.map((v) => Math.max(1, v) / 100) as [number, number, number];
  const at0 = m.translate([-cx, -cy, -z0]);
  const n: [number, number, number] | null = x.mirror === 'x' ? [1, 0, 0] : x.mirror === 'y' ? [0, 1, 0] : x.mirror === 'z' ? [0, 0, 1] : null;
  const flipped = n ? at0.mirror(n) : at0;
  const scaled = flipped.scale(k);
  const lift = scaled.boundingBox().min[2];
  const out = scaled.translate([cx, cy, z0 - lift]);
  [at0, flipped, scaled].forEach((q, i, all) => all.indexOf(q) === i && q.delete());
  return out;
}
