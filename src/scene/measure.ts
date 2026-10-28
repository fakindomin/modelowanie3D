import * as THREE from 'three';
import type { Vec3 } from '../types';

/** What the cursor points at in "Wymiary" mode, in world millimetres. */
export interface Feature {
  kind: 'face' | 'round' | 'edge' | 'circle';
  /** Part id, or "g:<body>" for a merged group. */
  pick: string;
  /** Short text: "80 × 60 mm", "Ø 6,2 · wys. 3,2 mm", "40 mm". */
  label: string;
  /** Numbers shown, for matching against the part's parameters. */
  values: number[];
  /** Triangles to highlight (world, flat xyz) or the edge polyline. */
  tris?: number[];
  line?: number[];
  /** Reference for distances: a point, and the plane normal (faces) or axis (round). */
  anchor: Vec3;
  normal?: Vec3;
}

interface Topo {
  /** Welded vertex id of each triangle corner. */
  ids: Uint32Array;
  verts: THREE.Vector3[];
  normals: THREE.Vector3[];
  /** Triangles sharing each edge, by key "a:b" (a < b). */
  edges: Map<string, number[]>;
  /** Triangles touching each welded vertex. */
  vtris: number[][];
}

const LIMIT = 60000;
const topoCache = new WeakMap<THREE.BufferGeometry, Topo | null>();

function topo(g: THREE.BufferGeometry): Topo | null {
  if (topoCache.has(g)) return topoCache.get(g)!;
  const pos = g.attributes.position;
  const n = pos.count / 3;
  if (n > LIMIT) {
    topoCache.set(g, null);
    return null;
  }
  const key = new Map<string, number>();
  const verts: THREE.Vector3[] = [];
  const ids = new Uint32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const k = `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
    let id = key.get(k);
    if (id === undefined) {
      id = verts.length;
      key.set(k, id);
      verts.push(v);
    }
    ids[i] = id;
  }
  const normals: THREE.Vector3[] = [];
  const edges = new Map<string, number[]>();
  const vtris: number[][] = verts.map(() => []);
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < n; t++) {
    const [a, b, c] = [ids[3 * t], ids[3 * t + 1], ids[3 * t + 2]];
    normals.push(e1.subVectors(verts[b], verts[a]).cross(e2.subVectors(verts[c], verts[a])).clone().normalize());
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const k = p < q ? `${p}:${q}` : `${q}:${p}`;
      const l = edges.get(k);
      if (l) l.push(t);
      else edges.set(k, [t]);
    }
    vtris[a].push(t);
    vtris[b].push(t);
    vtris[c].push(t);
  }
  const out = { ids, verts, normals, edges, vtris };
  topoCache.set(g, out);
  return out;
}

const SHARP = Math.cos((25 * Math.PI) / 180);
const ekey = (p: number, q: number) => (p < q ? `${p}:${q}` : `${q}:${p}`);

function neighbours(T: Topo, t: number): number[] {
  const out: number[] = [];
  const [a, b, c] = [T.ids[3 * t], T.ids[3 * t + 1], T.ids[3 * t + 2]];
  for (const [p, q] of [[a, b], [b, c], [c, a]]) for (const o of T.edges.get(ekey(p, q)) ?? []) if (o !== t) out.push(o);
  return out;
}

/** Is the edge p–q a crease (or open boundary)? */
function sharp(T: Topo, p: number, q: number) {
  const ts = T.edges.get(ekey(p, q)) ?? [];
  if (ts.length !== 2) return true;
  return T.normals[ts[0]].dot(T.normals[ts[1]]) < SHARP;
}

function grow(T: Topo, start: number, ok: (from: number, to: number) => boolean): number[] {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const t = queue.pop()!;
    for (const o of neighbours(T, t))
      if (!seen.has(o) && ok(t, o)) {
        seen.add(o);
        queue.push(o);
      }
  }
  return [...seen];
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');

/** Least-squares circle through 2D points (Kåsa fit). */
function circleFit(pts: [number, number][]) {
  let sx = 0, sy = 0;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  const mx = sx / pts.length, my = sy / pts.length;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const [x, y] of pts) {
    const u = x - mx, v = y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const bu = (suuu + suvv) / 2, bv = (svvv + svuu) / 2;
  const uc = (bu * svv - bv * suv) / det, vc = (bv * suu - bu * suv) / det;
  const cx = uc + mx, cy = vc + my;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / pts.length);
  const err = Math.max(...pts.map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r)));
  return { cx, cy, r, err };
}

function basis(n: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  // Prefer world axes so a box face reads as width × depth.
  const ax = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const cands = ax.filter((a) => Math.abs(a.dot(n)) < 0.01);
  if (cands.length >= 2) return [cands[0], cands[1]];
  const u = new THREE.Vector3().crossVectors(n, Math.abs(n.z) < 0.9 ? ax[2] : ax[0]).normalize();
  return [u, new THREE.Vector3().crossVectors(n, u).normalize()];
}

export interface HitInput {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  faceIndex: number;
  point: THREE.Vector3;
  pick: string;
  /** Projects a world point to screen pixels. */
  toScreen: (v: THREE.Vector3) => THREE.Vector2;
  cursor: THREE.Vector2;
}

/** Edge, flat face or round surface under the cursor, with its dimensions. */
export function featureAt(h: HitInput): Feature | null {
  const T = topo(h.geometry);
  const m = h.matrix;
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const W = (v: THREE.Vector3) => v.clone().applyMatrix4(m);
  const v3 = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];
  if (!T) {
    const b = h.geometry.boundingBox!.clone().applyMatrix4(m);
    const s = b.getSize(new THREE.Vector3());
    return { kind: 'face', pick: h.pick, label: `${fmt(s.x)} × ${fmt(s.y)} × ${fmt(s.z)} mm (całość)`, values: [s.x, s.y, s.z], anchor: v3(h.point) };
  }
  const t = h.faceIndex;
  const tv = [T.ids[3 * t], T.ids[3 * t + 1], T.ids[3 * t + 2]];

  // 1. Edge: a crease of this triangle passing within a few pixels of the cursor.
  let best: [number, number] | null = null;
  let bestD = 7;
  for (const [p, q] of [[tv[0], tv[1]], [tv[1], tv[2]], [tv[2], tv[0]]]) {
    if (!sharp(T, p, q)) continue;
    const a = h.toScreen(W(T.verts[p])), b = h.toScreen(W(T.verts[q]));
    const ab = b.clone().sub(a);
    const k = THREE.MathUtils.clamp(h.cursor.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9), 0, 1);
    const d = a.clone().add(ab.multiplyScalar(k)).distanceTo(h.cursor);
    if (d < bestD) {
      bestD = d;
      best = [p, q];
    }
  }
  if (best) {
    // Follow the crease through its neighbours: straight on for a line, round for a circle.
    const chain = [best[0], best[1]];
    const used = new Set([ekey(best[0], best[1])]);
    const dir0 = T.verts[best[1]].clone().sub(T.verts[best[0]]).normalize();
    let straight = true;
    for (const end of [1, 0]) {
      for (let guard = 0; guard < 2000; guard++) {
        const v = end ? chain[chain.length - 1] : chain[0];
        const prev = end ? chain[chain.length - 2] : chain[1];
        const din = T.verts[v].clone().sub(T.verts[prev]).normalize();
        let next = -1, bestDot = -2;
        for (const tt of T.vtris[v])
          for (const w of [T.ids[3 * tt], T.ids[3 * tt + 1], T.ids[3 * tt + 2]]) {
            if (w === v || used.has(ekey(v, w)) || !sharp(T, v, w)) continue;
            const dot = T.verts[w].clone().sub(T.verts[v]).normalize().dot(din);
            if (dot > bestDot) {
              bestDot = dot;
              next = w;
            }
          }
        if (next < 0 || bestDot < 0.7) break;
        if (bestDot < 0.9999) straight = false;
        used.add(ekey(v, next));
        if (end) chain.push(next);
        else chain.unshift(next);
        if (next === (end ? chain[0] : chain[chain.length - 1])) break;
      }
      if (chain[0] === chain[chain.length - 1]) break;
    }
    const pts = chain.map((i) => W(T.verts[i]));
    const line = pts.flatMap((p) => [p.x, p.y, p.z]);
    if (straight || dir0.lengthSq() === 0) {
      const a = pts[0], b = pts[pts.length - 1];
      const L = a.distanceTo(b);
      return { kind: 'edge', pick: h.pick, label: `Krawędź ${fmt(L)} mm`, values: [L], line, anchor: v3(a.clone().add(b).multiplyScalar(0.5)), normal: v3(b.clone().sub(a).normalize()) };
    }
    const closed = chain[0] === chain[chain.length - 1];
    // A round edge: fit a circle in its plane.
    const c0 = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);
    const n = new THREE.Vector3();
    for (let i = 1; i + 1 < pts.length; i++) n.add(pts[i].clone().sub(c0).cross(pts[i + 1].clone().sub(c0)));
    n.normalize();
    const [u, w] = basis(n);
    const fit = circleFit(pts.map((p) => [p.clone().sub(c0).dot(u), p.clone().sub(c0).dot(w)]));
    if (fit && fit.err < Math.max(0.05, fit.r * 0.03)) {
      const center = c0.clone().add(u.clone().multiplyScalar(fit.cx)).add(w.clone().multiplyScalar(fit.cy));
      return { kind: 'circle', pick: h.pick, label: `${closed ? 'Okrąg' : 'Łuk'} Ø ${fmt(2 * fit.r)} mm`, values: [2 * fit.r, fit.r], line, anchor: v3(center), normal: v3(n) };
    }
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    return { kind: 'edge', pick: h.pick, label: `Krawędź ${fmt(L)} mm`, values: [L], line, anchor: v3(h.point) };
  }

  // 2. Flat face: the coplanar region around the triangle.
  const n0 = T.normals[t];
  const p0 = T.verts[tv[0]];
  const flat = grow(T, t, (_, o) => T.normals[o].dot(n0) > 0.99995 && Math.abs(T.verts[T.ids[3 * o]].clone().sub(p0).dot(n0)) < 1e-3);
  const smooth = grow(T, t, (a, o) => T.normals[o].dot(T.normals[a]) > SHARP);
  const trisOf = (list: number[]) => list.flatMap((tt) => [0, 1, 2].flatMap((k) => v3(W(T.verts[T.ids[3 * tt + k]]))));
  if (smooth.length <= flat.length * 1.05 || smooth.length < 6) {
    const nw = n0.clone().applyMatrix3(nm).normalize();
    const [u, w] = basis(nw);
    const vs = [...new Set(flat.flatMap((tt) => [T.ids[3 * tt], T.ids[3 * tt + 1], T.ids[3 * tt + 2]]))].map((i) => W(T.verts[i]));
    const us = vs.map((v) => v.dot(u)), ws = vs.map((v) => v.dot(w));
    const a = Math.max(...us) - Math.min(...us), b = Math.max(...ws) - Math.min(...ws);
    // Round flat face (top of a cylinder): its outline is a circle.
    const c = vs.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(vs.length);
    const fit = vs.length > 12 ? circleFit(vs.map((v) => [v.clone().sub(c).dot(u), v.clone().sub(c).dot(w)])) : null;
    const round = fit && fit.err < Math.max(0.05, fit.r * 0.03) && Math.abs(a - b) < 0.05 * Math.max(a, b);
    return {
      kind: 'face',
      pick: h.pick,
      label: round ? `Ścianka Ø ${fmt(2 * fit!.r)} mm` : `Ścianka ${fmt(a)} × ${fmt(b)} mm`,
      values: round ? [2 * fit!.r, fit!.r] : [a, b],
      tris: trisOf(flat),
      anchor: v3(h.point),
      normal: v3(nw),
    };
  }

  // 3. Round surface (cylinder wall, hole, pocket): axis ⟂ to all normals, circle fit across it.
  const ns = smooth.map((tt) => T.normals[tt].clone().applyMatrix3(nm).normalize());
  let axis = new THREE.Vector3();
  let far = 1;
  for (const nn of ns) {
    const d = Math.abs(nn.dot(ns[0]));
    if (d < far) {
      far = d;
      axis = new THREE.Vector3().crossVectors(ns[0], nn);
    }
  }
  if (axis.lengthSq() < 1e-8) return null;
  axis.normalize();
  const [u, w] = basis(axis);
  const vs = [...new Set(smooth.flatMap((tt) => [T.ids[3 * tt], T.ids[3 * tt + 1], T.ids[3 * tt + 2]]))].map((i) => W(T.verts[i]));
  const c0 = vs.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(vs.length);
  const fit = circleFit(vs.map((v) => [v.clone().sub(c0).dot(u), v.clone().sub(c0).dot(w)]));
  const hs = vs.map((v) => v.dot(axis));
  const H = Math.max(...hs) - Math.min(...hs);
  if (!fit || fit.err > Math.max(0.1, fit.r * 0.05)) return { kind: 'face', pick: h.pick, label: `Powierzchnia, wys. ${fmt(H)} mm`, values: [H], tris: trisOf(smooth), anchor: v3(h.point) };
  const center = c0.clone().add(u.clone().multiplyScalar(fit.cx)).add(w.clone().multiplyScalar(fit.cy));
  // Normals pointing at the axis: we're looking at the inside of a hole.
  const inward = ns[0].dot(W(T.verts[tv[0]]).sub(center).sub(axis.clone().multiplyScalar(W(T.verts[tv[0]]).sub(center).dot(axis)))) < 0;
  return {
    kind: 'round',
    pick: h.pick,
    label: `${inward ? 'Otwór' : 'Walec'} Ø ${fmt(2 * fit.r)} mm · wys. ${fmt(H)} mm`,
    values: [2 * fit.r, fit.r, H],
    tris: trisOf(smooth),
    anchor: v3(center),
    normal: v3(axis),
  };
}

/** Distance between two pinned features: between parallel faces, else between their reference points. */
export function distance(a: Feature, b: Feature) {
  const pa = new THREE.Vector3(...a.anchor), pb = new THREE.Vector3(...b.anchor);
  if (a.kind === 'face' && b.kind === 'face' && a.normal && b.normal) {
    const na = new THREE.Vector3(...a.normal);
    if (Math.abs(na.dot(new THREE.Vector3(...b.normal))) > 0.9999) {
      const d = Math.abs(pb.clone().sub(pa).dot(na));
      const foot = pb.clone().sub(na.clone().multiplyScalar(pb.clone().sub(pa).dot(na)));
      return { value: d, text: `Odległość ścianek ${fmt(d)} mm`, from: [foot.x, foot.y, foot.z] as Vec3, to: b.anchor };
    }
  }
  const d = pa.distanceTo(pb);
  const dd = pb.clone().sub(pa);
  return { value: d, text: `Odległość ${fmt(d)} mm (X ${fmt(Math.abs(dd.x))} · Y ${fmt(Math.abs(dd.y))} · Z ${fmt(Math.abs(dd.z))})`, from: a.anchor, to: b.anchor };
}
