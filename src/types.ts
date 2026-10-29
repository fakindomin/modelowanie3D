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

/** Bending of a whole body, applied after holes are cut (kept on one of its solids). */
export interface Bend {
  /** Off shows the body flat for editing. */
  on: boolean;
  mode: 'wrap' | 'angle';
  /** Which length bends: along X or along Y. */
  axis: 'x' | 'y';
  /** Ends go down (bottom face inside the bend) or up. */
  dir: 'down' | 'up';
  /** wrap: pipe diameter and play. */
  D: number;
  luz: number;
  /** angle: bend line (world mm along the axis), angle in degrees and inner radius. */
  at: number;
  angle: number;
  r: number;
}

/** Hollowing of a whole body: walls of thickness t, optionally open at the top or bottom. */
export interface Shell {
  on: boolean;
  t: number;
  open: 'none' | 'top' | 'bottom';
}

/** See-through pattern cut into a whole body to save filament, with a solid frame left at edges and holes. */
export interface Infill {
  on: boolean;
  pattern: 'tri' | 'hex' | 'diamond' | 'slot' | 'circle';
  /** Direction the openings go through: Z = seen from above (plates, floors), X/Y = side walls. */
  axis: 'x' | 'y' | 'z';
  /** Repeat of the pattern and width of the struts, mm. */
  cell: number;
  rib: number;
  /** Solid border kept along the edges and around holes, mm. */
  margin: number;
  /** through: openings; pocket: blind pockets from the bottom (or the -X / -Y side), `depth` deep. */
  mode: 'through' | 'pocket';
  depth: number;
}

/** Mirror and scale of a whole body, about the centre of its base (kept on one of its solids). */
export interface Xform {
  mirror: 'none' | 'x' | 'y' | 'z';
  /** Percent per axis. */
  scale: Vec3;
}

export type ArmRole = 'pipe' | 'screw' | 'pin' | 'clip';

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
  /** More textures, one per face (picked by double-clicking a face). */
  textures?: Texture[];
  edges?: Edges;
  bend?: Bend;
  shell?: Shell;
  infill?: Infill;
  xform?: Xform;
  /** Kept in the model and the print, just not drawn. */
  hidden?: boolean;
  /** Cannot be moved, rotated or deleted until unlocked. */
  locked?: boolean;
  /** With `hole`: instead of cutting, keeps only what lies inside it (intersection). */
  clip?: boolean;
  /** Lid made for this box: its size (and divider slots) follow the box. */
  fitTo?: string;
  /** Gear meshing with another one: it stays where its teeth fit the driver's, also after edits. */
  gearMate?: { of: string; angle: number };
  /** Pipe, hole or spring clip made for arm `i` of a pipe fitting: it follows the fitting (k: which screw / pin). */
  armOf?: { of: string; i: number; role: ArmRole; k: number };
  /** Member of a pattern that keeps its rule: move one member and the others follow. */
  pattern?: PatternRule;
  /** Made by a project wizard: its run, the wizard and the item; one part of each run keeps the answers. */
  wiz?: WizTag;
}

/** Answers given in a project wizard. */
export type WizValues = Record<string, string | number | boolean>;

export interface WizTag {
  run: string;
  w: string;
  role: string;
  recipe?: { values: WizValues; origin: Vec3 };
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
  /** Imported STL meshes the parts refer to (base64 vertices and triangles). */
  meshes?: Record<string, { v: string; t: string }>;
}

/** Older single-scene project file. */
export interface ProjectV1 {
  version: 1;
  parts: Part[];
}
