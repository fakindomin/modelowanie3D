import type { Manifold } from 'manifold-3d';
import { M } from './manifold';

/** Triangle mesh of an imported model, millimetres, Z up. */
export interface MeshData {
  vert: Float32Array;
  tri: Uint32Array;
}

/** Imported meshes by reference; parts point at them, so undo and copies never duplicate the data. */
const MESHES = new Map<string, MeshData>();
const SOLIDS = new Map<string, Manifold>();
const STORAGE_KEY = 'modelowanie3d-meshes';

/** Reads binary or text STL; vertices shared by triangles are merged. */
export function parseSTL(buf: ArrayBuffer): MeshData {
  const dv = new DataView(buf);
  const n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  const binary = buf.byteLength === 84 + n * 50;
  const pts: number[] = [];
  if (binary) {
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k++) pts.push(dv.getFloat32(o + k * 4, true));
    }
  } else {
    const text = new TextDecoder().decode(buf);
    const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
    for (let m = re.exec(text); m; m = re.exec(text)) pts.push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if (!pts.length || pts.length % 9) throw new Error('empty');
  const index = new Map<string, number>();
  const vert: number[] = [];
  const tri = new Uint32Array(pts.length / 3);
  for (let i = 0; i < pts.length; i += 3) {
    const key = `${pts[i]},${pts[i + 1]},${pts[i + 2]}`;
    let v = index.get(key);
    if (v === undefined) {
      v = vert.length / 3;
      index.set(key, v);
      vert.push(pts[i], pts[i + 1], pts[i + 2]);
    }
    tri[i / 3] = v;
  }
  return { vert: new Float32Array(vert), tri };
}

/** Solid of a mesh, or the reason it can't be one (holes in the surface, crossing faces…). */
export function toSolid(d: MeshData): Manifold | string {
  const mesh = new (M().Mesh)({ numProp: 3, vertProperties: d.vert, triVerts: d.tri });
  mesh.merge();
  try {
    const m = new (M().Manifold)(mesh);
    const st = m.status();
    if (st !== 'NoError') return st;
    if (m.isEmpty()) return 'empty';
    return m;
  } catch (e) {
    return String((e as Error)?.message ?? e);
  }
}

function hash(d: MeshData) {
  let h = 2166136261;
  const bytes = new Uint8Array(d.vert.buffer, d.vert.byteOffset, d.vert.byteLength);
  for (let i = 0; i < bytes.length; i += 7) h = Math.imul(h ^ bytes[i], 16777619);
  return `m${(h >>> 0).toString(36)}${d.tri.length.toString(36)}`;
}

/** Keeps a mesh (and its solid) under a short reference. */
export function registerMesh(d: MeshData, solid?: Manifold): string {
  const ref = hash(d);
  MESHES.set(ref, d);
  if (solid) SOLIDS.set(ref, solid);
  return ref;
}

export function meshSolid(ref: string): Manifold {
  let m = SOLIDS.get(ref);
  if (!m) {
    const d = MESHES.get(ref);
    if (!d) throw new Error('mesh missing');
    const s = toSolid(d);
    if (typeof s === 'string') throw new Error(s);
    m = s;
    SOLIDS.set(ref, m);
  }
  return m;
}

const b64 = (a: ArrayBufferView) => {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

export type MeshBlobs = Record<string, { v: string; t: string }>;

/** Meshes used by these references, ready for a project file. */
export function encodeMeshes(refs: Iterable<string>): MeshBlobs {
  const out: MeshBlobs = {};
  for (const r of refs) {
    const d = MESHES.get(r);
    if (d) out[r] = { v: b64(d.vert), t: b64(d.tri) };
  }
  return out;
}

export function decodeMeshes(blobs: MeshBlobs | undefined) {
  if (!blobs) return;
  for (const [r, b] of Object.entries(blobs)) {
    if (MESHES.has(r)) continue;
    try {
      MESHES.set(r, { vert: new Float32Array(unb64(b.v)), tri: new Uint32Array(unb64(b.t)) });
    } catch {
      /* broken entry: the part shows as a marker */
    }
  }
}

let saved = '';

/** Browser copy of the meshes these parts use, so a reload keeps them (best effort: storage is small). */
export function persistMeshes(used: Set<string>) {
  const key = [...used].sort().join(',');
  if (key === saved) return;
  saved = key;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(encodeMeshes(used)));
  } catch {
    /* too big for storage: the project file still carries them */
  }
}

export function loadStoredMeshes() {
  try {
    decodeMeshes(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as MeshBlobs);
  } catch {
    /* nothing stored */
  }
}
