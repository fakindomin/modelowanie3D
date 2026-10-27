import * as THREE from 'three';
import type { Part, Vec3 } from '../types';
import { worldBox } from './parts';

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
  const pos = new THREE.Vector3(...proposed);
  const g = opt.grid;
  if (g > 0)
    for (let i = 0; i < 3; i++) if (opt.axes[i]) pos.setComponent(i, Math.round(pos.getComponent(i) / g) * g);

  const others = parts.filter((p) => p.id !== part.id);
  const boxes = others.map((p) => ({ p, b: worldBox(p) }));
  const targets = new Set<string>();

  if (opt.stick && opt.axes[0] && opt.axes[1] && !opt.axes[2]) {
    const mine = worldBox(part, [pos.x, pos.y, part.position[2]]);
    const bottomOffset = part.position[2] - mine.min.z;
    const height = mine.max.z - mine.min.z;
    let support = 0;
    let supportId: string | null = null;
    for (const { p, b } of boxes) {
      if (p.hole) continue;
      const overlapX = Math.min(mine.max.x, b.max.x) - Math.max(mine.min.x, b.min.x);
      const overlapY = Math.min(mine.max.y, b.max.y) - Math.max(mine.min.y, b.min.y);
      if (overlapX > 0.01 && overlapY > 0.01 && b.max.z > support) {
        support = b.max.z;
        supportId = p.id;
      }
    }
    pos.z = (part.hole && supportId ? support - height : support) + bottomOffset;
    if (supportId) targets.add(supportId);
  }

  if (opt.snap) {
    const mine = worldBox(part, [pos.x, pos.y, pos.z]);
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
      if (who) {
        pos.setComponent(i, pos.getComponent(i) + delta);
        targets.add(who);
      }
    }
  }

  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { position: [r(pos.x), r(pos.y), r(pos.z)], targets: [...targets] };
}
