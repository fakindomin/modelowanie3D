import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';

/** The six ways a part can lie on the bed: turn about X or Y (degrees). [0, 0] = as built. */
export const TURNS: [0 | 1, number][] = [[0, 0], [0, 90], [0, -90], [0, 180], [1, 90], [1, -90]];
const AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];

export interface PoseScore {
  turn: [0 | 1, number];
  /** mm² of faces within ~28° of horizontal looking down, not on the bed: what a slicer would hold up with supports (Bambu's default threshold is 30°). */
  overhang: number;
  /** mm² touching the bed. */
  contact: number;
  height: number;
}

/** How a mesh prints in each of the six poses. */
export function poseScores(m: Manifold): PoseScore[] {
  const mesh = m.getMesh();
  const v = mesh.vertProperties, np = mesh.numProp, tri = mesh.triVerts;
  const out: PoseScore[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const turn of TURNS) {
    const q = new THREE.Quaternion().setFromAxisAngle(AX[turn[0]], (turn[1] * Math.PI) / 180);
    const pts = new Float64Array((v.length / np) * 3);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0, j = 0; i < v.length; i += np, j += 3) {
      a.set(v[i], v[i + 1], v[i + 2]).applyQuaternion(q);
      pts[j] = a.x;
      pts[j + 1] = a.y;
      pts[j + 2] = a.z;
      lo = Math.min(lo, a.z);
      hi = Math.max(hi, a.z);
    }
    let overhang = 0, contact = 0;
    for (let i = 0; i < tri.length; i += 3) {
      const ia = tri[i] * 3, ib = tri[i + 1] * 3, ic = tri[i + 2] * 3;
      a.set(pts[ia], pts[ia + 1], pts[ia + 2]);
      b.set(pts[ib], pts[ib + 1], pts[ib + 2]);
      c.set(pts[ic], pts[ic + 1], pts[ic + 2]);
      const n = e1.subVectors(b, a).cross(e2.subVectors(c, a));
      const area = n.length() / 2;
      if (area < 1e-9) continue;
      const nz = n.z / (2 * area);
      const zmin = Math.min(a.z, b.z, c.z) - lo;
      if (nz < -0.999 && Math.max(a.z, b.z, c.z) - lo < 0.05) contact += area;
      else if (nz < -0.88 && zmin > 0.3) overhang += area * -nz;
    }
    out.push({ turn, overhang, contact, height: hi - lo });
  }
  return out;
}

/**
 * The pose that needs the least support. The pose as built is kept unless another one is clearly
 * better (designed parts already lie the right way); ties go to the larger footprint, then the lower part.
 */
export function bestPose(m: Manifold): PoseScore | null {
  const s = poseScores(m);
  const cur = s[0];
  let best = cur;
  for (const p of s.slice(1)) {
    const tol = Math.max(2, best.overhang * 0.05);
    if (p.overhang < best.overhang - tol) best = p;
    else if (Math.abs(p.overhang - best.overhang) <= tol && (p.contact > best.contact * 1.15 || (p.contact > best.contact * 0.98 && p.height < best.height - 0.5))) best = p;
  }
  // Keep the designed pose unless the new one saves real support (at least 20 mm² and half of it).
  if (best !== cur && (cur.overhang < 20 || best.overhang > cur.overhang * 0.5)) return null;
  return best.turn[1] === 0 ? null : best;
}

/** Turns a manifold into the pose. */
export function turnManifold(m: Manifold, turn: [0 | 1, number]): Manifold {
  const q = new THREE.Quaternion().setFromAxisAngle(AX[turn[0]], (turn[1] * Math.PI) / 180);
  const mat = new THREE.Matrix4().makeRotationFromQuaternion(q);
  return m.transform(mat.elements as unknown as Parameters<Manifold['transform']>[0]);
}

/**
 * Parts whose pose is part of the design: threads (they print true standing up), print-in-place
 * mechanisms and fittings whose arms are laid out for the bed. A body holding one of them is not turned.
 */
const KEEP = /bolt|thread|nut|jar|lid|gland|hoseBarb|pipe|profileFitting|springClip|hinge|Hinge|pushPush|clicker|springLatch|detentKnob|pushButton|clampClip|spring|gear|worm|rack|planetary|linearSlide|zipTie/;
export function keepsPose(parts: { type: string; params?: Record<string, unknown> }[]): boolean {
  return parts.some((p) => KEEP.test(p.type) || Object.entries(p.params ?? {}).some(([k, v]) => /thread/i.test(k) && v && v !== 'none' && v !== 'off'));
}
