import type { Manifold } from 'manifold-3d';
import type * as THREE from 'three';
import type { Vec3 } from '../types';

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

interface ParamBase {
  key: string;
  label: string;
  hint?: string;
  /** Hide the field unless this returns true (e.g. pitch only for a custom thread). */
  show?: (p: Params) => boolean;
  /** Section heading shown above this field. */
  group?: string;
}

export type ParamDef =
  | (ParamBase & { type: 'number'; def: number; min: number; max: number; step?: number; unit?: string })
  | (ParamBase & { type: 'select'; def: string; options: { value: string; label: string }[] })
  | (ParamBase & { type: 'bool'; def: boolean });

export type Category = 'ready' | 'profile' | 'basic' | 'joints' | 'threads' | 'hinges' | 'fittings' | 'figurines';

/** One printed piece of a multi-piece fitting (hinge leaf, gland nut…). */
export interface PieceDef {
  value: string;
  label: string;
  hole: boolean;
  /** Which body the piece joins: the selected part's, the one resting on it, or a new one. */
  body: 'sel' | 'above' | 'new';
}

export interface PartDef {
  type: string;
  label: string;
  category: Category;
  hole: boolean;
  description: string;
  params: ParamDef[];
  build: (p: Params) => Manifold;
  /** Parameters that depend on other values (figurines). Defaults to `params`. */
  paramsFor?: (p: Params) => ParamDef[];
  /** Multi-piece fitting: one part per piece, sharing parameters and moving together. */
  pieces?: PieceDef[];
  /** Placement relative to the selected part's world box; default is centred on its top. */
  place?: (sel: THREE.Box3, p: Params) => { position: Vec3; params?: Params };
  /** Fix up parameters after an edit (e.g. a new figurine model resets its sliders). */
  normalize?: (prev: Params, next: Params) => Params;
  /** Not shown in the library (made by helper buttons). */
  hidden?: boolean;
}
