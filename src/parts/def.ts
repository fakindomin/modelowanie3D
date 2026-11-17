import type { Manifold } from 'manifold-3d';
import type * as THREE from 'three';
import type { Part, Vec3 } from '../types';

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
  /** Rarely changed size (wall, plate thickness…): shown under „Więcej wymiarów”. */
  more?: boolean;
  /** Letter of the element's end this field chooses (shown in the „Końce” section, with the letter on the model). */
  end?: string;
}

export type ParamDef =
  | (ParamBase & { type: 'number'; def: number; min: number; max: number; step?: number; unit?: string })
  | (ParamBase & { type: 'select'; def: string; options: { value: string; label: string }[] })
  | (ParamBase & { type: 'bool'; def: boolean })
  | (ParamBase & { type: 'text'; def: string; max?: number });

export type Category = 'ready' | 'profile' | 'basic' | 'joints' | 'threads' | 'hinges' | 'fittings' | 'connectors' | 'gears' | 'springs' | 'couplings' | 'figurines' | 'useful';

/** One printed piece of a multi-piece fitting (hinge leaf, gland nut…). */
export interface PieceDef {
  value: string;
  label: string;
  hole: boolean;
  /** Which body the piece joins: the selected part's, the one resting on it, or a new one. */
  body: 'sel' | 'above' | 'new';
  /** Printed together with the piece of this value (an inlay with its lid): one object made of coloured parts. */
  printWith?: string;
}

/** A moving element shown in the editor (a lid sliding out, a drawer): only a preview, the print stays closed. */
export interface Motion {
  /** Parameter of the model that held this preview before (kept for other pages); the editor builds it closed. */
  key: string;
  label: string;
  /** Group of sizes in the panel that belongs to this element (clicking it opens that group). */
  group: string;
  /** Pieces that move. */
  pieces: string[];
  /** Travel at 100 % (the working stop, e.g. on the magnets), in the part's own frame (mm). */
  move: Vec3;
  /** Turn at 100 % about an axis through a point (a door on its hinge, a lid screwed off), in the part's own frame. */
  turn?: { axis: Vec3; at: Vec3; deg: number };
  /** Several stages instead of one straight run (slide out of the grooves, then back to where it is printed): pose at each value, in order; `rot` = degrees about X, then Y, then Z, about `at`. */
  keys?: { v: number; move: Vec3; rot?: Vec3 }[];
  /** Pivot of `keys` rotations. */
  at?: Vec3;
  /** Value it shows before anyone moves it (a lid lying beside its box on the bed: the last key). Default 0 = closed. */
  rest?: number;
  /** Pose given in the scene's frame, not the part's (an assembly of separate parts: a lid onto its box). */
  world?: boolean;
  /** Shares the value of another element (a gasket going with its cap). */
  rig?: string;
  /** No button of its own on the bar (it follows another element). */
  hidden?: boolean;
  /** How far past 100 % it can go (taken right out of the box), as a multiple of `move`; default 1. */
  max?: number;
  /** Only this box of the piece moves (two drawers printed as one piece). */
  region?: [Vec3, Vec3];
}

/** A named place on the model (a grinder socket): hover shows its name, a click opens its group of sizes. */
export interface Zone {
  label: string;
  group: string;
  box: [Vec3, Vec3];
  /** The moving element this place belongs to (a drawer's bay): outlined with it. */
  motion?: string;
  /** Exact shape of the place (the socket's cut), outlined instead of the box. */
  solid?: () => Manifold;
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
  place?: (sel: THREE.Box3, p: Params, part?: Part) => { position: Vec3; rotation?: Vec3; params?: Params };
  /** Fix up parameters after an edit (e.g. a new figurine model resets its sliders). */
  normalize?: (prev: Params, next: Params) => Params;
  /** Not shown in the library (made by helper buttons). */
  hidden?: boolean;
  /** Print pose of this piece as a turn about X or Y (degrees), e.g. a lid printed top-down; null = as built. Skips the automatic pose. */
  printTurn?: (p: Params) => [0 | 1, number] | null;
  /** Live checks shown under the part's fields (derived sizes, warnings, errors). */
  notes?: (p: Params) => { level: 'ok' | 'warn' | 'error'; text: string }[];
  /** Where the letters of the ends (A, B…) stand on the built part, in its own frame (bb = built box). */
  endMarks?: (p: Params, bb: THREE.Box3) => { l: string; at: Vec3 }[];
  /** Moving elements, previewed with the bar under the model. */
  motions?: (p: Params) => Motion[];
  /** Named places of each piece (in the piece's built frame), for hover names and clicks. */
  zones?: (p: Params) => Zone[];
}
