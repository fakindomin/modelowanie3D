/**
 * The start page's show drawn by the app's own engine: the box wizard („Pudełko z pokrywką”) builds the real
 * box and lid, the same solids the editor shows and exports. The show's script is fixed, so every state it
 * stops at is built once, before the show starts. While a dimension is dragged nothing is built: the ready
 * model of the last stop is stretched by moving its walls (wall thickness, text, magnets and handle keep their
 * shape), and at the end of the drag the exact model of the next stop takes its place. So it runs at full
 * frame rate on a phone as well. The dimension lines are drawn over the picture and give the cursor its handles.
 */
import * as THREE from 'three';
import { initManifold } from '../geom/manifold';
import type { Part } from '../types';

export type Key = 'W' | 'D' | 'H';
export type ShowState = { W: number; D: number; H: number; lid: string; text: boolean; tex: boolean; active: Key | null };
export type ShowView = { ready: Promise<void>; draw(st: ShowState): void; handle(k: Key): [number, number] | null; stop(): void };

const NS = 'http://www.w3.org/2000/svg';
const FOV = 28;
const GAP: Record<string, number> = { hinge: 0, press: 14, magnet: 20 };
/** Bands along the walls that move without stretching (walls, rim, magnets); the rest stretches. */
const SIDE = 10, FLOOR = 6, TOP = 10;

const keyOf = (s: ShowState) => [s.W, s.D, s.H, s.lid, +s.text, +s.tex].join('|');
const optsOf = (s: ShowState) => [s.lid, +s.text, +s.tex].join('|');

type Model = { st: ShowState; group: THREE.Group; meshes: { mesh: THREE.Mesh; base: Float32Array }[]; box: THREE.Box3; all: THREE.Box3; bent: boolean };

/** Stretch along one side axis (centred on 0): the outer bands move, the middle scales. */
function side(p: number, h0: number, h1: number) {
  const a = Math.abs(p);
  if (a >= h0 - SIDE) return Math.sign(p) * (a + h1 - h0);
  return (p * (h1 - SIDE)) / (h0 - SIDE);
}
/** Stretch upwards: the floor stays, the rim and everything above it (the lid) moves. */
function up(z: number, t0: number, t1: number) {
  if (z <= FLOOR) return z;
  if (z >= t0 - TOP) return z + t1 - t0;
  return FLOOR + ((z - FLOOR) * (t1 - TOP - FLOOR)) / (t0 - TOP - FLOOR);
}

export async function engineView(view: HTMLElement, plan: ShowState[]): Promise<ShowView> {
  // The store fills in the wizards' scratch scene, so it is loaded too.
  const [, { WIZARDS }, { buildBodies, built }, { lidFace }] = await Promise.all([initManifold(), import('../wizards'), import('../geom/parts'), import('../wizards/common'), import('../store')]);
  const wz = WIZARDS.box;

  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02 });

  /** The real model of one state, baked into the show's frame (box centred, floor at z = 0). */
  function build(s: ShowState): Model {
    const v = {
      ...wz.defaults,
      W: s.W, D: s.D, H: s.H, close: s.lid, knob: 'tab',
      text: s.text ? 'ŚRUBKI' : '', textOn: 'front', textMode: 'cut',
      tx_front: 'none', tx_left: s.tex ? 'ribs' : 'none', tx_right: s.tex ? 'ribs' : 'none', tx_back: s.tex ? 'ribs' : 'none', tx_lid: 'none',
    };
    const parts = wz.plan(v).parts ?? [];
    const bodies = buildBodies(parts);
    const solidsOf = (b: number) => parts.filter((p) => p.body === b && !p.hole);
    const boxPart = parts.find((p) => p.type === 'box' && !p.hole);
    const lidPart = parts.find((p) => (p.type === 'lid' || p.type === 'slab') && !p.hole);
    const meshes = new Map<number, THREE.Mesh>();
    for (const b of bodies) {
      meshes.set(b.body, new THREE.Mesh(b.geometry, mat(b.color)));
      b.manifold.delete();
    }
    const boxMesh = boxPart ? meshes.get(boxPart.body) : undefined;
    if (!boxMesh) throw new Error('no box');
    const root = new THREE.Group();
    root.add(boxMesh);
    const bb = new THREE.Box3().setFromObject(boxMesh);
    const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
    // Magnets show in their sockets on the box's rim (orange, as in the editor).
    for (const p of parts)
      if (p.type === 'magnet' && p.hole && p.body === boxPart!.body) {
        const m = new THREE.Mesh(built({ ...p, hole: false } as Part).geometry.clone(), mat('#f26419'));
        m.position.set(...p.position);
        m.rotation.set(...(p.rotation.map((r) => (r * Math.PI) / 180) as [number, number, number]));
        root.add(m);
      }
    // The lid and its glued-on handle. A hinged lid already sits on the box; the others lie beside it.
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
          k.position.copy(g.position);
          k.rotation.copy(g.rotation);
        } else {
          const kb = new THREE.Box3().setFromObject(k);
          k.position.set(cx - (kb.min.x + kb.max.x) / 2, lb.min.y + 8 - (kb.min.y + kb.max.y) / 2, lb.max.z - kb.min.z);
        }
        root.add(k);
      }
    } else {
      if (lidMesh) root.add(lidMesh);
      for (const k of knobs) root.add(k);
    }
    root.position.set(-cx, -cy, 0);
    root.updateMatrixWorld(true);
    // Bake every placement into the geometry, so stretching works on plain coordinates.
    const group = new THREE.Group();
    const list: Model['meshes'] = [];
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const g = o.geometry as THREE.BufferGeometry;
      g.applyMatrix4(o.matrixWorld);
      const m = new THREE.Mesh(g, o.material);
      m.frustumCulled = false;
      group.add(m);
      list.push({ mesh: m, base: (g.attributes.position.array as Float32Array).slice() });
    });
    const box = bb.clone().translate(new THREE.Vector3(-cx, -cy, 0));
    const all = new THREE.Box3().setFromObject(group);
    return { st: { ...s }, group, meshes: list, box, all, bent: false };
  }

  // Every stop of the script is built once: the first one before anything shows (so the very first picture is
  // the real box), the others right after it, before the show starts moving.
  const cache = new Map<string, Model>();
  const life = { alive: true };
  const prepare = (s: ShowState) => {
    const k = keyOf(s);
    if (cache.has(k)) return;
    try {
      cache.set(k, build(s));
    } catch (e) {
      // A stop that fails is built (or stretched to) while the show plays instead.
      console.warn('show stop', k, e);
    }
  };
  prepare(plan[0]);
  const ready = (async () => {
    for (const s of plan.slice(1)) {
      await new Promise((r) => setTimeout(r, 0));
      if (!life.alive) return;
      prepare(s);
    }
  })();

  const canvas = document.createElement('canvas');
  canvas.className = 'eng';
  const over = document.createElementNS(NS, 'svg');
  over.setAttribute('class', 'dims');
  over.setAttribute('aria-hidden', 'true');
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    // Some phones refuse a smoothed canvas while another WebGL view is open: take a plain one.
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
  }
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4946, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(150, -200, 300);
  scene.add(sun);
  const back = new THREE.DirectionalLight(0xffffff, 0.5);
  back.position.set(-200, 150, 120);
  scene.add(back);
  const cam = new THREE.PerspectiveCamera(FOV, 1, 1, 20000);
  cam.up.set(0, 0, 1);
  const dir = new THREE.Vector3(0.9, -1.3, 0.85).normalize();

  let st: ShowState | null = null, pending: ShowState | null = null;
  let shown: Model | null = null;
  let raf = 0, alive = true, onScreen = true, first = true;
  const box = new THREE.Box3(), all = new THREE.Box3();
  const aim = { c: new THREE.Vector3(), r: 1 }, now = { c: new THREE.Vector3(), r: 0 };
  const handles: Partial<Record<Key, [number, number]>> = {};

  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen && alive && !raf) raf = requestAnimationFrame(tick);
  });
  io.observe(view);

  function restore(m: Model) {
    if (!m.bent) return;
    for (const { mesh, base } of m.meshes) {
      const a = mesh.geometry.attributes.position as THREE.BufferAttribute;
      (a.array as Float32Array).set(base);
      a.needsUpdate = true;
    }
    m.bent = false;
  }

  /** Shows model m, stretched to the sizes of s (when s is not m's own state). */
  function show(m: Model, s: ShowState) {
    if (shown !== m) {
      if (shown) scene.remove(shown.group);
      scene.add(m.group);
      shown = m;
    }
    const b = m.box, h0x = (b.max.x - b.min.x) / 2, h0y = (b.max.y - b.min.y) / 2, t0 = b.max.z;
    const h1x = h0x + (s.W - m.st.W) / 2, h1y = h0y + (s.D - m.st.D) / 2, t1 = t0 + s.H - m.st.H;
    const same = s.W === m.st.W && s.D === m.st.D && s.H === m.st.H;
    if (same) restore(m);
    else {
      for (const { mesh, base } of m.meshes) {
        const a = mesh.geometry.attributes.position as THREE.BufferAttribute, arr = a.array as Float32Array;
        for (let i = 0; i < base.length; i += 3) {
          arr[i] = side(base[i], h0x, h1x);
          arr[i + 1] = side(base[i + 1], h0y, h1y);
          arr[i + 2] = up(base[i + 2], t0, t1);
        }
        a.needsUpdate = true;
      }
      m.bent = true;
    }
    const map = (p: THREE.Vector3) => new THREE.Vector3(side(p.x, h0x, h1x), side(p.y, h0y, h1y), up(p.z, t0, t1));
    box.set(map(b.min), map(b.max));
    all.set(map(m.all.min), map(m.all.max));
    const sph = all.getBoundingSphere(new THREE.Sphere());
    aim.c.copy(sph.center);
    aim.r = Math.max(sph.radius, 70);
    if (first) {
      now.c.copy(aim.c);
      now.r = aim.r;
      first = false;
    }
  }

  function apply(s: ShowState) {
    const exact = cache.get(keyOf(s));
    if (exact) return show(exact, s);
    // Between two stops: stretch the model on screen (or a stop with the same options).
    if (shown && optsOf(shown.st) === optsOf(s)) return show(shown, s);
    const near = [...cache.values()].find((m) => optsOf(m.st) === optsOf(s));
    if (near) return show(near, s);
    try {
      const m = build(s);
      cache.set(keyOf(s), m);
      show(m, s);
    } catch (e) {
      console.warn('show', e);
    }
  }

  function resize() {
    const w = Math.max(1, view.clientWidth), h = Math.max(1, view.clientHeight);
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
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
    const { min, max } = box;
    const o = 10 + now.r * 0.05;
    const line = (a: THREE.Vector3, b: THREE.Vector3, k: Key, label: string, off: THREE.Vector3) => {
      const p1 = px(a.clone().add(off), w, h), p2 = px(b.clone().add(off), w, h);
      const e1 = px(a, w, h), e2 = px(b, w, h);
      const on = st!.active === k;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'dim' + (on ? ' on' : ''));
      path.setAttribute('d', `M${e1}L${p1}M${e2}L${p2}M${p1}L${p2}`);
      over.appendChild(path);
      const m: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      const far = px(a.clone().add(b).multiplyScalar(0.5).add(off.clone().multiplyScalar(2.2)), w, h);
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
    line(new THREE.Vector3(min.x, min.y, 0), new THREE.Vector3(max.x, min.y, 0), 'W', st.W + ' mm', new THREE.Vector3(0, -o, 0));
    line(new THREE.Vector3(max.x, min.y, 0), new THREE.Vector3(max.x, max.y, 0), 'D', st.D + ' mm', new THREE.Vector3(o, 0, 0));
    line(new THREE.Vector3(min.x, min.y, 0), new THREE.Vector3(min.x, min.y, max.z), 'H', st.H + ' mm', new THREE.Vector3(-o * 0.7, -o * 0.7, 0));
  }

  function tick() {
    raf = 0;
    if (!alive || !onScreen) return;
    if (pending) {
      apply(pending);
      pending = null;
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
    ready,
    draw(s) {
      st = { ...s };
      pending = st;
      // The first picture right away.
      if (first) tick();
      else if (!raf && alive && onScreen) raf = requestAnimationFrame(tick);
    },
    handle(k) {
      const h = handles[k];
      if (!h) return null;
      const r = view.getBoundingClientRect();
      return [r.left + h[0], r.top + h[1]];
    },
    stop() {
      alive = false;
      life.alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      for (const m of cache.values())
        for (const { mesh } of m.meshes) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      renderer.dispose();
      canvas.remove();
      over.remove();
    },
  };
}
