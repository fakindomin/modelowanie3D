/**
 * The start page's show drawn by the app's own engine: the box wizard („Pudełko z pokrywką”) builds the real
 * box and lid for every value the show sets, the same solids the editor shows and exports. The lid sits on
 * the box (or just above it), the dimension lines are drawn over the picture and give the cursor its handles.
 */
import * as THREE from 'three';
import { initManifold } from '../geom/manifold';
import type { Part } from '../types';

export type Key = 'W' | 'D' | 'H';
export type ShowState = { W: number; D: number; H: number; lid: string; text: boolean; tex: boolean; active: Key | null };
export type ShowView = { draw(st: ShowState): void; handle(k: Key): [number, number] | null; stop(): void };

const NS = 'http://www.w3.org/2000/svg';
const FOV = 28;
const GAP: Record<string, number> = { hinge: 0, press: 14, magnet: 20 };

export async function engineView(view: HTMLElement, phone: () => boolean, onReady: () => void): Promise<ShowView> {
  const [, { WIZARDS }, { buildBodies, built }, { lidFace }] = await Promise.all([initManifold(), import('../wizards'), import('../geom/parts'), import('../wizards/common'), import('../store')]);
  // (The store fills in the wizards' scratch scene, so it is loaded too.)
  const wz = WIZARDS.box;

  const canvas = document.createElement('canvas');
  canvas.className = 'eng';
  const over = document.createElementNS(NS, 'svg');
  over.setAttribute('class', 'dims');
  over.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4946, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(150, -200, 300);
  scene.add(sun);
  const back = new THREE.DirectionalLight(0xffffff, 0.5);
  back.position.set(-200, 150, 120);
  scene.add(back);
  const model = new THREE.Group();
  scene.add(model);
  const cam = new THREE.PerspectiveCamera(FOV, 1, 1, 20000);
  cam.up.set(0, 0, 1);
  const dir = new THREE.Vector3(0.9, -1.3, 0.85).normalize();

  let st: ShowState | null = null;
  let dirty = false, lastBuild = -1e9, raf = 0, alive = true, onScreen = true, first = true;
  let size = { W: 0, D: 0, H: 0 };
  const aim = { c: new THREE.Vector3(), r: 1 }, now = { c: new THREE.Vector3(), r: 0 };
  const handles: Partial<Record<Key, [number, number]>> = {};

  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen && alive && !raf) raf = requestAnimationFrame(tick);
  });
  io.observe(view);

  function clear() {
    for (const o of [...model.children]) {
      model.remove(o);
      o.traverse((m) => {
        if (!(m instanceof THREE.Mesh)) return;
        if (m.userData.own) m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
    }
  }

  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02 });

  function rebuild(s: ShowState) {
    const v = {
      ...wz.defaults,
      W: s.W, D: s.D, H: s.H, close: s.lid, knob: 'tab',
      text: s.text ? 'ŚRUBKI' : '', textOn: 'front', textMode: 'cut',
      tx_front: 'none', tx_left: s.tex ? 'ribs' : 'none', tx_right: s.tex ? 'ribs' : 'none', tx_back: s.tex ? 'ribs' : 'none', tx_lid: 'none',
    };
    const parts = wz.plan(v).parts ?? [];
    const bodies = buildBodies(parts);
    clear();
    const solidsOf = (b: number) => parts.filter((p) => p.body === b && !p.hole);
    const boxPart = parts.find((p) => p.type === 'box' && !p.hole);
    const lidPart = parts.find((p) => (p.type === 'lid' || p.type === 'slab') && !p.hole);
    const meshes = new Map<number, THREE.Mesh>();
    for (const b of bodies) {
      const m = new THREE.Mesh(b.geometry, mat(b.color));
      m.userData.own = true;
      b.manifold.delete();
      meshes.set(b.body, m);
    }
    const boxMesh = boxPart ? meshes.get(boxPart.body) : undefined;
    if (!boxMesh) return;
    const root = new THREE.Group();
    root.add(boxMesh);
    const bb = new THREE.Box3().setFromObject(boxMesh);
    const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
    // Magnets show in their sockets on the box's rim (orange, as in the editor).
    for (const p of parts)
      if (p.type === 'magnet' && p.hole && p.body === boxPart!.body) {
        const m = new THREE.Mesh(built({ ...p, hole: false } as Part).geometry, mat('#f26419'));
        m.position.set(...p.position);
        m.rotation.set(...(p.rotation.map((r) => (r * Math.PI) / 180) as [number, number, number]));
        root.add(m);
      }
    // The other bodies: the lid and its glued-on handle. A hinged lid already sits on the box.
    const lidMesh = lidPart ? meshes.get(lidPart.body) : undefined;
    const knobs = [...meshes].filter(([b, m]) => m !== boxMesh && m !== lidMesh && solidsOf(b).every((p) => p.type === 'cube' || p.type === 'cylinder')).map(([, m]) => m);
    if (lidMesh && lidPart && s.lid !== 'hinge') {
      const g = new THREE.Group();
      g.add(lidMesh);
      const flip = lidFace(lidPart) === 'bottom';
      if (flip) g.rotation.x = Math.PI;
      g.updateMatrixWorld(true);
      let lb = new THREE.Box3().setFromObject(g);
      g.position.set(cx - (lb.min.x + lb.max.x) / 2, cy - (lb.min.y + lb.max.y) / 2, bb.max.z + (GAP[s.lid] ?? 12) - lb.min.z);
      g.updateMatrixWorld(true);
      lb = new THREE.Box3().setFromObject(g);
      root.add(g);
      for (const k of knobs) {
        if (!flip) {
          // Printed on the lid already: moves with it.
          k.position.copy(g.position);
          k.rotation.copy(g.rotation);
          root.add(k);
          continue;
        }
        const kb = new THREE.Box3().setFromObject(k);
        k.position.set(cx - (kb.min.x + kb.max.x) / 2, lb.min.y + 8 - (kb.min.y + kb.max.y) / 2, lb.max.z - kb.min.z);
        root.add(k);
      }
    } else {
      if (lidMesh) root.add(lidMesh);
      for (const k of knobs) root.add(k);
    }
    root.position.set(-cx, -cy, 0);
    model.add(root);
    model.updateMatrixWorld(true);
    const all = new THREE.Box3().setFromObject(model);
    const sph = all.getBoundingSphere(new THREE.Sphere());
    aim.c.copy(sph.center);
    aim.r = Math.max(sph.radius, 70);
    size = { W: bb.max.x - bb.min.x, D: bb.max.y - bb.min.y, H: bb.max.z - bb.min.z };
    if (first) {
      now.c.copy(aim.c);
      now.r = aim.r;
      first = false;
      onReady();
    }
  }

  function resize() {
    const w = Math.max(1, view.clientWidth), h = Math.max(1, view.clientHeight);
    const c = renderer.domElement;
    if (c.width !== Math.round(w * renderer.getPixelRatio()) || c.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    cam.aspect = w / h;
    over.setAttribute('viewBox', `0 0 ${w} ${h}`);
    return [w, h];
  }

  const px = (p: THREE.Vector3, w: number, h: number): [number, number] => {
    const q = p.clone().project(cam);
    return [((q.x + 1) / 2) * w, ((1 - q.y) / 2) * h];
  };

  function dims(w: number, h: number) {
    over.innerHTML = '';
    if (!st) return;
    const { W, D, H } = size;
    const x0 = -W / 2, x1 = W / 2, y0 = -D / 2, y1 = D / 2;
    const o = 10 + now.r * 0.05;
    const line = (a: THREE.Vector3, b: THREE.Vector3, k: Key, label: string, side: THREE.Vector3) => {
      const p1 = px(a.clone().add(side), w, h), p2 = px(b.clone().add(side), w, h);
      const e1 = px(a, w, h), e2 = px(b, w, h);
      const on = st!.active === k;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'dim' + (on ? ' on' : ''));
      path.setAttribute('d', `M${e1}L${p1}M${e2}L${p2}M${p1}L${p2}`);
      over.appendChild(path);
      const m: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      const far = px(a.clone().add(b).multiplyScalar(0.5).add(side.clone().multiplyScalar(2.2)), w, h);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'dimtxt' + (on ? ' on' : ''));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('x', far[0].toFixed(1));
      t.setAttribute('y', (far[1] + 4).toFixed(1));
      t.textContent = label;
      over.appendChild(t);
      handles[k] = m;
      if (on) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('class', 'knob');
        c.setAttribute('cx', m[0].toFixed(1));
        c.setAttribute('cy', m[1].toFixed(1));
        c.setAttribute('r', '5');
        over.appendChild(c);
      }
    };
    line(new THREE.Vector3(x0, y0, 0), new THREE.Vector3(x1, y0, 0), 'W', st.W + ' mm', new THREE.Vector3(0, -o, 0));
    line(new THREE.Vector3(x1, y0, 0), new THREE.Vector3(x1, y1, 0), 'D', st.D + ' mm', new THREE.Vector3(o, 0, 0));
    line(new THREE.Vector3(x0, y0, 0), new THREE.Vector3(x0, y0, H), 'H', st.H + ' mm', new THREE.Vector3(-o * 0.7, -o * 0.7, 0));
  }

  function tick(t: number) {
    raf = 0;
    if (!alive || !onScreen) return;
    // Rebuilding takes a few dozen milliseconds: at most every 60 ms on a computer, 180 ms on a phone.
    if (dirty && st && t - lastBuild >= (phone() ? 180 : 60)) {
      dirty = false;
      try {
        rebuild(st);
      } catch (e) {
        console.warn('show', e);
      }
      lastBuild = performance.now();
    }
    const [w, h] = resize();
    now.c.lerp(aim.c, 0.08);
    now.r += (aim.r - now.r) * 0.08;
    const half = (FOV / 2) * (Math.PI / 180);
    const fit = Math.min(Math.tan(half), Math.tan(half) * cam.aspect);
    cam.position.copy(now.c).addScaledVector(dir, (now.r / Math.sin(Math.atan(fit))) * (w < 500 ? 1.25 : 1.12));
    cam.lookAt(now.c);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    renderer.render(scene, cam);
    dims(w, h);
    raf = requestAnimationFrame(tick);
  }

  view.appendChild(canvas);
  view.appendChild(over);

  return {
    draw(s) {
      st = { ...s };
      dirty = true;
      if (!raf && alive && onScreen) raf = requestAnimationFrame(tick);
    },
    handle(k) {
      const h = handles[k];
      if (!h) return null;
      const r = view.getBoundingClientRect();
      return [r.left + h[0], r.top + h[1]];
    },
    stop() {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      clear();
      renderer.dispose();
      canvas.remove();
      over.remove();
    },
  };
}
