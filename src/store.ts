import { create } from 'zustand';
import * as THREE from 'three';
import { DEFS, cabinetOpenings, defaultParams, slideGroove, type Params } from './catalog';
import { SCALE, SCALED, type Family, type Size, type Variant } from './families';
import { buildBodies, built, partMatrix, worldBox, worldManifold } from './geom/parts';
import { MAGNET_COVER, MAGNET_LUZ, MAGNET_WALL, boxForLid, findLid, magnetDims, planSpots, wallThickness, type LidRef, type MagnetOptions } from './geom/magnets';
import { figurine, figurineParams, fitHeight, FIG_MODELS } from './parts/figurine';
import { magnetIssues, runCheck, type CheckResult, type Fix } from './geom/check';
import type { Part, PatternRule, Project, ProjectV1, Tab, Texture, Vec3 } from './types';
import type { Feature } from './scene/measure';
import { connOpening, sideOf, wallPose, type WallSide } from './parts/connectors';
import { BOARDS, EDGE_SIDE } from './parts/raspberry';
import { gridSegments, layoutOf } from './geom/dividers';

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
  matchingNut(id: string): void;
  matchingThreadHole(id: string): void;
  addDrawers(id: string): void;
  addLid(id: string): void;
  /** Stops a lid from following its box. */
  unfitLid(id: string): void;
  /** Magnet pockets on the top edge of a box (ready-made or built from plates) and mirrored ones in its lid. */
  addMagnets(id: string, opt: MagnetOptions): void;
  /** Adds a family variant in size S/M/L or with the dimensions last used for its type. */
  addVariant(family: Family, variant: Variant, size: Size | 'recent'): void;
  /** Last parameters the user set, per part type ("Ostatnie" in the library). */
  recent: Record<string, Params>;
  /** Replaces a box or drawer with the plates it is made of (grouped in the same body). */
  explode(id: string): void;
  /** Moves a connector cut-out (with its reinforcement) onto another wall of the body it is in. */
  connectorToWall(id: string, side: WallSide): void;
  /** Ready case for a Raspberry Pi board, made of ordinary editable elements. */
  addPiCase(board: string): void;
  applyFixes(fixes: Fix[]): void;
  pattern(id: string, kind: PatternKind, opt: PatternOptions): void;
  unlink(id: string): void;
  setTexture(id: string, texture: Texture | undefined): void;
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

export function isMerged(parts: Part[], body: number) {
  return parts.some((p) => p.body === body && !p.hole && p.merged);
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
  const shareParams = !!params && !!src.link;
  const shareTexture = 'texture' in patch && !!src.link;
  const sharePose = !!src.rigid && (patch.position !== undefined || patch.rotation !== undefined);
  const follow = src.pattern && patch.position && patch.pattern === undefined ? followers(parts, src, own.position) : null;
  if (follow) own.pattern = follow.get(src.id)!.pattern;
  return parts.map((p) => {
    if (p.id === id) return own;
    let q = p;
    if (shareParams && p.link === src.link) {
      const next: Params = { ...params! };
      if (p.params.piece !== undefined) next.piece = p.params.piece;
      q = { ...q, params: next };
    }
    if (shareTexture && p.link === src.link) q = { ...q, texture: patch.texture };
    if (sharePose && p.rigid === src.rigid) q = { ...q, position: own.position, rotation: own.rotation };
    const f = follow?.get(p.id);
    if (f) q = { ...q, position: f.position, pattern: f.pattern };
    return q;
  });
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

export const useStore = create<State>((set, get) => {
  const commit = (parts: Part[], extra: Partial<State> = {}) =>
    set((s) => ({ past: [...s.past.slice(-99), s.parts], future: [], parts: fixHolesIn(syncLids(s.parts, syncFigurines(parts))), check: null, ...extra }));

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
    spots: { x: number; y: number; s: [number, number]; set: string; notch?: number }[],
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
          pattern: { id, kind: 'sym', i: k, n: spots.length, s, c: [round(center[0] - p3[0]), round(center[1] - p3[1])] },
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
    toast: null,
    fitRequest: 0,
    check: null,
    measure: false,
    measureHover: null,
    recent: loadRecent(),
    suggest: null,
    dismissSuggest: () => set({ suggest: null }),
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

    select: (id) => set((s) => ({ selectedId: id, suggest: s.suggest && s.suggest.id === id ? s.suggest : null })),
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

    matchingBolt(id) {
      const { parts } = get();
      const src = parts.find((x) => x.id === id);
      if (!src) return;
      const depth = Number(src.params.H) || 12;
      const bolt = makePart('bolt', parts, {
        name: `Śruba do: ${src.name}`,
        params: { size: src.params.size, D: src.params.D, P: src.params.P, L: src.type === 'threadHole' ? Math.max(3, depth - 1) : Math.max(10, depth + 8), head: 'hex', bore: 0, luz: 0 },
      });
      pushRight(parts, bolt);
      commit([...parts, bolt], { selectedId: bolt.id, fitRequest: get().fitRequest + 1 });
      get().notify('Dodano pasującą śrubę jako osobną bryłę obok modelu.');
    },

    matchingNut(id) {
      const { parts } = get();
      const src = parts.find((x) => x.id === id);
      if (!src) return;
      const nut = makePart('threadNut', parts, { name: `Nakrętka do: ${src.name}`, params: { size: src.params.size, D: src.params.D, P: src.params.P, H: 0, shape: 'hex', luz: 0.3 } });
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
        params: { size: bolt.params.size, D: bolt.params.D, P: bolt.params.P, H: Number(bolt.params.L), luz: 0.3, chamfer: true },
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
            params: { ...defaultParams(DEFS.drawer), W: round(w - 2 * c, 2), H: round(h - 2 * c, 2), D: round(D, 2) },
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
      commit([...parts, lid], { selectedId: lid.id });
      if (slide) get().notify('Pudełko ma rowki, więc pokrywka jest wsuwana: wsuwa się od przodu (luz 0,3 mm na stronę).');
      // Pockets placed by hand in the box: check them now that a lid is coming and offer fixes.
      const issues = magnetIssues(get().parts).filter((i) => i.fix);
      if (issues.length) set({ check: { issues, bodies: 0, title: 'Gniazda na magnesy' } });
    },

    unfitLid(id) {
      commit(get().parts.map((p) => (p.id === id ? { ...p, fitTo: undefined } : p)));
      get().notify('Pokrywka odłączona: jej wymiary nie zmieniają się już razem z pudełkiem.');
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
      if (boxPart && boxPart.params.shape && boxPart.params.shape !== 'rect') return get().notify('Magnesy dodam na razie tylko do prostokątnego pudełka.');
      const box = bodyBox(parts, body);
      const [res] = buildBodies(parts, [body]);
      if (!res || box.isEmpty()) return;
      const spots = planSpots(res.manifold, box, opt);
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
      spots.forEach((sp, k) => {
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
              pattern: { id: (colPats[sp.set] ??= uid()), kind: 'sym', i: k, n: spots.length, s: sp.s, c: [round(c[0] - pos[0]), round(c[1] - pos[1])] },
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
            pattern: { id: (pats[sp.set] ??= uid()), kind: 'sym', i: k, n: spots.length, s: sp.s, c: [round(c[0] - pos[0]), round(c[1] - pos[1])] },
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
            const edge = sp.set === 'sideX' ? ex : sp.set === 'sideY' ? ey : Math.min(ex, ey);
            return { ...sp, notch: sp.column || edge + r + MAGNET_WALL > wall ? notch : undefined };
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
          params: { ...defaultParams(DEFS.lid), W: part.params.W, D: part.params.D, T: 2, R: 0 },
          position: [part.position[0], part.position[1], round(b.max.z)],
          fitTo: part.id,
        });
        commit([...parts, lid], { selectedId: id });
        get().add('hingePip');
        get().notify('Pudełko z pokrywką na zawiasie print-in-place: drukuje się w całości, zawias jest od razu ruchomy.');
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
      const ids = new Set(assembly(parts, body).map((p) => p.id));
      const box = bodyBox(parts, body);
      if (box.isEmpty()) return;
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
      commit(next);
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
        }));
      commit([...parts, ...copies], { selectedId: groupId(nb) });
    },

    removeBody(body) {
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
  const p: Params = { shape: box.params.shape ?? 'rect', W: box.params.W, D: box.params.D, wall: box.params.T };
  // Dividers lowered at least by the rim height don't reach it: no slots needed.
  const clear = (Number(box.params.low) || 0) >= (Number(lid.params.R) || 0);
  p.nx = clear ? 1 : (box.params.nx ?? 1);
  p.ny = clear ? 1 : (box.params.ny ?? 1);
  // The editor's layout and the radial spokes move the slots too.
  p.div = clear ? '' : (box.params.div ?? '');
  p.divMode = box.params.divMode ?? 'grid';
  p.nr = clear ? 0 : (box.params.nr ?? 0);
  p.rot = box.params.rot ?? 0;
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
  return changed ? next : parts;
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
  } catch {
    /* storage unavailable */
  }
});
