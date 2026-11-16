import type { Manifold } from 'manifold-3d';
import { M as W } from '../geom/manifold';
import { GR, M, ORDER, buildModel, defaults, finalize } from '../figurines/core.js';
import { SW_GR, SW_MODELS, SW_ORDER, buildSwieta, fixTopper, type SwItem, type SwNote } from '../figurines/swieta';
import type { ParamDef, Params, PartDef } from './def';
import { select } from './util';

/** Żebrowana kolekcja (silnik z artefaktu). */
export const FIG_ORDER = ORDER;
/** Świąteczne dodatki w Figurkach: etykieta „Dla”, czubek choinkowy, foremka (src/figurines/swieta.ts). */
export const XMAS_ORDER = SW_ORDER;
export const FIG_MODELS: Record<string, { n: string; desc: string; tune?: string }> = { ...M, ...SW_MODELS };
const ALL_ORDER = [...ORDER, ...SW_ORDER];
const isXmas = (id: string) => id in SW_MODELS;

const QUALITY: Record<string, number> = { draft: 0.8, normal: 0.6, fine: 0.45 };

/** Slider values as the figurine engine expects them (numbers, booleans as 0/1). */
function engineParams(p: Params): Record<string, number> {
  const id = String(p.model);
  const out: Record<string, number> = defaults(id);
  for (const k of Object.keys(out)) if (k in p) out[k] = typeof p[k] === 'boolean' ? (p[k] ? 1 : 0) : Number(p[k]);
  out.explode = 0;
  return out;
}

export interface FigResult {
  pieces: { name: string; manifold: Manifold }[];
  size: { w: number; h: number; d: number };
  /** Podpowiedzi pod suwakami (wymiary, masa, druk), tylko modele świąteczne. */
  notes?: SwNote[];
}

const cache = new Map<string, FigResult>();

function toManifold(mesh: { p: number[]; i: number[] }): Manifold {
  const p = mesh.p;
  const v = new Float32Array(p.length);
  // Engine pages are Y-up with the front at +Z; the editor is Z-up with the front at -Y.
  for (let k = 0; k < p.length; k += 3) {
    v[k] = p[k];
    v[k + 1] = -p[k + 2];
    v[k + 2] = p[k + 1];
  }
  const m = new (W().Mesh)({ numProp: 3, vertProperties: v, triVerts: new Uint32Array(mesh.i) });
  m.merge();
  return new (W().Manifold)(m);
}

/** Whole figurine (all printed pieces) for the given sliders, cached. */
export function figurine(p: Params): FigResult {
  const id = String(p.model);
  if (isXmas(id)) return xmas(id, p);
  const P = engineParams(p);
  const vox0 = QUALITY[String(p.quality)] ?? 0.6;
  const key = id + JSON.stringify(P) + vox0;
  let r = cache.get(key);
  if (r) return r;
  let lastErr: unknown;
  // Rarely a voxel size gives a mesh with a pinhole; a slightly finer grid fixes it.
  for (const vox of [vox0, vox0 * 0.93, vox0 * 0.85]) {
    try {
      const res = buildModel(id, P, { vox });
      const size = finalize(res.parts);
      r = { pieces: res.parts.map((q) => ({ name: q.name, manifold: toManifold(q.m) })), size: { w: size.w, h: size.h, d: size.d } };
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!r) throw lastErr;
  cache.set(key, r);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return r;
}

/** Świąteczne modele nie używają siatki z pól odległości: bryły liczy Manifold (swieta.ts), a pamięć podręczna bierze tylko ich własne suwaki. */
function xmas(id: string, p: Params): FigResult {
  const def = SW_MODELS[id];
  const quality = def.quality ? String(p.quality) : 'normal';
  const key = id + quality + JSON.stringify(Object.keys(def.d).map((k) => p[k] ?? def.d[k]));
  let r = cache.get(key);
  if (r) return r;
  r = buildSwieta(id, p, quality);
  cache.set(key, r);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return r;
}

export function figurineParams(id: string, quality = 'normal'): Params {
  return { model: id, quality, piece: 0, ...(isXmas(id) ? SW_MODELS[id].d : defaults(id)) };
}

function xmasFields(id: string, p: Params): ParamDef[] {
  const model = SW_MODELS[id];
  const out: ParamDef[] = [];
  for (const g of model.g) {
    const gr = SW_GR[g];
    gr.items.forEach((it: SwItem, i) => {
      const group = i === 0 ? gr.t : undefined;
      if (it.type === 'text') out.push({ key: it.k, label: it.l, type: 'text', def: String(model.d[it.k]), max: it.len, hint: it.hint, group });
      else if (it.type === 'select') out.push({ key: it.k, label: it.l, type: 'select', def: String(model.d[it.k]), options: (it.options ?? []).map(([value, label]) => ({ value, label })), hint: it.hint, group });
      else out.push({ key: it.k, label: it.l, type: 'number', def: Number(model.d[it.k]), min: it.min ?? 0, max: it.max ?? 1000, step: it.step ?? 1, unit: it.unit, hint: it.hint, group });
    });
  }
  if (id === 'czubek') {
    // Kula i wysokość nie mogą być mniejsze, niż pozwala tuleja o danej średnicy: dolne granice suwaków liczą się na bieżąco.
    const fx = fixTopper({ top: Number(p.top ?? model.d.top), sleeve: Number(p.sleeve ?? model.d.sleeve), bulb: Number(p.bulb ?? model.d.bulb), h: Number(p.h ?? model.d.h) });
    for (const f of out) {
      if (f.type !== 'number') continue;
      if (f.key === 'bulb') f.min = fx.bulbMin;
      if (f.key === 'h') {
        f.min = fx.hMin;
        f.max = Math.max(f.max, fx.hMin);
      }
    }
  }
  return out;
}

function paramsFor(p: Params): ParamDef[] {
  const id = String(p.model);
  const sw = SW_MODELS[id];
  const model = M[id] ?? M[ORDER[0]];
  const out: ParamDef[] = [select('model', 'Model', id, ALL_ORDER.map((k) => [k, FIG_MODELS[k].n]))];
  if (!sw || sw.quality)
    out.push(
      select('quality', 'Dokładność siatki', 'normal', sw ? [['draft', 'Szkic (szybko)'], ['normal', 'Normalna']] : [['draft', 'Szkic (szybko)'], ['normal', 'Normalna'], ['fine', 'Dokładna (wolniej)']]),
    );
  if (sw) return [...out, ...xmasFields(id, p)];
  for (const g of model.g) {
    const gr = GR[g];
    if (!gr) continue;
    gr.items.forEach((it, i) => {
      if (it.k === 'explode') return;
      const group = i === 0 ? gr.t : undefined;
      if (it.type === 'bool') out.push({ key: it.k, label: it.l, type: 'bool', def: Boolean(model.d[it.k]), group });
      else
        out.push({
          key: it.k,
          label: it.l,
          type: 'number',
          def: model.d[it.k] ?? 0,
          min: it.min ?? 0,
          max: it.max ?? 1000,
          step: it.step ?? 0.1,
          unit: it.f === 'mm' ? 'mm' : it.f === 'deg' ? '°' : undefined,
          hint: it.f === 'pct' ? '1 = 100%' : undefined,
          group,
        });
    });
  }
  return out;
}

/** Adjusts the model's "tune" slider so the whole figurine is `target` mm tall. */
export function fitHeight(p: Params, target: number): { params: Params; height: number } | null {
  const id = String(p.model);
  const k = FIG_MODELS[id]?.tune;
  if (!k) return null;
  if (isXmas(id)) {
    // Czubek: suwak wysokości jest wysokością całości, w granicach, które pozwala tuleja i kula.
    const item = paramsFor(p).find((d) => d.key === k);
    const lo = item && item.type === 'number' ? item.min : 0, hi = item && item.type === 'number' ? item.max : 500;
    const q = { ...p, [k]: Math.min(hi, Math.max(lo, Math.round(target))) };
    return { params: q, height: figurine(q).size.h };
  }
  const item = paramsFor(p).find((d) => d.key === k);
  const lo = item && item.type === 'number' ? item.min : 0, hi = item && item.type === 'number' ? item.max : 500;
  const heightOf = (q: Params) => {
    const res = buildModel(id, engineParams(q), { vox: 1, lo: true });
    return finalize(res.parts).h;
  };
  let cur = { ...p };
  let a = Number(cur[k]);
  for (let it = 0; it < 4; it++) {
    const ha = heightOf(cur);
    if (Math.abs(ha - target) < 0.5) break;
    const hb = heightOf({ ...cur, [k]: a + 3 });
    const slope = (hb - ha) / 3;
    if (slope < 0.05) return null;
    a = Math.min(hi, Math.max(lo, a + (target - ha) / slope));
    a = Math.round(a * 2) / 2;
    cur = { ...cur, [k]: a };
  }
  return { params: cur, height: heightOf(cur) };
}

export const FIGURINE_DEF: PartDef = {
  type: 'figurine',
  label: 'Figurka',
  category: 'figurines',
  hole: false,
  hidden: true,
  description: 'Figurka z żebrowanej kolekcji. Suwaki zmieniają wszystkie jej części naraz.',
  params: [],
  paramsFor,
  normalize: (prev, next) => {
    if (prev.model !== next.model) return { ...figurineParams(String(next.model), String(next.quality)), piece: next.piece };
    if (next.model === 'czubek') {
      const fx = fixTopper({ top: Number(next.top), sleeve: Number(next.sleeve), bulb: Number(next.bulb), h: Number(next.h) });
      return { ...next, bulb: fx.bulb, h: fx.h };
    }
    return next;
  },
  notes: (p) => {
    if (!isXmas(String(p.model))) return [];
    try {
      return figurine(p).notes ?? [];
    } catch (e) {
      return [{ level: 'error', text: e instanceof Error ? e.message : 'Nie udało się zbudować modelu.' }];
    }
  },
  build: (p) => {
    const r = figurine(p);
    const piece = r.pieces[Math.round(Number(p.piece))] ?? r.pieces[0];
    // Hand out a copy: the cached figurine owns its solids.
    return piece.manifold.translate([0, 0, 0]);
  },
};
