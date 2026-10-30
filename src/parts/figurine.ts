import type { Manifold } from 'manifold-3d';
import { M as W } from '../geom/manifold';
import { GR, M, ORDER, buildModel, defaults, finalize } from '../figurines/core.js';
import type { ParamDef, Params, PartDef } from './def';
import { select } from './util';

export const FIG_ORDER = ORDER;
export const FIG_MODELS = M;

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

export function figurineParams(id: string, quality = 'normal'): Params {
  return { model: id, quality, piece: 0, ...defaults(id) };
}

function paramsFor(p: Params): ParamDef[] {
  const id = String(p.model);
  const model = M[id] ?? M[ORDER[0]];
  const out: ParamDef[] = [
    select('model', 'Model', id, ORDER.map((k) => [k, M[k].n])),
    select('quality', 'Dokładność siatki', 'normal', [
      ['draft', 'Szkic (szybko)'],
      ['normal', 'Normalna'],
      ['fine', 'Dokładna (wolniej)'],
    ]),
  ];
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
  const k = M[id]?.tune;
  if (!k) return null;
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
  normalize: (prev, next) => (prev.model !== next.model ? { ...figurineParams(String(next.model), String(next.quality)), piece: next.piece } : next),
  build: (p) => {
    const r = figurine(p);
    const piece = r.pieces[Math.round(Number(p.piece))] ?? r.pieces[0];
    // Hand out a copy: the cached figurine owns its solids.
    return piece.manifold.translate([0, 0, 0]);
  },
};
