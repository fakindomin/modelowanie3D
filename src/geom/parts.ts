import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';
import { DEFS } from '../catalog';
import type { Part } from '../types';
import { M, matrixToMat4, toGeometry } from './manifold';
import { applyTexture } from './texture';
import { applyEdges } from './edges';
import { applyBend } from './bend';
import { applyShell, applyXform } from './modify';

interface Built {
  manifold: Manifold;
  geometry: THREE.BufferGeometry;
  box: THREE.Box3;
  failed?: boolean;
}

const cache = new Map<string, Built>();

function key(part: Part) {
  return part.type + JSON.stringify(part.params) + (part.texture ? JSON.stringify(part.texture) : '') + (part.edges ? JSON.stringify(part.edges) : '');
}

/** Local geometry of a part (centred in X/Y, resting on Z = 0), cached per type + params. */
export function built(part: Part): Built {
  const k = key(part);
  let b = cache.get(k);
  if (!b) {
    let manifold: Manifold;
    let bad = false;
    try {
      manifold = DEFS[part.type].build(part.params);
      if (part.texture && !part.hole) {
        try {
          manifold = applyTexture(manifold, part.texture);
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
      cache.get(first)!.geometry.dispose();
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
