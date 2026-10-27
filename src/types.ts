import type { Params } from './catalog';

export type Vec3 = [number, number, number];

export type TexturePattern = 'ribs' | 'grooves' | 'knurl' | 'dots' | 'honeycomb';
export type TextureFace = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'around';

/** Real surface geometry added to (or cut into) one face of a solid. */
export interface Texture {
  pattern: TexturePattern;
  face: TextureFace;
  mode: 'add' | 'cut';
  /** Height of raised relief or depth of cut, mm. */
  depth: number;
  /** Pattern period, mm. */
  spacing: number;
  /** Direction of ribs / knurl lines, degrees. */
  angle: number;
  /** Plain border left around the pattern, mm. */
  margin: number;
}

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
  /** Solids flagged here show their body as a finished group (holes already cut). */
  merged?: boolean;
  /** Linked copies share parameters and texture: edit one, all follow. */
  link?: string;
  /** Pieces of one fitting (hinge leaves, gland parts, figurine pieces) move together. */
  rigid?: string;
  texture?: Texture;
}

export type Tab = 'tech' | 'fig';

export interface Project {
  version: 2;
  tech: Part[];
  fig: Part[];
}

/** Older single-scene project file. */
export interface ProjectV1 {
  version: 1;
  parts: Part[];
}
