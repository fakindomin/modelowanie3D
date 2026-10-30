import * as THREE from 'three';
import { DEFS } from '../catalog';
import { armQuat, clipWidth, fittingGeo, fittingLift, halfAt, pinSpots, screwSpots, squareClick, type FitGeo } from '../parts/couplings';
import type { Params } from '../parts/def';
import type { Part, Vec3 } from '../types';
import { partMatrix } from './parts';

const DEG = Math.PI / 180;
const FITTINGS = new Set(['pipeFitting', 'profileFitting']);
export const isFitting = (p: Part | undefined) => !!p && FITTINGS.has(p.type);

const pose = (x: number, y: number, z: number, q = new THREE.Quaternion()) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
const rotZ = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
const rotY = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
/** A hole (cylinder along +Z from its base) whose base sits at radius r, angle a, height z, pointing inward. */
const inward = (r: number, a: number, z: number) => pose(r * Math.cos(a), r * Math.sin(a), z, rotZ(a).multiply(rotY(-Math.PI / 2)));

/** Ends whose pipe sits in the arm (not screwed on): only these get holes drilled in the pipe. */
const seated = (end: string) => end !== 'male' && end !== 'female' && end !== 'closed';

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Holes a round pipe in arm i needs, made by the pipe's own end A (clip pins, or the screw of a socket, plug or bolt arm):
 * distance from the pipe's end, diameter and the turn of the pipe about its axis (its holes go along its X).
 */
export function pipeHoles(geo: FitGeo, p: Params, i: number): { end: 'pin' | 'screw'; at: number; d: number; turn: number } | null {
  if (geo.square) return null;
  const end = geo.ends[i];
  if (end === 'pin') {
    const ps = pinSpots(geo, p);
    return { end: 'pin', at: r2(ps.z - geo.stop), d: geo.pinD, turn: ps.angles[0] };
  }
  const so = geo.screwOf(i);
  if (!so.s || !(end === 'socket' || end === 'plug' || end === 'bolt')) return null;
  const sp = screwSpots(geo, p, i);
  // Socket: pilot hole for a plastic screw (or a through hole for a bolt); plug: the pipe gets the clearance hole.
  const d = end === 'plug' || so.through ? so.s + 0.4 : so.s * 0.8;
  return { end: 'screw', at: r2(sp.z - geo.stop), d: r2(d), turn: sp.angles[0] };
}

/**
 * The pipe that fits fitting arm i: its type and the parameters that must match, its end A paired with the arm
 * (female thread → male thread, bayonet → pins, click → groove or windows, the rest → plain). Null for a closed arm.
 */
export function pipeFor(fit: Part, geo: FitGeo, i = 0): { type: string; params: Params } | null {
  const p = fit.params;
  const end = geo.ends[i];
  if (end === 'closed') return null;
  if (geo.square) {
    const c = squareClick(geo.size(i).D, geo.depth);
    return { type: 'rhs', params: end === 'click' ? { endA: 'click', endAt: c.at, clickW: c.tw } : { endA: 'plain' } };
  }
  if (end === 'male')
    return { type: 'pipeFitting', params: { kind: 'straight', end: 'female', std: p.std, D: p.D, T: p.T, depth: p.depth, wall: p.wall, luz: p.luz, P: p.P, fit: p.fit, screw: 'none' } };
  if (end === 'female' || end === 'bayonet' || end === 'click') return { type: 'pipeEnd', params: { end: end === 'female' ? 'male' : end, depth: p.depth, P: p.P, fit: p.fit, pinD: p.pinD, wall: p.wall, luz: p.luz } };
  const h = pipeHoles(geo, p, i);
  if (h?.end === 'pin') return { type: 'pipeEnd', params: { end: 'pin', pinAt: h.at, pinD: h.d, luz: p.luz } };
  if (h?.end === 'screw') return { type: 'pipeEnd', params: { end: 'screw', pinAt: h.at, screwD: h.d } };
  return { type: 'pipeEnd', params: { end: 'socket' } };
}

/** Pose (in the fitting's frame) and synced parameters of a part that follows arm i, or null when that spot is gone. */
function armLocal(fit: Part, mate: Part, geo: FitGeo): { m: THREE.Matrix4; params: Params } | null {
  const a = mate.armOf!;
  if (a.i >= geo.dirs.length) return null;
  const { D, T, H } = geo.size(a.i);
  const p = fit.params;
  const arm = pose(0, 0, fittingLift(p, geo.square), armQuat(geo.dirs[a.i]));
  const pipeStd = geo.kind === 'reducer' && a.i === 1 ? p.std2 : p.std;
  const end = geo.ends[a.i];
  if (a.role === 'pipe') {
    const want = pipeFor(fit, geo, a.i);
    if (!want || want.type !== mate.type) return null;
    if (mate.type === 'rhs') {
      // Profile: length along its X (centred), section centred on Y and standing on Z = 0..H. Turn X onto the arm.
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
      return { m: arm.multiply(pose(0, -H / 2, geo.stop + Number(mate.params.L) / 2)).multiply(pose(0, 0, 0, q)), params: { W: D, H, T: Math.max(0.4, T), ...want.params } };
    }
    if (mate.type === 'pipeFitting') {
      const other = fittingGeo({ ...mate.params, ...want.params }, false);
      // Not screwed in yet: it waits in front of the arm.
      // Its mouth stays clear of the male thread and of the couplers on the other arms.
      const Ro = other.thread(1).d / 2 + 0.5 + other.wall;
      const mouth = Math.max(geo.stop + geo.depth + 5, geo.minAngle < Math.PI - 0.01 ? Ro / Math.tan(geo.minAngle / 2) + 2 : 0);
      const z = mouth + other.stop + other.depth;
      return { m: arm.multiply(pose(0, 0, z, rotY(-Math.PI / 2))), params: { ...want.params, std: pipeStd, D, T } };
    }
    const z = mate.type === 'pipeEnd' && end === 'female' ? geo.stop + geo.depth + 5 : geo.stop;
    // A pipe with holes turns so they face the fitting's.
    const turn = pipeHoles(geo, p, a.i)?.turn ?? 0;
    return { m: arm.multiply(pose(0, 0, z, rotZ(turn))), params: { ...want.params, std: pipeStd, D, T } };
  }
  if (!seated(end)) return null;
  // Round pipes make these holes themselves (end A): separate holes are gone.
  if ((a.role === 'pin' || a.role === 'screw') && pipeHoles(geo, p, a.i)) return null;
  if (a.role === 'screw') {
    const so = geo.screwOf(a.i);
    if (!so.s) return null;
    const sp = screwSpots(geo, p, a.i);
    const ang = sp.angles[a.k];
    if (ang === undefined) return null;
    const h = halfAt(geo, a.i, ang);
    const plug = end === 'plug';
    const through = so.through;
    // Socket: pilot hole for a wood screw (or a through hole for a bolt); plug: the pipe gets the clearance hole.
    const d = plug || through ? so.s + 0.4 : so.s * 0.8;
    const depth = through ? 2 * h + 1 : T + 1 + d / 2;
    return { m: arm.multiply(inward(h + 0.5, ang, sp.z)), params: { D: Math.round(d * 100) / 100, H: Math.round(depth * 100) / 100, luz: 0 } };
  }
  if (end !== 'pin') return null;
  const ps = pinSpots(geo, p);
  if (a.role === 'pin') {
    const ang = ps.angles[a.k];
    if (ang === undefined) return null;
    const h = halfAt(geo, a.i, ang);
    return { m: arm.multiply(inward(h + 0.5, ang, ps.z)), params: { D: geo.pinD, H: T + 1 + geo.pinD / 2, luz: 2 * geo.g } };
  }
  // Clip (printed flat): stood up it has its pins along ±X at z = 0 and legs down; here the legs reach out along the pipe.
  const up = pose(0, 0, 0, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)).multiply(pose(0, 0, -clipWidth({ pinD: geo.pinD }) / 2));
  return {
    m: arm.multiply(pose(0, 0, ps.z, rotZ(ps.angles[0] + Math.PI).multiply(rotY(Math.PI)))).multiply(up),
    params: { shape: geo.square ? 'square' : 'round', D, T: Math.max(0.5, T), pinD: geo.pinD, pins: ps.angles.length === 1 ? '1' : '2', outer: p.wall },
  };
}

function toPose(m: THREE.Matrix4): { position: Vec3; rotation: Vec3 } {
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  m.decompose(p, q, new THREE.Vector3());
  const e = new THREE.Euler().setFromQuaternion(q);
  const r = (v: number, k = 1000) => Math.round(v * k) / k;
  const z = (v: number) => (Object.is(v, -0) ? 0 : v);
  return { position: [z(r(p.x)), z(r(p.y)), z(r(p.z))], rotation: [z(r(e.x / DEG, 100)), z(r(e.y / DEG, 100)), z(r(e.z / DEG, 100))] };
}

/** World pose and parameters of a part following a fitting's arm. */
export function armPose(fit: Part, mate: Part) {
  const geo = fittingGeo(fit.params, fit.type === 'profileFitting');
  const l = armLocal(fit, mate, geo);
  if (!l) return null;
  return { ...toPose(partMatrix(fit.position, fit.rotation).multiply(l.m)), params: l.params };
}

/** Pipes, their holes and clips follow their fitting; holes and clips whose spot is gone are removed. */
export function placeArmMates(parts: Part[]): Part[] {
  if (!parts.some((p) => p.armOf)) return parts;
  const byId = new Map(parts.map((p) => [p.id, p]));
  let changed = false;
  const out: Part[] = [];
  for (const p of parts) {
    if (!p.armOf) {
      out.push(p);
      continue;
    }
    const fit = byId.get(p.armOf.of);
    const at = isFitting(fit) ? armPose(fit!, p) : null;
    if (!at) {
      changed = true;
      // A pipe stays (just no longer follows); a hole or clip without its spot would cut in the wrong place.
      if (p.armOf.role === 'pipe') out.push({ ...p, armOf: undefined });
      continue;
    }
    const keys = Object.keys(at.params).filter((k) => k in (DEFS[p.type]?.params.reduce((o, d) => ({ ...o, [d.key]: 1 }), {} as Record<string, number>) ?? {}));
    const same =
      keys.every((k) => p.params[k] === at.params[k]) &&
      at.position.every((v, i) => Math.abs(v - p.position[i]) < 1e-3) &&
      at.rotation.every((v, i) => Math.abs(v - p.rotation[i]) < 1e-2);
    if (same) {
      out.push(p);
      continue;
    }
    changed = true;
    const params = { ...p.params };
    for (const k of keys) params[k] = at.params[k];
    out.push({ ...p, params, position: at.position, rotation: at.rotation });
  }
  return changed ? out : parts;
}
