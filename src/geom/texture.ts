import type { CrossSection, Manifold } from 'manifold-3d';
import * as THREE from 'three';
import { M } from './manifold';
import type { PlainFace, Texture, TextureFace } from '../types';

export const TEXTURE_LABELS: Record<Texture['pattern'], string> = {
  ribs: 'Żeberka',
  grooves: 'Rowki',
  knurl: 'Radełko (romby)',
  dots: 'Kropki',
  honeycomb: 'Plaster miodu',
};

export const FACE_LABELS: Record<PlainFace, string> = {
  top: 'Góra',
  bottom: 'Spód',
  front: 'Przód',
  back: 'Tył',
  left: 'Lewa',
  right: 'Prawa',
  around: 'Dookoła (walec, rura)',
};

/** Face key of a slanted flat face from its outward normal (part's own axes). */
export function slopeFace(n: THREE.Vector3): TextureFace {
  const v = n.clone().normalize();
  return `n:${[v.x, v.y, v.z].map((c) => Math.round(c * 1000) / 1000).join(',')}`;
}

const slopeNormal = (face: TextureFace) => (face.startsWith('n:') ? new THREE.Vector3(...face.slice(2).split(',').map(Number)).normalize() : null);

export const faceLabel = (face: TextureFace) => (face.startsWith('n:') ? 'Skośna' : FACE_LABELS[face as PlainFace]);

/** Rotations (degrees, as Manifold.rotate takes them: about X, then Y, then Z) bringing a face up and back. */
function faceTurn(face: TextureFace): { to: [number, number, number]; back: [number, number, number] } {
  const n = slopeNormal(face);
  if (!n) {
    const r = TO_TOP[face as Exclude<PlainFace, 'around'>];
    return { to: r, back: [-r[0], -r[1], -r[2]] };
  }
  const q = new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, 0, 1));
  const deg = (e: THREE.Euler): [number, number, number] => [e.x, e.y, e.z].map((a) => (a * 180) / Math.PI) as [number, number, number];
  return { to: deg(new THREE.Euler().setFromQuaternion(q, 'ZYX')), back: deg(new THREE.Euler().setFromQuaternion(q.clone().invert(), 'ZYX')) };
}

export const DEFAULT_TEXTURE: Texture = { pattern: 'ribs', face: 'top', mode: 'add', depth: 0.8, spacing: 3, angle: 0, margin: 2 };

// Rotation that brings each face's outward normal to +Z (and back again).
const TO_TOP: Record<Exclude<PlainFace, 'around'>, [number, number, number]> = {
  top: [0, 0, 0],
  bottom: [180, 0, 0],
  front: [-90, 0, 0],
  back: [90, 0, 0],
  right: [0, -90, 0],
  left: [0, 90, 0],
};

const MAX_CELLS = 4000;

/** Parallel strips of the given width, period `s`, covering a square of half-size `R` around (cx, cy). */
function strips(cx: number, cy: number, R: number, s: number, width: number, angle: number): CrossSection {
  const CS = M().CrossSection;
  const out: CrossSection[] = [];
  for (let x = -Math.ceil(R / s) * s; x <= R; x += s) out.push(CS.square([width, 2 * R]).translate([x - width / 2, -R]));
  return CS.union(out).rotate(angle).translate([cx, cy]);
}

/** Points of a hexagonal lattice with spacing `s` covering the square of half-size R. */
function lattice(cx: number, cy: number, R: number, s: number, angle: number): [number, number][] {
  const pts: [number, number][] = [];
  const dy = (s * Math.sqrt(3)) / 2;
  const a = (angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  for (let j = -Math.ceil(R / dy); j * dy <= R; j++)
    for (let i = -Math.ceil(R / s) - 1; i * s <= R; i++) {
      const x = i * s + (j % 2 ? s / 2 : 0), y = j * dy;
      pts.push([cx + x * ca - y * sa, cy + x * sa + y * ca]);
    }
  return pts;
}

function pattern2D(t: Texture, region: CrossSection): { add: CrossSection; cut: CrossSection } {
  const CS = M().CrossSection;
  const b = region.bounds();
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  const R = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2 + 1;
  // Too fine a pattern on a big face would be millions of triangles: widen it instead.
  let s = Math.max(0.8, t.spacing);
  while ((4 * R * R) / (s * s) > MAX_CELLS) s *= 1.25;
  let shape: CrossSection;
  switch (t.pattern) {
    case 'knurl': {
      const w = s * 0.35;
      const grooves = CS.union([strips(cx, cy, R, s, w, t.angle + 45), strips(cx, cy, R, s, w, t.angle - 45)]);
      return { add: region.subtract(grooves), cut: region.intersect(grooves) };
    }
    case 'dots':
      shape = CS.union(lattice(cx, cy, R, s, t.angle).map(([x, y]) => CS.circle(s * 0.28, 16).translate([x, y])));
      break;
    case 'honeycomb':
      shape = CS.union(lattice(cx, cy, R, s, t.angle).map(([x, y]) => CS.circle((s * 0.42) / Math.cos(Math.PI / 6), 6).rotate(30 + t.angle).translate([x, y])));
      break;
    default:
      shape = strips(cx, cy, R, s, s / 2, t.angle);
  }
  const inside = region.intersect(shape);
  return { add: inside, cut: inside };
}

/** Which local axis a round part spins around (null if it isn't round). */
function roundAxis(m: Manifold): 0 | 1 | 2 | null {
  const b = m.boundingBox();
  const e = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
  const close = (a: number, c: number) => Math.abs(a - c) < 0.02 * Math.max(a, c);
  if (close(e[0], e[1])) return 2;
  if (close(e[1], e[2])) return 0;
  if (close(e[0], e[2])) return 1;
  return null;
}

function aroundTexture(m: Manifold, t: Texture): Manifold {
  const axis = roundAxis(m);
  if (axis === null) return m;
  const rot: [number, number, number] = axis === 0 ? [0, 90, 0] : axis === 1 ? [90, 0, 0] : [0, 0, 0];
  const back: [number, number, number] = [-rot[0], -rot[1], -rot[2]];
  let w = m.rotate(rot);
  const b = w.boundingBox();
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  const r = (b.max[0] - b.min[0]) / 2;
  const z0 = b.min[2] + t.margin, z1 = b.max[2] - t.margin;
  const H = z1 - z0;
  if (H <= 0.2 || r <= 0.5) return m;
  const CS = M().CrossSection;
  const d = Math.max(0.1, t.depth);
  let s = Math.max(0.8, t.spacing);
  const n = () => Math.max(3, Math.round((2 * Math.PI * r) / s));
  const add = t.mode === 'add' && t.pattern !== 'grooves';
  // Radial band where relief lives: outward when raised, inward when cut.
  const rIn = add ? r - 0.05 : r - d, rOut = add ? r + d : r + 1;
  const ring = (count: number, width: number) =>
    CS.union(
      Array.from({ length: count }, (_, i) =>
        CS.square([rOut - rIn, width]).translate([rIn, -width / 2]).rotate((i * 360) / count),
      ),
    );
  const twist = (deg: number) => ((H * Math.tan((deg * Math.PI) / 180)) / r) * (180 / Math.PI);
  const slices = Math.max(1, Math.ceil(H / 1));
  let relief: Manifold;
  if (t.pattern === 'knurl') {
    const ang = Math.abs(t.angle) > 1 ? t.angle : 30;
    const cnt = n();
    const g = ring(cnt, s * 0.35);
    const grooves = M().Manifold.union([g.extrude(H, slices, twist(ang)), g.extrude(H, slices, twist(-ang))]).translate([cx, cy, z0]);
    if (add) {
      const band = CS.circle(r + d, 96).subtract(CS.circle(r - 0.05, 96)).extrude(H).translate([cx, cy, z0]);
      w = w.add(band.subtract(grooves));
    } else w = w.subtract(grooves);
    return w.rotate(back);
  }
  if (t.pattern === 'dots' || t.pattern === 'honeycomb') {
    const rows = Math.max(1, Math.floor(H / s));
    while (rows * n() > MAX_CELLS) s *= 1.25;
    const cnt = n();
    const dots: Manifold[] = [];
    const segs = t.pattern === 'honeycomb' ? 6 : 12;
    for (let j = 0; j < rows; j++) {
      const z = z0 + (H - (rows - 1) * s) / 2 + j * s;
      for (let i = 0; i < cnt; i++) {
        const a = ((i + (j % 2) * 0.5) * 360) / cnt;
        dots.push(M().Manifold.cylinder(rOut - rIn, s * 0.28, s * 0.28, segs).rotate([0, 90, 0]).translate([rIn, 0, 0]).rotate([0, 0, a]).translate([cx, cy, z]));
      }
    }
    const u = M().Manifold.union(dots);
    w = add ? w.add(u) : w.subtract(u);
    return w.rotate(back);
  }
  const ribs = ring(n(), s / 2).extrude(H, slices, twist(t.angle)).translate([cx, cy, z0]);
  w = add ? w.add(ribs) : w.subtract(ribs);
  return w.rotate(back);
}

/**
 * Height of the face to texture on a solid turned with that face up: the outermost flat face, unless
 * it is just the end of something small standing on a bigger face (the tip of a drawer's knob), in which
 * case that bigger face below wins. A box's rim stays the top: it reaches the outline.
 */
export function faceLevel(w: Manifold): number {
  const mesh = w.getMesh();
  const v = mesh.vertProperties, np = mesh.numProp, tri = mesh.triVerts;
  const levels = new Map<number, { z: number; area: number; x0: number; x1: number; y0: number; y1: number }>();
  for (let i = 0; i < tri.length; i += 3) {
    const a = tri[i] * np, b = tri[i + 1] * np, c = tri[i + 2] * np;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9 || nz / len < 0.999) continue;
    const key = Math.round(v[a + 2] * 50);
    const l = levels.get(key) ?? { z: v[a + 2], area: 0, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    l.area += len / 2;
    for (const q of [a, b, c]) {
      l.x0 = Math.min(l.x0, v[q]);
      l.x1 = Math.max(l.x1, v[q]);
      l.y0 = Math.min(l.y0, v[q + 1]);
      l.y1 = Math.max(l.y1, v[q + 1]);
    }
    levels.set(key, l);
  }
  const box = w.boundingBox();
  const list = [...levels.values()].sort((p, q) => q.z - p.z);
  if (!list.length) return box.max[2];
  const W = box.max[0] - box.min[0], D = box.max[1] - box.min[1];
  const small = (l: (typeof list)[number]) => l.x1 - l.x0 < 0.6 * W && l.y1 - l.y0 < 0.6 * D;
  let i = 0;
  while (i < list.length - 1 && small(list[i])) i++;
  // Nothing big: the largest face it is.
  if (small(list[i])) return list.reduce((p, q) => (q.area > p.area ? q : p)).z;
  return list[i].z;
}

/** Adds the texture as real geometry, so it prints exactly as shown. */
export function applyTexture(m: Manifold, t: Texture): Manifold {
  if (t.face === 'around') return aroundTexture(m, t);
  const turn = faceTurn(t.face);
  const w = m.rotate(turn.to);
  const top = faceLevel(w);
  // The face itself: material just under it, less anything standing on it (a knob, a peg).
  const under = w.slice(top - 0.05);
  const above = w.slice(top + 0.05);
  const footprint = above.isEmpty() ? under : under.subtract(above.offset(0.4, 'Round'));
  const region = t.margin > 0 ? footprint.offset(-t.margin, 'Miter') : footprint;
  if (region.isEmpty()) return m;
  const d = Math.max(0.1, t.depth);
  const add = t.mode === 'add' && t.pattern !== 'grooves';
  const p = pattern2D(t, region);
  let out: Manifold;
  if (add) out = w.add(p.add.extrude(d + 0.05).translate([0, 0, top - 0.05]));
  else out = w.subtract(p.cut.extrude(d + 0.05).translate([0, 0, top - d]));
  return out.rotate(turn.back);
}
