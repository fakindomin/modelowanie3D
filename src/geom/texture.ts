import type { CrossSection, Manifold } from 'manifold-3d';
import { M } from './manifold';
import type { Texture, TextureFace } from '../types';

export const TEXTURE_LABELS: Record<Texture['pattern'], string> = {
  ribs: 'Żeberka',
  grooves: 'Rowki',
  knurl: 'Radełko (romby)',
  dots: 'Kropki',
  honeycomb: 'Plaster miodu',
};

export const FACE_LABELS: Record<TextureFace, string> = {
  top: 'Góra',
  bottom: 'Spód',
  front: 'Przód',
  back: 'Tył',
  left: 'Lewa',
  right: 'Prawa',
  around: 'Dookoła (walec, rura)',
};

export const DEFAULT_TEXTURE: Texture = { pattern: 'ribs', face: 'top', mode: 'add', depth: 0.8, spacing: 3, angle: 0, margin: 2 };

// Rotation that brings each face's outward normal to +Z (and back again).
const TO_TOP: Record<Exclude<TextureFace, 'around'>, [number, number, number]> = {
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

/** Adds the texture as real geometry, so it prints exactly as shown. */
export function applyTexture(m: Manifold, t: Texture): Manifold {
  if (t.face === 'around') return aroundTexture(m, t);
  const rot = TO_TOP[t.face];
  const w = m.rotate(rot);
  const b = w.boundingBox();
  const top = b.max[2];
  const footprint = w.slice(top - 0.05);
  const region = t.margin > 0 ? footprint.offset(-t.margin, 'Miter') : footprint;
  if (region.isEmpty()) return m;
  const d = Math.max(0.1, t.depth);
  const add = t.mode === 'add' && t.pattern !== 'grooves';
  const p = pattern2D(t, region);
  let out: Manifold;
  if (add) out = w.add(p.add.extrude(d + 0.05).translate([0, 0, top - 0.05]));
  else out = w.subtract(p.cut.extrude(d + 0.05).translate([0, 0, top - d]));
  return out.rotate([-rot[0], -rot[1], -rot[2]]);
}
