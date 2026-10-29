import type { Manifold } from 'manifold-3d';
import type { ParamDef, Params } from './def';
import { FITS, externalThread, internalThreadCut, threadGap, type ThreadSpec } from './threads';
import { cyl, knurled, num, select } from './util';

/**
 * Round box with a screw-on cap (like a jar). The top of the box wall is a threaded neck, set in
 * so the cap's outside is flush with the box. A flat gasket (TPU) sits in the cap and is pressed
 * onto the neck's rim when the cap is screwed down.
 */
export const isJar = (p: Params) => p.shape === 'round' && !!p.screw;

/** Thread depth of a 60° thread as a fraction of the pitch. */
const DEPTH = 0.6134;
/** How much the gasket is squeezed when the cap is screwed down fully. */
export const GASKET_SQUEEZE = 0.3;

/** Neck and cap sizes from the box's width, wall, pitch and thread length. */
export function jarDims(p: Params) {
  const W = num(p, 'W'), t = num(p, 'T'), P = num(p, 'P') || 3, L = num(p, 'threadL') || 8;
  const capWall = Math.max(1.6, t);
  const h = DEPTH * P;
  // Cap's thread root (neck crest + play) leaves the cap wall at its thinnest.
  const dN = W - 2 * (capWall + 0.4);
  const root = dN / 2 - h;
  // The neck is thickened inwards when the box wall is thinner than the thread needs.
  const riN = Math.min(W / 2 - t, root - 1.6);
  const spec: ThreadSpec = { d: dN, p: P, angle: 60, af: 0, label: 'pudełko' };
  return { W, t, P, L, h, dN, root, riN, spec };
}

/** Gasket that fits in the cap past its thread and covers the neck's rim. */
export function gasketDims(p: Params) {
  const d = jarDims(p);
  return { OD: Math.round((d.dN - 2 * d.h + 0.4) * 10) / 10, ID: Math.round(2 * d.riN * 10) / 10 };
}

export const jarParams = (shown: (p: Params) => boolean): ParamDef[] => [
  { key: 'screw', label: 'Gwint pod zakręcaną pokrywkę', type: 'bool', def: false, show: (p) => p.shape === 'round' && shown(p), hint: 'Górna część ścianki staje się gwintowaną szyjką, a pokrywka jest zakręcana (z uszczelką).' },
  { key: 'P', label: 'Skok gwintu', type: 'number', def: 3, min: 1.5, max: 6, step: 0.5, unit: 'mm', show: (p) => isJar(p) && shown(p), hint: '3 mm zakręca się szybko i dobrze się drukuje. Mniejszy skok trzyma mocniej, ale wymaga dokładniejszego druku.' },
  { key: 'threadL', label: 'Długość gwintu', type: 'number', def: 8, min: 4, max: 40, step: 0.5, unit: 'mm', show: (p) => isJar(p) && shown(p) },
  { ...select('fit', 'Dopasowanie gwintu', 'normal', Object.entries(FITS).map(([k, v]) => [k, v.label] as [string, string])), show: (p) => isJar(p) && shown(p) },
];

/** The box: body, a shoulder, then the threaded neck; inside, a 45° step where the neck is thicker. */
export function jarBox(p: Params): Manifold {
  const d = jarDims(p);
  const H = num(p, 'H'), b = num(p, 'B');
  const Hn = Math.min(d.L, H - b - 1);
  const ri = d.W / 2 - d.t;
  let m = cyl(H - Hn, d.W / 2).add(externalThread(d.spec, Hn, threadGap(p, 'out'), true, false).translate([0, 0, H - Hn]));
  const step = Math.max(0, ri - d.riN);
  const z1 = Math.max(b, H - Hn - step);
  const inside = cyl(z1 - b + 0.01, ri)
    .translate([0, 0, b])
    .add(cyl(step + 0.01, ri, d.riN).translate([0, 0, z1]))
    .add(cyl(H + 2, d.riN).translate([0, 0, b]));
  m = m.subtract(inside);
  return m;
}

/** The cap, printed top down: top plate, a recess for the gasket, then the internal thread. */
export function jarCap(p: Params): Manifold {
  const d = jarDims({ ...p, T: p.wall });
  const t = num(p, 'T'), g = num(p, 'gasketT') || 0;
  const rec = Math.max(0, g - GASKET_SQUEEZE);
  const H = t + rec + d.L;
  const outer = p.grip === false ? cyl(H, d.W / 2) : knurled(d.W, H);
  const grow = 0.4;
  let m = outer.subtract(cyl(rec + 0.02, d.dN / 2 - d.h + grow + 0.2).translate([0, 0, t]));
  m = m.subtract(internalThreadCut(d.spec, d.L, threadGap(p, 'in'), true, false).translate([0, 0, t + rec]));
  return m;
}

/** Flat ring gasket (print in TPU, or cut from rubber sheet). */
export function gasket(p: Params): Manifold {
  return cyl(num(p, 'T'), num(p, 'OD') / 2).subtract(cyl(num(p, 'T') + 2, num(p, 'ID') / 2).translate([0, 0, -1]));
}
