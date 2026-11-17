import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';
import { DEFS } from '../catalog';
import type { Part, Texture } from '../types';
import { M, matrixToMat4, toGeometry } from './manifold';
import { applyTexture } from './texture';
import { applyEdges } from './edges';
import { applyBend } from './bend';
import { applyInfill, applyShell, applyXform } from './modify';

interface Built {
  manifold: Manifold;
  geometry: THREE.BufferGeometry;
  box: THREE.Box3;
  failed?: boolean;
}

const cache = new Map<string, Built>();

/** Every texture of a part: the older single one and the per-face ones. */
export function texturesOf(part: Part): Texture[] {
  return [...(part.texture ? [part.texture] : []), ...(part.textures ?? [])];
}

/** Preview motions (a lid slid out) are drawn by moving the closed piece, so the build never sees them. */
function buildParams(part: Part) {
  const ms = DEFS[part.type]?.motions?.(part.params);
  if (!ms?.length) return part.params;
  const p = { ...part.params };
  for (const m of ms) delete p[m.key];
  return p;
}

function key(part: Part) {
  const tex = texturesOf(part);
  return part.type + JSON.stringify(buildParams(part)) + (tex.length ? JSON.stringify(tex) : '') + (part.edges ? JSON.stringify(part.edges) : '');
}

/** Local geometry of a part (centred in X/Y, resting on Z = 0), cached per type + params. */
export function built(part: Part): Built {
  const k = key(part);
  let b = cache.get(k);
  if (!b) {
    let manifold: Manifold;
    let bad = false;
    try {
      manifold = DEFS[part.type].build(buildParams(part));
      if (!part.hole)
        for (const t of texturesOf(part)) {
          try {
            manifold = applyTexture(manifold, t);
          } catch (e) {
            console.warn('texture failed', e);
          }
        }
      if (part.edges && !part.hole) {
        try {
          manifold = applyEdges(manifold, part.edges);
        } catch (e) {
          console.warn('edges failed', e);
        }
      }
      if (manifold.isEmpty()) throw new Error('empty');
    } catch (e) {
      console.warn('build failed', part.type, e);
      // Invalid parameter combination: fall back to a small marker cube so the scene keeps working.
      manifold = M().Manifold.cube([1, 1, 1], true);
      bad = true;
    }
    const geometry = toGeometry(manifold);
    b = { manifold, geometry, box: geometry.boundingBox!.clone(), failed: bad };
    cache.set(k, b);
    if (cache.size > 400) {
      const first = cache.keys().next().value!;
      const old = cache.get(first)!;
      segCache.get(old)?.forEach((g) => g.geometry !== old.geometry && g.geometry.dispose());
      old.geometry.dispose();
      cache.delete(first);
    }
  }
  return b;
}

const DEG = Math.PI / 180;

export function partMatrix(position: [number, number, number], rotation: [number, number, number]) {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG)),
    new THREE.Vector3(1, 1, 1),
  );
  return m;
}

/** Did building this part fail (shown as a small marker cube)? */
export function failed(part: Part) {
  return built(part).failed === true;
}

export function worldBox(part: Part, position = part.position, rotation = part.rotation): THREE.Box3 {
  return built(part).box.clone().applyMatrix4(partMatrix(position, rotation));
}

/** World-space solid of a part (caller owns the returned Manifold). */
export function worldManifold(part: Part): Manifold {
  return built(part).manifold.transform(matrixToMat4(partMatrix(part.position, part.rotation)));
}

export interface BodyResult {
  body: number;
  manifold: Manifold;
  geometry: THREE.BufferGeometry;
  color: string;
}

/** Combines parts into printable bodies: solids of a body are united, then that body's holes are cut. */
export function buildBodies(parts: Part[], only?: number[]): BodyResult[] {
  const bodies = [...new Set(parts.map((p) => p.body))].filter((b) => !only || only.includes(b)).sort((a, b) => a - b);
  const out: BodyResult[] = [];
  for (const body of bodies) {
    const members = parts.filter((p) => p.body === body);
    const solids = members.filter((p) => !p.hole);
    if (!solids.length) continue;
    const holes = members.filter((p) => p.hole && !p.clip);
    const clips = members.filter((p) => p.hole && p.clip);
    const solidMs = solids.map(worldManifold);
    let result = M().Manifold.union(solidMs);
    solidMs.forEach((m) => m.delete());
    const step = (fn: (m: Manifold) => Manifold, what: string) => {
      try {
        const next = fn(result);
        if (next !== result) {
          result.delete();
          result = next;
        }
      } catch (e) {
        console.warn(what + ' failed', e);
      }
    };
    if (clips.length)
      step((m) => {
        const cm = clips.map(worldManifold);
        const keep = M().Manifold.union(cm);
        cm.forEach((x) => x.delete());
        const out = m.intersect(keep);
        keep.delete();
        return out;
      }, 'clip');
    const shell = solids.find((p) => p.shell?.on)?.shell;
    if (shell) step((m) => applyShell(m, shell), 'shell');
    const infill = solids.find((p) => p.infill?.on)?.infill;
    if (infill)
      step((m) => {
        const keep = holes.map((h) => {
          const bb = worldBox(h);
          return { min: bb.min.toArray(), max: bb.max.toArray() };
        });
        return applyInfill(m, infill, keep);
      }, 'infill');
    if (holes.length) {
      const holeMs = holes.map(worldManifold);
      const cut = M().Manifold.union(holeMs);
      const next = result.subtract(cut);
      holeMs.forEach((m) => m.delete());
      cut.delete();
      result.delete();
      result = next;
    }
    if (result.isEmpty()) continue;
    const bend = solids.find((p) => p.bend?.on)?.bend;
    if (bend) step((m) => applyBend(m, bend), 'bend');
    const xform = solids.find((p) => p.xform)?.xform;
    if (xform) step((m) => applyXform(m, xform), 'xform');
    out.push({ body, manifold: result, geometry: toGeometry(result), color: solids[0].color });
  }
  return out;
}

/** One drawn piece of a part: the part's geometry, or (with preview motions) the part split into what moves and what stays. */
export interface Segment {
  geometry: THREE.BufferGeometry;
  /** Key of the motion moving it, or null. */
  motion: string | null;
  move: [number, number, number];
}

const segCache = new WeakMap<Built, Segment[]>();

/** The part as drawn pieces: a lid moves whole, two drawers of one piece move each on its own. */
export function segments(part: Part): Segment[] {
  const b = built(part);
  const hit = segCache.get(b);
  if (hit) return hit;
  const ms = b.failed ? [] : (DEFS[part.type]?.motions?.(part.params) ?? []).filter((m) => m.pieces.includes(String(part.params.piece ?? '')));
  let out: Segment[];
  if (!ms.length) out = [{ geometry: b.geometry, motion: null, move: [0, 0, 0] }];
  else if (!ms.some((m) => m.region)) out = [{ geometry: b.geometry, motion: ms[0].key, move: ms[0].move }];
  else {
    out = [];
    const boxes = ms.map((m) => M().Manifold.cube([m.region![1][0] - m.region![0][0], m.region![1][1] - m.region![0][1], m.region![1][2] - m.region![0][2]]).translate(m.region![0]));
    ms.forEach((m, i) => {
      const part = b.manifold.intersect(boxes[i]);
      if (!part.isEmpty()) out.push({ geometry: toGeometry(part), motion: m.key, move: m.move });
      part.delete();
    });
    const rest = b.manifold.subtract(M().Manifold.union(boxes));
    if (!rest.isEmpty()) out.push({ geometry: toGeometry(rest), motion: null, move: [0, 0, 0] });
    rest.delete();
    boxes.forEach((x) => x.delete());
  }
  segCache.set(b, out);
  return out;
}
