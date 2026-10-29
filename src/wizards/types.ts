import type { Params } from '../catalog';
import type { Vec3, WizValues } from '../types';

export interface TileOption {
  value: string | number;
  label: string;
  desc?: string;
  /** SVG path drawn in a 100 × 48 box. */
  icon?: string;
}

export type Field =
  | { kind: 'tiles'; key: string; label?: string; options: TileOption[]; cols?: 2 | 3 | 4 }
  | { kind: 'slider'; key: string; label: string; min: number; max: number; step: number; unit: string }
  | { kind: 'toggle'; key: string; label: string; desc: string }
  | { kind: 'hint'; text: string };

export interface Step {
  title: string;
  desc: string;
  /** Item groups shown in full colour on this step (the rest dims); empty = everything. */
  focus: string[];
  focusLabel: string;
  fields: (v: WizValues, plan: Plan | null) => Field[];
}

/** One kind of printed part: every copy is the same print. */
export interface PlanItem {
  role: string;
  name: string;
  type: string;
  params: Params;
  qty: number;
  /** For highlighting per step: e.g. 'fit', 'pipe', 'clip'. */
  group: string;
  color: string;
  material: 'PLA' | 'PETG' | 'TPU';
  /** Where it goes and how to print it (the manual uses both). */
  where: string;
  how: string;
}

export interface Placement {
  role: string;
  position: Vec3;
  rotation: Vec3;
}

export interface Plan {
  items: PlanItem[];
  placements: Placement[];
  /** Things to buy: screws, boards, glue. */
  buy: { name: string; qty: string; note?: string }[];
  /** Assembly steps, in order. */
  steps: string[];
  notes: { text: string; warn?: boolean }[];
  /** Printer bed of the chosen printer, mm. */
  bed: Vec3;
  /** Tallest print (pipes stand up), mm. */
  longest: number;
  /** Outer size of the assembled model, mm. */
  size: Vec3;
  /** Bought boards (shelves, top), centre and size: shown in the preview, not added to the model. */
  boards?: { size: Vec3; position: Vec3 }[];
}

export interface Wizard {
  id: string;
  label: string;
  desc: string;
  steps: Step[];
  defaults: WizValues;
  /** Applies a picked value (a template tile sets several at once). */
  set(v: WizValues, key: string, value: string | number | boolean): WizValues;
  plan(v: WizValues): Plan;
}

/** Wizards listed in the gallery; `ready: false` ones are planned. */
export interface WizardEntry {
  id: string;
  label: string;
  desc: string;
  ready: boolean;
}
