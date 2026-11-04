import type { CrossSection, Manifold } from 'manifold-3d';
import { M } from './manifold';
import type { Edges } from '../types';

export const DEFAULT_EDGES: Edges = { kind: 'round', r: 2, vertical: true, top: true, bottom: false };

/** Height of one step of a rounded top or bottom edge: a printer's layer, so the steps never show. */
const STEP = 0.2;
const MAX_STEPS = 40;

/**
 * Rounds or chamfers the outer edges of a solid: the corners of its outline seen from above
 * (vertical edges) and the rim of that outline at the top and bottom. The solid is cut down to a
 * rounded copy of its own outline, so inner edges (a box's cavity) stay as they are.
 */
export function applyEdges(m: Manifold, e: Edges): Manifold {
  const b = m.boundingBox();
  const z0 = b.min[2], z1 = b.max[2], H = z1 - z0;
  const join = e.kind === 'round' ? 'Round' : 'Square';
  let outline: CrossSection = m.project();
  const r = Math.max(0, e.r);
  if (r < 0.05 || H <= 0) return m;
  if (e.vertical) outline = outline.offset(-r, 'Miter').offset(r, join);
  const rt = e.top ? Math.min(r, H / (e.bottom ? 2 : 1) - 0.01) : 0;
  const rb = e.bottom ? Math.min(r, H / (e.top ? 2 : 1) - 0.01) : 0;
  // Inset of the outline at distance d from the edge's plane (full radius at the edge, 0 at d = rr).
  const inset = (rr: number, d: number) => (e.kind === 'round' ? rr - Math.sqrt(Math.max(0, rr * rr - (rr - d) * (rr - d))) : rr - d);
  const env = smoothEnvelope(outline, z0, H, rt, rb, inset) ?? steppedEnvelope(outline, z0, H, rt, rb, inset, join);
  const out = m.intersect(env);
  return out.isEmpty() ? m : out;
}

type Inset = (rr: number, d: number) => number;

/** Bands of thin slabs, each a little smaller: always valid, slightly stepped. */
function steppedEnvelope(outline: CrossSection, z0: number, H: number, rt: number, rb: number, inset: Inset, join: 'Round' | 'Square'): Manifold {
  const pieces: Manifold[] = [];
  const mid = H - rt - rb;
  if (mid > 0.001) pieces.push(outline.extrude(mid).translate([0, 0, z0 + rb]));
  const band = (rr: number, from: number, dir: 1 | -1) => {
    const n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(rr / STEP)));
    const dz = rr / n;
    for (let k = 0; k < n; k++) {
      // Layer k counted from the flat part toward the edge; its inset is taken at the layer's middle.
      const layer = outline.offset(-inset(rr, rr - (k + 0.5) * dz), join);
      if (layer.isEmpty()) continue;
      const z = dir > 0 ? from + k * dz : from - (k + 1) * dz;
      pieces.push(layer.extrude(dz + 0.001).translate([0, 0, z]));
    }
  };
  if (rt > 0) band(rt, z0 + H - rt, 1);
  if (rb > 0) band(rb, z0 + rb, -1);
  return M().Manifold.union(pieces);
}

/**
 * Smooth version: the outline's prism with extra rings near the edges, whose corners are pushed
 * inward along their bisectors. Returns null when pushing would fold the outline over itself
 * (small features against a big radius); the stepped version is used then.
 */
function smoothEnvelope(outline: CrossSection, z0: number, H: number, rt: number, rb: number, inset: Inset): Manifold | null {
  const polys = outline.toPolygons();
  const miter = new Map<string, [number, number]>();
  const k = (x: number, y: number) => `${x.toFixed(4)},${y.toFixed(4)}`;
  for (const poly of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[(i + n - 1) % n], p = poly[i], c = poly[(i + 1) % n];
      const e1 = norm(p[0] - a[0], p[1] - a[1]), e2 = norm(c[0] - p[0], c[1] - p[1]);
      // Left normals point into the material for outer (CCW) and hole (CW) contours alike.
      const n1: [number, number] = [-e1[1], e1[0]], n2: [number, number] = [-e2[1], e2[0]];
      const dot = n1[0] * n2[0] + n1[1] * n2[1];
      if (dot < -0.5) return null; // spike sharper than 120°: offsetting it would fold
      miter.set(k(p[0], p[1]), [(n1[0] + n2[0]) / (1 + dot), (n1[1] + n2[1]) / (1 + dot)]);
    }
  }
  const pieces: Manifold[] = [];
  const mid = H - rt - rb;
  if (mid > 0.001) pieces.push(outline.extrude(mid).translate([0, 0, z0 + rb]));
  let expected = mid > 0.001 ? outline.area() * mid : 0;
  const band = (rr: number, from: number, dir: 1 | -1) => {
    const n = Math.min(MAX_STEPS, Math.max(2, Math.ceil(rr / STEP)));
    const prism = outline.extrude(rr, n - 1).translate([0, 0, dir > 0 ? from : from - rr]);
    pieces.push(
      prism.warp((v) => {
        const d = dir > 0 ? from + rr - v[2] : v[2] - (from - rr);
        const off = inset(rr, Math.min(rr, Math.max(0, d)));
        const mv = miter.get(k(v[0], v[1]));
        if (!mv || off <= 0) return;
        v[0] += mv[0] * off;
        v[1] += mv[1] * off;
      }),
    );
    for (let j = 0; j < 8; j++) expected += outline.offset(-inset(rr, rr - ((j + 0.5) * rr) / 8), 'Miter').area() * (rr / 8);
  };
  if (rt > 0) band(rt, z0 + H - rt, 1);
  if (rb > 0) band(rb, z0 + rb, -1);
  const env = M().Manifold.union(pieces);
  // A folded outline shows up as volume that does not match the offset outlines.
  if (env.status() !== 'NoError' || Math.abs(env.volume() - expected) > expected * 0.01 + 0.5) return null;
  return env;
}

function norm(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/** Rounded rectangle centred on the origin. */
export function roundRect(w: number, d: number, r: number): CrossSection {
  const rr = Math.max(0, Math.min(r, w / 2 - 0.01, d / 2 - 0.01));
  if (rr < 0.01) return M().CrossSection.square([w, d], true);
  return M().CrossSection.square([w - 2 * rr, d - 2 * rr], true).offset(rr, 'Round');
}
