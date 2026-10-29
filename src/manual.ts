import * as THREE from 'three';
import { DEFS, MAGNETS } from './catalog';
import { buildBodies, built, partMatrix } from './geom/parts';
import { fittingGeo } from './parts/couplings';
import { WIZARDS } from './wizards';
import { DENSITY } from './wizards/estimate';
import type { Plan, PlanItem } from './wizards/types';
import type { Part, Vec3 } from './types';

/** One kind of print: every body in `bodies` comes out the same. */
export interface ManualItem {
  no: string;
  name: string;
  qty: number;
  size: Vec3;
  grams: number;
  material: string;
  how: string;
  where: string;
  /** Notes the user wrote on the parts of this print. */
  note: string;
  color: string;
  geometry: THREE.BufferGeometry;
  bodies: number[];
}

export interface Manual {
  title: string;
  items: ManualItem[];
  buy: { name: string; qty: string; note?: string }[];
  fits: string[];
  steps: string[];
  notes: { text: string; warn?: boolean }[];
  grams: number;
  hours: number;
  pieces: number;
}

const FLOW = 11;
const r = (v: number) => Math.round(v * 10) / 10;
const fix = (m: THREE.Matrix4) => m.elements.map((e) => Math.round(e * 100) / 100).join(',');

/** What a body is made of, independent of where it stands: same key = same print. */
function signature(members: Part[]) {
  const solids = members.filter((p) => !p.hole);
  const base = solids[0] ?? members[0];
  const inv = partMatrix(base.position, base.rotation).invert();
  const one = (p: Part) =>
    JSON.stringify([p.type, p.params, p.hole, p.clip, p.texture, p.textures, p.edges, p.bend, p.shell, p.infill, p.xform, p.merged]) +
    (p === base ? '' : fix(inv.clone().multiply(partMatrix(p.position, p.rotation))));
  return members.map(one).sort().join('|');
}

function materialOf(p: Part, wiz?: PlanItem) {
  if (wiz) return wiz.material;
  if (p.type === 'springClip') return 'PETG';
  if (p.type === 'oringPart' || p.type === 'gasket') return 'TPU';
  return 'PLA';
}

function howOf(p: Part, single: boolean, wiz?: PlanItem) {
  if (wiz) return wiz.how;
  if (p.type === 'springClip') return 'Leży płasko, bez podpór. PETG albo nylon.';
  if (p.type === 'oringPart' || p.type === 'gasket') return 'Leży płasko, TPU 85A–95A, wolno (20–30 mm/s).';
  if (p.type === 'pipeEnd' || p.type === 'tube') return 'Stoi pionowo, brim 5 mm.';
  if (single && p.type === 'pipeFitting') return 'Stoi na jednym ramieniu, podpory drzewkowe pod resztą ramion.';
  return 'Połóż na największej płaskiej ściance (przycisk ⊞ Ułóż robi to samo).';
}

const plural = (n: number, one: string, few: string, many: string) => {
  const f = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return `${n} ${n === 1 ? one : f ? few : many}`;
};
const cleanName = (s: string) => s.replace(/\s*\(kopia\)/g, '').replace(/\s+\d+$/, '');

/** Builds the manual of the current model: what to print, buy, what fits where and the order of assembly. */
export function makeManual(parts: Part[]): Manual {
  // Wizard runs: their plans give names, roles and texts.
  const plans = new Map<string, { plan: Plan; label: string }>();
  for (const p of parts)
    if (p.wiz?.recipe && !plans.has(p.wiz.run) && WIZARDS[p.wiz.w]) {
      try {
        plans.set(p.wiz.run, { plan: WIZARDS[p.wiz.w].plan(p.wiz.recipe.values), label: WIZARDS[p.wiz.w].label });
      } catch {
        /* a recipe from an older version: fall back to plain names */
      }
    }
  const planItem = (p: Part) => (p.wiz ? plans.get(p.wiz.run)?.plan.items.find((i) => i.role === p.wiz!.role) : undefined);

  const bodyIds = [...new Set(parts.filter((p) => !p.hole).map((p) => p.body))];
  const groups = new Map<string, number[]>();
  for (const b of bodyIds) {
    const sig = signature(parts.filter((p) => p.body === b));
    groups.set(sig, [...(groups.get(sig) ?? []), b]);
  }

  const items: ManualItem[] = [];
  const noOf = new Map<number, string>();
  let n = 0;
  for (const bodies of groups.values()) {
    const members = parts.filter((p) => p.body === bodies[0]);
    const solids = members.filter((p) => !p.hole);
    const main = solids.reduce((a, b) => (built(b).box.getSize(new THREE.Vector3()).length() > built(a).box.getSize(new THREE.Vector3()).length() ? b : a));
    const single = members.length === 1 && !main.bend && !main.shell && !main.infill && !main.xform;
    const wiz = planItem(main);
    let geometry: THREE.BufferGeometry, volume: number;
    if (single) {
      const b = built(main);
      geometry = b.geometry;
      volume = b.manifold.volume();
    } else {
      const [res] = buildBodies(parts, [bodies[0]]);
      geometry = res.geometry;
      volume = res.manifold.volume();
      res.manifold.delete();
    }
    geometry.computeBoundingBox();
    const s = geometry.boundingBox!.getSize(new THREE.Vector3());
    const material = materialOf(main, wiz);
    // With several wizard projects in one model their roles repeat: number them per project (1.P, 2.P).
    const no = wiz ? (plans.size > 1 ? `${[...plans.keys()].indexOf(main.wiz!.run) + 1}.${wiz.role}` : wiz.role) : String(++n);
    bodies.forEach((b) => noOf.set(b, no));
    items.push({
      no,
      name: wiz ? wiz.name : cleanName(main.name),
      qty: bodies.length,
      size: [r(s.x), r(s.y), r(s.z)],
      grams: (volume / 1000) * (DENSITY[material] ?? 1.25),
      material,
      how: howOf(main, single, wiz),
      where: wiz?.where ?? '',
      note: [...new Set(bodies.flatMap((b) => parts.filter((p) => p.body === b && p.note?.trim()).map((p) => p.note!.trim())))].join(' '),
      color: main.color,
      geometry,
      bodies,
    });
  }
  // Wizard roles first in their own order, then the rest by number.
  const roleOrder = (it: ManualItem) => (/^\d+$/.test(it.no) ? 1e6 + Number(it.no) : items.indexOf(it));
  items.sort((a, b) => roleOrder(a) - roleOrder(b));

  // ------------------------------------------------------------------ what fits where
  const label = (body: number) => {
    const no = noOf.get(body);
    const it = items.find((i) => i.no === no);
    return it ? `${no} (${it.name})` : `bryła ${body}`;
  };
  const fits = new Set<string>();
  const byId = new Map(parts.map((p) => [p.id, p]));
  for (const p of parts) {
    if (p.wiz) continue;
    const to = (id?: string) => (id ? byId.get(id) : undefined);
    const box = to(p.fitTo);
    if (box) fits.add(`${label(p.body)} zamyka ${label(box.body)}.`);
    const fit = p.armOf ? to(p.armOf.of) : undefined;
    if (fit && !p.hole) fits.add(p.armOf!.role === 'clip' ? `Zatrzask ${label(p.body)} siedzi w rurze przy łączniku ${label(fit.body)}.` : `${label(p.body)} wchodzi w ramię łącznika ${label(fit.body)}.`);
    const gear = p.gearMate ? to(p.gearMate.of) : undefined;
    if (gear) fits.add(`${label(p.body)} zazębia się z ${label(gear.body)}.`);
    if (p.hole && !p.armOf && p.avoidBody !== undefined && noOf.has(p.avoidBody)) fits.add(`${label(p.avoidBody)} wchodzi w gniazdo w ${label(p.body)}.`);
  }
  const rigid = new Map<string, Set<number>>();
  for (const p of parts) if (p.rigid && !p.wiz) rigid.set(p.rigid, (rigid.get(p.rigid) ?? new Set()).add(p.body));
  for (const set of rigid.values()) if (set.size > 1) fits.add(`${[...set].map(label).join(', ')}: części jednego mechanizmu, składane razem.`);

  // ------------------------------------------------------------------ to buy
  const buy: Manual['buy'] = [];
  const magnets = new Map<string, number>();
  for (const p of parts) if (p.type === 'magnet' && !p.wiz) magnets.set(String(p.params.size), (magnets.get(String(p.params.size)) ?? 0) + 1);
  for (const [size, k] of magnets) {
    const [d, h] = MAGNETS[size] ?? [0, 0];
    buy.push({ name: `Magnes neodymowy Ø${d} × ${h} mm`, qty: `${k} szt.`, note: 'Wklej kroplą kleju CA. Przed wklejeniem sprawdź, czy pary się przyciągają.' });
  }
  const screws = new Map<string, number>();
  for (const p of parts) {
    if (p.wiz || (p.type !== 'pipeFitting' && p.type !== 'profileFitting') || p.params.screw === 'none' || p.params.end === 'pin') continue;
    const arms = fittingGeo(p.params, p.type === 'profileFitting').dirs.length;
    const k = arms * (p.params.screwMode === 'through' ? 1 : Number(p.params.screwN) || 1);
    const what = p.params.screwMode === 'through' ? `Śruba ${p.params.screw} z nakrętką` : `Wkręt do tworzyw ${p.params.screw}`;
    screws.set(what, (screws.get(what) ?? 0) + k);
  }
  for (const [what, k] of screws) buy.push({ name: what, qty: `${k} szt.`, note: 'Długość: przez ściankę łącznika i rurę.' });
  for (const { plan } of plans.values()) buy.push(...plan.buy);
  const boughtOring = parts.filter((p) => p.type === 'oring').length;
  if (boughtOring) buy.push({ name: 'O-ring (wymiary w gnieździe w modelu)', qty: `${boughtOring} szt.`, note: 'Albo wydrukuj z TPU: „Dodaj o-ring do druku”.' });

  // ------------------------------------------------------------------ assembly
  const steps: string[] = [];
  const notes: Manual['notes'] = [];
  for (const { plan, label: l } of plans.values()) {
    steps.push(...(plans.size > 1 ? plan.steps.map((s) => `${l}: ${s}`) : plan.steps));
    notes.push(...plan.notes);
  }
  const plain = items.filter((i) => /^\d+$/.test(i.no));
  if (plain.length) {
    if (!plans.size) steps.push('Wydrukuj części z listy, ułożone tak, jak podaje kolumna „Druk”.');
    if (magnets.size) steps.push('Wklej magnesy w gniazda, zanim złożysz części: wtedy łatwo sprawdzić, czy pary się przyciągają.');
    if (parts.some((p) => p.type === 'oringPart' || p.type === 'gasket')) steps.push('Załóż o-ringi i uszczelki w rowki.');
    if (fits.size) steps.push('Złóż części według listy „Co do czego pasuje”.');
  }

  const grams = items.reduce((a, i) => a + i.grams * i.qty, 0);
  const vol = items.reduce((a, i) => a + ((i.grams / (DENSITY[i.material] ?? 1.25)) * 1000 * i.qty), 0);
  const titles = [...plans.values()].map((p) => p.label);
  return {
    title: titles.length ? titles.join(' + ') : 'Projekt',
    items,
    buy,
    fits: [...fits],
    steps,
    notes,
    grams,
    hours: vol / FLOW / 3600,
    pieces: items.reduce((a, i) => a + i.qty, 0),
  };
}

/** How many prints of the whole list, as words. */
export const piecesText = (n: number) => plural(n, 'wydruk', 'wydruki', 'wydruków');

// ------------------------------------------------------------------ pictures

let renderer: THREE.WebGLRenderer | null = null;
function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setClearColor(0xffffff, 1);
  }
  return renderer;
}

/** Picture of some meshes on white, seen from the front-right, as a data URL. */
export function snapshot(objects: THREE.Object3D[], w: number, h: number, dir = new THREE.Vector3(1, -1.3, 0.9)) {
  const rr = getRenderer();
  rr.setSize(w, h, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, -2, 5);
  scene.add(sun);
  const back = new THREE.DirectionalLight(0xffffff, 0.5);
  back.position.set(-3, 4, 2);
  scene.add(back);
  objects.forEach((o) => scene.add(o));
  const box = new THREE.Box3();
  objects.forEach((o) => box.expandByObject(o));
  const c = box.getCenter(new THREE.Vector3());
  const rad = Math.max(1, box.getBoundingSphere(new THREE.Sphere()).radius) * 1.08;
  const a = w / h;
  const cam = new THREE.OrthographicCamera(-rad * a, rad * a, rad, -rad, rad * 0.01, rad * 20);
  cam.up.set(0, 0, 1);
  cam.position.copy(c).add(dir.clone().normalize().multiplyScalar(rad * 5));
  cam.lookAt(c);
  cam.updateProjectionMatrix();
  rr.render(scene, cam);
  return rr.domElement.toDataURL('image/png');
}

const mats = new Map<string, THREE.Material>();
const matOf = (color: string) => {
  let m = mats.get(color);
  if (!m) mats.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 })));
  return m;
};
const edgeMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.35 });

export function itemPicture(it: ManualItem) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(it.geometry, matOf(it.color)));
  const e = new THREE.EdgesGeometry(it.geometry, 35);
  g.add(new THREE.LineSegments(e, edgeMat));
  // Tall thin parts (pipes) look better seen from lower down.
  const tall = it.size[2] > 2.5 * Math.max(it.size[0], it.size[1]);
  const url = snapshot([g], 300, 225, tall ? new THREE.Vector3(1.2, -1, 0.45) : undefined);
  e.dispose();
  return url;
}

/** The whole model as it stands, every solid in its own colour. */
export function modelPicture(parts: Part[], w = 900, h = 560) {
  const objs = parts
    .filter((p) => !p.hole && !p.hidden && DEFS[p.type])
    .map((p) => {
      const m = new THREE.Mesh(built(p).geometry, matOf(p.color));
      m.applyMatrix4(partMatrix(p.position, p.rotation));
      return m;
    });
  if (!objs.length) return '';
  return snapshot(objs, w, h, new THREE.Vector3(1.25, -1, 0.6));
}
