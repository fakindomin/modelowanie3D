import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Manifold } from 'manifold-3d';
import { initManifold, toGeometry } from '../geom/manifold';
import { download, stlOf, zip } from '../export';
import { DEPTH, autoPlace, bottomOf, engraveBottom, fits, letterAt, parseSTL, place, toManifold, type Bottom } from './core';

interface Item {
  name: string;
  m?: Manifold;
  base?: Bottom;
  err?: string;
  on: boolean;
  h: number;
  rot: number;
  at: [number, number] | null;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const items: Item[] = [];
let sel = -1;

// ---------- files ----------
const drop = $('drop'), pick = $<HTMLInputElement>('pick');
pick.addEventListener('change', () => pick.files && addFiles([...pick.files]));
drop.addEventListener('dragover', (e) => (e.preventDefault(), drop.classList.add('over')));
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  if (e.dataTransfer) addFiles([...e.dataTransfer.files].filter((f) => /\.stl$/i.test(f.name)));
});

const ready = initManifold();

async function addFiles(files: File[]) {
  await ready;
  $('work').classList.remove('hidden');
  $('bar').classList.remove('hidden');
  for (const f of files) {
    const it: Item = { name: f.name.replace(/\.stl$/i, ''), on: true, h: 8, rot: 0, at: null };
    items.push(it);
    renderList();
    await new Promise((r) => setTimeout(r, 20));
    try {
      it.m = toManifold(parseSTL(await f.arrayBuffer()));
      it.base = bottomOf(it.m);
      const a = it.base.area > 1 ? autoPlace(it.base.free) : null;
      if (a) Object.assign(it, a);
      else {
        it.on = false;
        it.err = 'Spód za mały na znak (albo model nie leży płasko na stole).';
      }
    } catch (e) {
      it.on = false;
      it.err = (e as Error).message;
    }
    if (sel < 0 || items.length === 1) sel = items.length - 1;
    renderList();
    if (sel === items.length - 1) show();
  }
}

function status(it: Item): [string, string] {
  if (!it.m && !it.err) return ['Wczytuję…', ''];
  if (it.err && !it.at) return [it.err, 'bad'];
  if (!it.on) return ['Bez znaku', ''];
  if (it.at && it.base && !fits(it.base.free, it.h, it.rot, it.at)) return ['Znak wychodzi poza spód', 'bad'];
  return [`Znak ${fmt(it.h)} mm na spodzie`, 'ok'];
}
const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

function renderList() {
  const list = $('list');
  list.innerHTML = '';
  items.forEach((it, i) => {
    const [txt, cls] = status(it);
    const row = document.createElement('div');
    row.className = 'file' + (i === sel ? ' sel' : '');
    row.innerHTML = `<input type="checkbox" ${it.on ? 'checked' : ''} ${it.at ? '' : 'disabled'} title="Ze znakiem"><div class="info"><div class="nm"></div><div class="st ${cls}"></div></div>`;
    (row.querySelector('.nm') as HTMLElement).textContent = it.name + '.stl';
    (row.querySelector('.st') as HTMLElement).textContent = txt;
    const cb = row.querySelector('input') as HTMLInputElement;
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      it.on = cb.checked;
      if (i === sel) show();
      else renderList();
    });
    row.addEventListener('click', () => {
      sel = i;
      renderList();
      show();
    });
    list.appendChild(row);
  });
  const n = items.filter((x) => x.m).length, marked = items.filter((x) => x.on && x.at).length;
  $('summary').textContent = n ? `${n} ${n === 1 ? 'plik' : n < 5 ? 'pliki' : 'plików'}, ze znakiem: ${marked}` : '';
  $<HTMLButtonElement>('dl').disabled = !n;
  $('dl').textContent = n > 1 ? 'Pobierz wszystkie (ZIP)' : 'Pobierz STL';
}

// ---------- 3D view (from below) ----------
const c3 = $<HTMLCanvasElement>('v3d');
const renderer = new THREE.WebGLRenderer({ canvas: c3, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, c3);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f88, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 0.7);
scene.add(sun, sun.target);
// Grazing light across the bottom, so the shallow mark casts visible edges.
const lamp = new THREE.DirectionalLight(0xffffff, 2.2);
scene.add(lamp, lamp.target);
const css = getComputedStyle(document.documentElement);
const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(css.getPropertyValue('--model').trim() || '#c9cec7'), roughness: 0.7 });
let mesh: THREE.Mesh | null = null;
// The bottom of the cut, tinted, so the shallow mark is easy to see in the preview.
const floorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(css.getPropertyValue('--orange').trim() || '#e0782b'), side: THREE.DoubleSide });
let floor: THREE.Mesh | null = null;
let shownFor = -1;

function size3() {
  const r = c3.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height || 1;
  camera.updateProjectionMatrix();
}
(function loop() {
  requestAnimationFrame(loop);
  controls.update();
  sun.position.copy(camera.position);
  sun.target.position.copy(controls.target);
  lamp.target.position.copy(controls.target);
  lamp.position.copy(controls.target).add(new THREE.Vector3(-300, 220, -90));
  renderer.render(scene, camera);
})();
new ResizeObserver(() => (size3(), draw2d())).observe(c3);

let timer = 0;
function update3d() {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    const it = items[sel];
    if (!it?.m) return;
    const solid = it.on && it.at && it.base ? engraveBottom(it.m, it.base.z, it.h, it.rot, it.at) : it.m;
    const g = toGeometry(solid);
    if (solid !== it.m) solid.delete();
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    mesh = new THREE.Mesh(g, material);
    scene.add(mesh);
    if (floor) {
      scene.remove(floor);
      floor.geometry.dispose();
      floor = null;
    }
    if (it.on && it.at && it.base) {
      const l = letterAt(it.h, it.rot, it.at);
      const slab = l.extrude(0.02).translate([0, 0, it.base.z + DEPTH - 0.04]);
      floor = new THREE.Mesh(toGeometry(slab), floorMat);
      scene.add(floor);
      l.delete();
      slab.delete();
    }
    if (shownFor !== sel) {
      shownFor = sel;
      // Aim at the bottom, close enough to read the mark; zoom out with the wheel for the whole model.
      const fb = it.base?.free.bounds(), bb = it.m.boundingBox();
      const lo = fb ?? { min: [bb.min[0], bb.min[1]], max: [bb.max[0], bb.max[1]] };
      const c = new THREE.Vector3((lo.min[0] + lo.max[0]) / 2, (lo.min[1] + lo.max[1]) / 2, bb.min[2]);
      const R = Math.max(lo.max[0] - lo.min[0], lo.max[1] - lo.min[1], 20);
      controls.target.copy(c);
      camera.position.copy(c).add(new THREE.Vector3(-0.08, 0.22, -1).normalize().multiplyScalar(R * 2.2));
      controls.update();
    }
  }, 120);
}

// ---------- 2D bottom view (seen from below: X mirrored) ----------
const c2 = $<HTMLCanvasElement>('v2d');
let view = { s: 1, cx: 0, cy: 0, mx: 0, my: 0 };
const toScreen = (x: number, y: number): [number, number] => [view.cx - (x - view.mx) * view.s, view.cy - (y - view.my) * view.s];
const toWorld = (sx: number, sy: number): [number, number] => [view.mx - (sx - view.cx) / view.s, view.my - (sy - view.cy) / view.s];

function draw2d() {
  const dpr = Math.min(2, devicePixelRatio), r = c2.getBoundingClientRect();
  c2.width = r.width * dpr;
  c2.height = r.height * dpr;
  const g = c2.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, r.width, r.height);
  const it = items[sel];
  if (!it?.base) return;
  const css = getComputedStyle(document.documentElement);
  const bb = it.base.free.bounds();
  const w = bb.max[0] - bb.min[0] || 1, h = bb.max[1] - bb.min[1] || 1;
  view = { s: Math.min((r.width - 40) / w, (r.height - 50) / h), cx: r.width / 2, cy: r.height / 2 + 8, mx: (bb.min[0] + bb.max[0]) / 2, my: (bb.min[1] + bb.max[1]) / 2 };
  const path = (polys: [number, number][][]) => {
    g.beginPath();
    for (const p of polys) p.forEach(([x, y], k) => (k ? g.lineTo : g.moveTo).call(g, ...toScreen(x, y)));
    g.closePath();
  };
  path(it.base.free.toPolygons() as [number, number][][]);
  g.fillStyle = css.getPropertyValue('--model').trim();
  g.fill('evenodd');
  if (!it.at) return;
  const l = letterAt(it.h, it.rot, it.at);
  const ok = fits(it.base.free, it.h, it.rot, it.at);
  const ring = l.offset(1.2, 'Round');
  path(ring.toPolygons() as [number, number][][]);
  g.setLineDash([4, 3]);
  g.strokeStyle = it.on ? (ok ? css.getPropertyValue('--green') : css.getPropertyValue('--bad')) : css.getPropertyValue('--muted');
  g.lineWidth = 1.5;
  g.stroke();
  g.setLineDash([]);
  path(l.toPolygons() as [number, number][][]);
  g.fillStyle = it.on ? css.getPropertyValue('--ink') : css.getPropertyValue('--muted');
  g.globalAlpha = it.on ? 1 : 0.4;
  g.fill('nonzero');
  g.globalAlpha = 1;
  l.delete();
  ring.delete();
}

let drag: [number, number] | null = null;
c2.addEventListener('pointerdown', (e) => {
  const it = items[sel];
  if (!it?.at || !it.on) return;
  const r = c2.getBoundingClientRect();
  const [x, y] = toWorld(e.clientX - r.left, e.clientY - r.top);
  drag = [x - it.at[0], y - it.at[1]];
  c2.setPointerCapture(e.pointerId);
});
c2.addEventListener('pointermove', (e) => {
  const it = items[sel];
  if (!drag || !it?.at) return;
  const r = c2.getBoundingClientRect();
  const [x, y] = toWorld(e.clientX - r.left, e.clientY - r.top);
  it.at = [x - drag[0], y - drag[1]];
  draw2d();
});
c2.addEventListener('pointerup', () => {
  if (!drag) return;
  drag = null;
  changed();
});

// ---------- controls ----------
const size = $<HTMLInputElement>('size'), on = $<HTMLInputElement>('on');
size.addEventListener('input', () => {
  const it = items[sel];
  if (!it?.at) return;
  it.h = +size.value;
  $('sizev').textContent = fmt(it.h) + ' mm';
  draw2d();
});
size.addEventListener('change', changed);
on.addEventListener('change', () => {
  const it = items[sel];
  if (!it) return;
  it.on = on.checked;
  changed();
});
$('rot').addEventListener('click', () => {
  const it = items[sel];
  if (!it?.at) return;
  it.rot = (it.rot + 90) % 360;
  changed();
});
$('auto').addEventListener('click', () => {
  const it = items[sel];
  if (!it?.base) return;
  const at = place(it.base.free, it.h, it.rot);
  if (at) it.at = at;
  else {
    const a = autoPlace(it.base.free, it.rot);
    if (a) Object.assign(it, a);
  }
  changed();
});

function changed() {
  renderList();
  show();
}

function show() {
  const it = items[sel];
  if (!it) return;
  on.checked = it.on;
  on.disabled = !it.at;
  size.value = String(it.h);
  $('sizev').textContent = fmt(it.h) + ' mm';
  for (const id of ['size', 'rot', 'auto']) $<HTMLInputElement>(id).disabled = !it.at;
  const [txt, cls] = status(it);
  $('msg').textContent = it.err && !it.at ? it.err : cls === 'bad' ? txt + ': przesuń go albo zmniejsz.' : '';
  $('msg').className = 'msg' + (cls === 'bad' ? ' bad' : '');
  draw2d();
  update3d();
}

// ---------- download ----------
$('dl').addEventListener('click', async () => {
  const ok = items.filter((it) => it.m);
  const files = ok.map((it) => {
    const marked = it.on && it.at && it.base;
    const solid = marked ? engraveBottom(it.m!, it.base!.z, it.h, it.rot, it.at!) : it.m!;
    const data = stlOf(solid.getMesh() as Parameters<typeof stlOf>[0]);
    if (solid !== it.m) solid.delete();
    return { name: `${it.name}${marked ? '-F' : ''}.stl`, data };
  });
  if (files.length === 1) await download(files[0].data, files[0].name, 'model/stl');
  else await download(zip(files), 'znak-F.zip', 'application/zip');
});
