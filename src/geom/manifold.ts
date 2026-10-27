import Module from 'manifold-3d';
import type { ManifoldToplevel, Manifold } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import * as THREE from 'three';

let api: ManifoldToplevel | null = null;

export async function initManifold(): Promise<ManifoldToplevel> {
  if (api) return api;
  // The single-file build inlines the WASM as a data: URL; hand it over as bytes instead of a fetch.
  const config: Record<string, unknown> = { locateFile: () => wasmUrl };
  if (wasmUrl.startsWith('data:')) config.wasmBinary = Uint8Array.from(atob(wasmUrl.split(',')[1]), (c) => c.charCodeAt(0));
  const m = await Module(config as { locateFile: () => string });
  m.setup();
  // Smooth enough circles for printing without bloating meshes.
  m.setMinCircularAngle(6);
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
  flat.computeVertexNormals();
  flat.computeBoundingBox();
  g.dispose();
  return flat;
}

export function matrixToMat4(m: THREE.Matrix4) {
  return m.elements.slice() as unknown as Parameters<Manifold['transform']>[0];
}
