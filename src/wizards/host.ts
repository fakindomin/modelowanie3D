import type { Params } from '../catalog';
import type { FaceMagnetOptions, MagnetOptions } from '../geom/magnets';
import type { WallSide } from '../parts/connectors';
import type { Part } from '../types';

/** Editor tools a wizard may use to build its parts in a scratch scene (nothing reaches the real model or history). */
export interface WizTools {
  add(type: string, overrides?: Partial<Part> & { params?: Params }): string;
  addLid(id: string): void;
  addMagnets(id: string, opt: MagnetOptions): void;
  /** Box with a lid on a hinge hidden in its back wall. */
  addHinged(params: Params): string;
  update(id: string, patch: Partial<Part>): void;
  remove(id: string): void;
  /** Ready case for a board (box with posts, port openings and a lid); returns the box id. */
  addPiCase(board: string): string;
  /** Cabinet with matching drawers; returns the cabinet id. */
  addCabinet(params: Params): string;
  addFaceMagnets(body: number, opt: FaceMagnetOptions): void;
  /** Moves a connector cut-out onto a wall of its body. */
  connectorToWall(id: string, side: WallSide): void;
  /** Connector cut-out (with its inner frame) on a wall of the box; `at` sets x/y along the wall and z. Returns the cut-out id. */
  addConnector(box: string, params: Params, side: WallSide, at?: Partial<Record<0 | 1 | 2, number>>): string;
  /** Puts a label (text / textCut) onto a face of the body it belongs to. */
  textToWall(id: string, side: WallSide): void;
  parts(): Part[];
}

/** Filled in by the store when it starts (the store imports the wizards, so not the other way round). */
export const host: { simulate: (fn: (t: WizTools) => void) => Part[] } = {
  simulate: () => [],
};
