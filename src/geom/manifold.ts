import Module from 'manifold-3d';
import type { ManifoldToplevel, Manifold } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Faces meeting at less than this angle are shaded as one smooth surface (curved walls, spheres). */
const CREASE = (25 * Math.PI) / 180;

let api: ManifoldToplevel | null = null;

export async function initManifold(): Promise<ManifoldToplevel> {
  if (api) return api;
  // The single-file build inlines the WASM as a data: URL; hand it over as bytes instead of a fetch.
  const config: Record<string, unknown> = { locateFile: () => wasmUrl };
  if (wasmUrl.startsWith('data:')) config.wasmBinary = Uint8Array.from(atob(wasmUrl.split(',')[1]), (c) => c.charCodeAt(0));
  const m = await Module(config as { locateFile: () => string });
  m.setup();
  // Smooth enough circles for printing without bloating meshes: at most 90 segments, so even a
  // 300 mm circle stays within 0.1 mm of round; small ones keep 0.5 mm long edges.
  m.setMinCircularAngle(4);
  m.setMinCircularEdgeLength(0.5);
  api = m;
  return m;
}

export function M(): ManifoldToplevel {
  if (!api) throw new Error('Manifold not initialised');
  return api;
}

/** Moves a solid so it is centred in X/Y and rests on Z = 0. */
export function settle(m: Manifold): Manifold {
  const b = m.boundingBox();
  return m.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]]);
}

export function toGeometry(m: Manifold): THREE.BufferGeometry {
  const mesh = m.getMesh();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.vertProperties), mesh.numProp));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1));
  const flat = g.toNonIndexed();
  g.dispose();
  // Smooth shading on curved surfaces, sharp edges stay sharp.
  const smooth = toCreasedNormals(flat, CREASE);
  if (smooth !== flat) flat.dispose();
  smooth.computeBoundingBox();
  return smooth;
}

export function matrixToMat4(m: THREE.Matrix4) {
  return m.elements.slice() as unknown as Parameters<Manifold['transform']>[0];
}
