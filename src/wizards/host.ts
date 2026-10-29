import type { Params } from '../catalog';
import type { MagnetOptions } from '../geom/magnets';
import type { Part } from '../types';

/** Editor tools a wizard may use to build its parts in a scratch scene (nothing reaches the real model or history). */
export interface WizTools {
  add(type: string, overrides?: Partial<Part> & { params?: Params }): string;
  addLid(id: string): void;
  addMagnets(id: string, opt: MagnetOptions): void;
  /** Box with a lid on a hinge hidden in its back wall. */
  addHinged(params: Params): string;
  parts(): Part[];
}

/** Filled in by the store when it starts (the store imports the wizards, so not the other way round). */
export const host: { simulate: (fn: (t: WizTools) => void) => Part[] } = {
  simulate: () => [],
};
