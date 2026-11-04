/**
 * „Lite”: a small bundle for a shop page (sezonowe3d.pl). It offers a handful of the library's models with only their
 * basic sizes, shows a 3D preview with those sizes written next to the right edge, estimates grams and print time,
 * and saves the print-ready 3MF. Built by `npm run build:lite` into dist-lite/model3d.js (one file, WASM inside),
 * which sets `window.Model3D`.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Manifold } from 'manifold-3d';
import { DEFS, defaultParams, type Params } from '../catalog';
import { M, initManifold, toGeometry } from '../geom/manifold';
import { bestPose, keepsPose, turnManifold } from '../geom/orient';
import { export3MF, exportSTL } from '../export';
import { cyl } from '../parts/util';
import { TEXTURE_LABELS, applyTexture } from '../geom/texture';
import type { Texture, TextureFace } from '../types';

export type Value = number | string | boolean;
export type Values = Record<string, Value>;

/** One size the client may set. `axis` is the edge of the model's box the size is written along. */
export interface Dim {
  key: string;
  label: string;
  type: 'number' | 'select' | 'bool' | 'text';
  def: Value;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
  max_len?: number;
  options?: { value: string; label: string }[];
  axis?: 'x' | 'y' | 'z';
  /** Along X: at the top of the model instead of its foot. */
  top?: boolean;
  /** Along X: a line this long, centred, instead of the model's whole width (the foot of a tapered pot). */
  span?: (v: Values) => number;
  show?: (v: Values) => boolean;
}

export interface LiteModel {
  id: string;
  label: string;
  desc: string;
  /** What the client gets: pieces in the box. */
  pieces: string;
  dims: Dim[];
  /** Short text with the chosen sizes, for the cart and the order. */
  summary: (v: Values) => string;
  /** A second filament for the raised part (the letters): its label in the shop. */
  accent?: string;
}

interface Impl extends LiteModel {
  /** Solid as printed (pieces laid out side by side). */
  build: (v: Values) => Manifold;
  /** Solid as used, for the preview (defaults to `build`). */
  preview?: (v: Values) => Manifold;
  /** Keeps linked sizes printable (e.g. as many hooks as fit the bed at the chosen spacing). */
  fit?: (v: Values) => Values;
  /** Turn of the preview about X, in degrees: 90 stands a flat-printed wall part up, as on the wall. */
  standUp?: boolean;
  /** With `accent`: height (as built, lying flat) above which the solid takes the second filament. */
  accentZ?: (v: Values) => number;
}

const num = (v: Values, k: string) => Number(v[k]);
const mm = (x: number) => `${Math.round(x * 10) / 10}`.replace('.', ',');
/** Builds a library part with its own defaults, the shop's fixed choices and the client's sizes. */
const part = (type: string, fixed: Params = {}) => (v: Values) => DEFS[type].build({ ...defaultParams(DEFS[type]), ...fixed, ...v } as Params);

const mount: Dim = { key: 'screwS', label: 'Mocowanie', type: 'select', def: 'screw', options: [{ value: 'screw', label: 'Na wkręty' }, { value: 'tape', label: 'Na taśmę dwustronną' }] };
const mountTxt = (v: Values) => (v.screwS === 'tape' ? 'na taśmę' : 'na wkręty');

/** Surface pattern, the editor's own (raised 0.8 mm, 3 mm apart, 3 mm plain border). */
const tex: Dim = { key: 'tex', label: 'Faktura', type: 'select', def: 'none', options: [{ value: 'none', label: 'Gładka' }, ...Object.entries(TEXTURE_LABELS).map(([value, label]) => ({ value, label: label.replace(/ \(.*\)$/, '') }))] };
const texTxt = (v: Values) => (v.tex && v.tex !== 'none' ? `, faktura: ${TEXTURE_LABELS[v.tex as Texture['pattern']].replace(/ \(.*\)$/, '').toLowerCase()}` : '');
function textured(m: Manifold, v: Values, face: TextureFace): Manifold {
  if (!v.tex || v.tex === 'none') return m;
  const t: Texture = { pattern: v.tex as Texture['pattern'], face, mode: 'add', depth: 0.8, spacing: 3, angle: 0, margin: 3 };
  const out = applyTexture(m, t);
  if (out !== m) m.delete();
  return out;
}
/**
 * A wall part whose plate front takes the pattern. As printed the plate lies on the bed (thickness T from the
 * bottom) with the arm standing on it: the plate alone gets the texture, the relief stays off the arm's footprint.
 */
const plate = (type: string) => (v: Values) => {
  const m = part(type)(v);
  if (!v.tex || v.tex === 'none') return m;
  const T = Number(defaultParams(DEFS[type]).T) || 4;
  const top = m.boundingBox().min[2] + T;
  const slab = m.trimByPlane([0, 0, -1], -top);
  const tex = textured(slab.translate([0, 0, 0]), v, 'top');
  const arm = m.slice(top + 0.05).offset(0.6, 'Round').extrude(20).translate([0, 0, top - 1]);
  const relief = tex.subtract(slab).subtract(arm);
  const out = m.add(relief);
  [m, slab, tex, arm, relief].forEach((x) => x.delete());
  return out;
};

// ------------------------------------------------------------------------- flower pot with a saucer
let potCache: { key: string; m: Manifold } | null = null;
function pot(v: Values): Manifold {
  const W = num(v, 'W'), Wb = num(v, 'Wb'), H = num(v, 'H');
  const key = `${W}/${Wb}/${H}/${v.tex}`;
  if (potCache?.key === key) return potCache.m.translate([0, 0, 0]);
  // Built straight at the bottom diameter (texture and all), then the wall is leaned out (or in) to the top one.
  const box = DEFS.box;
  const base = { ...defaultParams(box), shape: 'round', W: Wb, D: Wb, H, T: 2, B: 2.4, nx: 1, ny: 1, rad: 0, divMode: 'grid', div: '' } as Params;
  let m = box.build(base);
  // Drain holes: one in the middle and three on a ring.
  const ring = Wb * 0.25;
  const holes = [[0, 0], ...[0, 1, 2].map((i) => [ring * Math.cos((i * 2 * Math.PI) / 3), ring * Math.sin((i * 2 * Math.PI) / 3)])];
  for (const [x, y] of holes) {
    const h = cyl(10, 4).translate([x, y, -5]);
    const c = m.subtract(h);
    m.delete();
    h.delete();
    m = c;
  }
  m = textured(m, v, 'around');
  if (W !== Wb) {
    // Each point moves outward by (top − bottom radius) × its height share: the wall and the relief keep their
    // thickness. The floor's middle stays put; the ramp between keeps the mapping continuous.
    const Rb = Wb / 2, lean = (W - Wb) / 2;
    const warped = m.warp((p) => {
      const r = Math.hypot(p[0], p[1]);
      if (r < 1e-6) return;
      const k = Math.min(1, Math.max(0, (r - (Rb - 6)) / 3));
      const d = (lean * Math.max(0, p[2]) * k) / H;
      p[0] += (p[0] / r) * d;
      p[1] += (p[1] / r) * d;
    });
    m.delete();
    m = warped;
  }
  // A textured wall takes seconds: the preview and the estimate reuse the last one.
  if (v.tex && v.tex !== 'none') {
    potCache?.m.delete();
    potCache = { key, m };
    return m.translate([0, 0, 0]);
  }
  return m;
}
function saucer(v: Values): Manifold {
  const W = num(v, 'Wb') + 12;
  const box = DEFS.box;
  let m = box.build({ ...defaultParams(box), shape: 'round', W, D: W, H: 16, T: 2, B: 2, nx: 1, ny: 1, rad: 0, divMode: 'grid', div: '' } as Params);
  // Three low ribs: the pot stands on them, not in the water.
  for (let i = 0; i < 3; i++) {
    const r = M().Manifold.cube([W * 0.32, 3, 2.5]).translate([W * 0.1, -1.5, 1.9]).rotate([0, 0, 90 + i * 120]);
    const u = m.add(r);
    m.delete();
    r.delete();
    m = u;
  }
  return m;
}
const POT: Impl = {
  id: 'pot',
  label: 'Doniczka z podstawką',
  desc: 'Okrągła doniczka z otworami odpływowymi i podstawka z żeberkami, żeby doniczka nie stała w wodzie.',
  pieces: 'doniczka + podstawka',
  dims: [
    { key: 'W', label: 'Średnica u góry', type: 'number', def: 120, min: 60, max: 200, step: 5, unit: 'mm', axis: 'x', top: true },
    { key: 'Wb', label: 'Średnica na dole', type: 'number', def: 95, min: 50, max: 200, step: 5, unit: 'mm', axis: 'x', span: (v) => num(v, 'Wb'), hint: 'Taka sama jak u góry = prosta ścianka. Ścianka może się pochylać najwyżej o 35°, żeby drukowała się bez podpór.' },
    { key: 'H', label: 'Wysokość', type: 'number', def: 100, min: 50, max: 200, step: 5, unit: 'mm', axis: 'z' },
    { key: 'saucer', label: 'Z podstawką', type: 'bool', def: true },
    // Knurl around a pot takes too long to build in a browser.
    { ...tex, options: tex.options!.filter((o) => o.value !== 'knurl') },
  ],
  summary: (v) => `Ø${mm(num(v, 'W'))}${num(v, 'Wb') !== num(v, 'W') ? `/${mm(num(v, 'Wb'))}` : ''} × ${mm(num(v, 'H'))} mm${v.saucer ? ', z podstawką' : ''}${texTxt(v)}`,
  build: (v) => {
    const p = pot(v);
    if (!v.saucer) return p;
    const s = saucer(v);
    const out = M().Manifold.compose([p, s.translate([(num(v, 'W') + num(v, 'Wb') + 12) / 2 + 10, 0, 0])]);
    p.delete();
    s.delete();
    return out;
  },
  // The wall leans at most 35° (prints without support, wide enough to stand): the bottom follows the top.
  fit: (v) => {
    const most = 2 * num(v, 'H') * Math.tan((35 * Math.PI) / 180);
    const W = num(v, 'W'), Wb = num(v, 'Wb');
    const lo = W - most, hi = W + most;
    if (Wb >= lo && Wb <= hi) return v;
    return { ...v, Wb: Math.max(50, Math.round(Math.min(hi, Math.max(lo, Wb)) / 5) * 5) };
  },
  preview: (v) => {
    const p = pot(v);
    if (!v.saucer) return p;
    const s = saucer(v);
    const out = M().Manifold.compose([s, p.translate([0, 0, 4.4])]);
    p.delete();
    s.delete();
    return out;
  },
};

const MODELS: Impl[] = [
  {
    id: 'wallHook',
    label: 'Haczyk ścienny',
    desc: 'Na ręcznik, kurtkę albo torbę: płytka do ściany i ramię z końcówką w górę.',
    pieces: '1 haczyk',
    dims: [
      { key: 'D', label: 'Wysięg', type: 'number', def: 30, min: 15, max: 80, step: 1, unit: 'mm', axis: 'y', hint: 'Na ręcznik 30, na kurtkę 40–50.' },
      { key: 'hookW', label: 'Szerokość', type: 'number', def: 16, min: 8, max: 40, step: 1, unit: 'mm', axis: 'x' },
      { key: 'H', label: 'Wysokość płytki', type: 'number', def: 50, min: 30, max: 100, step: 1, unit: 'mm', axis: 'z' },
      mount,
      tex,
    ],
    summary: (v) => `wysięg ${mm(num(v, 'D'))}, szer. ${mm(num(v, 'hookW'))}, wys. ${mm(num(v, 'H'))} mm, ${mountTxt(v)}${texTxt(v)}`,
    build: plate('wallHook'),
    standUp: true,
  },
  {
    id: 'hookRail',
    label: 'Listwa z haczykami',
    desc: 'Na klucze, smycze albo ścierki. Liczba haczyków i odstęp ustalają długość listwy.',
    pieces: '1 listwa',
    dims: [
      { key: 'N', label: 'Liczba haczyków', type: 'number', def: 5, min: 2, max: 10, step: 1, unit: 'szt.', hint: 'Listwa ma najwyżej 24 cm, żeby zmieściła się w drukarce: przy dużym odstępie liczba haczyków sama się zmniejszy.' },
      { key: 'gap', label: 'Odstęp haczyków', type: 'number', def: 22, min: 10, max: 60, step: 1, unit: 'mm' },
      { key: 'D', label: 'Wysięg', type: 'number', def: 22, min: 12, max: 50, step: 1, unit: 'mm', axis: 'y' },
      mount,
      tex,
    ],
    summary: (v) => `${num(v, 'N')} haczyków co ${mm(num(v, 'gap'))} mm, wysięg ${mm(num(v, 'D'))} mm, ${mountTxt(v)}${texTxt(v)}`,
    build: plate('hookRail'),
    // Rail length = N hooks (8 mm) + gaps + ends; at most as many hooks as fit the bed at this spacing.
    fit: (v) => {
      const gap = num(v, 'gap'), w = Number(defaultParams(DEFS.hookRail).hookW) || 8;
      const most = Math.max(2, Math.floor((BED - 2 * Math.max(12, gap / 2) + gap) / (w + gap)));
      return num(v, 'N') > most ? { ...v, N: most } : v;
    },
    standUp: true,
  },
  {
    id: 'shelfHook',
    label: 'Haczyk pod półkę',
    desc: 'Wsuwany na brzeg półki, bez wiercenia: kubki, ścierki i kable wiszą pod spodem.',
    pieces: '1 haczyk',
    dims: [
      { key: 'shelf', label: 'Grubość półki', type: 'number', def: 18, min: 8, max: 36, step: 0.5, unit: 'mm', axis: 'z', hint: 'Zmierz półkę; haczyk ma 0,4 mm luzu.' },
      { key: 'A', label: 'Głębokość wsunięcia', type: 'number', def: 40, min: 20, max: 80, step: 1, unit: 'mm', axis: 'x' },
      { key: 'drop', label: 'Opuszczenie haczyka', type: 'number', def: 25, min: 10, max: 60, step: 1, unit: 'mm' },
    ],
    summary: (v) => `półka ${mm(num(v, 'shelf'))} mm, wsunięcie ${mm(num(v, 'A'))}, opuszczenie ${mm(num(v, 'drop'))} mm`,
    build: part('shelfHook'),
    standUp: true,
  },
  {
    id: 'toiletPaperHolder',
    label: 'Uchwyt na papier toaletowy',
    desc: 'Ramię z końcówką w górę, opcjonalnie z półeczką na telefon nad rolką.',
    pieces: '1 uchwyt',
    dims: [
      { key: 'D', label: 'Długość ramienia', type: 'number', def: 115, min: 95, max: 150, step: 1, unit: 'mm', axis: 'y', hint: 'Rolka ma ok. 100 mm szerokości.' },
      { key: 'shelf', label: 'Półeczka na telefon', type: 'bool', def: false },
      mount,
      tex,
    ],
    summary: (v) => `ramię ${mm(num(v, 'D'))} mm${v.shelf ? ', z półeczką' : ''}, ${mountTxt(v)}${texTxt(v)}`,
    build: plate('toiletPaperHolder'),
    standUp: true,
  },
  {
    id: 'paperTowelHolder',
    label: 'Uchwyt na ręcznik papierowy',
    desc: 'Dwa wsporniki i drążek. Na ścianę, pod szafkę albo nasuwany na półkę jak litera U.',
    pieces: '2 wsporniki + drążek z 2 części',
    dims: [
      { key: 'mode', label: 'Montaż', type: 'select', def: 'wall', options: [{ value: 'wall', label: 'Na ścianę' }, { value: 'under', label: 'Pod szafkę' }, { value: 'shelf', label: 'Na półkę (U)' }] },
      { key: 'st', label: 'Grubość półki', type: 'number', def: 18, min: 8, max: 36, step: 0.5, unit: 'mm', show: (v) => v.mode === 'shelf', hint: 'Zmierz półkę; trzyma się na wcisk.' },
      { key: 'RW', label: 'Szerokość rolki', type: 'number', def: 230, min: 200, max: 300, step: 5, unit: 'mm' },
    ],
    summary: (v) => `${v.mode === 'shelf' ? `na półkę ${mm(num(v, 'st'))} mm` : v.mode === 'under' ? 'pod szafkę' : 'na ścianę'}, rolka ${mm(num(v, 'RW'))} mm`,
    build: part('paperTowelHolder'),
  },
  POT,
  {
    id: 'keyShelf',
    label: 'Wieszak na klucze z półką',
    desc: 'Haczyki na klucze, a nad nimi półeczka z rantem na portfel, telefon albo listy.',
    pieces: '1 wieszak',
    dims: [
      { key: 'N', label: 'Liczba haczyków', type: 'number', def: 4, min: 2, max: 8, step: 1, unit: 'szt.' },
      { key: 'L', label: 'Szerokość', type: 'number', def: 160, min: 100, max: 240, step: 5, unit: 'mm', axis: 'x' },
      { key: 'Ds', label: 'Głębokość półki', type: 'number', def: 40, min: 20, max: 80, step: 1, unit: 'mm', axis: 'y' },
      mount,
      tex,
    ],
    summary: (v) => `${num(v, 'N')} haczyki, szer. ${mm(num(v, 'L'))} mm, półka ${mm(num(v, 'Ds'))} mm, ${mountTxt(v)}${texTxt(v)}`,
    build: plate('keyShelf'),
    standUp: true,
  },
  {
    id: 'plantLabel',
    label: 'Tabliczka do roślin',
    desc: 'Wbijana tabliczka z wypukłym napisem, np. nazwą zioła albo imieniem.',
    pieces: '1 tabliczka',
    dims: [
      { key: 'text', label: 'Napis', type: 'text', def: 'Bazylia', max_len: 16 },
      { key: 'W', label: 'Szerokość tabliczki', type: 'number', def: 60, min: 40, max: 120, step: 5, unit: 'mm', axis: 'x' },
      { key: 'stake', label: 'Długość szpikulca', type: 'number', def: 80, min: 40, max: 150, step: 5, unit: 'mm' },
    ],
    summary: (v) => `„${String(v.text).trim()}”, szer. ${mm(num(v, 'W'))} mm, szpikulec ${mm(num(v, 'stake'))} mm`,
    build: part('plantLabel'),
    standUp: true,
    accent: 'Kolor napisu',
    // The plate is 2 mm thick; the letters stand on it (printed flat, letters up: a filament change at 2 mm).
    accentZ: () => 2,
  },
];

const BY_ID = Object.fromEntries(MODELS.map((m) => [m.id, m]));

function model(id: string): Impl {
  const m = BY_ID[id];
  if (!m) throw new Error(`Nieznany model: ${id}`);
  return m;
}

/** The client's values, checked: missing ones take the default, numbers are clamped and snapped to the step. */
export function clean(id: string, v: Values = {}): Values {
  const out: Values = {};
  for (const d of model(id).dims) {
    const x = v[d.key];
    if (d.type === 'number') {
      let n = Number(x);
      if (!Number.isFinite(n)) n = Number(d.def);
      n = Math.min(d.max ?? n, Math.max(d.min ?? n, n));
      if (d.step) n = Math.round(n / d.step) * d.step;
      out[d.key] = Math.round(n * 100) / 100;
    } else if (d.type === 'bool') out[d.key] = x === undefined ? d.def : !!x;
    else if (d.type === 'select') out[d.key] = d.options!.some((o) => o.value === x) ? (x as string) : d.def;
    else out[d.key] = String(x ?? d.def).slice(0, d.max_len ?? 24) || String(d.def);
  }
  return model(id).fit?.(out) ?? out;
}

/** Print-ready solid: laid out for the bed, each piece turned to need the least support. */
function printSolid(id: string, v: Values): Manifold {
  let m = model(id).build(clean(id, v));
  if (id !== 'pot' && !keepsPose([{ type: id }])) {
    const pose = bestPose(m);
    if (pose) {
      const t = turnManifold(m, pose.turn);
      m.delete();
      m = t;
    }
  }
  return m;
}

/**
 * Grams and hours from the solid: two 0.4 mm walls (0.8 mm shell) are solid, the rest is 15 % infill;
 * PLA 1.24 g/cm³; time from about 22 g an hour on a P1S plus warm-up.
 */
export function estimate(id: string, v: Values) {
  const m = printSolid(id, v);
  const bb = m.boundingBox();
  const vol = m.volume() / 1000, area = m.surfaceArea() / 100;
  const pieces = m.decompose();
  const n = pieces.length;
  // Each piece has to fit the printer (P1S: 256 mm, but Bambu Studio keeps the edges free: 240 mm).
  const longest = Math.round(Math.max(...pieces.map((p) => { const b = p.boundingBox(); return Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]); })));
  pieces.forEach((p) => p.delete());
  m.delete();
  const shell = Math.min(vol, area * 0.08);
  const grams = Math.round(1.24 * (shell + (vol - shell) * 0.15) * 10) / 10;
  const hours = Math.round((0.15 + grams / 22) * 100) / 100;
  return { grams, hours, size: [0, 1, 2].map((i) => Math.round(bb.max[i] - bb.min[i])) as [number, number, number], pieces: n, longest, fits: longest <= BED, bed: BED };
}

/** Longest piece the shop prints, mm. */
export const BED = 240;

/** The solid cut into [base, accent] at the accent height (both as built). */
function splitAccent(id: string, m: Manifold, v: Values): [Manifold, Manifold] | null {
  const z = model(id).accentZ?.(v);
  if (z === undefined) return null;
  // A hair above the plate's top face, so no film of the plate (floats a little off z) goes with the letters.
  const [above, below] = m.splitByPlane([0, 0, 1], z + 0.01);
  if (above.isEmpty()) { above.delete(); below.delete(); return null; }
  return [below, above];
}

const fileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Saves the print file: 3MF (one plate) or STL. With `colors` a two-filament model (the plant label) comes as one
 * object of two parts named with their colours, lying flat as built, so each part takes its own filament in the slicer.
 */
export function download(id: string, v: Values, name?: string, fmt: '3mf' | 'stl' = '3mf', colors?: { base: string; accent: string }) {
  const nm0 = fileName(name ?? model(id).label);
  if (fmt === '3mf' && model(id).accentZ) {
    const cv = clean(id, v);
    const whole = model(id).build(cv);
    const split = splitAccent(id, whole, cv);
    if (split) {
      const [base, acc] = split;
      const body = { body: 1, manifold: whole, geometry: new THREE.BufferGeometry(), color: '#888', parts: [
        { manifold: base, name: `${model(id).label.replace(/ .*/, '')} - ${colors?.base ?? 'kolor 1'}` },
        { manifold: acc, name: `Napis - ${colors?.accent ?? 'kolor 2'}` },
      ] };
      export3MF([body], nm0, new Map([[1, nm0]]), false, [BED, BED]);
      [whole, base, acc].forEach((x) => x.delete());
      return;
    }
  }
  const m = printSolid(id, v);
  // Each piece its own body, so the plates are filled like in the editor (a second plate when they don't fit one).
  const pieces = m.decompose();
  m.delete();
  const nm = nm0;
  const bodies = pieces.map((p, i) => ({ body: i + 1, manifold: p, geometry: new THREE.BufferGeometry(), color: '#888' }));
  const names = new Map(bodies.map((b) => [b.body, pieces.length > 1 ? `${nm} ${b.body}` : nm]));
  if (fmt === 'stl') exportSTL(bodies, nm, names);
  else export3MF(bodies, nm, names, false, [BED, BED]);
  pieces.forEach((p) => p.delete());
}

// ------------------------------------------------------------------------- preview
export interface Viewer {
  show(id: string, v: Values, color?: string, opts?: { labels?: boolean; accent?: string }): void;
  dispose(): void;
}

/** A small 3D view in `el`: the model turns with a finger or the mouse, the sizes stand along their edges. */
export function viewer(el: HTMLElement): Viewer {
  el.style.position ||= 'relative';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  el.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
  const labels = document.createElement('div');
  labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  el.appendChild(labels);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8178, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(1, -1.5, 2);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 5000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  const group = new THREE.Group();
  scene.add(group);
  let marks: { el: HTMLDivElement; at: THREE.Vector3 }[] = [];
  let first = true;

  const resize = () => {
    const w = el.clientWidth || 300, h = el.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  const clear = () => {
    for (const o of [...group.children]) {
      group.remove(o);
      const mo = o as THREE.Mesh;
      mo.geometry?.dispose();
      (mo.material as THREE.Material | undefined)?.dispose?.();
    }
    labels.innerHTML = '';
    marks = [];
  };

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
    const w = el.clientWidth, h = el.clientHeight;
    for (const mk of marks) {
      const p = mk.at.clone().project(camera);
      mk.el.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) translate(-50%, -50%)`;
      mk.el.style.display = p.z < 1 ? '' : 'none';
    }
  };
  tick();

  return {
    show(id, values, color = '#d97706', opts = {}) {
      const mdl = model(id);
      const v = clean(id, values);
      const m = (mdl.preview ?? mdl.build)(v);
      // The letters in their own colour: the same solid cut at the accent height.
      const split = opts.accent ? splitAccent(id, m, v) : null;
      const geo = toGeometry(split ? split[0] : m);
      const accGeo = split ? toGeometry(split[1]) : null;
      split?.forEach((x) => x.delete());
      m.delete();
      if (mdl.standUp) { geo.rotateX(Math.PI / 2); accGeo?.rotateX(Math.PI / 2); }
      clear();
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const c = bb.getCenter(new THREE.Vector3());
      const z0 = bb.min.z; // read before the move: translating updates `bb` in place
      geo.translate(-c.x, -c.y, -z0);
      accGeo?.translate(-c.x, -c.y, -z0);
      const box = geo.boundingBox!.clone();
      const surf = (col: string) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.05 });
      group.add(new THREE.Mesh(geo, surf(color)));
      if (accGeo) group.add(new THREE.Mesh(accGeo, surf(opts.accent!)));
      // Each size along its edge of the box: a thin line with a chip in the middle.
      const s = box.getSize(new THREE.Vector3());
      const off = Math.max(s.x, s.y, s.z) * 0.08;
      const mat = new THREE.LineBasicMaterial({ color: 0x1c1917 });
      for (const d of mdl.dims) {
        if (opts.labels === false || !d.axis || (d.show && !d.show(v))) continue;
        const a = new THREE.Vector3(box.min.x - off, box.min.y - off, box.min.z), b = a.clone();
        if (d.axis === 'x') {
          const half = d.span ? d.span(v) / 2 : null;
          a.x = half === null ? box.min.x : -half;
          b.x = half === null ? box.max.x : half;
          a.y = b.y = box.min.y - off;
          if (d.top) a.z = b.z = box.max.z;
        }
        if (d.axis === 'y') { a.y = box.min.y; b.y = box.max.y; a.x = b.x = box.max.x + off; }
        if (d.axis === 'z') { a.z = box.min.z; b.z = box.max.z; a.x = b.x = box.min.x - off; a.y = b.y = box.min.y; }
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat.clone()));
        const chip = document.createElement('div');
        chip.textContent = `${d.label}: ${mm(Number(v[d.key]))} ${d.unit ?? ''}`.trim();
        chip.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;font:600 11px/1.2 system-ui,sans-serif;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.92);color:#1c1917;border:1px solid #d6d3d1;box-shadow:0 1px 2px rgba(0,0,0,.08)';
        labels.appendChild(chip);
        marks.push({ el: chip, at: a.clone().add(b).multiplyScalar(0.5) });
      }
      // Camera: the first time from the front-left and a bit above; later the client's own view stays.
      // Far enough for the whole box (its sphere) to fit the narrower side of the view, with room for the chips.
      const fov = (camera.fov * Math.PI) / 360;
      const half = Math.min(fov, Math.atan(Math.tan(fov) * camera.aspect));
      const r = ((s.length() / 2 + off) / Math.sin(half)) * 1.08;
      controls.target.set(0, 0, s.z / 2);
      if (first) {
        camera.position.set(-r * 0.55, -r * 0.8, s.z / 2 + r * 0.55);
        first = false;
      } else {
        const dir = camera.position.clone().sub(controls.target).normalize();
        camera.position.copy(controls.target.clone().add(dir.multiplyScalar(r)));
      }
      camera.near = r / 100;
      camera.far = r * 20;
      camera.updateProjectionMatrix();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      clear();
      controls.dispose();
      renderer.dispose();
      el.innerHTML = '';
    },
  };
}

// ------------------------------------------------------------------------- public API
const ready = initManifold().then(() => undefined);
const api = {
  ready,
  /** The models on offer, without their builders. */
  models: MODELS.map(({ build: _b, preview: _p, ...m }) => m) as LiteModel[],
  model: (id: string) => model(id) as LiteModel,
  clean,
  estimate,
  download,
  viewer,
};
export type Model3D = typeof api;
(window as unknown as { Model3D: Model3D }).Model3D = api;
