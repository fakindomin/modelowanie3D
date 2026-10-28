import * as THREE from 'three';
import type { Part, Vec3 } from '../types';
import { built, partMatrix, worldBox } from './parts';

export const SNAP_DISTANCE = 3; // mm

export interface SnapOptions {
  grid: number;
  snap: boolean;
  /** Rest the part on top of whatever solid is underneath it (holes sink flush into it). */
  stick: boolean;
  axes: [boolean, boolean, boolean];
}

const AX = ['x', 'y', 'z'] as const;

/** Do the [aMin, aMax] and [bMin, bMax] ranges overlap, allowing a gap of up to d? */
function near(aMin: number, aMax: number, bMin: number, bMax: number, d: number) {
  return aMin < bMax + d && bMin < aMax + d;
}

/**
 * Snaps a proposed position: first to the grid, then face-to-face / edge-to-edge with nearby parts,
 * so blocks click together like construction pieces.
 */
export function snapPosition(part: Part, proposed: Vec3, parts: Part[], opt: SnapOptions): { position: Vec3; targets: string[] } {
  // Pattern siblings follow this part, so snapping to them would chase its own tail.
  const group = parts.filter((p) => p.id === part.id || (part.rigid && p.rigid === part.rigid) || (part.pattern && p.pattern?.id === part.pattern.id));
  const ids = new Set(group.map((p) => p.id));
  return snapMover(moverFor(group, part.position, part.hole), proposed, parts.filter((p) => !ids.has(p.id)), opt);
}

/** Mover for several parts dragged together, referenced by `anchor`. */
export function moverFor(group: Part[], anchor: Vec3, hole = false): Mover {
  return {
    boxAt: (pos) => {
      const b = new THREE.Box3();
      const d = [pos[0] - anchor[0], pos[1] - anchor[1], pos[2] - anchor[2]];
      for (const p of group) b.union(worldBox(p, [p.position[0] + d[0], p.position[1] + d[1], p.position[2] + d[2]]));
      return b;
    },
    hole,
    z: anchor[2],
  };
}

/** Axis-aligned flat faces of a part, so things snap to inner walls and floors, not only to its outer box. */
interface Face {
  axis: number;
  /** Plane coordinate (world, without the part's position). */
  c: number;
  /** Extent of the triangle on the two other axes. */
  lo: [number, number];
  hi: [number, number];
}

const FACE_LIMIT = 40000; // triangles; heavier meshes (figurines) snap by their box only
const faceCache = new WeakMap<THREE.BufferGeometry, Map<string, Face[] | null>>();

function facesOf(part: Part): Face[] | null {
  const g = built(part).geometry;
  let byRot = faceCache.get(g);
  if (!byRot) faceCache.set(g, (byRot = new Map()));
  const k = part.rotation.join(',');
  if (byRot.has(k)) return byRot.get(k)!;
  const pos = g.attributes.position;
  const n = pos.count / 3;
  let out: Face[] | null = null;
  if (n <= FACE_LIMIT) {
    out = [];
    const m = partMatrix([0, 0, 0], part.rotation);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let t = 0; t < n; t++) {
      a.fromBufferAttribute(pos, 3 * t).applyMatrix4(m);
      b.fromBufferAttribute(pos, 3 * t + 1).applyMatrix4(m);
      c.fromBufferAttribute(pos, 3 * t + 2).applyMatrix4(m);
      const nrm = e1.subVectors(b, a).cross(e2.subVectors(c, a));
      const len = nrm.length();
      if (len < 1e-9) continue;
      nrm.divideScalar(len);
      for (let ax = 0; ax < 3; ax++) {
        if (Math.abs(nrm.getComponent(ax)) < 0.999) continue;
        const o = [0, 1, 2].filter((i) => i !== ax);
        const u = [a.getComponent(o[0]), b.getComponent(o[0]), c.getComponent(o[0])];
        const v = [a.getComponent(o[1]), b.getComponent(o[1]), c.getComponent(o[1])];
        out.push({ axis: ax, c: a.getComponent(ax), lo: [Math.min(...u), Math.min(...v)], hi: [Math.max(...u), Math.max(...v)] });
      }
    }
  }
  byRot.set(k, out);
  return out;
}

const downRay = new THREE.Raycaster();
const pickMesh = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));

/** Height of the first upward-facing surface of `part` below (x, y), or null. */
export function surfaceBelow(part: Part, x: number, y: number, from = 1e4): number | null {
  return surfaceHit(part, x, y, from, -1);
}

/** Height of the first downward-facing surface of `part` above (x, y) (its underside), or null. */
export function surfaceAbove(part: Part, x: number, y: number, from = -1e4): number | null {
  return surfaceHit(part, x, y, from, 1);
}

function surfaceHit(part: Part, x: number, y: number, from: number, dir: 1 | -1): number | null {
  pickMesh.geometry = built(part).geometry;
  pickMesh.matrixWorld.copy(partMatrix(part.position, part.rotation));
  downRay.set(new THREE.Vector3(x, y, from), new THREE.Vector3(0, 0, dir));
  const hit = downRay.intersectObject(pickMesh, false)[0];
  return hit ? hit.point.z : null;
}

/** Something being dragged: a part or a whole group, described by its world box at a position. */
export interface Mover {
  boxAt: (pos: Vec3) => THREE.Box3;
  hole: boolean;
  /** Current height of the reference point. */
  z: number;
}

export function snapMover(mover: Mover, proposed: Vec3, others: Part[], opt: SnapOptions): { position: Vec3; targets: string[] } {
  const pos = new THREE.Vector3(...proposed);
  const g = opt.grid;
  if (g > 0)
    for (let i = 0; i < 3; i++) if (opt.axes[i]) pos.setComponent(i, Math.round(pos.getComponent(i) / g) * g);

  const boxes = others.map((p) => ({ p, b: worldBox(p) }));
  const targets = new Set<string>();

  if (opt.stick && opt.axes[0] && opt.axes[1] && !opt.axes[2]) {
    const mine = mover.boxAt([pos.x, pos.y, mover.z]);
    const bottomOffset = mover.z - mine.min.z;
    const height = mine.max.z - mine.min.z;
    let support = 0;
    let supportId: string | null = null;
    // Sample the footprint and rest on the highest real surface under it: inside a box that is the floor, not the rim.
    const ins = 0.02;
    const xs = [mine.min.x + ins, (mine.min.x + mine.max.x) / 2, mine.max.x - ins];
    const ys = [mine.min.y + ins, (mine.min.y + mine.max.y) / 2, mine.max.y - ins];
    for (const { p, b } of boxes) {
      if (p.hole) continue;
      const overlapX = Math.min(mine.max.x, b.max.x) - Math.max(mine.min.x, b.min.x);
      const overlapY = Math.min(mine.max.y, b.max.y) - Math.max(mine.min.y, b.min.y);
      if (overlapX <= 0.01 || overlapY <= 0.01 || b.max.z <= support) continue;
      let top = -Infinity;
      for (const x of xs) for (const y of ys) top = Math.max(top, surfaceBelow(p, x, y, b.max.z + 1) ?? -Infinity);
      if (top > support) {
        support = top;
        supportId = p.id;
      }
    }
    pos.z = (mover.hole && supportId ? support - height : support) + bottomOffset;
    if (supportId) targets.add(supportId);
  }

  if (opt.snap) {
    const mine = mover.boxAt([pos.x, pos.y, pos.z]);
    for (let i = 0; i < 3; i++) {
      if (!opt.axes[i]) continue;
      const a = AX[i];
      const others2 = AX.filter((_, j) => j !== i);
      let best = SNAP_DISTANCE;
      let delta = 0;
      let who: string | null = null;
      for (const { p, b } of boxes) {
        // Only consider neighbours that are lined up with us on the other two axes.
        if (!others2.every((o) => near(mine.min[o], mine.max[o], b.min[o], b.max[o], SNAP_DISTANCE * 4))) continue;
        const mc = (mine.min[a] + mine.max[a]) / 2, bc = (b.min[a] + b.max[a]) / 2;
        for (const d of [b.max[a] - mine.min[a], b.min[a] - mine.max[a], b.min[a] - mine.min[a], b.max[a] - mine.max[a], bc - mc]) {
          if (Math.abs(d) < best) {
            best = Math.abs(d);
            delta = d;
            who = p.id;
          }
        }
      }
      // Real flat faces of nearby parts: inner walls, floors, rims, pockets.
      const o2 = [0, 1, 2].filter((j) => j !== i);
      for (const { p, b } of boxes) {
        if (!AX.every((x) => near(mine.min[x], mine.max[x], b.min[x], b.max[x], SNAP_DISTANCE))) continue;
        const faces = facesOf(p);
        if (!faces) continue;
        const off = [p.position[o2[0]], p.position[o2[1]]];
        const tol = SNAP_DISTANCE;
        for (const f of faces) {
          if (f.axis !== i) continue;
          if (f.lo[0] + off[0] > mine.max[AX[o2[0]]] + tol || f.hi[0] + off[0] < mine.min[AX[o2[0]]] - tol) continue;
          if (f.lo[1] + off[1] > mine.max[AX[o2[1]]] + tol || f.hi[1] + off[1] < mine.min[AX[o2[1]]] - tol) continue;
          const c = f.c + p.position[i];
          for (const d of [c - mine.min[a], c - mine.max[a]]) {
            if (Math.abs(d) < best - 1e-6) {
              best = Math.abs(d);
              delta = d;
              who = p.id;
            }
          }
        }
      }
      if (who) {
        pos.setComponent(i, pos.getComponent(i) + delta);
        targets.add(who);
      }
    }
  }

  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { position: [r(pos.x), r(pos.y), r(pos.z)], targets: [...targets] };
}
