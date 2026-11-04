import * as THREE from 'three';
import { DEFS, defaultParams, type Params } from '../catalog';
import { FAMILIES } from '../families';
import { built } from '../geom/parts';
import { toGeometry } from '../geom/manifold';
import { DENSITY } from '../wizards/estimate';
import type { Part } from '../types';
import type { ProjectItem } from '../projects';

/** What a model card shows: a small picture, the size, filament and time, and whether it fits the bed. */
export interface CardInfo {
  thumb: string;
  size: [number, number, number];
  grams: number;
  minutes: number;
  parts: number;
}

/** Average volumetric speed of a whole print with walls and travel (same rough figure as the wizards). */
const FLOW = 11;
const cache = new Map<string, CardInfo | null>();
let renderer: THREE.WebGLRenderer | null = null;

/** Type and parameters the item adds with (a family variant at its middle size). */
export function itemPart(i: ProjectItem): { type: string; params: Params } | null {
  if (i.kind === 'part') return DEFS[i.type] ? { type: i.type, params: defaultParams(DEFS[i.type]) } : null;
  if (i.kind === 'family') {
    const f = FAMILIES.find((x) => x.id === i.family);
    const v = f?.variants.find((x) => x.label === i.variant);
    if (!f || !v || !DEFS[v.type]) return null;
    const preset = (v.sizes ?? f.sizes)?.M ?? {};
    return { type: v.type, params: { ...defaultParams(DEFS[v.type]), ...preset, ...(v.params ?? {}) } };
  }
  return null;
}

function snapshot(geo: THREE.BufferGeometry): string {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(200, 150, false);
  }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(1, -1.5, 2.5);
  scene.add(sun);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9fb4c8, roughness: 0.6, metalness: 0.05 }));
  scene.add(mesh);
  geo.computeBoundingSphere();
  const s = geo.boundingSphere!;
  const cam = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 10000);
  cam.up.set(0, 0, 1);
  const dist = s.radius / Math.sin((15 * Math.PI) / 180) * 1.05;
  const dir = new THREE.Vector3(0.9, -1.3, 0.9).normalize();
  cam.position.copy(s.center).addScaledVector(dir, dist);
  cam.lookAt(s.center);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  (mesh.material as THREE.Material).dispose();
  return url;
}

/** Card data for an item, built once and kept (null for wizards and anything that fails). */
export function cardInfo(i: ProjectItem): CardInfo | null {
  const key = i.kind === 'part' ? i.type : i.kind === 'family' ? `${i.family}/${i.variant}` : i.kind;
  if (cache.has(key)) return cache.get(key)!;
  let info: CardInfo | null = null;
  try {
    const ip = itemPart(i);
    if (ip) {
      const b = built({ type: ip.type, params: ip.params } as Part);
      const v = b.manifold.volume();
      const sz = b.box.getSize(new THREE.Vector3());
      const geo = toGeometry(b.manifold);
      info = { thumb: snapshot(geo), size: [sz.x, sz.y, sz.z], grams: (v / 1000) * DENSITY.PLA, minutes: v / FLOW / 60, parts: b.manifold.decompose().length };
      geo.dispose();
    }
  } catch {
    info = null;
  }
  cache.set(key, info);
  return info;
}

export const fmtMin = (m: number) => (m < 60 ? `${Math.max(1, Math.round(m))} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`);
