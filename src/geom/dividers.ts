import type { Manifold } from 'manifold-3d';
import type { Params } from '../parts/def';
import { M } from './manifold';

/**
 * Divider layout of a box, kept in the part's `div` parameter as JSON.
 * xs: lines running front to back (positions across the width), ys: lines running left to right,
 * both as fractions of the inside. Each line is cut into segments by the crossing lines;
 * `off` lists the removed ones: "v{line}:{segment}", "h{line}:{segment}" or "r{spoke}".
 */
export interface DivLayout {
  xs: number[];
  ys: number[];
  off: string[];
}

/** Narrowest compartment the editor allows, mm. */
export const MIN_CELL = 5;

const uniform = (n: number) => Array.from({ length: Math.max(0, Math.round(n) - 1) }, (_, i) => (i + 1) / Math.round(n));

export function layoutOf(p: Params): DivLayout {
  if (typeof p.div === 'string' && p.div) {
    try {
      const l = JSON.parse(p.div) as DivLayout;
      if (Array.isArray(l.xs) && Array.isArray(l.ys)) return { xs: l.xs, ys: l.ys, off: l.off ?? [] };
    } catch {
      /* fall back to the plain grid */
    }
  }
  return { xs: uniform(Number(p.nx) || 1), ys: uniform(Number(p.ny) || 1), off: [] };
}

export const encode = (l: DivLayout) => JSON.stringify({ xs: l.xs.map((v) => Math.round(v * 1e4) / 1e4), ys: l.ys.map((v) => Math.round(v * 1e4) / 1e4), off: [...new Set(l.off)].sort() });

/** Parameters that store a layout: the counts follow it so the plain fields and the lid stay in step. */
export const layoutParams = (l: DivLayout): Params => ({ div: encode(l), nx: l.xs.length + 1, ny: l.ys.length + 1 });

export interface Segment {
  key: string;
  axis: 'v' | 'h' | 'r';
  line: number;
  /** End points in the box's own frame (centred), mm. */
  a: [number, number];
  b: [number, number];
  on: boolean;
  /** Ends that meet the box wall (the others meet a crossing divider). */
  wallA?: boolean;
  wallB?: boolean;
}

/** Grid segments over an inside of iw × id mm centred on the origin. */
export function gridSegments(l: DivLayout, iw: number, id: number): Segment[] {
  const off = new Set(l.off);
  const X = l.xs.map((f) => -iw / 2 + f * iw);
  const Y = l.ys.map((f) => -id / 2 + f * id);
  const bx = [-iw / 2, ...X, iw / 2];
  const by = [-id / 2, ...Y, id / 2];
  const out: Segment[] = [];
  X.forEach((x, i) => {
    for (let j = 0; j < by.length - 1; j++) out.push({ key: `v${i}:${j}`, axis: 'v', line: i, a: [x, by[j]], b: [x, by[j + 1]], on: !off.has(`v${i}:${j}`), wallA: j === 0, wallB: j === by.length - 2 });
  });
  Y.forEach((y, i) => {
    for (let j = 0; j < bx.length - 1; j++) out.push({ key: `h${i}:${j}`, axis: 'h', line: i, a: [bx[j], y], b: [bx[j + 1], y], on: !off.has(`h${i}:${j}`), wallA: j === 0, wallB: j === bx.length - 2 });
  });
  return out;
}

/** Spokes of a round or hexagonal box, from the centre to radius r. */
export function radialSegments(p: Params, l: DivLayout, r: number): Segment[] {
  const n = Math.max(0, Math.round(Number(p.nr) || 0));
  const rot = ((Number(p.rot) || 0) * Math.PI) / 180;
  const off = new Set(l.off);
  return Array.from({ length: n < 2 ? 0 : n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2;
    return { key: `r${i}`, axis: 'r' as const, line: i, a: [0, 0] as [number, number], b: [Math.cos(a) * r, Math.sin(a) * r] as [number, number], on: !off.has(`r${i}`), wallB: true };
  });
}

/** Segments for any box shape (inside sizes iw × id; round and hex use iw as the inside width). */
export function segmentsOf(p: Params, iw: number, id: number): Segment[] {
  const l = layoutOf(p);
  // Spokes of a hexagon run out to its corners; the caller clips them to the inside.
  if ((p.shape === 'round' || p.shape === 'hex') && p.divMode === 'radial') return radialSegments(p, l, p.shape === 'hex' ? iw / Math.sqrt(3) : iw / 2);
  return gridSegments(l, iw, id);
}

/**
 * Divider walls of thickness `t` from z0 up `h`, in the box's own frame. Ends at the box wall are
 * lengthened by `extend` so they sink into it (the caller clips them); ends at a crossing reach half
 * into the crossing divider. Spokes start at the centre.
 */
export function dividerSolid(segs: Segment[], t: number, z0: number, h: number, extend: number): Manifold | null {
  const parts: Manifold[] = [];
  for (const s of segs) {
    if (!s.on) continue;
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    const start = s.axis === 'r' ? 0 : s.wallA ? extend : t / 2;
    const end = s.wallB ? extend : t / 2;
    const L = len + start + end;
    const a = Math.atan2(dy, dx);
    const ang = (a * 180) / Math.PI;
    const cx = (s.a[0] + s.b[0]) / 2 + (Math.cos(a) * (end - start)) / 2;
    const cy = (s.a[1] + s.b[1]) / 2 + (Math.sin(a) * (end - start)) / 2;
    parts.push(M().Manifold.cube([L, t, h], true).rotate([0, 0, ang]).translate([cx, cy, z0 + h / 2]));
  }
  return parts.length ? M().Manifold.union(parts) : null;
}

// ---------------------------------------------------------------- editing a layout

function shiftOff(off: string[], axis: 'v' | 'h', fn: (line: number, seg: number) => [number, number] | null) {
  const out: string[] = [];
  for (const k of off) {
    const m = /^([vh])(\d+):(\d+)$/.exec(k);
    if (!m || m[1] !== axis) {
      out.push(k);
      continue;
    }
    const r = fn(Number(m[2]), Number(m[3]));
    if (r) out.push(`${axis}${r[0]}:${r[1]}`);
  }
  return out;
}

/** Adds a line at fraction f; segments of the crossing lines split in two (both keep their state). */
export function addLine(l: DivLayout, axis: 'v' | 'h', f: number): DivLayout {
  const list = axis === 'v' ? l.xs : l.ys;
  const at = list.filter((x) => x < f).length;
  const nextList = [...list.slice(0, at), f, ...list.slice(at)];
  const other = axis === 'v' ? 'h' : 'v';
  let off = shiftOff(l.off, axis, (line, seg) => [line >= at ? line + 1 : line, seg]);
  // Crossing lines: their segment `at` splits into at and at+1.
  const extra: string[] = [];
  off = shiftOff(off, other, (line, seg) => {
    if (seg === at) extra.push(`${other}${line}:${at + 1}`);
    return [line, seg > at ? seg + 1 : seg];
  });
  off.push(...extra);
  return axis === 'v' ? { xs: nextList, ys: l.ys, off } : { xs: l.xs, ys: nextList, off };
}

/** Removes line i; segments i and i+1 of the crossing lines merge (off only if both were off). */
export function removeLine(l: DivLayout, axis: 'v' | 'h', i: number): DivLayout {
  const list = (axis === 'v' ? l.xs : l.ys).filter((_, k) => k !== i);
  const other = axis === 'v' ? 'h' : 'v';
  let off = shiftOff(l.off, axis, (line, seg) => (line === i ? null : [line > i ? line - 1 : line, seg]));
  const set = new Set(off);
  const both = new Set<number>();
  for (const k of set) {
    const m = new RegExp(`^${other}(\\d+):${i}$`).exec(k);
    if (m && set.has(`${other}${m[1]}:${i + 1}`)) both.add(Number(m[1]));
  }
  off = shiftOff(off, other, (line, seg) => {
    if (seg === i || seg === i + 1) return both.has(line) ? [line, i] : null;
    return [line, seg > i + 1 ? seg - 1 : seg];
  });
  return axis === 'v' ? { xs: list, ys: l.ys, off } : { xs: l.xs, ys: list, off };
}

/** Turns one segment on or off; a grid line with every segment off disappears. */
export function toggleSegment(l: DivLayout, key: string): DivLayout {
  const off = l.off.includes(key) ? l.off.filter((k) => k !== key) : [...l.off, key];
  let next = { ...l, off };
  const m = /^([vh])(\d+):/.exec(key);
  if (m) {
    const axis = m[1] as 'v' | 'h';
    const line = Number(m[2]);
    const count = (axis === 'v' ? l.ys.length : l.xs.length) + 1;
    if (Array.from({ length: count }, (_, j) => `${axis}${line}:${j}`).every((k) => off.includes(k))) next = removeLine(next, axis, line);
  }
  return next;
}

/** Moves line i to fraction f, keeping at least MIN_CELL mm to its neighbours and the walls. */
export function moveLine(l: DivLayout, axis: 'v' | 'h', i: number, f: number, size: number): DivLayout {
  const list = [...(axis === 'v' ? l.xs : l.ys)];
  const gap = MIN_CELL / size;
  const lo = (i > 0 ? list[i - 1] : 0) + gap;
  const hi = (i < list.length - 1 ? list[i + 1] : 1) - gap;
  if (lo > hi) return l;
  list[i] = Math.min(hi, Math.max(lo, f));
  return axis === 'v' ? { ...l, xs: list } : { ...l, ys: list };
}

/** Puts a new line in the middle of the widest compartment along the axis. */
export function addInWidestGap(l: DivLayout, axis: 'v' | 'h'): DivLayout {
  const b = [0, ...(axis === 'v' ? l.xs : l.ys), 1];
  let best = 0;
  for (let i = 1; i < b.length - 1; i++) if (b[i + 1] - b[i] > b[best + 1] - b[best]) best = i;
  return addLine(l, axis, (b[best] + b[best + 1]) / 2);
}

/** Equal spacing, keeping which segments are removed. */
export function evenOut(l: DivLayout): DivLayout {
  return { xs: l.xs.map((_, i) => (i + 1) / (l.xs.length + 1)), ys: l.ys.map((_, i) => (i + 1) / (l.ys.length + 1)), off: l.off };
}
