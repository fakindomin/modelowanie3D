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

/** Rounded or chamfered outer edges of a solid. */
export interface Edges {
  kind: 'round' | 'chamfer';
  r: number;
  /** Corners of the outline seen from above. */
  vertical: boolean;
  /** Rim of the top face. */
  top: boolean;
  /** Rim of the bottom face (a chamfer prints best there). */
  bottom: boolean;
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
  edges?: Edges;
  /** Lid made for this box: its size (and divider slots) follow the box. */
  fitTo?: string;
  /** Member of a pattern that keeps its rule: move one member and the others follow. */
  pattern?: PatternRule;
}

/**
 * How pattern members follow each other.
 * linear: all move by the same delta. circle: member i sits at angle a0 + i·360/n around the centre.
 * sym: mirror signs `s` around the centre (corners, X/Y mirrors).
 * The centre is kept as an X/Y offset from the member, so moving the whole group keeps the rule intact.
 */
export interface PatternRule {
  id: string;
  kind: 'linear' | 'circle' | 'sym';
  c: [number, number];
  i: number;
  n: number;
  s: [number, number];
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
