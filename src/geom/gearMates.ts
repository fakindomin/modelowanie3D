import * as THREE from 'three';
import { bevelCone, helixOf, matePhase } from '../parts/gears';
import type { Params } from '../parts/def';
import type { Part, Vec3 } from '../types';
import { partMatrix } from './parts';

const DEG = Math.PI / 180;
const n = (p: Params, k: string) => Number(p[k]);

const pose = (x: number, y: number, z: number, q: THREE.Quaternion) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
const turnZ = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
const turnY = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);

/** Pose of `mate` in the frame of `driver` so their teeth mesh, or null for a pair that can't mesh. */
export function mateFrame(driver: Part, mate: Part, angle = 0, wheelTurn = false): THREE.Matrix4 | null {
  const d = driver.params, m = mate.params;
  const a = driver.type, b = mate.type;
  if (a === 'gear' && b === 'gear') {
    const z1 = Math.round(n(d, 'z')), z2 = Math.round(n(m, 'z'));
    const r = (n(d, 'm') * (z1 + z2)) / 2;
    const t = angle * DEG;
    return pose(r * Math.cos(t), r * Math.sin(t), 0, turnZ(matePhase(t, z1, z2)));
  }
  if (a === 'rack' && b === 'gear') {
    const z = Math.round(n(m, 'z')), teeth = Math.round(n(d, 'n'));
    return pose(0, (n(m, 'm') * z) / 2, 0, turnZ(-Math.PI / 2 + (teeth % 2 ? Math.PI / z : 0)));
  }
  if (a === 'gear' && b === 'rack') return inverse(mateFrame(mate, driver));
  if (a === 'bevelGear' && b === 'bevelGear') {
    const c1 = bevelCone(d), c2 = bevelCone(m);
    // Both apexes meet; the mate's axis points along -X of the driver.
    const q = turnY(-Math.PI / 2).multiply(turnZ(Math.PI + Math.PI / Math.round(n(m, 'z'))));
    return pose(n(m, 'back') + c2.apex, 0, n(d, 'back') + c1.apex, q);
  }
  if (a === 'wormWheel' && b === 'worm') {
    const z = Math.round(n(d, 'z')), rw = (n(d, 'm') * z) / 2;
    const r = (n(d, 'dw') + 2 * rw) / 2;
    const L = n(m, 'L'), h = n(d, 'h');
    const lead = Math.max(1, Math.round(n(m, 'starts') || 1)) * Math.PI * n(m, 'm');
    // Where the wheel's tooth facing the worm (+Y) sits along X at mid height, helix twist included.
    const k = Math.round((z / (2 * Math.PI)) * (Math.PI / 2));
    const delta = Math.PI / 2 - (2 * Math.PI * k) / z;
    const tau = ((h / 2) * Math.tan(helixOf(d, 'wormWheel') * DEG)) / rw;
    const xt = (delta - tau) * rw;
    // Turn the worm so a gap between its threads lands on that tooth.
    const spin = m.hand === 'left' ? (2 * Math.PI * (xt + L / 2 - lead / 4)) / lead : (-2 * Math.PI * (xt + L / 2 + lead / 4)) / lead;
    // With the worm as the driver the wheel turns instead, so it doesn't swing round the worm.
    if (wheelTurn) return pose(-L / 2, r, h / 2, turnY(Math.PI / 2)).premultiply(new THREE.Matrix4().makeRotationZ(((m.hand === 'left' ? -1 : 1) * spin * lead) / (2 * Math.PI * rw)));
    return pose(-L / 2, r, h / 2, turnY(Math.PI / 2).multiply(turnZ(spin)));
  }
  if (a === 'worm' && b === 'wormWheel') return inverse(mateFrame(mate, driver, 0, true));
  return null;
}

const inverse = (m: THREE.Matrix4 | null) => (m ? m.clone().invert() : null);

/** World position and rotation (degrees) of a mate following its driver. */
export function matePose(driver: Part, mate: Part): { position: Vec3; rotation: Vec3 } | null {
  const rel = mateFrame(driver, mate, mate.gearMate?.angle ?? 0);
  if (!rel) return null;
  const w = partMatrix(driver.position, driver.rotation).multiply(rel);
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  w.decompose(p, q, new THREE.Vector3());
  const e = new THREE.Euler().setFromQuaternion(q);
  const r = (v: number, k = 1000) => Math.round(v * k) / k;
  return { position: [r(p.x), r(p.y), r(p.z)], rotation: [r(e.x / DEG, 100), r(e.y / DEG, 100), r(e.z / DEG, 100)] };
}

const SHARED: Record<string, string[]> = {
  'gear>gear': ['m', 'fit', 'kind', 'beta'],
  'gear>rack': ['m', 'fit'],
  'rack>gear': ['m', 'fit'],
  'bevelGear>bevelGear': ['m', 'fit'],
  'worm>wormWheel': ['m', 'fit', 'dw', 'starts', 'hand'],
  'wormWheel>worm': ['m', 'fit', 'dw', 'starts', 'hand'],
};

/** Values a mate must share with its driver to mesh at all (module, helix, worm size…). */
function shared(driver: Part, mate: Part): Params | null {
  const keys = SHARED[`${driver.type}>${mate.type}`] ?? [];
  const next: Params = { ...mate.params };
  let diff = false;
  for (const k of keys)
    if (driver.params[k] !== undefined && next[k] !== driver.params[k]) {
      next[k] = driver.params[k];
      diff = true;
    }
  if (driver.type === 'gear' && mate.type === 'gear' && driver.params.kind !== 'spur') {
    const hand = driver.params.hand === 'left' ? 'right' : 'left';
    if (next.hand !== hand) {
      next.hand = hand;
      diff = true;
    }
  }
  if (driver.type === 'bevelGear' && mate.type === 'bevelGear' && next.zMate !== driver.params.z) {
    next.zMate = driver.params.z;
    diff = true;
  }
  return diff ? next : null;
}

/** Moves every gear that follows another to where it meshes; chains settle in a few passes. */
export function placeMates(parts: Part[]): Part[] {
  if (!parts.some((p) => p.gearMate)) return parts;
  let out = parts;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    // A bevel pair shares its cone: the driver takes the mate's tooth count too.
    for (const p of out) {
      const of = p.gearMate && out.find((q) => q.id === p.gearMate!.of);
      if (of && of.type === 'bevelGear' && p.type === 'bevelGear' && of.params.zMate !== p.params.z) {
        out = out.map((q) => (q.id === of.id ? { ...q, params: { ...q.params, zMate: p.params.z } } : q));
        changed = true;
      }
    }
    const byId = new Map(out.map((p) => [p.id, p]));
    out = out.map((p) => {
      const of = p.gearMate && byId.get(p.gearMate.of);
      if (!of) return p;
      const params = shared(of, p);
      if (params) {
        p = { ...p, params };
        changed = true;
      }
      const at = matePose(of, p);
      if (!at || (at.position.every((v, i) => Math.abs(v - p.position[i]) < 1e-3) && at.rotation.every((v, i) => Math.abs(v - p.rotation[i]) < 1e-2))) return p;
      changed = true;
      return { ...p, ...at };
    });
    if (!changed) break;
  }
  return out;
}
