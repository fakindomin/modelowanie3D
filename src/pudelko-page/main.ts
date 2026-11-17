/** Samodzielna strona z konfiguratorem pudełka: te same części (`PUDELKO_DEFS`), podgląd 3D z rozsuwaniem pokrywy i szuflad. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { initManifold, toGeometry } from '../geom/manifold';
import { PUDELKO_DEFS } from '../parts/pudelko';
import type { ParamDef, Params } from '../parts/def';

const def = PUDELKO_DEFS[0];
const defaults = (): Params => Object.fromEntries(def.params.map((d) => [d.key, d.def]));
let state: Params = defaults();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#999';
const fmt = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

// ---------- scena ----------
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);
camera.up.set(0, 0, 1);
const target = new THREE.Vector3(82, 37, 28);
const dirHome = new THREE.Vector3(0.12, -1, 0.7).normalize();
camera.position.copy(target).addScaledVector(dirHome, 380);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.copy(target);
scene.background = new THREE.Color(css('--view'));
/** Ustawia kamerę tak, żeby cała bryła (z wysuniętymi częściami) mieściła się w kadrze, zachowując kierunek patrzenia. */
function frame(dir?: THREE.Vector3) {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const vf = (camera.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const d = (r / Math.sin(Math.min(vf, hf) / 2)) * 0.9;
  const v = dir ?? camera.position.clone().sub(orbit.target).normalize();
  orbit.target.copy(c); camera.position.copy(c).addScaledVector(v, d);
}
orbit.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(120, -180, 260); scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.7); fill.position.set(-200, 120, 80); scene.add(fill);
const group = new THREE.Group(); scene.add(group);
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize();
(function loop() { orbit.update(); renderer.render(scene, camera); requestAnimationFrame(loop); })();

const COLORS: Record<string, string> = { korpus: '--oak', pokrywa: '--lidc', szuflady: '--drw', napis: '--ink3d', znak: '--ink3d', ubijak: '--drw' };
const meshes = new Map<string, THREE.Mesh>();
const cache = new Map<string, string>();
const OPENS: Record<string, string[]> = { pokrywa: ['lidOpen'], napis: ['lidOpen'], szuflady: ['drOpen', 'drOpen2'], znak: ['drOpen', 'drOpen2'] };
const allOpens = ['lidOpen', 'drOpen', 'drOpen2'];
const keyFor = (piece: string) => JSON.stringify(Object.entries(state).filter(([k]) => !allOpens.includes(k) || (OPENS[piece] ?? []).includes(k)).sort());
function recolor() {
  scene.background = new THREE.Color(css('--view'));
  for (const [piece, mesh] of meshes) (mesh.material as THREE.MeshStandardMaterial).color.set(css(COLORS[piece]));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(recolor, 50));

let building = false, dirty = false, framed = false;
function schedule() { dirty = true; $('status').textContent = 'Przeliczam…'; if (!building) setTimeout(run, 60); }
function run() {
  building = true; dirty = false;
  const t0 = performance.now();
  try {
    for (const piece of def.pieces!.map((p) => p.value)) {
      const key = keyFor(piece);
      if (cache.get(piece) === key) continue;
      const m = def.build({ ...state, piece });
      const geo = toGeometry(m); m.delete();
      let mesh = meshes.get(piece);
      if (!mesh) { mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: css(COLORS[piece]), roughness: 0.75, metalness: 0 })); meshes.set(piece, mesh); group.add(mesh); }
      else { mesh.geometry.dispose(); mesh.geometry = geo; }
      cache.set(piece, key);
    }
    $('status').textContent = `Gotowe (${Math.round(performance.now() - t0)} ms)`;
    if (!framed) { framed = true; frame(dirHome); }
  } catch (e) { $('status').textContent = 'Błąd: ' + (e as Error).message; }
  building = false;
  if (dirty) setTimeout(run, 0);
}

// ---------- panel ----------
type Ctl = { d: ParamDef; row: HTMLElement; set: (def: ParamDef) => void };
const ctls = new Map<string, Ctl>();
const ctlBox = $('ctl'), openBox = $('openBox');
let more: HTMLElement | null = null, lastGroup = '';
function onChange(key: string, v: number | string | boolean) {
  state = def.normalize ? def.normalize(state, { ...state, [key]: v }) : { ...state, [key]: v };
  refresh(); schedule();
}
for (const d of def.params) {
  if (d.group) { const h = document.createElement('h2'); h.textContent = d.group; ctlBox.append(h); lastGroup = d.group; more = null; }
  const row = document.createElement('div'); row.className = 'row';
  const label = document.createElement('label'); label.textContent = d.label; if (d.hint) label.title = d.hint; row.append(label);
  let set: (dd: ParamDef) => void;
  if (d.type === 'number') {
    const num = document.createElement('input'); num.type = 'number'; num.id = 'n_' + d.key;
    const range = document.createElement('input'); range.type = 'range'; range.id = 'r_' + d.key;
    const unit = document.createElement('span'); unit.className = 'unit'; unit.textContent = d.unit ?? '';
    const val = document.createElement('div'); val.className = 'val'; val.append(num, unit);
    const narrow = document.createElement('div'); narrow.className = 'narrow'; narrow.hidden = true;
    label.htmlFor = num.id;
    range.addEventListener('input', () => onChange(d.key, Number(range.value)));
    num.addEventListener('change', () => { const dd = ctls.get(d.key)!.d as Extract<ParamDef, { type: 'number' }>; onChange(d.key, Math.min(dd.max, Math.max(dd.min, Number(num.value)))); });
    row.append(val, range, narrow);
    set = (dd) => {
      const n = dd as Extract<ParamDef, { type: 'number' }>;
      range.min = num.min = String(n.min); range.max = num.max = String(n.max); range.step = num.step = String(n.step ?? 1);
      range.value = num.value = String(state[d.key]);
      const narrowed = !!n.hint && n.hint.includes('Zakres zawężony');
      narrow.hidden = !narrowed; narrow.textContent = narrowed ? `Zakres ${fmt(n.min)}–${fmt(n.max)} ${n.unit ?? ''} (zawężony przez inne wymiary)` : '';
    };
  } else if (d.type === 'select') {
    const sel = document.createElement('select'); sel.id = 's_' + d.key; label.htmlFor = sel.id;
    for (const o of d.options) { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; sel.append(op); }
    sel.addEventListener('change', () => onChange(d.key, sel.value));
    row.append(sel);
    set = () => { sel.value = String(state[d.key]); };
  } else {
    set = () => {}; row.hidden = true;
  }
  if (d.more) { if (!more) { const det = document.createElement('details'); const sm = document.createElement('summary'); sm.textContent = 'Więcej wymiarów'; det.append(sm); more = det; ctlBox.append(det); } more.append(row); }
  else if (allOpens.includes(d.key)) openBox.append(row);
  else ctlBox.append(row);
  ctls.set(d.key, { d, row, set });
}
function refresh() {
  const defs = def.paramsFor ? def.paramsFor(state) : def.params;
  for (const d of defs) {
    const c = ctls.get(d.key); if (!c) continue;
    c.d = d;
    const vis = d.type !== 'bool' && d.type !== 'text' && !(d.show && !d.show(state));
    c.row.hidden = !vis; c.set(d);
  }
  const L = (def.notes?.(state) ?? []);
  const ul = $('notes'); ul.textContent = '';
  for (const n of L) { const li = document.createElement('li'); li.className = n.level; li.textContent = n.text; ul.append(li); }
  const m = /Wymiary zewnętrzne ([\d,]+) × ([\d,]+) × ([\d,]+)/.exec(L[0]?.text ?? '');
  $('dims').textContent = m ? `${m[1]} × ${m[2]} × ${m[3]} mm` : '';
}

const setOpen = (v: number) => { state = { ...state, lidOpen: v, drOpen: v, drOpen2: v }; refresh(); schedule(); setTimeout(() => frame(), 400); };
$('bOpen').addEventListener('click', () => setOpen(100));
$('bClose').addEventListener('click', () => setOpen(0));
$('bReset').addEventListener('click', () => { state = defaults(); refresh(); schedule(); setTimeout(() => frame(dirHome), 400); });
$('bBottom').addEventListener('click', () => frame(new THREE.Vector3(0.12, -0.6, -1).normalize()));
$('bCopy').addEventListener('click', async () => {
  const diff = Object.fromEntries(Object.entries(state).filter(([k, v]) => String(v) !== String(defaults()[k])));
  const txt = JSON.stringify(diff, null, 1);
  try { await navigator.clipboard.writeText(txt); $('bCopy').textContent = 'Skopiowano'; } catch {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* brak schowka */ }
    ta.remove(); $('bCopy').textContent = ok ? 'Skopiowano' : 'Schowek zablokowany';
  }
  setTimeout(() => ($('bCopy').textContent = 'Kopiuj parametry'), 1500);
});
$('stage').addEventListener('dblclick', () => frame(dirHome));

initManifold().then(() => { refresh(); run(); }).catch((e) => { $('status').textContent = 'Błąd ładowania: ' + e.message; });
