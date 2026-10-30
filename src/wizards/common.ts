import { worldBox } from '../geom/parts';
import { TEXTURE_LABELS } from '../geom/texture';
import type { WallSide } from '../parts/connectors';
import type { Part, Texture, TextureFace, WizValues } from '../types';
import { PRINTERS } from './frame';
import type { WizTools } from './host';
import type { Field } from './types';

export const r1 = (v: number) => Math.round(v * 10) / 10;
export const mm = (v: number) => String(r1(v)).replace('.', ',');
export const pl = (n: number, one: string, few: string, many: string) => {
  const f = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return `${n} ${n === 1 ? one : f ? few : many}`;
};
export const tiles = (key: string, options: Extract<Field, { kind: 'tiles' }>['options'], label?: string, cols?: 2 | 3 | 4): Field => ({ kind: 'tiles', key, label, options, cols });
export const printerField: Field = tiles('printer', Object.entries(PRINTERS).map(([k, pr]) => ({ value: k, label: pr.label, desc: `${pr.bed.join(' × ')} mm` })));
export const bedOf = (v: WizValues) => (PRINTERS[String(v.printer)] ?? PRINTERS.p1s).bed;

// ------------------------------------------------------------------------------------- looks (shared)

export const texture = (pattern: string, face: TextureFace): Texture => ({ pattern: pattern as Texture['pattern'], face, mode: 'add', depth: 0.8, spacing: 3, angle: 0, margin: 3 });
export const SIDES: Record<string, string> = { front: 'Przód', back: 'Tył', left: 'Lewy bok', right: 'Prawy bok' };
export const texField = (round: boolean): Field[] => [tiles('tex', [{ value: 'none', label: 'Gładko' }, ...Object.entries(TEXTURE_LABELS).map(([k, l]) => ({ value: k, label: l }))], 'Faktura ścianki', 3)];
/** Faces picked for the texture ('front,left,lid'); older recipes hold a single face. */
export const texSides = (v: WizValues): string[] => String(v.texOn ?? '').split(',').filter(Boolean);
/** Pattern on one face: its own choice (tx_front…), or older recipes' one texture on the picked faces. */
export const faceTex = (v: WizValues, face: string): string => {
  const own = v[`tx_${face}`];
  if (own !== undefined) return String(own);
  if (!v.tex || v.tex === 'none') return 'none';
  // The cabinet had one texture, always on the drawer fronts.
  const on = v.texOn === undefined ? ['drawer'] : texSides(v);
  return on.includes(face) || (face === 'around' && on.some((f) => f !== 'lid')) ? String(v.tex) : 'none';
};
/** One row per face, each with its own pattern. */
export const faceTexFields = (v: WizValues, faces: [string, string][], head = 'Faktura: każda ścianka osobno'): Field[] =>
  faces.map(([face, label], i) => ({
    kind: 'select',
    key: `tx_${face}`,
    label,
    def: faceTex(v, face),
    head: i === 0 ? head : undefined,
    options: [{ value: 'none', label: 'Gładko' }, ...Object.entries(TEXTURE_LABELS).map(([k, l]) => ({ value: k, label: l }))],
  }));
/** Wall faces of a box (or all around a round one) for faceTexFields. */
export const wallFaces = (round: boolean): [string, string][] => (round ? [['around', 'Ścianka dookoła']] : Object.entries(SIDES));
/** Textures for the given faces of a part, from the per-face choices. */
export const faceTextures = (v: WizValues, faces: string[], as: (face: string) => TextureFace = (f) => f as TextureFace): Texture[] =>
  faces.flatMap((f) => {
    const p = faceTex(v, f);
    return p === 'none' ? [] : [texture(p, as(f))];
  });

/** A label on one face of the body `host` belongs to, as large as the face allows. */
export function addLabel(t: WizTools, on: Part, text: string, side: WallSide, cut: boolean, maxW: number, maxH: number) {
  const len = Math.max(1, [...text].length);
  const size = r1(Math.max(3, Math.min(12, maxH * 0.45, (maxW * 0.8) / (len * 1.0))));
  const id = t.add(cut ? 'textCut' : 'text', { name: 'Napis', params: { text, size, depth: 0.8, bold: size < 6 ? 0.3 : 0 }, body: on.body, color: on.color });
  t.textToWall(id, side);
}

/** Face of a lid that shows on the closed box: a lid with a rim is printed rim up, so its outside is the bottom. */
export const lidFace = (lid: Part): WallSide => (lid.type === 'lid' && Number(lid.params.R) > 0 ? 'bottom' : 'top');

/** Bounding box of a part, for placing things on it. */
export const boxOf = (p: Part) => worldBox(p);
