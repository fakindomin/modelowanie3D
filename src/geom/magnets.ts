import * as THREE from 'three';
import type { CrossSection, Manifold } from 'manifold-3d';
import { MAGNETS } from '../catalog';
import { M } from './manifold';
import { worldBox } from './parts';
import type { Part } from '../types';

/** Rules of thumb for printed magnet pockets. */
export const MAGNET_LUZ = 0.2;
/** Plastic left around a pocket. */
export const MAGNET_WALL = 1.2;
/** Layer over a hidden magnet (printed after a pause). */
export const MAGNET_COVER = 0.6;

export type MagnetLayout = '4' | '6' | '8';

export interface MagnetOptions {
  size: string;
  layout: MagnetLayout;
  /** Magnets sealed in under a thin layer (print pause). */
  hidden: boolean;
  /** Lid to make when the box has none. */
  lid: 'none' | 'flat' | 'rim';
}

export function magnetDims(size: string) {
  const [d, h] = MAGNETS[size] ?? MAGNETS['6x3'];
  return { d, h, r: (d + MAGNET_LUZ) / 2, depth: h + 0.2 };
}

/** One pocket of the plan, in world X/Y. */
export interface Spot {
  x: number;
  y: number;
  /** Pocket sits in a column (corner) or pad (side) because the wall alone is too thin. */
  column?: { cx: number; cy: number; w: number; d: number };
  /** Mirror signs around the box centre, and which symmetric set the spot belongs to. */
  s: [number, number];
  set: 'corner' | 'sideX' | 'sideY';
}

/** Is a circle (centre, radius) fully inside material at every slice height? */
function fits(slices: CrossSection[], x: number, y: number, R: number) {
  const c = M().CrossSection.circle(R, 32).translate([x, y]);
  const area = c.area();
  let ok = true;
  for (const s of slices) {
    const rest = c.subtract(s);
    const a = rest.area();
    rest.delete();
    if (a > area * 0.005) {
      ok = false;
      break;
    }
  }
  c.delete();
  return ok;
}

/**
 * Where the pockets go on the top edge of a box-like body: corners (and side middles for 6/8),
 * as close to the outer edge as the walls allow. Where the wall is too thin, a column (corner)
 * or pad (side) of solid material is planned under the pocket.
 */
export function planSpots(body: Manifold, box: THREE.Box3, opt: MagnetOptions): Spot[] {
  const { r, depth } = magnetDims(opt.size);
  const R = r + MAGNET_WALL;
  const top = box.max.z;
  const sunk = depth + (opt.hidden ? MAGNET_COVER : 0);
  const zs = [top - 0.1, top - sunk / 2, top - sunk + 0.05, top - sunk - 0.4].filter((z) => z > box.min.z + 0.05);
  const slices = zs.map((z) => body.slice(z));
  const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2;
  const W = box.max.x - box.min.x, D = box.max.y - box.min.y;
  const S = Math.ceil(2 * R * 5) / 5; // column side, rounded to 0.2 mm
  const reach = Math.min(W, D) / 2 - R;
  const spots: Spot[] = [];
  const search = (ox: number, oy: number, dx: number, dy: number) => {
    for (let o = R; o <= Math.min(R + 8, reach); o += 0.25) {
      const x = ox + dx * o, y = oy + dy * o;
      if (fits(slices, x, y, R)) return [x, y] as const;
    }
    return null;
  };
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const ox = sx < 0 ? box.min.x : box.max.x, oy = sy < 0 ? box.min.y : box.max.y;
    const hit = search(ox, oy, -sx, -sy);
    if (hit) spots.push({ x: hit[0], y: hit[1], s: [sx, sy], set: 'corner' });
    else {
      const c = { cx: ox - (sx * S) / 2, cy: oy - (sy * S) / 2, w: S, d: S };
      spots.push({ x: c.cx, y: c.cy, column: c, s: [sx, sy], set: 'corner' });
    }
  }
  const sides: ('x' | 'y')[] = opt.layout === '8' ? ['x', 'y'] : opt.layout === '6' ? [W >= D ? 'y' : 'x'] : [];
  for (const side of sides)
    for (const sg of [-1, 1] as const) {
      // side 'y': the two walls facing ±Y (along the width), middle at x = cx.
      const ox = side === 'y' ? cx : sg < 0 ? box.min.x : box.max.x;
      const oy = side === 'y' ? (sg < 0 ? box.min.y : box.max.y) : cy;
      const dx = side === 'y' ? 0 : -sg, dy = side === 'y' ? -sg : 0;
      const hit = search(ox, oy, dx, dy);
      const s: [number, number] = side === 'y' ? [1, sg] : [sg, 1];
      const set = side === 'y' ? 'sideY' : 'sideX';
      if (hit) spots.push({ x: hit[0], y: hit[1], s, set });
      else {
        const c = { cx: ox + (dx * S) / 2, cy: oy + (dy * S) / 2, w: S, d: S };
        spots.push({ x: c.cx, y: c.cy, column: c, s, set });
      }
    }
  slices.forEach((s) => s.delete());
  return spots;
}

/** Wall thickness of a box-like body, measured inward from the middle of its -X side just under the top. */
export function wallThickness(body: Manifold, box: THREE.Box3): number {
  const z = box.max.z - 1;
  if (z <= box.min.z) return 2;
  const s = body.slice(z);
  const cy = (box.min.y + box.max.y) / 2;
  let t = 0;
  for (let x = box.min.x + 0.1; x < (box.min.x + box.max.x) / 2; x += 0.1) {
    const probe = M().CrossSection.square([0.05, 0.05], true).translate([x, cy]);
    const rest = probe.subtract(s);
    const outside = rest.area() > 0.0012;
    rest.delete();
    probe.delete();
    if (outside) break;
    t = x - box.min.x + 0.05;
  }
  s.delete();
  return Math.max(0.8, Math.round(t * 10) / 10);
}

/** Is there at least MAGNET_WALL of material all around a pocket (centre, radius) at height z? */
export function ringOk(body: Manifold, x: number, y: number, r: number, z: number) {
  const s = body.slice(z);
  const ok = fits([s], x, y, r + MAGNET_WALL - 0.05);
  s.delete();
  return ok;
}

export interface LidRef {
  part: Part;
  /** Lying on the box (pockets go into its underside) or elsewhere, e.g. on the bed ready to print. */
  resting: boolean;
}

/** World box of a body's solids. */
function solidsBox(parts: Part[], body: number) {
  const b = new THREE.Box3();
  parts.filter((p) => p.body === body && !p.hole).forEach((p) => b.union(worldBox(p)));
  return b;
}

/** The lid of the box body: a part lying on it, or a "Pokrywka" sized for it. */
export function findLid(parts: Part[], body: number, box: THREE.Box3 = solidsBox(parts, body)): LidRef | null {
  const W = box.max.x - box.min.x, D = box.max.y - box.min.y;
  for (const p of parts) {
    if (p.hole || p.body === body) continue;
    const b = worldBox(p);
    const ox = Math.min(b.max.x, box.max.x) - Math.max(b.min.x, box.min.x);
    const oy = Math.min(b.max.y, box.max.y) - Math.max(b.min.y, box.min.y);
    if (Math.abs(b.min.z - box.max.z) < 0.6 && ox > W * 0.5 && oy > D * 0.5) return { part: p, resting: true };
  }
  const lids = parts.filter(
    (p) => p.type === 'lid' && p.body !== body && Math.abs(Number(p.params.W) - W) < 1.5 && Math.abs(Number(p.params.D) - D) < 1.5,
  );
  const free = lids.find((l) => !parts.some((q) => q.body === l.body && q.type === 'magnet'));
  const lid = free ?? lids[0];
  return lid ? { part: lid, resting: false } : null;
}

/** The box body a lid belongs to: a box sized for it, or whatever it lies on. */
export function boxForLid(parts: Part[], lid: Part): number | null {
  const box = parts.find((p) => p.type === 'box' && p.body !== lid.body && Math.abs(Number(p.params.W) - Number(lid.params.W)) < 1.5 && Math.abs(Number(p.params.D) - Number(lid.params.D)) < 1.5);
  if (box) return box.body;
  const lb = worldBox(lid);
  for (const p of parts) {
    if (p.hole || p.body === lid.body) continue;
    const b = worldBox(p);
    if (Math.abs(b.max.z - lb.min.z) < 0.6 && b.min.x < lb.max.x && b.max.x > lb.min.x && b.min.y < lb.max.y && b.max.y > lb.min.y) return p.body;
  }
  return null;
}
