import { create } from 'zustand';
import * as THREE from 'three';
import { DEFS, cabinetOpenings, defaultParams, slideGroove, type Params } from './catalog';
import { SCALE, SCALED, type Family, type Size, type Variant } from './families';
import { buildBodies, built, partMatrix, texturesOf, worldBox, worldManifold } from './geom/parts';
import { finishing } from './geom/modify';
import { MAGNET_COVER, MAGNET_LUZ, MAGNET_WALL, type FaceMagnetOptions, boxForLid, findLid, magnetDims, planRingSpots, planSpots, wallThickness, type LidRef, type MagnetOptions, type Spot } from './geom/magnets';
import { figurine, figurineParams, fitHeight, FIG_MODELS } from './parts/figurine';
import { magnetIssues, runCheck, type CheckResult, type Fix } from './geom/check';
import { placeMates } from './geom/gearMates';
import { isFitting, pipeFor, placeArmMates } from './geom/armMates';
import { fittingGeo, oringFor, pinSpots, screwSpots } from './parts/couplings';
import type { Bend, Edges, Infill, Part, PatternRule, Project, ProjectV1, Shell, Tab, Texture, TextureFace, Vec3, WizValues, Xform } from './types';
import { WIZARDS } from './wizards';
import { host } from './wizards/host';
import type { Feature } from './scene/measure';
import { connOpening, sideOf, wallPose, type WallSide } from './parts/connectors';
import { BOARDS, EDGE_SIDE } from './parts/raspberry';
import { BOX_HINGE_LIFT } from './parts/joints';
import { gasketDims, isJar } from './parts/jar';
import { gridSegments, layoutOf } from './geom/dividers';
import { DOWEL_LUZ, dowelSpots } from './geom/split';
import { decodeMeshes, loadStoredMeshes, parseSTL, persistMeshes, registerMesh, toSolid } from './geom/meshes';

export const PALETTE = ['#a9aeb3', '#e8873a', '#5bb974', '#c9b48a', '#7f8c99', '#d97757', '#8fbf9f', '#b8a07a'];
const FIG_PALETTE = ['#e9d8c4', '#f0b6a8', '#b9d7a8', '#a8c8e8', '#f2d68a', '#d8b8e8'];
export const HOLE_COLOR = '#8b939e';
const STORAGE_KEY = 'modelowanie3d.project';
const RECENT_KEY = 'modelowanie3d.recent';

function loadRecent(): Record<string, Params> {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '{}') as Record<string, Params>;
  } catch {
    return {};
  }
}
const DEG = Math.PI / 180;

export interface Settings {
  grid: number;
  snap: boolean;
  stick: boolean;
  /** Thinnest wall the printer handles (two nozzle lines), used by "Sprawdź model". */
  minWall: number;
}

export type PatternKind = 'linear' | 'circle' | 'corners' | 'mirrorX' | 'mirrorY' | 'mirrorXY';
export interface PatternOptions {
  count: number;
  distance: number;
  axis: 0 | 1 | 2;
  inset: number;
  radius: number;
}

interface Doc {
  parts: Part[];
  past: Part[][];
  future: Part[][];
  selectedId: string | null;
}

interface State {
  tab: Tab;
  /** The other tab's scene, kept while this one is edited. */
  stash: Record<Tab, Doc>;
  parts: Part[];
  /** A part id, or "g:<body>" for a whole group. */
  selectedId: string | null;
  hoveredId: string | null;
  past: Part[][];
  future: Part[][];
  settings: Settings;
  preview: boolean;
  snapTargets: string[];
  toast: string | null;
  fitRequest: number;
  check: CheckResult | null;
  /** "Wymiary" mode: hovering shows sizes, clicks pin features and measure between them. */
  measure: boolean;
  measureHover: (Feature & { x: number; y: number }) | null;
  pins: Feature[];
  setMeasure(on: boolean): void;
  setMeasureHover(f: (Feature & { x: number; y: number }) | null): void;
  addPin(f: Feature): void;
  removePin(i: number): void;
  clearPins(): void;
  fit(): void;

  setTab(tab: Tab): void;
  select(id: string | null): void;
  setHover(id: string | null): void;
  add(type: string, overrides?: Partial<Part> & { params?: Params }): string;
  addFigurine(model: string): void;
  update(id: string, patch: Partial<Part>): void;
  /** Updates without recording history; pair with beginGesture(). */
  updateLive(id: string, patch: Partial<Part>): void;
  /** Moves parts by a delta from their start positions (live, during a group drag). */
  moveManyLive(start: Record<string, Vec3>, delta: Vec3): void;
  beginGesture(): void;
  remove(id: string): void;
  duplicate(id: string): void;
  rotateBy(id: string, axis: 0 | 1 | 2, degrees: number): void;
  dropToFloor(id: string): void;
  matchingHole(id: string): void;
  matchingBolt(id: string): void;
  /** Adds a gear (or rack, worm, wheel) meshing with this one; `kind` picks the partner. */
  matingGear(id: string, kind: 'gear' | 'rack' | 'bevel' | 'worm' | 'wheel'): void;
  /** Pipes (or profiles) in every arm of a fitting, with their screw / pin holes and spring clips. */
  matchingPipes(id: string): void;
  /** Printable o-rings for a fitting's grooves (or an o-ring groove), beside the model. */
  addOrings(id: string): void;
  matchingNut(id: string): void;
  matchingThreadHole(id: string): void;
  addDrawers(id: string): void;
  addLid(id: string): void;
  /** Stops a lid from following its box. */
  unfitLid(id: string): void;
  /** Magnet pockets on the top edge of a box (ready-made or built from plates) and mirrored ones in its lid. */
  addMagnets(id: string, opt: MagnetOptions): void;
  /** Round box: threaded neck, screw-on cap and a flat gasket (adds what is missing). */
  makeJar(id: string): void;
  /** Flat gasket for a jar box that has none. */
  addGasket(id: string): void;
  /** Magnet pockets in one face of any body: centre, corners or a row. */
  addFaceMagnets(body: number, opt: FaceMagnetOptions): void;
  /** Adds a family variant in size S/M/L or with the dimensions last used for its type. */
  addVariant(family: Family, variant: Variant, size: Size | 'recent'): void;
  /** Last parameters the user set, per part type ("Ostatnie" in the library). */
  recent: Record<string, Params>;
  /** Replaces a box or drawer with the plates it is made of (grouped in the same body). */
  explode(id: string): void;
  /** Moves a connector cut-out (with its reinforcement) onto another wall of the body it is in. */
  connectorToWall(id: string, side: WallSide): void;
  /** Adds a model read from an STL file. */
  importSTL(name: string, data: ArrayBuffer): void;
  /** Puts a label onto a face of the body it belongs to, upright and readable from outside. */
  textToWall(id: string, side: WallSide): void;
  /** Cuts a body in two at a plane across `axis`, with dowel holes in both halves and loose dowels. */
  splitBody(body: number, axis: 0 | 1 | 2, at: number, dowels: boolean): void;
  /** Cuts a body into pieces that each fit on the printer's bed. */
  splitToBed(body: number, bed: Vec3, dowels: boolean): void;
  /** Cut plane shown in the scene while the split tool is open. */
  cutPlane: { body: number; axis: 0 | 1 | 2; at: number } | null;
  setCutPlane(c: { body: number; axis: 0 | 1 | 2; at: number } | null): void;
  /** Ready case for a Raspberry Pi board, made of ordinary editable elements. */
  addPiCase(board: string): void;
  applyFixes(fixes: Fix[]): void;
  pattern(id: string, kind: PatternKind, opt: PatternOptions): void;
  unlink(id: string): void;
  setTexture(id: string, texture: Texture | undefined): void;
  /** Texture of one face (replacing that face's, if any); undefined removes it. */
  setFaceTexture(id: string, face: TextureFace, texture: Texture | undefined): void;
  /** Face picked by a double click: its texture face (part's own axes), wall side (world) and triangles to highlight. */
  faceSel: { id: string; face: TextureFace | null; side: WallSide | null; tris: number[] } | null;
  setFaceSel(f: { id: string; face: TextureFace | null; side: WallSide | null; tris: number[] } | null): void;
  /** A label (raised or cut) on a wall of the body this part belongs to. */
  addLabel(id: string, side: WallSide, text: string, cut: boolean): void;
  setEdges(id: string, edges: Edges | undefined): void;
  /** Bending of a whole body, kept on one of its solids (`id`); other solids of the body lose theirs. */
  setBend(id: string, bend: Bend | undefined): void;
  /** Body modifiers kept on one solid of the body (the others are cleared). */
  setShell(id: string, shell: Shell | undefined): void;
  setInfill(id: string, infill: Infill | undefined): void;
  /** Triangular ribs in the inside corners of an angle, channel or tee profile. */
  addRibs(id: string, count: number): void;
  setXform(id: string, xform: Xform | undefined): void;
  /** Mirrored copy of a body placed beside it. */
  mirrorCopy(body: number, axis: 'x' | 'y'): void;
  /** Hide or lock parts; a group id ("g:3") means every member of that body. */
  setFlags(ids: string[], patch: { hidden?: boolean; locked?: boolean }): void;
  /** Keeps only what the solids of `body` share with the solids of `other` (other becomes a clip). */
  clipWith(body: number, other: number): void;
  /** Extra picks for aligning (Ctrl+click); `selectedId` stays the main one. */
  multi: string[];
  /** Picked point or edge of a sketch part's outline (its menu is open), from the panel or the 3D view. */
  sketchSel: { id: string; kind: 'pt' | 'edge'; i: number; from: 'panel' | '3d' } | null;
  setSketchSel(sel: { id: string; kind: 'pt' | 'edge'; i: number; from: 'panel' | '3d' } | null): void;
  toggleMulti(id: string): void;
  clearMulti(): void;
  align(ids: string[], axis: 0 | 1 | 2, to: 'min' | 'mid' | 'max'): void;
  distribute(ids: string[], axis: 0 | 1 | 2, gap: number | null): void;
  /** Turns every body onto its largest flat face and packs them on the bed. */
  layoutOnBed(): void;
  fitFigurine(id: string, height: number): void;
  merge(body: number): void;
  unmerge(body: number): void;
  /** Group actions on a whole body. */
  moveBody(body: number, position: Vec3): void;
  rotateBody(body: number, axis: 0 | 1 | 2, degrees: number): void;
  dropBody(body: number): void;
  duplicateBody(body: number): void;
  removeBody(body: number): void;
  /** Moves holes that no longer touch their own body into the body they now sit in. */
  fixHoles(): void;
  /** After the user moves a part: join the body it now stands in, fix holes, maybe offer corner copies. */
  afterMove(id: string): void;
  /** Offer shown after placing an element in a body's corner. */
  suggest: { id: string } | null;
  /** Open project wizard: none picked yet (gallery), or a wizard with answers; `run` when editing one already in the model. */
  wizard: { id: string | null; values?: WizValues; run?: string } | null;
  openWizard(w: { id: string | null; values?: WizValues; run?: string } | null): void;
  /** Puts what a wizard planned into the model (replacing that run's parts when editing). */
  applyWizard(id: string, values: WizValues, run?: string): void;
  /** Project manual (what to print, buy and how to assemble) shown over the editor. */
  manual: boolean;
  setManual(v: boolean): void;
  dismissSuggest(): void;
  mergeAll(): void;
  runCheck(): void;
  closeCheck(): void;
  undo(): void;
  redo(): void;
  load(project: Project | ProjectV1): void;
  reset(): void;
  setSettings(s: Partial<Settings>): void;
  setPreview(v: boolean): void;
  setSnapTargets(ids: string[]): void;
  notify(msg: string): void;
}

/** Polish plural: 2–4 (but not 12–14) take the "few" form. */
const few = (n: number) => n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);

const uid = () => Math.random().toString(36).slice(2, 10);
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const r3 = (v: Vec3): Vec3 => [round(v[0]), round(v[1]), round(v[2])];

export const groupId = (body: number) => `g:${body}`;
export const groupBody = (id: string | null) => (id && id.startsWith('g:') ? Number(id.slice(2)) : null);

function nextBody(parts: Part[]) {
  return parts.reduce((m, p) => Math.max(m, p.body), 0) + 1;
}

/** A locked part (or a body with a locked member) stays put: no dragging, keys, gizmo or delete. */
export function isLocked(parts: Part[], id: string | null) {
  if (!id) return false;
  const gb = groupBody(id);
  if (gb !== null) return parts.some((p) => p.body === gb && p.locked);
  const p = parts.find((x) => x.id === id);
  return !!p && mates(parts, p).some((x) => x.locked);
}

/** Shown as the finished piece: merged by the user, or bent (bending needs the finished solid). */
export function isMerged(parts: Part[], body: number) {
  return parts.some((p) => p.body === body && !p.hole && (p.merged || finishing(p)));
}

function overlaps(a: THREE.Box3, b: THREE.Box3, eps = 0.01) {
  return a.min.x < b.max.x - eps && a.max.x > b.min.x + eps && a.min.y < b.max.y - eps && a.max.y > b.min.y + eps && a.min.z < b.max.z - eps && a.max.z > b.min.z + eps;
}

function volume(b: THREE.Box3) {
  const s = b.getSize(new THREE.Vector3());
  return Math.max(s.x, 0) * Math.max(s.y, 0) * Math.max(s.z, 0);
}

/** World box of a body's solids (or every member when it has none). */
export function bodyBox(parts: Part[], body: number, exclude?: string) {
  const b = new THREE.Box3();
  const members = parts.filter((p) => p.body === body && p.id !== exclude);
  const solids = members.filter((p) => !p.hole);
  (solids.length ? solids : members).forEach((p) => b.union(worldBox(p)));
  return b;
}

/**
 * Every part that moves with a body: the body itself plus bodies tied to it by a fitting
 * (a hinge holds the box and its lid together).
 */
export function assembly(parts: Part[], body: number): Part[] {
  const bodies = new Set([body]);
  for (let grew = true; grew; ) {
    grew = false;
    const rigids = new Set(parts.filter((p) => bodies.has(p.body) && p.rigid).map((p) => p.rigid));
    for (const p of parts)
      if (p.rigid && rigids.has(p.rigid) && !bodies.has(p.body)) {
        bodies.add(p.body);
        grew = true;
      }
  }
  return parts.filter((p) => bodies.has(p.body));
}

/** Parts that move with this one (pieces of one fitting). */
function mates(parts: Part[], part: Part) {
  return part.rigid ? parts.filter((p) => p.rigid === part.rigid) : [part];
}

function sanitize(parts: unknown): Part[] {
  return Array.isArray(parts) ? (parts as Part[]).filter((x) => x && DEFS[x.type]) : [];
}

function loadSaved(): { tech: Part[]; fig: Part[] } {
  loadStoredMeshes();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Project | ProjectV1;
      if (p.version === 1) return { tech: sanitize(p.parts), fig: [] };
      return { tech: sanitize(p.tech), fig: sanitize(p.fig) };
    }
  } catch {
    /* ignore broken or blocked storage */
  }
  return { tech: [], fig: [] };
}

function rotationAfter(rotation: Vec3, axis: THREE.Vector3, degrees: number): Vec3 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotation.map((r) => r * DEG) as Vec3)));
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, degrees * DEG));
  const e = new THREE.Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z].map((r) => {
    const d = round(r / DEG, 2);
    return Math.abs(d) < 1e-6 ? 0 : d;
  }) as Vec3;
}

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

/** Applies a patch and carries it over to linked copies and pieces of the same fitting. */
function applyPatch(parts: Part[], id: string, patch: Partial<Part>): Part[] {
  const src = parts.find((p) => p.id === id);
  if (!src) return parts;
  const def = DEFS[src.type];
  let params = patch.params;
  if (params && def.normalize) params = def.normalize(src.params, params);
  const own = { ...src, ...patch, ...(params ? { params } : {}) };
  // Moving a following gear by hand unhooks it from its driver.
  if (src.gearMate && (patch.position || patch.rotation) && !('gearMate' in patch)) own.gearMate = undefined;
  // Same for a pipe (or its hole) moved off its fitting's arm.
  if (src.armOf && (patch.position || patch.rotation) && !('armOf' in patch)) own.armOf = undefined;
  const shareParams = !!params && !!src.link;
  const shareTexture = ('texture' in patch || 'textures' in patch) && !!src.link;
  const shareEdges = 'edges' in patch && !!src.link;
  const sharePose = !!src.rigid && (patch.position !== undefined || patch.rotation !== undefined);
  const follow = src.pattern && patch.position && patch.pattern === undefined ? followers(parts, src, own.position) : null;
  if (follow) own.pattern = follow.get(src.id)!.pattern;
  return placeArmMates(placeMates(parts.map((p) => {
    if (p.id === id) return own;
    let q = p;
    if (shareParams && p.link === src.link) {
      const next: Params = { ...params! };
      if (p.params.piece !== undefined) next.piece = p.params.piece;
      q = { ...q, params: next };
    }
    if (shareTexture && p.link === src.link) q = { ...q, texture: own.texture, textures: own.textures };
    if (shareEdges && p.link === src.link) q = { ...q, edges: patch.edges };
    if (sharePose && p.rigid === src.rigid) q = { ...q, position: own.position, rotation: own.rotation };
    const f = follow?.get(p.id);
    if (f) q = { ...q, position: f.position, pattern: f.pattern };
    return q;
  })));
}

/** New positions of every member of `src`'s pattern after `src` moves to `to` (rule kept). */
function followers(parts: Part[], src: Part, to: Vec3): Map<string, { position: Vec3; pattern: PatternRule }> {
  const r = src.pattern!;
  const cx = src.position[0] + r.c[0], cy = src.position[1] + r.c[1];
  const out = new Map<string, { position: Vec3; pattern: PatternRule }>();
  const d: Vec3 = [to[0] - src.position[0], to[1] - src.position[1], to[2] - src.position[2]];
  const R = Math.hypot(to[0] - cx, to[1] - cy);
  const a0 = Math.atan2(to[1] - cy, to[0] - cx) - (r.i * 2 * Math.PI) / r.n;
  const ux = (to[0] - cx) * r.s[0], uy = (to[1] - cy) * r.s[1];
  for (const p of parts) {
    const q = p.pattern;
    if (!q || q.id !== r.id) continue;
    let pos: Vec3;
    if (p.id === src.id) pos = to;
    else if (r.kind === 'linear') pos = [p.position[0] + d[0], p.position[1] + d[1], p.position[2] + d[2]];
    else if (r.kind === 'circle') {
      const a = a0 + (q.i * 2 * Math.PI) / q.n;
      pos = [cx + R * Math.cos(a), cy + R * Math.sin(a), to[2]];
    } else pos = [cx + q.s[0] * ux, cy + q.s[1] * uy, to[2]];
    pos = r3(pos);
    out.set(p.id, { position: pos, pattern: { ...q, c: [round(cx - pos[0]), round(cy - pos[1])] } });
  }
  return out;
}

function boxOf(m: { boundingBox(): { min: number[]; max: number[] } }) {
  const b = m.boundingBox();
  return new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max));
}

/** Extent of a body as printed (holes cut), not just of its solids. */
export function finishedBox(parts: Part[], body: number) {
  const [res] = buildBodies(parts, [body]);
  if (!res) return new THREE.Box3();
  const b = boxOf(res.manifold);
  res.geometry.dispose();
  res.manifold.delete();
  return b;
}

function dowelNote(pins: Part[], dowel: { d: number; len: number } | null) {
  if (!pins.length) return ' Bez kołków: przekrój jest za cienki, części skleisz na płasko.';
  const n = pins.length;
  const len = dowel ? String(round(dowel.len - 0.6, 1)).replace('.', ',') : '';
  return ` ${n} ${n === 1 ? 'kołek' : few(n) ? 'kołki' : 'kołków'} Ø${dowel?.d} × ${len} mm jako osobna bryła, otwory w obu częściach z luzem ${String(DOWEL_LUZ).replace('.', ',')} mm.`;
}

export const useStore = create<State>((set, get) => {
  const commit = (parts: Part[], extra: Partial<State> = {}) =>
    set((s) => ({ past: [...s.past.slice(-99), s.parts], future: [], parts: fixHolesIn(syncLids(s.parts, placeArmMates(syncFigurines(parts)))), check: null, ...extra }));

  const makePart = (type: string, parts: Part[], overrides: Partial<Part> = {}): Part => {
    const def = DEFS[type];
    const count = parts.filter((p) => p.type === type).length + 1;
    const palette = get().tab === 'fig' ? FIG_PALETTE : PALETTE;
    return {
      id: uid(),
      type,
      name: `${def.label} ${count}`,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      color: def.hole ? HOLE_COLOR : palette[parts.length % palette.length],
      hole: def.hole,
      body: nextBody(parts),
      ...overrides,
      params: { ...defaultParams(def), ...(overrides.params ?? {}) },
    };
  };

  /**
   * Cuts `body` at a plane across `axis`: the part below stays, a copy of every member (holes too)
   * becomes a new body above, and each side gets a box-shaped cut removing the other half.
   * Dowel holes go through the cut into both halves; matching dowels are collected in `pins`.
   */
  const splitAt = (parts: Part[], body: number, axis: 0 | 1 | 2, at: number, dowels: boolean, pins: Part[]) => {
    const [res] = buildBodies(parts, [body]);
    if (!res) return null;
    // The finished solid's extent: earlier cuts already took material away.
    const bb = boxOf(res.manifold);
    let plan: ReturnType<typeof dowelSpots> = null;
    if (at > bb.min.getComponent(axis) + 0.5 && at < bb.max.getComponent(axis) - 0.5 && dowels) plan = dowelSpots(res.manifold, axis, at);
    res.geometry.dispose();
    res.manifold.delete();
    if (at <= bb.min.getComponent(axis) + 0.5 || at >= bb.max.getComponent(axis) - 0.5) return null;
    // Each side keeps only the members that reach into it; the rest would be cut away anyway.
    const side = (p: Part) => worldBox(p);
    const below = new Set(parts.filter((p) => p.body === body && side(p).min.getComponent(axis) < at - 0.01).map((p) => p.id));
    const next = parts.filter((p) => p.body !== body || below.has(p.id));
    const nb = nextBody(parts);
    const members = parts.filter((p) => p.body === body && side(p).max.getComponent(axis) > at + 0.01);
    const ids = new Map(members.map((p) => [p.id, uid()]));
    const fresh = new Map<string, string>();
    const remap = (k: string | undefined) => (k ? (fresh.get(k) ?? fresh.set(k, uid()).get(k)) : undefined);
    for (const p of members)
      next.push({ ...p, id: ids.get(p.id)!, body: nb, rigid: remap(p.rigid), fitTo: p.fitTo ? (ids.get(p.fitTo) ?? p.fitTo) : undefined, pattern: p.pattern ? { ...p.pattern, id: remap(p.pattern.id)! } : undefined });
    // Box-shaped cuts reaching 2 mm past every solid of the body (earlier cuts may hide some of them).
    const all = bodyBox(parts, body).union(bb);
    const lo = all.min.clone().subScalar(2), hi = all.max.clone().addScalar(2);
    const cutBox = (from: number, to: number, b: number, k: number) => {
      const a = lo.clone(), z = hi.clone();
      a.setComponent(axis, from);
      z.setComponent(axis, to);
      next.push(
        makePart('holeBox', next, {
          name: `Cięcie ${k}`,
          params: { W: round(z.x - a.x, 2), D: round(z.y - a.y, 2), H: round(z.z - a.z, 2), luz: 0 },
          position: r3([(a.x + z.x) / 2, (a.y + z.y) / 2, a.z]),
          body: b,
        }),
      );
    };
    const cuts = parts.filter((p) => p.type === 'holeBox' && p.name.startsWith('Cięcie')).length / 2 + 1;
    cutBox(at, hi.getComponent(axis), body, cuts);
    cutBox(lo.getComponent(axis), at, nb, cuts);
    if (plan) {
      const rot: Vec3 = axis === 0 ? [0, 90, 0] : axis === 1 ? [-90, 0, 0] : [0, 0, 0];
      const reach = plan.len / 2 + 0.5;
      plan.spots.forEach((sp, k) => {
        const pos = [...sp] as Vec3;
        pos[axis] -= reach;
        for (const b of [body, nb])
          next.push(makePart('hole', next, { name: `Otwór na kołek ${k + 1}`, params: { D: plan!.d, H: round(2 * reach, 2), luz: DOWEL_LUZ }, position: r3(pos), rotation: rot, body: b }));
        pins.push({ id: uid(), type: 'cylinder', name: `Kołek ${plan!.d}×${plan!.len - 0.6}`, params: { D: plan!.d, H: round(plan!.len - 0.6, 2) }, position: [0, 0, 0], rotation: [0, 0, 0], color: PALETTE[3], hole: false, body: -1, edges: { kind: 'chamfer', r: 0.5, vertical: false, top: true, bottom: true } });
      });
    }
    return { parts: next, body: nb, dowel: plan ? { d: plan.d, len: plan.len } : null };
  };

  /** Loose dowels as one more body, in a row next to the model. */
  const addDowelPins = (parts: Part[], pins: Part[]) => {
    if (!pins.length) return parts;
    const body = nextBody(parts);
    const d = Number(pins[0].params.D), gap = d + 4;
    // A square-ish grid of dowels standing on the bed.
    const cols = Math.ceil(Math.sqrt(pins.length));
    const start = besideAll(parts, new THREE.Vector3(cols * gap, Math.ceil(pins.length / cols) * gap, 0));
    return [...parts, ...pins.map((p, i) => ({ ...p, body, position: r3([start[0] - (cols * gap) / 2 + (i % cols) * gap + gap / 2, start[1] + Math.floor(i / cols) * gap, 0]) }))];
  };

  /** The selection as something to build on: its world box and body. */
  const selection = () => {
    const { parts, selectedId } = get();
    const gb = groupBody(selectedId);
    if (gb !== null && parts.some((p) => p.body === gb)) return { box: bodyBox(parts, gb), body: gb };
    const part = parts.find((p) => p.id === selectedId);
    return part ? { box: worldBox(part), body: part.body } : null;
  };

  /** Position to the right of everything, for a new standalone part of the given local size. */
  const besideAll = (parts: Part[], size: THREE.Vector3): Vec3 => {
    if (!parts.length) return [0, 0, 0];
    const maxX = Math.max(...parts.map((p) => worldBox(p).max.x));
    return [Math.ceil(maxX + 10 + size.x / 2), 0, 0];
  };

  /** Body resting on top of the given box (for the upper leaf of a hinge). */
  const bodyAbove = (parts: Part[], box: THREE.Box3, exclude: number) => {
    for (const p of parts) {
      if (p.hole || p.body === exclude) continue;
      const b = worldBox(p);
      if (Math.abs(b.min.z - box.max.z) < 0.6 && b.min.x < box.max.x && b.max.x > box.min.x && b.min.y < box.max.y && b.max.y > box.min.y) return p.body;
    }
    return null;
  };

  const addPieces = (type: string, overrides: Partial<Part> & { params?: Params }) => {
    const { parts } = get();
    const def = DEFS[type];
    const sel = selection();
    const link = uid();
    let params: Params = { ...defaultParams(def), ...(overrides.params ?? {}) };
    let position: Vec3;
    let rotation: Vec3 = [0, 0, 0];
    if (sel && def.place) {
      const selPart = get().parts.find((p) => p.id === get().selectedId) ?? largestSolid(parts, sel.body);
      const pl = def.place(sel.box, params, selPart);
      position = pl.position;
      rotation = pl.rotation ?? rotation;
      params = { ...params, ...(pl.params ?? {}) };
    } else if (sel) {
      const c = sel.box.getCenter(new THREE.Vector3());
      position = [c.x, c.y, sel.box.max.z];
    } else {
      position = besideAll(parts, new THREE.Vector3(40, 40, 0));
    }
    const next = [...parts];
    const solidBody = sel ? sel.body : nextBody(next);
    const above = sel ? bodyAbove(parts, sel.box, sel.body) : null;
    // The upper hinge leaf shouldn't stick out above a thin lid.
    if (above !== null && params.hB !== undefined) {
      const ab = bodyBox(parts, above);
      params = { ...params, hB: Math.max(2, Math.min(Number(params.hB), Math.round((ab.max.z - ab.min.z) * 10) / 10)) };
    }
    const count = parts.filter((p) => p.type === type && p.params.piece === def.pieces![0].value).length + 1;
    let firstId = '';
    for (const piece of def.pieces!) {
      let body: number;
      if (piece.body === 'sel') body = solidBody;
      else if (piece.body === 'above' && above !== null) body = above;
      else body = Math.max(nextBody(next), solidBody + 1);
      const part = makePart(type, next, {
        name: `${def.label} ${count}: ${piece.label}`,
        params: { ...params, piece: piece.value },
        position: r3(position),
        rotation,
        hole: piece.hole,
        color: piece.hole ? HOLE_COLOR : PALETTE[(next.length + 1) % PALETTE.length],
        body,
        link,
        rigid: link,
      });
      // A fitting's own solids are separate bodies; its hole must not move into them.
      if (piece.hole && def.pieces!.some((q) => !q.hole && q.body !== 'sel')) part.avoidBody = solidBody;
      if (!firstId) firstId = part.id;
      next.push(part);
    }
    if (!sel) {
      // Standing alone: lift the whole set so it rests on the bed.
      const added = next.slice(parts.length);
      const box = new THREE.Box3();
      added.forEach((p) => box.union(worldBox(p)));
      added.forEach((p) => (p.position = r3([p.position[0], p.position[1], p.position[2] - box.min.z])));
    }
    commit(next, { selectedId: firstId, fitRequest: get().fitRequest + (sel ? 0 : 1) });
    if (def.pieces!.some((p) => p.body === 'above' && !p.hole) && sel && above === null)
      get().notify('Skrzydełko B jest osobną bryłą. Jeśli na zaznaczonym elemencie leży pokrywa, zaznacz dolną część i dodaj zawias jeszcze raz.');
    return firstId;
  };

  /** A flat gasket for a jar box, lying on the bed at x (its left edge). */
  const makeGasket = (box: Part, parts: Part[], x: number) => {
    const dims = gasketDims(box.params);
    return makePart('gasket', parts, {
      name: `Uszczelka do: ${box.name}`,
      params: { ...dims, T: 1.5 },
      position: [round(x + dims.OD / 2), round(box.position[1]), 0],
      fitTo: box.id,
      color: '#3d4148',
    });
  };

  const pushRight = (parts: Part[], part: Part) => {
    const size = built(part).box.getSize(new THREE.Vector3());
    part.position = besideAll(parts, size);
  };

  /**
   * Pockets in a lid mirroring the box pockets at (x, y) around the box centre (cx, cy).
   * A lid lying on the box gets them in its underside; a lid elsewhere is treated as printed
   * the usual way (flipped onto the box), so they are mirrored across X. Lids with a rim get
   * notches where the rim would hit a column. Returns the lid, possibly thickened.
   */
  const lidPockets = (
    next: Part[],
    lid: LidRef,
    spots: { x: number; y: number; s: [number, number]; set: string; notch?: number; ring?: { i: number; n: number } }[],
    c: [number, number],
    size: string,
    hidden: boolean,
    link: string,
  ) => {
    const { depth } = magnetDims(size);
    const need = depth + (hidden ? MAGNET_COVER : 0) + 1; // 1 mm of plastic left on the outer face
    let part = next.find((p) => p.id === lid.part.id)!;
    const T = Number(part.params.T);
    let thickened = false;
    if (Number.isFinite(T) && (part.type === 'lid' || part.type === 'slab' || part.type === 'plate') && T < need) {
      part = { ...part, params: { ...part.params, T: Math.ceil(need * 5) / 5 } };
      next.splice(next.indexOf(next.find((p) => p.id === part.id)!), 1, part);
      thickened = true;
    }
    const pats: Record<string, string> = {};
    const lb = worldBox(part);
    const m = partMatrix(part.position, part.rotation);
    const lc = new THREE.Vector3(0, 0, 0).applyMatrix4(m);
    const R = Number(part.params.R) || 0;
    const t = Number(part.params.T) || 0;
    spots.forEach((sp, k) => {
      let pos: Vec3, rotation: Vec3, s: [number, number], center: [number, number];
      if (lid.resting) {
        pos = [sp.x, sp.y, lb.min.z + (hidden ? MAGNET_COVER : 0)];
        rotation = [0, 0, 0];
        s = sp.s;
        center = c;
      } else {
        // Plate top (z = T in the lid's own frame) is the side that touches the box.
        const local = new THREE.Vector3(sp.x - c[0], -(sp.y - c[1]), t - depth - (hidden ? MAGNET_COVER : 0)).applyMatrix4(m);
        pos = [local.x, local.y, local.z];
        rotation = [...part.rotation];
        s = [sp.s[0], -sp.s[1]];
        center = [lc.x, lc.y];
        if (sp.notch && R > 0 && part.type === 'lid') {
          const nl = new THREE.Vector3(sp.x - c[0], -(sp.y - c[1]), t - 0.01).applyMatrix4(m);
          next.push(
            makePart('holeBox', next, {
              name: `Wcięcie w rancie ${k + 1}`,
              params: { W: sp.notch, D: sp.notch, H: R + 1, luz: 0 },
              position: r3([nl.x, nl.y, nl.z]),
              rotation: [...part.rotation],
              body: part.body,
            }),
          );
        }
      }
      const id = (pats[sp.set] ??= uid());
      const p3 = r3(pos);
      next.push(
        makePart('magnet', next, {
          name: `Magnes w pokrywce ${k + 1}${hidden ? ' (ukryty)' : ''}`,
          params: { size, luz: MAGNET_LUZ },
          position: p3,
          rotation,
          body: part.body,
          link,
          // A ring seen from the other side runs the other way round.
          pattern: sp.ring
            ? { id, kind: 'circle', i: lid.resting ? sp.ring.i : (sp.ring.n - sp.ring.i) % sp.ring.n, n: sp.ring.n, s: [1, 1], c: [round(center[0] - p3[0]), round(center[1] - p3[1])] }
            : { id, kind: 'sym', i: k, n: spots.length, s, c: [round(center[0] - p3[0]), round(center[1] - p3[1])] },
        }),
      );
    });
    return { lid: part, thickened };
  };

  const initial = loadSaved();

  return {
    tab: 'tech',
    stash: { tech: { parts: [], past: [], future: [], selectedId: null }, fig: { parts: initial.fig, past: [], future: [], selectedId: null } },
    parts: initial.tech,
    selectedId: null,
    hoveredId: null,
    past: [],
    future: [],
    settings: { grid: 1, snap: true, stick: true, minWall: 0.8 },
    preview: false,
    snapTargets: [],
    cutPlane: null,
    setCutPlane: (c) => set({ cutPlane: c }),
    toast: null,
    fitRequest: 0,
    check: null,
    measure: false,
    measureHover: null,
    recent: loadRecent(),
    suggest: null,
    dismissSuggest: () => set({ suggest: null }),

    wizard: null,
    openWizard: (wizard) => set({ wizard }),
    manual: false,
    setManual: (manual) => set({ manual }),

    applyWizard(id, values, run) {
      const wz = WIZARDS[id];
      if (!wz) return;
      const plan = wz.plan(values);
      let parts = get().parts;
      let origin: Vec3;
      if (run) {
        origin = parts.find((p) => p.wiz?.run === run && p.wiz.recipe)?.wiz?.recipe?.origin ?? [0, 0, 0];
        parts = parts.filter((p) => p.wiz?.run !== run);
      } else origin = parts.length ? [besideAll(parts, new THREE.Vector3(40, 0, 0))[0], 0, 0] : [round(-plan.size[0] / 2), round(-plan.size[1] / 2), 0];
      const tag = run ?? uid();
      const next = [...parts];
      const links: Record<string, string> = {};
      const byRole = new Map(plan.items.map((it) => [it.role, it]));
      if (plan.parts) {
        // Ready parts from the wizard's scratch scene: fresh ids and bodies, references carried over.
        const ids = new Map(plan.parts.map((p) => [p.id, uid()]));
        const bodies = new Map<number, number>();
        const keys = new Map<string, string>();
        const fresh = (k?: string) => (k ? (keys.get(k) ?? (keys.set(k, uid()), keys.get(k)!)) : undefined);
        let nb = nextBody(next);
        for (const p of plan.parts) if (!bodies.has(p.body)) bodies.set(p.body, nb++);
        for (const p of plan.parts)
          next.push({
            ...p,
            id: ids.get(p.id)!,
            name: p.wiz?.role && !p.hole ? `${p.wiz.role} ${p.name}` : p.name,
            body: bodies.get(p.body)!,
            avoidBody: p.avoidBody !== undefined ? bodies.get(p.avoidBody) : undefined,
            position: r3([p.position[0] + origin[0], p.position[1] + origin[1], p.position[2] + origin[2]]),
            fitTo: p.fitTo ? ids.get(p.fitTo) : undefined,
            gearMate: p.gearMate ? { ...p.gearMate, of: ids.get(p.gearMate.of) ?? p.gearMate.of } : undefined,
            armOf: p.armOf ? { ...p.armOf, of: ids.get(p.armOf.of) ?? p.armOf.of } : undefined,
            link: fresh(p.link),
            rigid: fresh(p.rigid),
            pattern: p.pattern ? { ...p.pattern, id: fresh(p.pattern.id)! } : undefined,
            wiz: { run: tag, w: id, role: p.wiz?.role ?? '', recipe: { values, origin } },
          });
      }
      for (const pl of plan.placements) {
        const it = byRole.get(pl.role)!;
        next.push(
          makePart(it.type, next, {
            name: `${it.role} ${it.name}`,
            params: { ...it.params },
            position: r3([pl.position[0] + origin[0], pl.position[1] + origin[1], pl.position[2] + origin[2]]),
            rotation: pl.rotation,
            color: it.color,
            // Copies of one item stay linked: change one N1 and all corners follow.
            link: (links[it.role] ??= uid()),
            wiz: { run: tag, w: id, role: it.role, recipe: { values, origin } },
          }),
        );
      }
      commit(next, { selectedId: null, fitRequest: get().fitRequest + 1, wizard: null, suggest: null });
      const n = plan.parts ? new Set(plan.parts.map((p) => p.body)).size : plan.placements.length;
      get().notify(`${run ? 'Zaktualizowano' : 'Utworzono'} „${wz.label}”: ${n} ${n === 1 ? 'element' : few(n) ? 'elementy' : 'elementów'}. Zaznacz dowolny i kliknij „Edytuj w kreatorze”, żeby zmienić odpowiedzi.`);
    },
    pins: [],
    fit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
    setMeasure: (on) => set({ measure: on, measureHover: null, pins: on ? get().pins : [], preview: false }),
    setMeasureHover: (f) => {
      const cur = get().measureHover;
      if (cur === f || (cur && f && cur.label === f.label && cur.pick === f.pick && cur.x === f.x && cur.y === f.y)) return;
      set({ measureHover: f });
    },
    addPin: (f) => set((s) => ({ pins: [...s.pins, f] })),
    // Removes the measurement (pair of pins) that pin i belongs to.
    removePin: (i) => set((s) => ({ pins: s.pins.filter((_, k) => Math.floor(k / 2) !== Math.floor(i / 2)) })),
    clearPins: () => set({ pins: [] }),

    setTab(tab) {
      const s = get();
      if (tab === s.tab) return;
      const other = s.stash[tab];
      set({
        tab,
        stash: { ...s.stash, [s.tab]: { parts: s.parts, past: s.past, future: s.future, selectedId: s.selectedId } },
        parts: other.parts,
        past: other.past,
        future: other.future,
        selectedId: other.selectedId,
        hoveredId: null,
        check: null,
        preview: false,
        fitRequest: s.fitRequest + 1,
      });
    },

    select: (id) => set((s) => ({ selectedId: id, multi: [], faceSel: s.faceSel && s.faceSel.id === id ? s.faceSel : null, sketchSel: s.sketchSel && s.sketchSel.id === id ? s.sketchSel : null, suggest: s.suggest && s.suggest.id === id ? s.suggest : null })),
    setHover: (id) => {
      if (get().hoveredId !== id) set({ hoveredId: id });
    },

    add(type, overrides = {}) {
      const def = DEFS[type];
      if (def.pieces) return addPieces(type, overrides);
      const { parts } = get();
      const sel = selection();
      const part = makePart(type, parts, overrides);
      if (!overrides.position) {
        const local = built(part).box;
        const size = local.getSize(new THREE.Vector3());
        if (sel) {
          // Build onto the selection: centred on its top face, holes drilled in from the top.
          const c = sel.box.getCenter(new THREE.Vector3());
          part.position = [round(c.x), round(c.y), round(part.hole ? sel.box.max.z - size.z - local.min.z : sel.box.max.z - local.min.z)];
          if (overrides.body === undefined) part.body = sel.body;
        } else if (parts.length) pushRight(parts, part);
      }
      commit([...parts, part], { selectedId: part.id, fitRequest: get().fitRequest + (sel ? 0 : 1) });
      if (sel && inCorner(get().parts, get().parts.find((p) => p.id === part.id)!)) set({ suggest: { id: part.id } });
      return part.id;
    },

    addFigurine(model) {
      const { parts } = get();
      const params = figurineParams(model);
      let fig;
      try {
        fig = figurine(params);
      } catch {
        get().notify('Nie udało się zbudować tej figurki.');
        return;
      }
      const link = uid();
      const next = [...parts];
      const n = parts.filter((p) => p.type === 'figurine' && p.params.model === model && Number(p.params.piece) === 0).length + 1;
      const position: Vec3 = parts.length ? besideAll(parts, new THREE.Vector3(fig.size.w, 0, 0)) : [0, 0, 0];
      let first = '';
      fig.pieces.forEach((piece, i) => {
        const part = makePart('figurine', next, {
          name: `${FIG_MODELS[model].n} ${n}: ${piece.name}`,
          params: { ...params, piece: i },
          position,
          color: FIG_PALETTE[(n - 1 + i) % FIG_PALETTE.length],
          link,
          rigid: link,
        });
        if (!first) first = part.id;
        next.push(part);
      });
      commit(next, { selectedId: first, fitRequest: get().fitRequest + 1 });
    },

    update(id, patch) {
      commit(applyPatch(get().parts, id, patch));
      // A picked face no longer sits where it was drawn.
      const fs = get().faceSel;
      if (fs && fs.id === id && (patch.position || patch.rotation || patch.params)) set({ faceSel: { ...fs, tris: [] } });
      if (patch.position && !patch.rotation) get().afterMove(id);
      const p = get().parts.find((x) => x.id === id);
      if (patch.params && p && !p.params.piece && p.type !== 'figurine') {
        const recent = { ...get().recent, [p.type]: p.params };
        set({ recent });
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
        } catch {
          /* storage unavailable */
        }
      }
    },

    updateLive(id, patch) {
      set((s) => ({ parts: applyPatch(s.parts, id, patch) }));
    },

    moveManyLive(start, delta) {
      set((s) => ({
        parts: s.parts.map((p) => (start[p.id] ? { ...p, position: r3([start[p.id][0] + delta[0], start[p.id][1] + delta[1], start[p.id][2] + delta[2]]) } : p)),
      }));
    },

    beginGesture() {
      set((s) => ({ past: [...s.past.slice(-99), s.parts], future: [] }));
    },

    remove(id) {
      const { parts } = get();
      const p = parts.find((x) => x.id === id);
      if (!p) return;
      if (isLocked(parts, id)) return get().notify('Ten element jest zablokowany. Odblokuj go (🔒 na liście), żeby usunąć.');
      const gone = new Set(mates(parts, p).map((x) => x.id));
      commit(
        parts.filter((x) => !gone.has(x.id)),
        { selectedId: null },
      );
    },

    duplicate(id) {
      const { parts } = get();
      const src = parts.find((p) => p.id === id);
      if (!src) return;
      const group = mates(parts, src);
      const box = new THREE.Box3();
      group.forEach((p) => box.union(worldBox(p)));
      const w = box.getSize(new THREE.Vector3()).x;
      const next = [...parts];
      // A plain copy stays linked to its original (edit one, all follow); fitting pieces get their own set.
      const link = src.rigid ? uid() : (src.link ?? uid());
      let firstId = '';
      let solidBody = 0;
      for (const p of group) {
        const copy: Part = {
          ...p,
          id: uid(),
          name: `${p.name} (kopia)`,
          params: { ...p.params },
          position: [round(p.position[0] + w + 5), p.position[1], p.position[2]],
          body: p.hole ? p.body : src.rigid ? nextBody(next) : (solidBody ||= nextBody(next)),
          link,
          rigid: p.rigid ? link : undefined,
          pattern: undefined,
          armOf: undefined,
          wiz: undefined,
        };
        if (!firstId) firstId = copy.id;
        next.push(copy);
      }
      commit(
        src.rigid ? next : next.map((p) => (p.id === src.id ? { ...p, link } : p)),
        { selectedId: firstId },
      );
    },

    rotateBy(id, axis, degrees) {
      const { parts } = get();
      const p = parts.find((x) => x.id === id);
      if (!p) return;
      const minZ = worldBox(p).min.z;
      const rotation = rotationAfter(p.rotation, AXES[axis], degrees);
      // Keep the part resting at the same height so rotating doesn't sink it into the bed.
      const nb = worldBox(p, p.position, rotation);
      const position: Vec3 = [p.position[0], p.position[1], round(p.position[2] + minZ - nb.min.z)];
      get().update(id, { rotation, position });
    },

    dropToFloor(id) {
      const { parts } = get();
      const p = parts.find((x) => x.id === id);
      if (!p) return;
      const box = new THREE.Box3();
      mates(parts, p).forEach((m) => box.union(worldBox(m)));
      get().update(id, { position: [p.position[0], p.position[1], round(p.position[2] - box.min.z)] });
    },

    matchingHole(id) {
      const { parts } = get();
      const peg = parts.find((x) => x.id === id);
      if (!peg) return;
      let type = 'hole';
      let params: Params = { D: Number(peg.params.D), H: Number(peg.params.H) + 0.5, luz: 0.3 };
      if (peg.type === 'pegSquare') {
        type = 'holeBox';
        params = { W: Number(peg.params.W), D: Number(peg.params.W), H: Number(peg.params.H) + 0.5, luz: 0.3 };
      } else if (peg.type === 'dovetail') {
        type = 'dovetailSlot';
        params = { ...peg.params, luz: 0.3 };
      }
      const hole = makePart(type, parts, {
        name: `Gniazdo do: ${peg.name}`,
        params,
        position: [...peg.position],
        rotation: [...peg.rotation],
      });
      hole.avoidBody = peg.body;
      const target = bestBodyFor(hole, parts, peg.body);
      if (target !== null) hole.body = target;
      commit([...parts, hole], { selectedId: hole.id });
      get().notify(
        target === null
          ? 'Gniazdo gotowe. Postaw drugą część na czopie, a gniazdo wytnie się w niej samo.'
          : `Gniazdo wycięte w bryle ${target} (luz 0,3 mm).`,
      );
    },

    matingGear(id, kind) {
      const { parts } = get();
      const src = parts.find((x) => x.id === id);
      if (!src) return;
      const p = src.params;
      const shared = { m: p.m, fit: p.fit };
      const flip = p.hand === 'left' ? 'right' : 'left';
      let made: Part | null = null;
      if (kind === 'gear' && (src.type === 'gear' || src.type === 'rack')) {
        const kindOf = src.type === 'gear' ? p.kind : 'spur';
        made = makePart('gear', parts, { params: { ...shared, z: src.type === 'gear' ? p.z : 20, h: p.h, kind: kindOf, beta: p.beta ?? 20, hand: flip, boreT: p.boreT ?? 'round', bore: p.bore ?? 5 } });
      } else if (kind === 'rack' && src.type === 'gear') {
        made = makePart('rack', parts, { params: { ...shared, n: Math.max(10, Math.round(Number(p.z))), h: p.h } });
      } else if (kind === 'bevel' && src.type === 'bevelGear') {
        made = makePart('bevelGear', parts, { params: { ...shared, z: p.zMate, zMate: p.z, b: p.b, back: p.back, boreT: p.boreT, bore: p.bore } });
      } else if (kind === 'wheel' && src.type === 'worm') {
        made = makePart('wormWheel', parts, { params: { ...shared, z: 30, h: Math.max(4, Math.round(Number(p.dw) * 0.6)), dw: p.dw, starts: p.starts, hand: p.hand } });
      } else if (kind === 'worm' && src.type === 'wormWheel') {
        made = makePart('worm', parts, { params: { ...shared, dw: p.dw, starts: p.starts, hand: p.hand, L: Math.max(10, Math.round(Number(p.dw) * 1.6)) } });
      }
      if (!made) return;
      made.name = `${made.name} (para do: ${src.name})`;
      made.gearMate = { of: src.id, angle: 0 };
      commit(placeMates([...parts, made]), { selectedId: made.id });
      get().notify('Pasująca część stoi tam, gdzie zęby się zazębiają. Zmieniasz liczbę zębów, a para sama się rozsuwa; przesunięcie jej ręcznie odpina ją.');
    },

    matchingPipes(id) {
      const parts = get().parts.filter((p) => p.armOf?.of !== id);
      const fit = parts.find((p) => p.id === id);
      if (!isFitting(fit)) return;
      const square = fit!.type === 'profileFitting';
      const geo = fittingGeo(fit!.params, square);
      const want = pipeFor(fit!, geo);
      const next = [...parts];
      const len = Math.max(40, Math.round(geo.depth * 2 + 20));
      const seated = geo.end !== 'male' && geo.end !== 'female';
      let holes = 0, clips = 0;
      geo.dirs.forEach((_, i) => {
        const body = nextBody(next);
        const pipe = makePart(want.type, next, {
          name: `${want.type === 'pipeFitting' ? 'Złączka' : square ? 'Profil' : 'Rura'} ${i + 1} do: ${fit!.name}`,
          body,
          params: { ...want.params, ...(want.type === 'rhs' ? { L: len } : want.type === 'tube' ? { H: len } : want.type === 'pipeEnd' ? { L: len } : {}) },
          armOf: { of: id, i, role: 'pipe', k: 0 },
        });
        next.push(pipe);
        if (!seated) return;
        const add = (role: 'screw' | 'pin', k: number) => {
          next.push(makePart('hole', next, { name: `${role === 'pin' ? 'Otwór na bolec' : 'Otwór na śrubę'} ${i + 1}.${k + 1}`, body, avoidBody: fit!.body, armOf: { of: id, i, role, k } }));
          holes++;
        };
        if (geo.end === 'pin') {
          pinSpots(geo, fit!.params).angles.forEach((_, k) => add('pin', k));
          next.push(makePart('springClip', next, { name: `Zatrzask ${i + 1} do: ${fit!.name}`, armOf: { of: id, i, role: 'clip', k: 0 } }));
          clips++;
        } else if (geo.screw) screwSpots(geo, fit!.params).angles.forEach((_, k) => add('screw', k));
      });
      commit(placeArmMates(next), { selectedId: id });
      if (fit!.params.oring === 'yes' && !parts.some((p) => p.type === 'oringPart' && p.name.endsWith(`do: ${fit!.name}`))) get().addOrings(id);
      const what = [
        holes ? `${holes} ${holes === 1 ? 'otwór' : holes < 5 ? 'otwory' : 'otworów'} w rurach` : '',
        clips ? `${clips} ${clips === 1 ? 'zatrzask' : clips < 5 ? 'zatrzaski' : 'zatrzasków'} sprężynowe` : '',
      ].filter(Boolean);
      get().notify(
        !seated
          ? geo.end === 'male'
            ? 'Do gwintów zewnętrznych dodałem złączki z gwintem wewnętrznym, czekają przed ramionami.'
            : 'Rury z gwintem zewnętrznym czekają przed ramionami: wkręć je.'
          : `Rury stoją w ramionach${what.length ? ', dodałem ' + what.join(' i ') : ''}. Idą za łącznikiem; położenie śrub i bolców zmieniasz w łączniku. Przesunięta ręcznie rura odpina się.`,
      );
    },

    addOrings(id) {
      const { parts } = get();
      const src = parts.find((p) => p.id === id);
      if (!src) return;
      const rings: { ID: number; CS: number }[] = [];
      if (src.type === 'oring') rings.push({ ID: Number(src.params.ID), CS: Number(src.params.CS) });
      else if (isFitting(src)) {
        const geo = fittingGeo(src.params, src.type === 'profileFitting');
        geo.dirs.forEach((_, i) => {
          const r = oringFor(geo, src.params, i);
          if (r) rings.push({ ID: r.ID, CS: r.CS });
        });
      }
      if (!rings.length) return get().notify('Ten łącznik nie ma rowka na o-ring. Włącz „Uszczelka o-ring” w Wymiarach.');
      const next = [...parts];
      // Same size: linked copies (edit one, all follow).
      const links: Record<string, string> = {};
      for (const r of rings) {
        const o = makePart('oringPart', next, { name: `O-ring ${r.ID}×${r.CS} do: ${src.name}`, params: { ID: r.ID, CS: r.CS, section: 'square' }, link: (links[`${r.ID}/${r.CS}`] ??= uid()) });
        pushRight(next, o);
        next.push(o);
      }
      commit(next);
      get().notify(`Dodałem ${rings.length === 1 ? 'o-ring' : rings.length + ' o-ringi'} do druku z TPU (85A–95A), obok modelu. Kupny o-ring o tych wymiarach też pasuje.`);
    },

    matchingBolt(id) {
      const { parts } = get();
      const src = parts.find((x) => x.id === id);
      if (!src) return;
      const depth = Number(src.params.H) || 12;
      const bolt = makePart('bolt', parts, {
        name: `Śruba do: ${src.name}`,
        params: { size: src.params.size, D: src.params.D, P: src.params.P, L: src.type === 'threadHole' ? Math.max(3, depth - 1) : Math.max(10, depth + 8), head: 'hex', bore: 0, fit: 'normal', luz: 0.1, hand: src.params.hand ?? 'right' },
      });
      pushRight(parts, bolt);
      commit([...parts, bolt], { selectedId: bolt.id, fitRequest: get().fitRequest + 1 });
      get().notify('Dodano pasującą śrubę jako osobną bryłę obok modelu.');
    },

    matchingNut(id) {
      const { parts } = get();
      const src = parts.find((x) => x.id === id);
      if (!src) return;
      const nut = makePart('threadNut', parts, { name: `Nakrętka do: ${src.name}`, params: { size: src.params.size, D: src.params.D, P: src.params.P, H: 0, shape: 'hex', fit: 'normal', luz: 0.2, hand: src.params.hand ?? 'right' } });
      pushRight(parts, nut);
      commit([...parts, nut], { selectedId: nut.id, fitRequest: get().fitRequest + 1 });
      get().notify('Dodano pasującą nakrętkę jako osobną bryłę obok modelu.');
    },

    matchingThreadHole(id) {
      const { parts } = get();
      const bolt = parts.find((x) => x.id === id);
      if (!bolt) return;
      const headH = bolt.params.head === 'none' ? 0 : built(bolt).box.max.z - Number(bolt.params.L);
      const local = new THREE.Vector3(0, 0, Math.max(0, headH)).applyMatrix4(partMatrix(bolt.position, bolt.rotation));
      const hole = makePart('threadHole', parts, {
        name: `Gwint do: ${bolt.name}`,
        params: { size: bolt.params.size, D: bolt.params.D, P: bolt.params.P, H: Number(bolt.params.L), fit: 'normal', luz: 0.2, chamfer: true, hand: bolt.params.hand ?? 'right' },
        position: r3([local.x, local.y, local.z]),
        rotation: [...bolt.rotation],
      });
      hole.avoidBody = bolt.body;
      const target = bestBodyFor(hole, parts, bolt.body);
      if (target !== null) hole.body = target;
      commit([...parts, hole], { selectedId: hole.id });
      get().notify(target === null ? 'Otwór gwintowany gotowy. Przesuń go w bryłę, w której ma być gwint.' : `Gwint wycięty w bryle ${target}.`);
    },

    addDrawers(id) {
      const { parts } = get();
      const cab = parts.find((x) => x.id === id);
      if (!cab) return;
      const o = cabinetOpenings(cab.params);
      const c = 0.3;
      const w = Number(cab.params.w), h = Number(cab.params.h);
      const D = o.depth - 0.5;
      const mat = partMatrix(cab.position, cab.rotation);
      const next = [...parts];
      const link = uid();
      for (const op of o.openings) {
        const local = new THREE.Vector3(op.cx, -o.D / 2 + D / 2, op.z0 + c).applyMatrix4(mat);
        next.push(
          makePart('drawer', next, {
            params: { ...defaultParams(DEFS.drawer), W: round(w - 2 * c, 2), H: round(h - 2 * c, 2), D: round(D, 2), catch: cab.params.catch ?? 'none' },
            position: [round(local.x), round(local.y), round(local.z)],
            rotation: [...cab.rotation],
            link,
          }),
        );
      }
      commit(next);
      get().notify(`Dodano ${o.openings.length} szuflad z luzem 0,3 mm. Są powiązane: zmiana jednej zmienia wszystkie.`);
    },

    addLid(id) {
      const { parts } = get();
      const box = parts.find((x) => x.id === id);
      if (!box) return;
      const b = worldBox(box);
      const slide = !!box.params.slide;
      const lid = makePart(slide ? 'slab' : 'lid', parts, {
        ...(slide ? { name: `Wsuwana pokrywka do: ${box.name}` } : {}),
        fitTo: box.id,
        params: slide ? {} : { ...defaultParams(DEFS.lid) },
      });
      lid.params = { ...lid.params, ...lidParams(box, lid) };
      lid.position = [round(b.max.x + 10 + Number(lid.params.W) / 2), round(box.position[1]), 0];
      const added = [lid];
      if (isJar(box.params) && !parts.some((p) => p.type === 'gasket' && p.fitTo === box.id)) added.push(makeGasket(box, [...parts, lid], b.max.x + 20 + Number(lid.params.W)));
      commit([...parts, ...added], { selectedId: lid.id });
      if (isJar(box.params)) get().notify('Zakręcana pokrywka i płaska uszczelka. Pokrywkę drukuj wierzchem do stołu, uszczelkę z TPU (albo wytnij z gumy). Włóż ją do pokrywki pod gwint.');
      if (slide) get().notify('Pudełko ma rowki, więc pokrywka jest wsuwana: wsuwa się od przodu (luz 0,3 mm na stronę).');
      // Pockets placed by hand in the box: check them now that a lid is coming and offer fixes.
      const issues = magnetIssues(get().parts).filter((i) => i.fix);
      if (issues.length) set({ check: { issues, bodies: 0, title: 'Gniazda na magnesy' } });
    },

    unfitLid(id) {
      commit(get().parts.map((p) => (p.id === id ? { ...p, fitTo: undefined } : p)));
      get().notify('Pokrywka odłączona: jej wymiary nie zmieniają się już razem z pudełkiem.');
    },

    makeJar(id) {
      const box = get().parts.find((p) => p.id === id);
      if (!box || box.params.shape !== 'round') return;
      if (!box.params.screw) get().update(id, { params: { ...box.params, screw: true } });
      const lid = get().parts.find((p) => p.type === 'lid' && p.fitTo === id);
      if (!lid) return get().addLid(id);
      get().addGasket(id);
      get().notify('Pudełko ma gwint, pokrywka stała się zakręcana. Dodałem płaską uszczelkę (TPU).');
    },

    addGasket(id) {
      const { parts } = get();
      const box = parts.find((p) => p.id === id);
      if (!box || !isJar(box.params) || parts.some((p) => p.type === 'gasket' && p.fitTo === id)) return;
      const g = makeGasket(box, parts, 0);
      pushRight(parts, g);
      commit([...parts, g], { selectedId: g.id });
    },

    addFaceMagnets(body, opt) {
      const { parts } = get();
      const [res] = buildBodies(parts, [body]);
      if (!res) return;
      const bb = finishedBox(parts, body);
      const { r, depth } = magnetDims(opt.size);
      const axis = opt.face === 'top' || opt.face === 'bottom' ? 2 : opt.face === 'left' || opt.face === 'right' ? 0 : 1;
      const plus = opt.face === 'top' || opt.face === 'right' || opt.face === 'back';
      // The face's two in-plane axes and its extent there.
      const [ua, va] = axis === 2 ? [0, 1] : axis === 0 ? [1, 2] : [0, 2];
      const lo = (a: number) => bb.min.getComponent(a), hi = (a: number) => bb.max.getComponent(a);
      const m = Math.max(opt.margin, MAGNET_WALL) + r;
      const cu = (lo(ua) + hi(ua)) / 2, cv = (lo(va) + hi(va)) / 2;
      const su = Math.max(0, (hi(ua) - lo(ua)) / 2 - m), sv = Math.max(0, (hi(va) - lo(va)) / 2 - m);
      let uv: [number, number][];
      if (opt.layout === 'center') uv = [[cu, cv]];
      else if (opt.layout === 'corners') uv = su > 0 && sv > 0 ? [[cu - su, cv - sv], [cu + su, cv - sv], [cu - su, cv + sv], [cu + su, cv + sv]] : [[cu, cv]];
      else {
        const n = Math.max(2, Math.round(opt.n));
        const alongU = hi(ua) - lo(ua) >= hi(va) - lo(va);
        const s = alongU ? su : sv;
        uv = Array.from({ length: n }, (_, i) => {
          const t = -s + (2 * s * i) / (n - 1);
          return alongU ? [cu + t, cv] : [cu, cv + t];
        });
      }
      const rotation: Vec3 =
        opt.face === 'top' ? [0, 0, 0] : opt.face === 'bottom' ? [180, 0, 0] : opt.face === 'right' ? [0, 90, 0] : opt.face === 'left' ? [0, -90, 0] : opt.face === 'back' ? [-90, 0, 0] : [90, 0, 0];
      const surf = plus ? hi(axis) : lo(axis);
      const inward = (plus ? -1 : 1) * (depth - 0.01);
      const link = uid();
      const next = [...parts];
      let skipped = 0, k = 0;
      for (const [u, v] of uv) {
        const pos: [number, number, number] = [0, 0, 0];
        pos[ua] = u;
        pos[va] = v;
        pos[axis] = surf + inward;
        const pocket = makePart('magnet', next, { name: `Magnes ${k + 1}`, params: { size: opt.size, luz: MAGNET_LUZ }, position: r3(pos), rotation, body, link });
        // Only where the pocket and a wall around it sit in material (a sphere or a figurine is not a box).
        const wall = worldManifold({ ...pocket, params: { ...pocket.params, luz: MAGNET_LUZ + 2 * MAGNET_WALL } });
        const inside = wall.subtract(res.manifold);
        const ok = inside.volume() < wall.volume() * 0.12;
        wall.delete();
        inside.delete();
        if (!ok) {
          skipped++;
          continue;
        }
        k++;
        next.push(pocket);
      }
      if (!k) return get().notify('Tu nie zmieści się gniazdo: ścianka jest za mała albo za cienka na ten magnes. Wybierz mniejszy magnes albo inną ściankę.');
      commit(next, { selectedId: groupId(body) });
      get().notify(`Dodano ${k} ${few(k) ? 'gniazda' : k === 1 ? 'gniazdo' : 'gniazd'} na magnesy ${opt.size.replace('x', '×')} mm (głębokość ${String(round(depth, 2)).replace('.', ',')} mm).${skipped ? ` ${skipped} pominięte, bo wypadały poza materiał.` : ''} Bieguny: przed wklejeniem złóż magnesy parami.`);
    },

    addMagnets(id, opt) {
      const { parts } = get();
      let body: number | null = groupBody(id);
      let lid: LidRef | null = null;
      const part = parts.find((p) => p.id === id);
      if (body === null && part) {
        if (part.type === 'lid') {
          body = boxForLid(parts, part);
          lid = { part, resting: false };
          if (body === null) return get().notify('Nie widzę pudełka do tej pokrywki. Zaznacz pudełko i dodaj magnesy stamtąd.');
        } else body = part.body;
      }
      if (body === null) return;
      const boxPart = parts.find((p) => p.body === body && p.type === 'box');
      const shape = boxPart?.params.shape;
      const ringBox = shape === 'round' || shape === 'hex' ? shape : null;
      const box = bodyBox(parts, body);
      const [res] = buildBodies(parts, [body]);
      if (!res || box.isEmpty()) return;
      // Round and hexagonal boxes get pockets evenly around the rim instead of corners and sides.
      const spots = ringBox ? planRingSpots(res.manifold, box, opt, ringBox, Number(boxPart!.params.W)) : planSpots(res.manifold, box, opt);
      const wall = boxPart ? Number(boxPart.params.T) : wallThickness(res.manifold, box);
      res.geometry.dispose();
      res.manifold.delete();
      lid ??= findLid(parts, body, box);
      const { depth, r } = magnetDims(opt.size);
      const top = box.max.z;
      const c: [number, number] = [round((box.min.x + box.max.x) / 2), round((box.min.y + box.max.y) / 2)];
      const color = parts.find((p) => p.body === body && !p.hole)?.color ?? PALETTE[0];
      const link = uid(), colLink = uid();
      const pats: Record<string, string> = {}, colPats: Record<string, string> = {};
      const next = [...parts];
      let columns = 0;
      const rule = (sp: Spot, pos: Vec3, set: Record<string, string>): PatternRule =>
        sp.ring
          ? { id: (set.ring ??= uid()), kind: 'circle', i: sp.ring.i, n: sp.ring.n, s: [1, 1], c: [round(c[0] - pos[0]), round(c[1] - pos[1])] }
          : { id: (set[sp.set] ??= uid()), kind: 'sym', i: spots.indexOf(sp), n: spots.length, s: sp.s, c: [round(c[0] - pos[0]), round(c[1] - pos[1])] };
      spots.forEach((sp, k) => {
        if (sp.post) {
          const pos: Vec3 = r3([sp.post.cx, sp.post.cy, box.min.z]);
          columns++;
          next.push(makePart('cylinder', next, { name: `Słupek pod magnes ${k + 1}`, params: { D: sp.post.d, H: round(top - box.min.z, 2) }, position: pos, body, color, link: colLink, pattern: rule(sp, pos, colPats) }));
        }
        if (sp.column) {
          const col = sp.column;
          const pos: Vec3 = r3([col.cx, col.cy, box.min.z]);
          columns++;
          next.push(
            makePart('cube', next, {
              name: `Słupek pod magnes ${k + 1}`,
              params: { W: col.w, D: col.d, H: round(top - box.min.z, 2) },
              position: pos,
              body,
              color,
              link: colLink,
              pattern: rule(sp, pos, colPats),
            }),
          );
        }
        const pos = r3([sp.x, sp.y, top - depth - (opt.hidden ? MAGNET_COVER : 0)]);
        next.push(
          makePart('magnet', next, {
            name: `Magnes ${k + 1}${opt.hidden ? ' (ukryty)' : ''}`,
            params: { size: opt.size, luz: MAGNET_LUZ },
            position: pos,
            body,
            link,
            pattern: rule(sp, pos, pats),
          }),
        );
      });
      let lidMsg = '';
      if (!lid && opt.lid !== 'none') {
        const W = round(box.max.x - box.min.x, 2), D = round(box.max.y - box.min.y, 2);
        const made = makePart('lid', next, {
          params: { ...defaultParams(DEFS.lid), W, D, wall, R: opt.lid === 'rim' ? 4 : 0 },
          position: [round(box.max.x + 10 + W / 2), c[1], 0],
        });
        // A round or hexagonal box's lid takes its shape and follows it like "Dodaj pasującą pokrywkę".
        if (ringBox && boxPart) {
          made.fitTo = boxPart.id;
          made.params = { ...made.params, ...lidParams(boxPart, made) };
          made.position = [round(box.max.x + 10 + Number(made.params.W) / 2), c[1], 0];
        }
        next.push(made);
        lid = { part: made, resting: false };
        lidMsg = opt.lid === 'rim' ? ' Dodałem pokrywkę z rantem.' : ' Dodałem płaską pokrywkę.';
      }
      let pause = '';
      if (lid) {
        const notch = Math.ceil((2 * (r + MAGNET_WALL) + 0.6) * 5) / 5;
        const out = lidPockets(
          next,
          lid,
          spots.map((sp) => {
            // Distance of the pocket centre from the outer edge it sits at; beyond the wall the lid's rim is in the way.
            const ex = box.max.x - c[0] - Math.abs(sp.x - c[0]), ey = box.max.y - c[1] - Math.abs(sp.y - c[1]);
            const edge = sp.edge ?? (sp.set === 'sideX' ? ex : sp.set === 'sideY' ? ey : Math.min(ex, ey));
            return { ...sp, notch: sp.column || sp.post || edge + r + MAGNET_WALL > wall ? notch : undefined };
          }),
          c,
          opt.size,
          opt.hidden,
          link,
        );
        lidMsg += ` W pokrywce ${spots.length} ${few(spots.length) ? 'lustrzane gniazda' : 'lustrzanych gniazd'}${out.thickened ? `, pogrubiona do ${String(out.lid.params.T).replace('.', ',')} mm, żeby magnes się zmieścił` : ''}.`;
        if (opt.hidden) pause = ` Pauza w druku: pudełko na Z = ${String(round(top - MAGNET_COVER - box.min.z, 2)).replace('.', ',')} mm${lid.resting ? '' : `, pokrywka na Z = ${String(round(Number(out.lid.params.T) - MAGNET_COVER, 2)).replace('.', ',')} mm`}. Wtedy włóż magnesy i wznów druk.`;
      } else if (opt.hidden) pause = ` Pauza w druku na Z = ${String(round(top - MAGNET_COVER - box.min.z, 2)).replace('.', ',')} mm.`;
      commit(next, { selectedId: groupId(body) });
      get().notify(
        `Dodano ${spots.length} ${few(spots.length) ? 'gniazda' : 'gniazd'} na magnesy ${opt.size.replace('x', '×')} mm${columns ? ` i ${columns} ${columns === 1 ? 'słupek' : few(columns) ? 'słupki' : 'słupków'} (ścianka była za cienka)` : ''}.${lidMsg}${pause} Bieguny: przed wklejeniem złóż magnesy pudełka i pokrywki parami.`,
      );
    },

    addVariant(family, variant, size) {
      const def = DEFS[variant.type];
      const base = defaultParams(def);
      let params: Params;
      if (size === 'recent') params = { ...base, ...(get().recent[variant.type] ?? {}), ...(variant.params ?? {}) };
      else {
        const preset = (variant.sizes ?? family.sizes)?.[size];
        if (preset) params = { ...base, ...preset, ...(variant.params ?? {}) };
        else {
          params = { ...base, ...(variant.params ?? {}) };
          for (const d of def.params)
            if (d.type === 'number' && SCALED.includes(d.key) && d.def > 0) params[d.key] = Math.min(d.max, Math.max(d.min, round(d.def * SCALE[size], 1)));
        }
      }
      if (variant.extra === 'pi') return get().addPiCase(variant.board ?? 'pi4');
      const id = get().add(variant.type, { params });
      const part = get().parts.find((p) => p.id === id);
      if (!part) return;
      if (variant.extra === 'lid') {
        get().addLid(id);
        get().select(id);
      } else if (variant.extra === 'drawers') get().addDrawers(id);
      else if (variant.extra === 'hinged') {
        const parts = get().parts;
        const b = worldBox(part);
        const lid = makePart('lid', parts, {
          params: { ...defaultParams(DEFS.lid), W: part.params.W, D: part.params.D, T: 2, wall: part.params.T, R: 0, rad: part.params.rad ?? 0 },
          position: [part.position[0], part.position[1], round(b.max.z + BOX_HINGE_LIFT, 2)],
          fitTo: part.id,
        });
        const next = [...parts, lid];
        const def = DEFS.boxHinge;
        const link = uid();
        const count = parts.filter((p) => p.type === 'boxHinge' && p.params.piece === 'A').length + 1;
        for (const piece of def.pieces!) {
          const body = piece.body === 'sel' ? part.body : lid.body;
          next.push(
            makePart('boxHinge', next, {
              name: `${def.label} ${count}: ${piece.label}`,
              params: { piece: piece.value },
              position: part.position,
              rotation: part.rotation,
              hole: piece.hole,
              color: piece.hole ? HOLE_COLOR : piece.body === 'sel' ? part.color : lid.color,
              body,
              link,
              rigid: link,
              fitTo: part.id,
            }),
          );
        }
        // Shown finished: the hinge's room is cut out right away.
        const shown = next.map((p) => (!p.hole && (p.body === part.body || p.body === lid.body) ? { ...p, merged: true } : p));
        commit(shown, { selectedId: id });
        get().notify('Pudełko z pokrywką na zawiasie schowanym w tylnej ściance. Zawias rośnie i maleje razem z pudełkiem. Pokrywkę drukuj osobno, wierzchem do stołu, i złóż na osi z filamentu 1,75 mm wsuniętej z boku. W ustawieniach zawiasu można wybrać druk w całości (print-in-place).');
      } else if (variant.extra === 'slide') {
        get().addLid(id);
        get().select(id);
        set({ fitRequest: get().fitRequest + 1 });
      }
    },

    connectorToWall(id, side) {
      const { parts } = get();
      const src = parts.find((p) => p.id === id);
      if (!src || src.type !== 'connector') return;
      const set_ = parts.filter((p) => (src.rigid ? p.rigid === src.rigid : p.id === src.id));
      const ids = new Set(set_.map((p) => p.id));
      const host = parts.filter((p) => p.body === src.body && !p.hole && !ids.has(p.id));
      if (!host.length) return get().notify('Najpierw wstaw otwór w pudełko lub płytę (ta sama bryła).');
      const box = new THREE.Box3();
      host.forEach((p) => box.union(worldBox(p)));
      const same = sideOf(src.rotation) === side;
      const pose = wallPose(box, side, largestSolid(parts, src.body, ids), same ? src.position : undefined);
      const params = pose.wall ? { ...src.params, wall: pose.wall } : src.params;
      commit(parts.map((p) => (ids.has(p.id) ? { ...p, position: r3(pose.position), rotation: pose.rotation, params: { ...params, piece: p.params.piece } } : p)));
    },

    splitBody(body, axis, at, dowels) {
      const pins: Part[] = [];
      const r = splitAt(get().parts, body, axis, at, dowels, pins);
      if (!r) return get().notify('Tu nie da się przeciąć: płaszczyzna jest poza bryłą albo za blisko jej brzegu.');
      // The piece beyond the cut moves 10 mm away, so both halves are easy to see and click.
      // An upper half goes onto the bed beside the lower one, cut face down.
      const lower = finishedBox(r.parts, body), upper = finishedBox(r.parts, r.body);
      const d: Vec3 = [0, 0, 0];
      if (axis === 2) {
        d[0] = round(lower.max.x - upper.min.x + 10);
        d[2] = round(lower.min.z - upper.min.z);
      } else d[axis] = 10;
      let next = r.parts.map((p) => (p.body === r.body ? { ...p, position: r3([p.position[0] + d[0], p.position[1] + d[1], p.position[2] + d[2]]) } : p));
      next = addDowelPins(next, pins);
      commit(next, { selectedId: groupId(r.body), cutPlane: null });
      get().notify(`Przecięto bryłę ${body}: druga część to bryła ${r.body}, ${axis === 2 ? 'postawiona obok cięciem do stołu' : 'odsunięta o 10 mm'}.${dowelNote(pins, r.dowel)}`);
    },

    splitToBed(body, bed, dowels) {
      const parts = get().parts;
      const box = finishedBox(parts, body);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3()).toArray();
      const min = box.min.toArray();
      // Even cuts along every axis that does not fit, 2 mm short of the bed for the brim and play.
      const cuts: [0 | 1 | 2, number][] = [];
      ([0, 1, 2] as const).forEach((a) => {
        const n = Math.ceil(size[a] / Math.max(10, bed[a] - 2));
        for (let i = 1; i < n; i++) cuts.push([a, round(min[a] + (size[a] * i) / n, 2)]);
      });
      if (!cuts.length) return get().notify(`Bryła ${body} mieści się na stole (${size.map((v) => Math.round(v)).join(' × ')} mm), nie trzeba jej dzielić.`);
      let next = parts;
      const pins: Part[] = [];
      let pieces = [body];
      let dowel: { d: number; len: number } | null = null;
      for (const [a, at] of cuts) {
        const grown: number[] = [];
        for (const b of pieces) {
          const r = splitAt(next, b, a, at, dowels, pins);
          if (r) {
            next = r.parts;
            grown.push(r.body);
            dowel ??= r.dowel;
          }
        }
        pieces = [...pieces, ...grown];
      }
      // Spread the pieces 10 mm apart per cut, so each one is easy to see and pick. Pieces above a
      // horizontal cut go down onto the bed, in a row of their own beside the model.
      const shift = new Map<number, Vec3>();
      for (const b of pieces) {
        const pb = finishedBox(next, b);
        const c = pb.getCenter(new THREE.Vector3()).toArray();
        const v: Vec3 = [0, 0, 0];
        let level = 0;
        for (const [a, at] of cuts) if (c[a] > at) a === 2 ? level++ : (v[a] += 10);
        if (level) {
          v[0] += level * (size[0] + 10 * cuts.filter((q) => q[0] === 0).length + 20);
          v[2] = round(min[2] - pb.min.z);
        }
        shift.set(b, v);
      }
      next = next.map((p) => {
        const v = shift.get(p.body);
        return v && (v[0] || v[1] || v[2]) ? { ...p, position: r3([p.position[0] + v[0], p.position[1] + v[1], p.position[2] + v[2]]) } : p;
      });
      next = addDowelPins(next, pins);
      commit(next, { selectedId: groupId(body), cutPlane: null });
      get().notify(`Podzielono bryłę ${body} na ${pieces.length} części, każda mieści się na stole ${bed.join(' × ')} mm.${dowelNote(pins, dowel)}`);
    },

    importSTL(name, data) {
      let mesh;
      try {
        mesh = parseSTL(data);
      } catch {
        return get().notify(`„${name}” nie wygląda na plik STL.`);
      }
      const solid = toSolid(mesh);
      if (typeof solid === 'string')
        return get().notify(`„${name}” ma dziurawą albo samoprzecinającą się siatkę, więc nie da się w niej wycinać ani jej łączyć. Napraw ją (np. w slicerze: „Napraw model”) i wczytaj jeszcze raz.`);
      const ref = registerMesh(mesh, solid);
      const b = solid.boundingBox();
      const size = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
      const id = get().add('mesh', { name: name.replace(/\.stl$/i, ''), params: { ref, scale: 100 } });
      const big = Math.max(...size);
      const hint = big < 2 ? ' Jest bardzo mały: może był w metrach albo calach, zmień „Skalę”.' : big > 1000 ? ' Jest bardzo duży: może był w mikronach, zmień „Skalę”.' : '';
      get().select(id);
      get().notify(`Wczytano „${name}”: ${(mesh.tri.length / 3).toLocaleString('pl-PL')} trójkątów, ${size.map((v) => String(Math.round(v * 10) / 10).replace('.', ',')).join(' × ')} mm.${hint}`);
    },

    textToWall(id, side) {
      const { parts } = get();
      const src = parts.find((p) => p.id === id);
      if (!src || (src.type !== 'text' && src.type !== 'textCut')) return;
      const host = parts.filter((p) => p.body === src.body && !p.hole && p.id !== src.id);
      if (!host.length) return get().notify('Napis musi być w tej samej bryle co element: zaznacz element, a potem wstaw napis (albo zmień bryłę napisu w sekcji „Wydruk”).');
      const box = new THREE.Box3();
      host.forEach((p) => box.union(worldBox(p)));
      const pose = wallPose(box, side, largestSolid(parts, src.body, new Set([src.id])));
      // Letters face outward and read upright; a cut label sinks into the face by its depth.
      const turn: Record<WallSide, number> = { front: 0, back: 180, left: -90, right: 90, top: 0, bottom: 0 };
      const rotation = side === 'top' ? ([0, 0, 0] as Vec3) : side === 'bottom' ? ([180, 0, 0] as Vec3) : rotationAfter([90, 0, 0], AXES[2], turn[side]);
      const out: Record<WallSide, Vec3> = { front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 0, 1], bottom: [0, 0, -1] };
      const sink = src.hole ? Number(src.params.depth) || 0 : 0;
      const n = out[side];
      const position = r3([pose.position[0] - n[0] * sink, pose.position[1] - n[1] * sink, pose.position[2] - n[2] * sink]);
      commit(parts.map((p) => (p.id === id ? { ...p, position, rotation } : p)));
    },

    addPiCase(key) {
      const b = BOARDS[key];
      if (!b) return;
      const { parts } = get();
      const c = 1, T = 2, B = 2, sh = 4; // clearance around the board, wall, floor, standoff height
      const W = b.L + 2 * (c + T), D = b.W + 2 * (c + T);
      // Tall enough for the parts on the board, 2 mm of wall above every port and the lid rim.
      const portTop = Math.max(...b.ports.map((q) => q.z + connOpening({ ...defaultParams(DEFS.connector), ...q.params }).h / 2));
      const rim = 3; // the lid rim reaches this far down inside
      const H = Math.ceil(B + sh + b.t + Math.max(b.top + 1.5, portTop + 2) + rim);
      const next = [...parts];
      const body = nextBody(next);
      const box = makePart('box', next, { name: `Obudowa ${b.label}`, body, params: { W, D, H, T, B } });
      box.position = parts.length ? besideAll(parts, new THREE.Vector3(W, D, H)) : [0, 0, 0];
      next.push(box);
      const [cx, cy] = box.position;
      const x0 = cx - b.L / 2, y0 = cy - b.W / 2;
      const top = B + sh + b.t; // board top surface
      const posts = uid(), pilots = uid();
      b.holes.forEach(([hx, hy], i) => {
        const at: Vec3 = r3([x0 + hx, y0 + hy, B - 0.01]);
        next.push(makePart('cylinder', next, { name: `Słupek ${i + 1}`, body, link: posts, color: box.color, position: at, params: { D: b.standoff, H: sh + 0.01 } }));
        next.push(makePart('hole', next, { name: `Otwór pod wkręt ${i + 1}`, body, link: pilots, position: r3([at[0], at[1], B + 0.6]), params: { D: b.pilot, H: sh, luz: 0 } }));
      });
      const wb = worldBox(box);
      for (const port of b.ports) {
        const along: Vec3 = port.edge === 'y0' ? [x0 + port.at, 0, top + port.z] : [0, y0 + port.at, top + port.z];
        const pose = wallPose(wb, EDGE_SIDE[port.edge], box, along);
        next.push(
          makePart('connector', next, {
            name: `${b.label}: ${port.label}`,
            body,
            rigid: uid(),
            hole: true,
            color: HOLE_COLOR,
            position: r3(pose.position),
            rotation: pose.rotation,
            params: { ...port.params, wall: T, piece: 'cut' },
          }),
        );
      }
      if (b.sd) {
        const z = b.sd.side < 0 ? top - b.t - 1.5 : top + 0.8;
        next.push(makePart('holeBox', next, { name: `${b.label}: karta microSD`, body, position: r3([wb.min.x + T / 2, y0 + b.sd.at, z - 1.75]), params: { W: T + 2, D: 13, H: 3.5, luz: 0 } }));
      }
      const lid = makePart('lid', next, { name: `Pokrywka ${b.label}`, fitTo: box.id, params: { ...defaultParams(DEFS.lid), W, D, T: 2, wall: T, R: rim } });
      lid.position = [round(wb.max.x + 10 + W / 2), cy, 0];
      next.push(lid);
      commit(next, { selectedId: box.id, fitRequest: get().fitRequest + 1 });
      get().notify(`${b.label}: pudełko, 4 słupki pod wkręty, otwory na gniazda i pokrywka. Wymiary są typowe, sprawdź je suwmiarką na swojej płytce. ${b.hint}`);
    },

    explode(id) {
      const { parts } = get();
      const src = parts.find((p) => p.id === id);
      if (!src || (src.type !== 'box' && src.type !== 'drawer')) return;
      const p = src.params;
      if (src.type === 'box' && ((p.shape && p.shape !== 'rect') || p.slide)) return get().notify('Na płyty rozbiję tylko prostokątne pudełko bez rowków.');
      const W = Number(p.W), D = Number(p.D), H = Number(p.H), t = Number(p.T), b = Number(p.B);
      const m = partMatrix(src.position, src.rotation);
      const h = H - b;
      // Plates in the part's own frame: [name, width, depth, height, centre x, centre y, bottom z].
      const plates: [string, number, number, number, number, number, number][] = [
        ['Dno', W, D, b, 0, 0, 0],
        ['Ścianka przednia', W, t, h, 0, -D / 2 + t / 2, b],
        ['Ścianka tylna', W, t, h, 0, D / 2 - t / 2, b],
        ['Ścianka lewa', t, D - 2 * t, h, -W / 2 + t / 2, 0, b],
        ['Ścianka prawa', t, D - 2 * t, h, W / 2 - t / 2, 0, b],
      ];
      // Dividers become one plate per segment between crossings, so each compartment wall can go on its own.
      const top = src.type === 'drawer' ? H - 2 : H - (Number(p.low) || 0);
      if (top > b + 0.2) {
        const iw = W - 2 * t, id = D - 2 * t, hd = top - b;
        const segs = gridSegments(layoutOf(p), iw, id);
        const inner = (v: number, lim: number) => Math.abs(Math.abs(v) - lim) > 0.01;
        for (const sg of segs) {
          if (!sg.on) continue;
          const j = Number(sg.key.split(':')[1]);
          if (sg.axis === 'v') {
            // Ends at a crossing reach half into it, ends at a wall stop at its inner face.
            const y0 = sg.a[1] - (inner(sg.a[1], id / 2) ? t / 2 : 0), y1 = sg.b[1] + (inner(sg.b[1], id / 2) ? t / 2 : 0);
            plates.push([`Przegródka wzdłuż ${sg.line + 1}, odcinek ${j + 1}`, t, y1 - y0, hd, sg.a[0], (y0 + y1) / 2, b]);
          } else {
            const x0 = sg.a[0] - (inner(sg.a[0], iw / 2) ? t / 2 : 0), x1 = sg.b[0] + (inner(sg.b[0], iw / 2) ? t / 2 : 0);
            plates.push([`Przegródka w poprzek ${sg.line + 1}, odcinek ${j + 1}`, x1 - x0, t, hd, (x0 + x1) / 2, sg.a[1], b]);
          }
        }
      }
      const next = parts.filter((x) => x.id !== id);
      const at = (x: number, y: number, z: number): Vec3 => {
        const v = new THREE.Vector3(x, y, z).applyMatrix4(m);
        return r3([v.x, v.y, v.z]);
      };
      for (const [name, w, d, hh, x, y, z] of plates)
        next.push(makePart('slab', next, { name: `${src.name}: ${name}`, params: { W: round(w, 3), D: round(d, 3), T: round(hh, 3) }, position: at(x, y, z), rotation: [...src.rotation], body: src.body, color: src.color }));
      if (src.type === 'drawer' && p.handle === 'notch') {
        const r = Math.min(12, H / 2.5, W / 4);
        next.push(makePart('hole', next, { name: `${src.name}: wycięcie na palec`, params: { D: round(2 * r, 2), H: round(4 * t, 2), luz: 0 }, position: at(0, -D / 2 + 2 * t, H), rotation: rotationAfter(src.rotation, AXES[0], 90), body: src.body }));
      } else if (src.type === 'drawer' && p.handle === 'knob') {
        const r = Math.min(6, H / 4);
        next.push(makePart('cone', next, { name: `${src.name}: gałka`, params: { D1: round(2 * r, 2), D2: round(1.6 * r, 2), H: 8 }, position: at(0, -D / 2 + 0.01, H / 2), rotation: rotationAfter(src.rotation, AXES[0], 90), body: src.body, color: src.color }));
      }
      commit(next, { selectedId: groupId(src.body) });
      get().notify(`Rozbito na ${next.length - parts.length + 1} części w bryle ${src.body}. Każdą płytę zmienisz osobno; razem dalej drukują się jako jedna bryła.`);
    },

    applyFixes(fixes) {
      let next = [...get().parts];
      for (const f of fixes) {
        if (f.kind === 'move') next = next.map((p) => (p.id === f.id ? { ...p, position: f.position } : p));
        else {
          const lidPart = next.find((p) => p.id === f.lid);
          if (!lidPart) continue;
          const pockets = next.filter((p) => p.body === f.body && p.type === 'magnet');
          if (!pockets.length) continue;
          const box = bodyBox(next, f.body);
          const c: [number, number] = [round((box.min.x + box.max.x) / 2), round((box.min.y + box.max.y) / 2)];
          const spots = pockets.map((p) => ({ x: p.position[0], y: p.position[1], s: [Math.sign(p.position[0] - c[0]) || 1, Math.sign(p.position[1] - c[1]) || 1] as [number, number], set: 'm' }));
          const link = pockets[0].link ?? uid();
          next = next.map((p) => (pockets.includes(p) && !p.link ? { ...p, link } : p));
          const hidden = box.max.z - worldBox(pockets[0]).max.z > 0.3;
          lidPockets(next, { part: lidPart, resting: f.resting }, spots, c, String(pockets[0].params.size), hidden, link);
        }
      }
      commit(next);
      get().notify(`Poprawiono ${fixes.length} ${fixes.length === 1 ? 'rzecz' : 'rzeczy'}. „Cofnij” przywróci poprzedni stan.`);
    },

    pattern(id, kind, opt) {
      const { parts } = get();
      const src = parts.find((x) => x.id === id);
      if (!src) return;
      const link = src.link ?? uid();
      const pid = uid();
      let ref = bodyBox(parts, src.body, src.id);
      if (ref.isEmpty()) ref = worldBox(src);
      const center = ref.getCenter(new THREE.Vector3());
      type Copy = { position: Vec3; rotation: Vec3; rule: Omit<PatternRule, 'c' | 'id'> };
      const copies: Copy[] = [];
      let moved: Vec3 | null = null;
      let srcRule: Omit<PatternRule, 'c' | 'id'> = { kind: 'linear', i: 0, n: 1, s: [1, 1] };
      let cx = center.x, cy = center.y;
      const n = Math.max(2, Math.round(opt.count));
      const mirrored = (rot: Vec3, sx: number, sy: number): Vec3 => {
        if (sx === 1 && sy === 1) return rot;
        const S = new THREE.Matrix4().makeScale(sx, sy, 1);
        const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(rot.map((r) => r * DEG) as Vec3)));
        const e = new THREE.Euler().setFromRotationMatrix(S.clone().multiply(R).multiply(S));
        return [e.x, e.y, e.z].map((r) => round(r / DEG, 2)) as Vec3;
      };
      // A mirror on a member of a mirrored set mirrors the whole set and keeps one rule (X then Y = 4 corners).
      const prev = src.pattern?.kind === 'sym' && (kind === 'mirrorX' || kind === 'mirrorY') ? src.pattern : null;
      if (prev) {
        cx = src.position[0] + prev.c[0];
        cy = src.position[1] + prev.c[1];
        const members = parts.filter((p) => p.pattern?.id === prev.id);
        const ax = kind === 'mirrorX' ? 0 : 1;
        if (members.some((m) => m.pattern!.s[ax] === -1)) {
          get().notify(`Ten szyk ma już lustro ${kind === 'mirrorX' ? 'X' : 'Y'}.`);
          return;
        }
        const next = [...parts];
        for (const m of members) {
          const pos = [...m.position] as Vec3;
          pos[ax] = 2 * (ax === 0 ? cx : cy) - pos[ax];
          const s: [number, number] = ax === 0 ? [-m.pattern!.s[0], m.pattern!.s[1]] : [m.pattern!.s[0], -m.pattern!.s[1]];
          next.push({
            ...m,
            id: uid(),
            name: `${m.name} (lustro)`,
            params: { ...m.params },
            position: r3(pos),
            rotation: mirrored(m.rotation, ax === 0 ? -1 : 1, ax === 1 ? -1 : 1),
            pattern: { ...m.pattern!, s, c: [round(cx - pos[0]), round(cy - pos[1])] },
          });
        }
        commit(next);
        get().notify(`Dodano ${members.length} ${members.length === 1 ? 'kopię' : 'kopii'}. Przesuń jedną, a reszta przesunie się symetrycznie.`);
        return;
      }
      if (kind === 'linear') {
        for (let i = 1; i < n; i++) {
          const pos = [...src.position] as Vec3;
          pos[opt.axis] += opt.distance * i;
          copies.push({ position: pos, rotation: src.rotation, rule: { kind: 'linear', i, n, s: [1, 1] } });
        }
      } else if (kind === 'circle') {
        const dx = src.position[0] - center.x, dy = src.position[1] - center.y;
        let R = opt.radius > 0 ? opt.radius : Math.hypot(dx, dy);
        if (R < 0.5) R = Math.max(5, Math.min(ref.max.x - ref.min.x, ref.max.y - ref.min.y) * 0.3);
        const a0 = Math.hypot(dx, dy) > 0.5 ? Math.atan2(dy, dx) : 0;
        moved = [center.x + R * Math.cos(a0), center.y + R * Math.sin(a0), src.position[2]];
        srcRule = { kind: 'circle', i: 0, n, s: [1, 1] };
        for (let i = 1; i < n; i++) {
          const a = a0 + (i * 2 * Math.PI) / n;
          copies.push({
            position: [center.x + R * Math.cos(a), center.y + R * Math.sin(a), src.position[2]],
            rotation: rotationAfter(src.rotation, AXES[2], (i * 360) / n),
            rule: { kind: 'circle', i, n, s: [1, 1] },
          });
        }
      } else if (kind === 'corners') {
        // Inset 0 keeps the element where it is (same offset from its corner); otherwise it moves to that inset.
        const e = opt.inset;
        moved = e > 0 ? [ref.min.x + e, ref.min.y + e, src.position[2]] : [...src.position];
        srcRule = { kind: 'sym', i: 0, n: 4, s: [1, 1] };
        const signs: [number, number][] = [
          [-1, 1],
          [-1, -1],
          [1, -1],
        ];
        // Each copy mirrors the first corner by its signs.
        signs.forEach((sg, i) =>
          copies.push({ position: [cx + sg[0] * (moved![0] - cx), cy + sg[1] * (moved![1] - cy), src.position[2]], rotation: src.rotation, rule: { kind: 'sym', i: i + 1, n: 4, s: sg } }),
        );
      } else {
        const signs: [number, number][] = kind === 'mirrorX' ? [[-1, 1]] : kind === 'mirrorY' ? [[1, -1]] : [[-1, 1], [-1, -1], [1, -1]];
        srcRule = { kind: 'sym', i: 0, n: signs.length + 1, s: [1, 1] };
        signs.forEach((sg, i) =>
          copies.push({
            position: [cx + sg[0] * (src.position[0] - cx), cy + sg[1] * (src.position[1] - cy), src.position[2]],
            rotation: mirrored(src.rotation, sg[0], sg[1]),
            rule: { kind: 'sym', i: i + 1, n: signs.length + 1, s: sg },
          }),
        );
      }
      const rule = (pos: Vec3, r: Omit<PatternRule, 'c' | 'id'>): PatternRule => ({ ...r, id: pid, c: [round(cx - pos[0]), round(cy - pos[1])] });
      const srcPos = moved ? r3(moved) : src.position;
      const next = parts.map((p) => (p.id === src.id ? { ...p, link, position: srcPos, pattern: rule(srcPos, srcRule) } : p));
      copies.forEach((c, i) => {
        const pos = r3(c.position);
        next.push({ ...src, id: uid(), name: `${src.name} · ${i + 2}`, params: { ...src.params }, link, position: pos, rotation: c.rotation, pattern: rule(pos, c.rule) });
      });
      commit(next, { suggest: null });
      get().notify(`Dodano ${copies.length} ${copies.length === 1 ? 'kopię' : 'kopii'}. Są powiązane: zmiana wymiarów jednej zmienia wszystkie, a przesunięcie jednej przesuwa resztę według szyku.`);
    },

    unlink(id) {
      const p = get().parts.find((x) => x.id === id);
      if (!p?.link && !p?.pattern) return;
      commit(get().parts.map((x) => (x.id === id ? { ...x, link: undefined, pattern: undefined } : x)));
      get().notify('Odłączono. Ten element możesz teraz zmieniać osobno.');
    },

    setTexture(id, texture) {
      get().update(id, { texture });
    },

    setFaceTexture(id, face, texture) {
      const p = get().parts.find((x) => x.id === id);
      if (!p) return;
      const list = texturesOf(p).filter((t) => t.face !== face);
      if (texture) list.push({ ...texture, face });
      get().update(id, { texture: undefined, textures: list.length ? list : undefined });
    },

    faceSel: null,
    setFaceSel: (faceSel) => set({ faceSel }),

    addLabel(id, side, text, cut) {
      const p = get().parts.find((x) => x.id === id);
      if (!p || !text.trim()) return;
      const box = bodyBox(get().parts, p.body);
      const s = box.getSize(new THREE.Vector3());
      // As large as the wall allows: 45 % of its height, the text (about one letter height per letter) across 80 % of its width.
      const [w, h] = side === 'top' || side === 'bottom' ? [Math.max(s.x, s.y), Math.min(s.x, s.y)] : [side === 'left' || side === 'right' ? s.y : s.x, s.z];
      const len = Math.max(1, [...text.trim()].length);
      const size = round(Math.max(3, Math.min(20, h * 0.45, (w * 0.8) / (len * 1.0))), 1);
      const keep = get().faceSel;
      const tid = get().add(cut ? 'textCut' : 'text', { name: `Napis „${text.trim()}”`, params: { text: text.trim(), size, depth: 0.8, bold: size < 6 ? 0.3 : 0 }, body: p.body, color: p.color });
      get().textToWall(tid, side);
      get().select(id);
      set({ faceSel: keep });
    },

    setEdges(id, edges) {
      get().update(id, { edges });
    },

    setBend(id, bend) {
      const src = get().parts.find((p) => p.id === id);
      if (!src) return;
      commit(get().parts.map((p) => (p.id === id ? { ...p, bend } : p.body === src.body && p.bend ? { ...p, bend: undefined } : p)));
    },

    addRibs(id, count) {
      const { parts } = get();
      const src = parts.find((p) => p.id === id);
      if (!src || !['angle', 'channel', 'tee'].includes(src.type)) return;
      const n = (k: string) => Number(src.params[k]) || 0;
      const L = n('L'), t = n('T');
      // Inside corners in the profile's own frame: Y of the wall face, which way the rib points, free height.
      let corners: { y: number; dir: 1 | -1; reach: number; up: number }[] = [];
      if (src.type === 'angle') corners = [{ y: -n('A') / 2 + t, dir: 1, reach: n('A') - t, up: n('B') - t }];
      if (src.type === 'channel') {
        const w = n('W');
        corners = [
          { y: -w / 2 + t, dir: 1, reach: (w - 2 * t) / 2, up: n('H') - t },
          { y: w / 2 - t, dir: -1, reach: (w - 2 * t) / 2, up: n('H') - t },
        ];
      }
      if (src.type === 'tee') {
        const w = n('W');
        corners = [
          { y: t / 2, dir: 1, reach: w / 2 - t / 2, up: n('H') - t },
          { y: -t / 2, dir: -1, reach: w / 2 - t / 2, up: n('H') - t },
        ];
      }
      const leg = Math.min(...corners.map((c) => Math.min(c.reach, c.up))) * 0.8;
      if (leg < 2) return get().notify('Profil jest za mały na żebra.');
      const k = Math.max(1, Math.round(count));
      const thick = Math.max(1.2, t);
      const xs = k === 1 ? [0] : Array.from({ length: k }, (_, i) => -L / 2 + thick / 2 + 2 + (i * (L - thick - 4)) / (k - 1));
      const R = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(src.rotation.map((r) => r * DEG) as Vec3)));
      const link = uid();
      const OV = 0.2;
      const next = [...parts];
      let first = '';
      for (const c of corners)
        for (const x of xs) {
          // The wedge's right angle sits at its -Y side; a rib pointing to -Y is the wedge turned 180° about Z.
          const local = new THREE.Vector3(x, c.y + c.dir * ((leg + OV) / 2 - OV), t - OV);
          const pos = local.applyQuaternion(R).add(new THREE.Vector3(...src.position));
          const q = c.dir === 1 ? R.clone() : R.clone().multiply(new THREE.Quaternion().setFromAxisAngle(AXES[2], Math.PI));
          const e = new THREE.Euler().setFromQuaternion(q);
          const rib = makePart('wedge', next, {
            name: `Żebro ${next.filter((p) => p.type === 'wedge').length + 1}`,
            params: { W: thick, D: round(leg + OV, 2), H: round(leg + OV, 2) },
            position: r3(pos.toArray() as Vec3),
            rotation: [e.x, e.y, e.z].map((r) => round(r / DEG, 2)) as Vec3,
            body: src.body,
            color: src.color,
            link,
          });
          first ||= rib.id;
          next.push(rib);
        }
      commit(next, { selectedId: first });
      get().notify(`Dodano ${next.length - parts.length} żeber w narożnikach. Są powiązane: zmień wymiary jednego, zmienią się wszystkie.`);
    },

    setInfill(id, infill) {
      const src = get().parts.find((p) => p.id === id);
      if (!src) return;
      commit(get().parts.map((p) => (p.id === id ? { ...p, infill } : p.body === src.body && p.infill ? { ...p, infill: undefined } : p)));
    },

    setShell(id, shell) {
      const src = get().parts.find((p) => p.id === id);
      if (!src) return;
      commit(get().parts.map((p) => (p.id === id ? { ...p, shell } : p.body === src.body && p.shell ? { ...p, shell: undefined } : p)));
    },

    setXform(id, xform) {
      const src = get().parts.find((p) => p.id === id);
      if (!src) return;
      commit(get().parts.map((p) => (p.id === id ? { ...p, xform } : p.body === src.body && p.xform ? { ...p, xform: undefined } : p)));
    },

    mirrorCopy(body, axis) {
      get().duplicateBody(body);
      const { parts, selectedId } = get();
      const nb = groupBody(selectedId);
      if (nb === null) return;
      const holder = parts.find((p) => p.body === nb && !p.hole && p.xform) ?? parts.find((p) => p.body === nb && !p.hole);
      if (!holder) return;
      const x = holder.xform ?? { mirror: 'none' as const, scale: [100, 100, 100] as Vec3 };
      const mirror = x.mirror === axis ? 'none' : x.mirror === 'none' ? axis : x.mirror;
      // Same undo step as the copy itself.
      set({ parts: parts.map((p) => (p.id === holder.id ? { ...p, xform: { ...x, mirror } } : p.body === nb && p.xform ? { ...p, xform: undefined } : p)) });
      get().notify(`Lustrzana kopia jako bryła ${nb}. Wymiary i otwory zmieniasz w niej jak zwykle, odbicie liczy się na końcu.`);
    },

    setFlags(ids, patch) {
      const { parts } = get();
      const hit = new Set<string>();
      for (const id of ids) {
        const gb = groupBody(id);
        parts.forEach((p) => (gb !== null ? p.body === gb : p.id === id) && hit.add(p.id));
      }
      const clean = (p: Part): Part => {
        const q = { ...p, ...patch };
        if (!q.hidden) delete q.hidden;
        if (!q.locked) delete q.locked;
        return q;
      };
      commit(parts.map((p) => (hit.has(p.id) ? clean(p) : p)));
    },

    clipWith(body, other) {
      const { parts } = get();
      if (body === other || !parts.some((p) => p.body === other && !p.hole)) return;
      commit(
        parts.map((p) => (p.body !== other ? p : p.hole ? { ...p, body } : { ...p, body, hole: true, clip: true, color: '#7fb3d5', bend: undefined, shell: undefined, xform: undefined, merged: undefined })),
        { selectedId: groupId(body) },
      );
      get().notify(`Z bryły ${body} zostaje tylko część wspólna z bryłą ${other}. Niebieski kształt możesz przesuwać; „Rodzaj” → „Bryła” cofa przycięcie.`);
    },

    multi: [],
    sketchSel: null,
    setSketchSel: (sel) => set({ sketchSel: sel }),
    toggleMulti(id) {
      const s = get();
      const all = [...new Set([...(s.selectedId ? [s.selectedId] : []), ...s.multi])];
      const next = all.includes(id) ? all.filter((x) => x !== id) : [...all, id];
      set({ selectedId: next[0] ?? null, multi: next.slice(1) });
    },
    clearMulti: () => set({ multi: [] }),

    align(ids, axis, to) {
      const { parts } = get();
      const items = ids.map((id) => pickItem(parts, id)).filter((x): x is PickItem => !!x);
      if (items.length < 2) return;
      const all = new THREE.Box3();
      items.forEach((it) => all.union(it.box));
      const target = to === 'min' ? all.min.getComponent(axis) : to === 'max' ? all.max.getComponent(axis) : (all.min.getComponent(axis) + all.max.getComponent(axis)) / 2;
      const shift = new Map<string, number>();
      for (const it of items) {
        const cur = to === 'min' ? it.box.min.getComponent(axis) : to === 'max' ? it.box.max.getComponent(axis) : (it.box.min.getComponent(axis) + it.box.max.getComponent(axis)) / 2;
        it.ids.forEach((id) => shift.set(id, target - cur));
      }
      commit(movedBy(parts, shift, axis));
    },

    distribute(ids, axis, gap) {
      const { parts } = get();
      const items = ids
        .map((id) => pickItem(parts, id))
        .filter((x): x is PickItem => !!x)
        .sort((a, b) => a.box.min.getComponent(axis) + a.box.max.getComponent(axis) - (b.box.min.getComponent(axis) + b.box.max.getComponent(axis)));
      if (items.length < 2 || (gap === null && items.length < 3)) return;
      const size = (it: PickItem) => it.box.max.getComponent(axis) - it.box.min.getComponent(axis);
      const first = items[0].box.min.getComponent(axis);
      // Equal gaps between the outer two, or the given gap from the first one on.
      const g = gap ?? (items[items.length - 1].box.max.getComponent(axis) - first - items.reduce((a, it) => a + size(it), 0)) / (items.length - 1);
      const shift = new Map<string, number>();
      let at = first;
      for (const it of items) {
        const d = at - it.box.min.getComponent(axis);
        it.ids.forEach((id) => shift.set(id, d));
        at += size(it) + g;
      }
      commit(movedBy(parts, shift, axis));
    },

    layoutOnBed() {
      let parts = get().parts;
      const units: number[][] = [];
      const seen = new Set<number>();
      for (const b of [...new Set(parts.map((p) => p.body))].sort((a, c) => a - c)) {
        if (seen.has(b) || !parts.some((p) => p.body === b && !p.hole)) continue;
        const bs = [...new Set(assembly(parts, b).map((p) => p.body))];
        bs.forEach((x) => seen.add(x));
        units.push(bs);
      }
      if (!units.length) return get().notify('Nie ma czego układać.');
      let turned = 0;
      for (const u of units) {
        // Only single printed bodies turn: a box on its hinge with the lid stays as built.
        if (u.length !== 1) continue;
        const best = bestFaceDown(parts, u[0]);
        if (!best) continue;
        parts = turnBody(parts, u[0], best[0], best[1]);
        turned++;
      }
      const bed = loadBed();
      const GAP = 6;
      const boxes = units.map((u) => {
        const b = new THREE.Box3();
        u.forEach((x) => b.union(finishedBox(parts, x)));
        return { u, b, w: b.max.x - b.min.x, d: b.max.y - b.min.y };
      });
      boxes.sort((a, b) => b.d - a.d || b.w - a.w);
      // Rows across the bed, deepest first.
      const place: { u: number[]; b: THREE.Box3; x: number; y: number }[] = [];
      let x = 0, y = 0, row = 0, width = 0;
      for (const it of boxes) {
        if (x > 0 && x + it.w > bed[0]) {
          y += row + GAP;
          x = 0;
          row = 0;
        }
        place.push({ u: it.u, b: it.b, x, y });
        x += it.w + GAP;
        width = Math.max(width, x - GAP);
        row = Math.max(row, it.d);
      }
      const depth = y + row;
      const shift = new Map<string, Vec3>();
      for (const pl of place) {
        const d: Vec3 = [pl.x - width / 2 - pl.b.min.x, pl.y - depth / 2 - pl.b.min.y, -pl.b.min.z];
        parts.filter((p) => pl.u.includes(p.body)).forEach((p) => shift.set(p.id, d));
      }
      parts = parts.map((p) => {
        const d = shift.get(p.id);
        return d ? { ...p, position: r3([p.position[0] + d[0], p.position[1] + d[1], p.position[2] + d[2]]) } : p;
      });
      commit(parts, { fitRequest: get().fitRequest + 1 });
      const fits = width <= bed[0] && depth <= bed[1];
      get().notify(
        `Ułożono ${units.length} ${units.length === 1 ? 'bryłę' : few(units.length) ? 'bryły' : 'brył'}${turned ? ', każda na największej płaskiej ściance' : ''}. Zajmują ${Math.round(width)} × ${Math.round(depth)} mm${fits ? '' : `: nie mieszczą się na stole ${bed[0]} × ${bed[1]} mm, wydrukuj je w kilku partiach`}.`,
      );
    },

    fitFigurine(id, height) {
      const p = get().parts.find((x) => x.id === id);
      if (!p) return;
      const r = fitHeight(p.params, height);
      if (!r) {
        get().notify('Ta figurka nie ma suwaka, który zmienia wysokość całości.');
        return;
      }
      get().update(id, { params: r.params });
      get().notify(Math.abs(r.height - height) < 1 ? `Całość ma teraz ${height} mm.` : `Najbliżej ${height} mm w zakresie suwaka: ${Math.round(r.height)} mm.`);
    },

    merge(body) {
      commit(get().parts.map((p) => (p.body === body && !p.hole ? { ...p, merged: true } : p)), { selectedId: groupId(body) });
      get().notify('Otwory złączone z bryłą. Otwory nadal możesz klikać i przesuwać, a „Rozdziel” cofa złączenie.');
    },

    unmerge(body) {
      commit(get().parts.map((p) => (p.body === body && p.merged ? { ...p, merged: false } : p)));
    },

    moveBody(body, position) {
      const { parts } = get();
      const anchor = parts.find((p) => p.body === body && !p.hole) ?? parts.find((p) => p.body === body);
      if (!anchor) return;
      const d = [position[0] - anchor.position[0], position[1] - anchor.position[1], position[2] - anchor.position[2]];
      const ids = new Set(assembly(parts, body).map((p) => p.id));
      commit(parts.map((p) => (ids.has(p.id) ? { ...p, position: r3([p.position[0] + d[0], p.position[1] + d[1], p.position[2] + d[2]]) } : p)));
    },

    rotateBody(body, axis, degrees) {
      const { parts } = get();
      const next = turnBody(parts, body, axis, degrees);
      if (next !== parts) commit(next);
    },

    dropBody(body) {
      const { parts } = get();
      const group = assembly(parts, body);
      const ids = new Set(group.map((p) => p.id));
      const box = new THREE.Box3();
      group.forEach((p) => box.union(worldBox(p)));
      const dz = -box.min.z;
      commit(parts.map((p) => (ids.has(p.id) ? { ...p, position: r3([p.position[0], p.position[1], p.position[2] + dz]) } : p)));
    },

    duplicateBody(body) {
      const { parts } = get();
      const box = bodyBox(parts, body);
      const w = box.getSize(new THREE.Vector3()).x + 5;
      const nb = nextBody(parts);
      const rigids: Record<string, string> = {};
      const pats: Record<string, string> = {};
      const copies = parts
        .filter((p) => p.body === body)
        .map((p) => ({
          ...p,
          id: uid(),
          name: `${p.name} (kopia)`,
          params: { ...p.params },
          body: nb,
          position: r3([p.position[0] + w, p.position[1], p.position[2]]),
          rigid: p.rigid ? (rigids[p.rigid] ??= uid()) : undefined,
          pattern: p.pattern ? { ...p.pattern, id: (pats[p.pattern.id] ??= uid()) } : undefined,
          armOf: undefined,
          wiz: undefined,
        }));
      commit([...parts, ...copies], { selectedId: groupId(nb) });
    },

    removeBody(body) {
      if (isLocked(get().parts, groupId(body))) return get().notify('Ta bryła ma zablokowane elementy. Odblokuj je (🔒 na liście), żeby ją usunąć.');
      commit(
        get().parts.filter((p) => p.body !== body),
        { selectedId: null },
      );
    },

    fixHoles() {
      const { parts } = get();
      const next = fixHolesIn(parts);
      if (next !== parts) set({ parts: next });
    },

    afterMove(id) {
      const { parts } = get();
      let next = parts;
      const p = parts.find((x) => x.id === id);
      let joined: number | null = null;
      if (p && !p.hole && !p.rigid && p.type !== 'figurine') {
        joined = hostBody(parts, p);
        if (joined !== null) {
          const merged = isMerged(parts, joined);
          next = next.map((q) => (q.id === id ? { ...q, body: joined!, merged: merged || undefined } : q));
        }
      }
      next = fixHolesIn(next);
      if (next !== parts) set({ parts: next });
      if (joined !== null) {
        const host = next.find((q) => q.body === joined && !q.hole && q.id !== id);
        get().notify(`„${p!.name}” stoi w bryle ${joined}${host ? ` (${host.name})` : ''}, więc do niej dołączył: razem to jeden wydruk, a szyki liczą się od tej bryły. „Cofnij” przywraca.`);
      }
      const cur = next.find((x) => x.id === id);
      set({ suggest: cur && inCorner(next, cur) ? { id } : null });
    },

    mergeAll() {
      commit(get().parts.map((p) => ({ ...p, body: 1 })));
      get().notify('Wszystkie elementy tworzą teraz jedną bryłę.');
    },

    runCheck() {
      set({ check: runCheck(get().parts, get().settings.minWall), preview: false });
    },
    closeCheck: () => set({ check: null }),

    undo() {
      const { past, parts, future } = get();
      if (!past.length) return;
      set({ parts: past[past.length - 1], past: past.slice(0, -1), future: [parts, ...future], check: null });
    },

    redo() {
      const { past, parts, future } = get();
      if (!future.length) return;
      set({ parts: future[0], future: future.slice(1), past: [...past, parts], check: null });
    },

    load(project) {
      const s = get();
      if (project.version === 2) decodeMeshes(project.meshes);
      if (project.version === 1) {
        commit(sanitize(project.parts), { selectedId: null, fitRequest: s.fitRequest + 1 });
        return;
      }
      const other: Tab = s.tab === 'tech' ? 'fig' : 'tech';
      set({ stash: { ...s.stash, [other]: { parts: sanitize(project[other]), past: [], future: [], selectedId: null } } });
      commit(sanitize(project[s.tab]), { selectedId: null, fitRequest: s.fitRequest + 1 });
    },

    reset() {
      commit([], { selectedId: null });
    },

    setSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),
    setPreview: (v) => set({ preview: v, check: null, selectedId: v ? null : get().selectedId }),
    setSnapTargets: (ids) => {
      const cur = get().snapTargets;
      if (cur.length !== ids.length || cur.some((c, i) => c !== ids[i])) set({ snapTargets: ids });
    },
    notify(msg) {
      set({ toast: msg });
      setTimeout(() => get().toast === msg && set({ toast: null }), 4500);
    },
  };
});

/** Keeps each figurine's set of piece parts in step with its sliders (e.g. detachable ears add pieces). */
function syncFigurines(parts: Part[]): Part[] {
  const groups = new Map<string, Part[]>();
  for (const p of parts) if (p.type === 'figurine' && p.rigid) groups.set(p.rigid, [...(groups.get(p.rigid) ?? []), p]);
  let next = parts;
  for (const [rigid, group] of groups) {
    let fig;
    try {
      fig = figurine(group[0].params);
    } catch {
      continue;
    }
    const n = fig.pieces.length;
    const model = FIG_MODELS[String(group[0].params.model)]?.n ?? 'Figurka';
    const num = /(\d+)\s*:/.exec(group[0].name)?.[1] ?? '1';
    const base = `${model} ${num}`;
    const nameOf = (i: number) => `${base}: ${fig.pieces[i].name}`;
    const have = new Set(group.map((p) => Number(p.params.piece)));
    const extra = new Set(group.filter((p) => Number(p.params.piece) >= n).map((p) => p.id));
    const missing = Array.from({ length: n }, (_, i) => i).filter((i) => !have.has(i));
    const renamed = group.some((p) => Number(p.params.piece) < n && p.name !== nameOf(Number(p.params.piece)));
    if (!extra.size && !missing.length && !renamed) continue;
    next = next.filter((p) => !extra.has(p.id)).map((p) => (p.rigid === rigid && !extra.has(p.id) ? { ...p, name: nameOf(Number(p.params.piece)) } : p));
    for (const i of missing) {
      next = [
        ...next,
        { ...group[0], id: uid(), params: { ...group[0].params, piece: i }, body: nextBody(next), name: nameOf(i), color: FIG_PALETTE[(i + 1) % FIG_PALETTE.length], merged: false, texture: undefined },
      ];
    }
  }
  return next;
}

/** Parameters a lid needs to fit its box: size, wall, shape and slots for the dividers (a sliding lid: the groove). */
function lidParams(box: Part, lid: Part): Params {
  if (lid.type === 'slab') {
    const g = slideGroove(box.params);
    return { W: round(g.lidW, 2), D: round(g.lidD, 2), T: g.lidT };
  }
  if (lid.type === 'gasket') return gasketDims(box.params);
  const p: Params = { shape: box.params.shape ?? 'rect', W: box.params.W, D: box.params.D, wall: box.params.T, rad: box.params.slide ? 0 : (box.params.rad ?? 0) };
  // Dividers lowered at least by the rim height don't reach it: no slots needed.
  const clear = (Number(box.params.low) || 0) >= (Number(lid.params.R) || 0);
  p.nx = clear ? 1 : (box.params.nx ?? 1);
  p.ny = clear ? 1 : (box.params.ny ?? 1);
  // The editor's layout and the radial spokes move the slots too.
  p.div = clear ? '' : (box.params.div ?? '');
  p.divMode = box.params.divMode ?? 'grid';
  p.nr = clear ? 0 : (box.params.nr ?? 0);
  p.rot = box.params.rot ?? 0;
  // A round box with a threaded neck gets a screw-on cap.
  p.screw = isJar(box.params);
  if (p.screw) {
    p.P = box.params.P ?? 3;
    p.threadL = box.params.threadL ?? 8;
    p.fit = box.params.fit ?? 'normal';
  }
  return p;
}

/**
 * Keeps lids sized to their boxes after every change. A lid lying on the box moves with its top;
 * a lid next to the box is pushed aside when the grown box would reach it.
 */
function syncLids(prev: Part[], parts: Part[]): Part[] {
  if (!parts.some((p) => p.fitTo)) return parts;
  let changed = false;
  const next = parts.map((lid) => {
    if (!lid.fitTo) return lid;
    const box = parts.find((p) => p.id === lid.fitTo);
    if (!box || box.type !== 'box') {
      changed = true;
      return { ...lid, fitTo: undefined };
    }
    if (lid.type === 'boxHinge') return lid;
    const want = lidParams(box, lid);
    if (Object.entries(want).every(([k, v]) => lid.params[k] === v)) return lid;
    changed = true;
    const q: Part = { ...lid, params: { ...lid.params, ...want } };
    const oldBox = prev.find((p) => p.id === box.id);
    const oldLid = prev.find((p) => p.id === lid.id);
    if (oldBox && oldLid) {
      const ob = worldBox(oldBox), lb = worldBox(oldLid), nb = worldBox(box);
      const above = lb.min.x < ob.max.x && lb.max.x > ob.min.x && lb.min.y < ob.max.y && lb.max.y > ob.min.y;
      if (above && Math.abs(lb.min.z - ob.max.z) < 0.6) q.position = r3([q.position[0], q.position[1], q.position[2] + nb.max.z - ob.max.z]);
      else {
        const qb = worldBox(q);
        if (qb.min.x < nb.max.x + 2 && qb.max.x > nb.min.x && qb.min.y < nb.max.y && qb.max.y > nb.min.y)
          q.position = r3([nb.max.x + 10 + (q.position[0] - qb.min.x), q.position[1], q.position[2]]);
      }
    }
    return q;
  });
  return syncHinges(changed ? next : parts);
}

/** A box hinge follows its box (size, wall, corners, place) and its lid (thickness, gap above the rim). */
function syncHinges(parts: Part[]): Part[] {
  if (!parts.some((p) => p.type === 'boxHinge' && p.fitTo)) return parts;
  let changed = false;
  const next = parts.map((h) => {
    if (h.type !== 'boxHinge' || !h.fitTo) return h;
    const box = parts.find((p) => p.id === h.fitTo);
    if (!box) return h;
    const lid = parts.find((p) => p.type === 'lid' && p.fitTo === box.id);
    const gap = lid ? worldBox(lid).min.z - worldBox(box).max.z : BOX_HINGE_LIFT;
    const want: Params = {
      W: box.params.W,
      D: box.params.D ?? box.params.W,
      H: box.params.H,
      wall: box.params.T,
      rad: box.params.slide ? 0 : (box.params.rad ?? 0),
      Tl: lid ? lid.params.T : 2,
      lift: gap >= 0 && gap <= 1 ? round(gap, 2) : BOX_HINGE_LIFT,
    };
    const same = Object.entries(want).every(([k, v]) => h.params[k] === v);
    const placed = h.position.every((v, i) => v === box.position[i]) && h.rotation.every((v, i) => v === box.rotation[i]);
    if (same && placed) return h;
    changed = true;
    return { ...h, params: { ...h.params, ...want }, position: [...box.position] as Vec3, rotation: [...box.rotation] as Vec3 };
  });
  return changed ? next : parts;
}

/** Turns a body (and what is tied to it) about its centre, keeping its lowest point where it was. */
function turnBody(parts: Part[], body: number, axis: 0 | 1 | 2, degrees: number): Part[] {
  const ids = new Set(assembly(parts, body).map((p) => p.id));
  const box = bodyBox(parts, body);
  if (box.isEmpty()) return parts;
  const c = box.getCenter(new THREE.Vector3());
  const q = new THREE.Quaternion().setFromAxisAngle(AXES[axis], degrees * DEG);
  let next = parts.map((p) => {
    if (!ids.has(p.id)) return p;
    const pos = new THREE.Vector3(...p.position).sub(c).applyQuaternion(q).add(c);
    // Mirror signs and angles no longer match after a turn, so the pattern rule is dropped (the link stays).
    return { ...p, position: r3(pos.toArray() as Vec3), rotation: rotationAfter(p.rotation, AXES[axis], degrees), pattern: undefined };
  });
  const dz = box.min.z - bodyBox(next, body).min.z;
  next = next.map((p) => (ids.has(p.id) ? { ...p, position: r3([p.position[0], p.position[1], p.position[2] + dz]) } : p));
  return next;
}

/**
 * The turn that puts the largest flat face of the finished body on the bed, or null when the way
 * it stands now is as good (ties keep the current pose, then the lower one wins).
 */
function bestFaceDown(parts: Part[], body: number): [0 | 1 | 2, number] | null {
  if (parts.some((p) => p.body === body && (p.bend?.on || p.xform))) return null;
  const [res] = buildBodies(parts, [body]);
  if (!res) return null;
  const mesh = res.manifold.getMesh();
  res.geometry.dispose();
  res.manifold.delete();
  const turns: [0 | 1 | 2, number][] = [[0, 0], [0, 90], [0, -90], [0, 180], [1, 90], [1, -90]];
  const v = mesh.vertProperties, np = mesh.numProp, tri = mesh.triVerts;
  let best: { t: [0 | 1 | 2, number]; area: number; h: number } | null = null;
  for (const t of turns) {
    const q = new THREE.Quaternion().setFromAxisAngle(AXES[t[0]], t[1] * DEG);
    const pts: THREE.Vector3[] = [];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < v.length; i += np) {
      const p = new THREE.Vector3(v[i], v[i + 1], v[i + 2]).applyQuaternion(q);
      pts.push(p);
      lo = Math.min(lo, p.z);
      hi = Math.max(hi, p.z);
    }
    let area = 0;
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let i = 0; i < tri.length; i += 3) {
      const a = pts[tri[i]], b = pts[tri[i + 1]], c = pts[tri[i + 2]];
      if (a.z - lo > 0.05 || b.z - lo > 0.05 || c.z - lo > 0.05) continue;
      area += e1.subVectors(b, a).cross(e2.subVectors(c, a)).length() / 2;
    }
    const h = hi - lo;
    if (!best || area > best.area * 1.02 || (area > best.area * 0.98 && h < best.h - 0.5)) best = { t, area, h };
  }
  return best && best.t[1] !== 0 ? best.t : null;
}

interface PickItem {
  ids: string[];
  box: THREE.Box3;
}

/** What moves when one pick is aligned: a part with its fitting, or a whole body with what it carries. */
function pickItem(parts: Part[], id: string): PickItem | null {
  const gb = groupBody(id);
  if (gb !== null) {
    const group = assembly(parts, gb);
    if (!group.length) return null;
    const box = new THREE.Box3();
    group.filter((p) => !p.hole).forEach((p) => box.union(worldBox(p)));
    return { ids: group.map((p) => p.id), box };
  }
  const p = parts.find((x) => x.id === id);
  if (!p) return null;
  const group = mates(parts, p);
  const box = new THREE.Box3();
  group.forEach((x) => box.union(worldBox(x)));
  return { ids: group.map((x) => x.id), box };
}

function movedBy(parts: Part[], shift: Map<string, number>, axis: 0 | 1 | 2): Part[] {
  return parts.map((p) => {
    const d = shift.get(p.id);
    if (!d || p.locked) return p;
    const position = [...p.position] as Vec3;
    position[axis] = round(position[axis] + d);
    return { ...p, position, pattern: undefined };
  });
}

export const BED_KEY = 'm3d-bed';
export function loadBed(): Vec3 {
  try {
    const v = JSON.parse(localStorage.getItem(BED_KEY) ?? '');
    if (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && x > 0)) return v as Vec3;
  } catch {
    /* default below */
  }
  return [220, 220, 250];
}

function fixHolesIn(parts: Part[]): Part[] {
  let changed = false;
  const next = parts.map((hole) => {
    if (!hole.hole) return hole;
    const hb = worldBox(hole);
    if (parts.some((p) => !p.hole && p.body === hole.body && overlaps(worldBox(p), hb))) return hole;
    const target = bestBodyFor(hole, parts, hole.avoidBody ?? null);
    if (target === null || target === hole.body) return hole;
    changed = true;
    return { ...hole, body: target };
  });
  return changed ? next : parts;
}

/**
 * Body a moved solid now stands in, when it left its own: it touches nothing of its own body and
 * sits inside (or cuts into) another body's solids. Null when it should stay where it is.
 */
function hostBody(parts: Part[], part: Part): number | null {
  const pb = worldBox(part);
  const near = pb.clone().expandByScalar(0.05);
  if (parts.some((q) => q.body === part.body && q.id !== part.id && !q.hole && worldBox(q).intersectsBox(near))) return null;
  let best: number | null = null;
  let bestVol = 0;
  for (const q of parts) {
    if (q.hole || q.body === part.body || q.id === part.id || q.type === 'figurine') continue;
    const qb = worldBox(q);
    const inside = qb.clone().expandByScalar(0.05).containsBox(pb);
    const inter = qb.clone().intersect(pb);
    if (inter.isEmpty()) continue;
    let cuts = false;
    if (!inside) {
      const a = worldManifold(part), b = worldManifold(q);
      const i = a.intersect(b);
      cuts = i.volume() > 0.5;
      [a, b, i].forEach((m) => m.delete());
    }
    if ((inside || cuts) && volume(inter) > bestVol) {
      bestVol = volume(inter);
      best = q.body;
    }
  }
  return best;
}

/** Is the part standing in a corner of its body (a column or pocket that could be copied to the other corners)? */
function inCorner(parts: Part[], part: Part): boolean {
  if (part.pattern || part.rigid || part.type === 'figurine') return false;
  const host = bodyBox(parts, part.body, part.id);
  if (host.isEmpty()) return false;
  const pb = worldBox(part);
  const W = host.max.x - host.min.x, D = host.max.y - host.min.y;
  const s = pb.getSize(new THREE.Vector3());
  if (s.x > 0.4 * W || s.y > 0.4 * D) return false;
  const c = pb.getCenter(new THREE.Vector3());
  const ex = Math.min(c.x - host.min.x, host.max.x - c.x), ey = Math.min(c.y - host.min.y, host.max.y - c.y);
  return ex >= 0 && ey >= 0 && ex < Math.max(8, 0.15 * W) && ey < Math.max(8, 0.15 * D);
}

/** Body (other than `exclude`) whose solids overlap the given part the most, or null. */
/** Biggest solid of a body (the box a connector sits in), skipping the given ids. */
function largestSolid(parts: Part[], body: number, skip?: Set<string>): Part | undefined {
  let best: Part | undefined;
  let bestVol = -1;
  for (const p of parts) {
    if (p.body !== body || p.hole || skip?.has(p.id)) continue;
    const v = volume(worldBox(p));
    if (v > bestVol) {
      bestVol = v;
      best = p;
    }
  }
  return best;
}

function bestBodyFor(part: Part, parts: Part[], exclude: number | null): number | null {
  const hb = worldBox(part);
  let best: number | null = null;
  let bestVol = 0;
  for (const p of parts) {
    if (p.hole || p.id === part.id || p.body === exclude) continue;
    const inter = worldBox(p).intersect(hb);
    if (inter.isEmpty()) continue;
    const v = volume(inter);
    if (v > bestVol) {
      bestVol = v;
      best = p.body;
    }
  }
  return best;
}

// Handy for debugging from the browser console.
(globalThis as unknown as { __store: typeof useStore }).__store = useStore;

useStore.subscribe((s, prev) => {
  if (s.parts === prev.parts && s.tab === prev.tab) return;
  try {
    const tech = s.tab === 'tech' ? s.parts : s.stash.tech.parts;
    const fig = s.tab === 'fig' ? s.parts : s.stash.fig.parts;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, tech, fig } satisfies Project));
    persistMeshes(new Set([...tech, ...fig].filter((p) => p.type === 'mesh').map((p) => String(p.params.ref))));
  } catch {
    /* storage unavailable */
  }
});

host.simulate = (fn) => {
  const snap = useStore.getState();
  useStore.setState({ parts: [], past: [], future: [], selectedId: null, suggest: null, check: null, multi: [] });
  try {
    const st = () => useStore.getState();
    fn({
      add: (type, o) => {
        const id = st().add(type, o);
        st().select(null);
        return id;
      },
      addLid: (id) => {
        st().addLid(id);
        st().select(null);
      },
      addMagnets: (id, opt) => {
        st().addMagnets(id, opt);
        st().select(null);
      },
      addHinged: (params) => {
        st().addVariant({} as Family, { label: '', type: 'box', params, extra: 'hinged' }, 'recent');
        return st().parts.find((p) => p.type === 'box')?.id ?? '';
      },
      update: (id, patch) => st().update(id, patch),
      remove: (id) => st().remove(id),
      addPiCase: (board) => {
        st().addPiCase(board);
        const id = st().selectedId ?? '';
        st().select(null);
        return id;
      },
      addCabinet: (params) => {
        st().addVariant({} as Family, { label: '', type: 'cabinet', params, extra: 'drawers' }, 'recent');
        st().select(null);
        return st().parts.find((p) => p.type === 'cabinet')?.id ?? '';
      },
      addFaceMagnets: (body, opt) => {
        st().addFaceMagnets(body, opt);
        st().select(null);
      },
      connectorToWall: (id, side) => st().connectorToWall(id, side),
      addConnector: (box, params, side, at) => {
        st().select(box);
        const id = st().add('connector', { params });
        st().select(null);
        st().connectorToWall(id, side);
        if (at) {
          const p = st().parts.find((x) => x.id === id)!;
          st().update(id, { position: [at[0] ?? p.position[0], at[1] ?? p.position[1], at[2] ?? p.position[2]] });
          st().connectorToWall(id, side);
        }
        return id;
      },
      textToWall: (id, side) => st().textToWall(id, side),
      parts: () => st().parts,
    });
    return st().parts;
  } finally {
    useStore.setState(snap, true);
  }
};
