/**
 * Real pictures of the models for the start page's tiles: each model is built with the app's own
 * engine and photographed once, in the background and one at a time, so the page stays smooth.
 * Pictures are kept in memory and in the browser; until one is ready the tile shows the model's icon.
 */
import * as THREE from 'three';
import { initManifold } from '../geom/manifold';
import type { ProjectItem } from '../projects';
import type { Part } from '../types';

export type ThumbKey = { item: ProjectItem } | { wizard: string };

const W = 320, H = 240;
const MODEL = 0x8f9a6a;
const cache = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();
let renderer: THREE.WebGLRenderer | null = null;

const keyOf = (k: ThumbKey) => ('wizard' in k ? 'wiz:' + k.wizard : 'item:' + k.item.label);
const idle = () => new Promise((r) => setTimeout(r, 16));

/** Pictures ready now, so a tile opened again shows its picture at once. */
const ready = new Map<string, string>();

/*
 * Pictures are also saved in the browser (IndexedDB), so a later visit shows them at once. They are
 * tied to the build: after an update the models may have changed, so the old ones are dropped.
 */
declare const __BUILD_ID__: string;
const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
const DB = 'modelowanie3d-thumbs', STORE = 'thumbs';
let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
  return dbp;
}
/** Loads this build's saved pictures into memory and clears ones from older builds. */
const loaded: Promise<void> = (async () => {
  const d = await db();
  if (!d) return;
  await new Promise<void>((res) => {
    try {
      const st = d.transaction(STORE, 'readwrite').objectStore(STORE);
      const cur = st.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return res();
        const k = String(c.key);
        if (k.startsWith(BUILD + '|')) ready.set(k.slice(BUILD.length + 1), String(c.value));
        else c.delete();
        c.continue();
      };
      cur.onerror = () => res();
    } catch {
      res();
    }
  });
})();
async function save(key: string, url: string) {
  const d = await db();
  try {
    d?.transaction(STORE, 'readwrite').objectStore(STORE).put(url, BUILD + '|' + key);
  } catch {
    /* storage full or blocked: the picture is just drawn again next time */
  }
}

/** The picture if it is already at hand (no waiting), else null. */
export const thumbNow = (k: ThumbKey) => ready.get(keyOf(k)) ?? null;

/** The picture of a project or wizard (a data URL), or null when it can't be drawn. */
export function thumb(k: ThumbKey): Promise<string | null> {
  const key = keyOf(k);
  let p = cache.get(key);
  if (!p) {
    p = loaded.then(() => {
      const have = ready.get(key);
      if (have) return have;
      const job = queue.then(async () => {
        await initManifold();
        await idle();
        try {
          const url = 'wizard' in k ? await wizardShot(k.wizard) : await itemShot(k.item);
          if (url) {
            ready.set(key, url);
            void save(key, url);
          }
          return url;
        } catch (err) {
          console.warn('thumb', key, err);
          return null;
        }
      });
      queue = job;
      return job;
    });
    cache.set(key, p);
  }
  return p;
}

async function itemShot(i: ProjectItem): Promise<string | null> {
  const [{ itemPart }, { built }] = await Promise.all([import('../ui/modelCard'), import('../geom/parts')]);
  const ip = itemPart(i);
  if (!ip) return null;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(built({ type: ip.type, params: ip.params } as Part).geometry, material(MODEL)));
  return shoot(g);
}

async function wizardShot(id: string): Promise<string | null> {
  const [{ WIZARDS }, { built, buildBodies }] = await Promise.all([import('../wizards'), import('../geom/parts')]);
  const wz = WIZARDS[id];
  if (!wz) return null;
  const plan = wz.plan(wz.defaults);
  const g = new THREE.Group();
  const bodies = plan.parts ? buildBodies(plan.parts) : [];
  for (const b of bodies) g.add(new THREE.Mesh(b.geometry, material(MODEL)));
  const byRole = new Map(plan.items.map((it) => [it.role, it]));
  const D = Math.PI / 180;
  for (const pl of plan.placements) {
    const it = byRole.get(pl.role);
    if (!it) continue;
    const m = new THREE.Mesh(built({ type: it.type, params: it.params } as Part).geometry, material(MODEL));
    m.position.set(...pl.position);
    m.rotation.set(pl.rotation[0] * D, pl.rotation[1] * D, pl.rotation[2] * D);
    g.add(m);
  }
  for (const r of plan.rods ?? []) {
    const a = new THREE.Vector3(...r.a), b = new THREE.Vector3(...r.b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r.d / 2, r.d / 2, a.distanceTo(b), 12), material(0x6b6f66));
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(m);
  }
  for (const b of plan.boards ?? []) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...b.size), material(0xc8b38a));
    m.position.set(...b.position);
    g.add(m);
  }
  const url = g.children.length ? shoot(g) : null;
  for (const b of bodies) {
    b.geometry.dispose();
    b.manifold.delete();
  }
  return url;
}

function material(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.04 });
}

/** Photographs the group from the front-right corner, filling the frame, on a transparent background. */
function shoot(g: THREE.Group): string {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W * 2, H * 2, false);
  }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3d4035, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(1, -1.6, 2.4);
  scene.add(sun);
  const back = new THREE.DirectionalLight(0xffffff, 0.45);
  back.position.set(-1.5, 1, 0.8);
  scene.add(back);
  scene.add(g);
  g.updateMatrixWorld(true);
  const s = new THREE.Box3().setFromObject(g).getBoundingSphere(new THREE.Sphere());
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 100000);
  cam.up.set(0, 0, 1);
  cam.position.copy(s.center).addScaledVector(new THREE.Vector3(0.9, -1.3, 0.85).normalize(), (s.radius / Math.sin((14 * Math.PI) / 180)) * 1.02);
  cam.lookAt(s.center);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/webp', 0.85);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
  });
  return url;
}
