/**
 * „Znak na STL”: engraves the shop's „f” into the bottom of any ready-to-print STL (the face lying on the bed,
 * at the lowest Z). The mark is mirrored, so it reads normally when the print is turned over.
 */
import type { CrossSection, Manifold } from 'manifold-3d';
import { M } from '../geom/manifold';
import { markOutline } from '../lite/mark';

export const DEPTH = 0.5;
/** Clear border kept around the letter. */
const MARGIN = 1.2;

/** Triangles of a binary or ASCII STL, 9 floats each. */
export function parseSTL(buf: ArrayBuffer): Float32Array {
  const dv = new DataView(buf);
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buf.byteLength) {
      const out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
      return out;
    }
  }
  const text = new TextDecoder().decode(buf);
  const nums: number[] = [];
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) nums.push(+m[1], +m[2], +m[3]);
  if (!nums.length || nums.length % 9) throw new Error('To nie wygląda na plik STL.');
  return Float32Array.from(nums);
}

/** A solid from a triangle soup (shared corners welded). Throws when the mesh is not closed. */
export function toManifold(tris: Float32Array): Manifold {
  const api = M();
  const index = new Map<string, number>();
  const verts: number[] = [];
  const triVerts = new Uint32Array(tris.length / 3);
  for (let i = 0; i < tris.length; i += 3) {
    const key = `${Math.round(tris[i] * 1e4)},${Math.round(tris[i + 1] * 1e4)},${Math.round(tris[i + 2] * 1e4)}`;
    let v = index.get(key);
    if (v === undefined) {
      v = verts.length / 3;
      index.set(key, v);
      verts.push(tris[i], tris[i + 1], tris[i + 2]);
    }
    triVerts[i / 3] = v;
  }
  // Drop triangles collapsed by the weld.
  const keep: number[] = [];
  for (let t = 0; t < triVerts.length; t += 3) {
    const a = triVerts[t], b = triVerts[t + 1], c = triVerts[t + 2];
    if (a !== b && b !== c && a !== c) keep.push(a, b, c);
  }
  const mesh = new api.Mesh({ numProp: 3, vertProperties: Float32Array.from(verts), triVerts: Uint32Array.from(keep) });
  mesh.merge();
  try {
    const m = new api.Manifold(mesh);
    if (m.isEmpty()) throw new Error('empty');
    return m;
  } catch {
    throw new Error('Model nie jest zamkniętą bryłą (ma dziury lub sklejone ścianki).');
  }
}

export interface Bottom {
  z: number;
  /** Where the mark may go: the face on the bed, with enough material above the letter. */
  free: CrossSection;
  area: number;
}

export function bottomOf(m: Manifold): Bottom {
  const z = m.boundingBox().min[2];
  const a = m.slice(z + 0.1), b = m.slice(z + DEPTH + 0.6);
  const free = a.intersect(b);
  a.delete();
  b.delete();
  return { z, free, area: free.area() };
}

/** The letter as cut (mirrored, rotated by `rot`°, centred at `at`). */
export const letterAt = (h: number, rot: number, at: [number, number]) => markOutline(h, true).rotate(rot).translate(at);

export function fits(free: CrossSection, h: number, rot: number, at: [number, number]): boolean {
  const l = letterAt(h, rot, at);
  const r = l.offset(MARGIN, 'Round');
  const i = free.intersect(r);
  const ok = i.area() > r.area() - 0.02;
  [l, r, i].forEach((x) => x.delete());
  return ok;
}

function centroid(polys: [number, number][][]): [number, number] {
  let A = 0, cx = 0, cy = 0;
  for (const p of polys)
    for (let k = 0; k < p.length; k++) {
      const [x0, y0] = p[k], [x1, y1] = p[(k + 1) % p.length];
      const c = x0 * y1 - x1 * y0;
      A += c;
      cx += (x0 + x1) * c;
      cy += (y0 + y1) * c;
    }
  return A ? [cx / (3 * A), cy / (3 * A)] : [0, 0];
}

function inside(polys: [number, number][][], x: number, y: number) {
  let w = 0;
  for (const p of polys)
    for (let k = 0; k < p.length; k++) {
      const [x0, y0] = p[k], [x1, y1] = p[(k + 1) % p.length];
      if (y0 <= y ? y1 > y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) > 0 : y1 <= y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) < 0)
        w += y0 <= y ? 1 : -1;
    }
  return w !== 0;
}

/** Size picked from the bottom (about a third of its narrow side, 5–10 mm). */
export function autoSize(free: CrossSection) {
  const bb = free.bounds();
  const narrow = Math.min(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]);
  return Math.max(5, Math.min(10, Math.round(narrow * 0.35)));
}

/** Where the letter `h` tall fits, nearest the middle of the bottom; null when it does not fit anywhere. */
export function place(free: CrossSection, h: number, rot: number): [number, number] | null {
  const polys = free.toPolygons() as [number, number][][];
  if (!polys.length) return null;
  const c = centroid(polys);
  const l = letterAt(h, rot, [0, 0]);
  const lb = l.bounds();
  l.delete();
  const half = Math.min(lb.max[0] - lb.min[0], lb.max[1] - lb.min[1]) / 2 + MARGIN;
  const er = free.offset(-half, 'Round');
  const ep = er.toPolygons() as [number, number][][];
  const eb = er.bounds();
  er.delete();
  if (!ep.length) return null;
  const pts: [number, number][] = [c];
  const step = Math.max(0.5, Math.max(eb.max[0] - eb.min[0], eb.max[1] - eb.min[1]) / 120);
  for (let x = eb.min[0]; x <= eb.max[0]; x += step) for (let y = eb.min[1]; y <= eb.max[1]; y += step) if (inside(ep, x, y)) pts.push([x, y]);
  pts.sort((a, b) => Math.hypot(a[0] - c[0], a[1] - c[1]) - Math.hypot(b[0] - c[0], b[1] - c[1]));
  for (const p of pts.slice(0, 400)) if (fits(free, h, rot, p)) return p;
  return null;
}

/** Auto: the biggest size from `autoSize` down to 5 mm that fits somewhere. */
export function autoPlace(free: CrossSection, rot = 0): { h: number; at: [number, number] } | null {
  for (let h = autoSize(free); h >= 5; h--) {
    const at = place(free, h, rot);
    if (at) return { h, at };
  }
  return null;
}

export function engraveBottom(m: Manifold, z: number, h: number, rot: number, at: [number, number]): Manifold {
  const l = letterAt(h, rot, at);
  const cut = l.extrude(DEPTH + 1).translate([0, 0, z - 1]);
  const out = m.subtract(cut);
  l.delete();
  cut.delete();
  return out;
}
