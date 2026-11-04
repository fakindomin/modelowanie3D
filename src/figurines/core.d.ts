/* Typy dla silnika figurek (core.js, przeniesiony z artefaktu). */
export interface FigMesh {
  p: number[];
  i: number[];
}
export interface FigPart {
  name: string;
  m: FigMesh;
  ex?: FigMesh;
  g?: string;
}
export interface FigItem {
  k: string;
  l: string;
  min?: number;
  max?: number;
  step?: number;
  f?: string;
  type?: 'bool';
}
export interface FigModel {
  n: string;
  desc: string;
  tune?: string;
  f: Record<string, unknown>;
  g: string[];
  d: Record<string, number>;
}
export const LINE: unknown;
export const M: Record<string, FigModel>;
export const ORDER: string[];
export const GR: Record<string, { t: string; items: FigItem[] }>;
export function defaults(id: string): Record<string, number>;
export function buildModel(id: string, P: Record<string, number>, opt?: { vox?: number; lo?: boolean; draft?: boolean; explode?: number }): { parts: FigPart[]; warn: string[] };
export function finalize(parts: FigPart[]): { w: number; h: number; d: number };
export function meshCheck(m: FigMesh): { ok: boolean };
export function fileNames(id: string, P: Record<string, number>): string[];
