import type { Params } from './catalog';

export type Vec3 = [number, number, number];

export interface Part {
  id: string;
  type: string;
  name: string;
  params: Params;
  position: Vec3;
  /** Euler angles in degrees (XYZ order). */
  rotation: Vec3;
  color: string;
  /** Holes cut the solids of their own body; every body is a separate printed object. */
  hole: boolean;
  body: number;
  /** A socket made for a peg never cuts the peg's own body. */
  avoidBody?: number;
}

export interface Project {
  version: 1;
  parts: Part[];
}
