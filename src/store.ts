import { create } from 'zustand';
import * as THREE from 'three';
import { DEFS, cabinetOpenings, defaultParams, type Params } from './catalog';
import { built, partMatrix, worldBox } from './geom/parts';
import { figurine, figurineParams, fitHeight, FIG_MODELS } from './parts/figurine';
import { runCheck, type CheckResult } from './geom/check';
import type { Part, Project, ProjectV1, Tab, Texture, Vec3 } from './types';

const PALETTE = ['#4f8edc', '#e0864a', '#5bb37a', '#c96bc4', '#d9b84a', '#53b6c4', '#d76565', '#8a8fdc'];
const FIG_PALETTE = ['#e9d8c4', '#f0b6a8', '#b9d7a8', '#a8c8e8', '#f2d68a', '#d8b8e8'];
export const HOLE_COLOR = '#8b939e';
const STORAGE_KEY = 'modelowanie3d.project';
const DEG = Math.PI / 180;

export interface Settings {
  grid: number;
  snap: boolean;
  stick: boolean;
  /** Thinnest wall the printer handles (two nozzle lines), used by "Sprawdź model". */
  minWall: number;
}

export type PatternKind = 'linear' | 'circle' | 'corners' | 'mirrorX' | 'mirrorY';
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
    return q;
  });
}

export const useStore = create<State>((set, get) => {
  const commit = (parts: Part[], extra: Partial<State> = {}) =>
    set((s) => ({ past: [...s.past.slice(-99), s.parts], future: [], parts: fixHolesIn(syncFigurines(parts)), check: null, ...extra }));

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
    if (sel && def.place) {
      const pl = def.place(sel.box, params);
      position = pl.position;
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
        hole: piece.hole,
        color: piece.hole ? HOLE_COLOR : PALETTE[(next.length + 1) % PALETTE.length],
        body,
        link,
        rigid: link,
      });
      if (piece.hole) part.avoidBody = solidBody;
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
    fit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),

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

    select: (id) => set({ selectedId: id }),
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
      const lid = makePart('lid', parts, {
        params: { ...defaultParams(DEFS.lid), W: box.params.W, D: box.params.D, wall: box.params.T },
        position: [round(b.max.x + 10 + Number(box.params.W) / 2), round(box.position[1]), 0],
      });
      commit([...parts, lid], { selectedId: lid.id });
    },

    pattern(id, kind, opt) {
      const { parts } = get();
      const src = parts.find((x) => x.id === id);
      if (!src) return;
      const link = src.link ?? uid();
      let ref = bodyBox(parts, src.body, src.id);
      if (ref.isEmpty()) ref = worldBox(src);
      const center = ref.getCenter(new THREE.Vector3());
      const copies: { position: Vec3; rotation: Vec3 }[] = [];
      let moved: Vec3 | null = null;
      const n = Math.max(2, Math.round(opt.count));
      if (kind === 'linear') {
        for (let i = 1; i < n; i++) {
          const pos = [...src.position] as Vec3;
          pos[opt.axis] += opt.distance * i;
          copies.push({ position: pos, rotation: src.rotation });
        }
      } else if (kind === 'circle') {
        const dx = src.position[0] - center.x, dy = src.position[1] - center.y;
        let R = opt.radius > 0 ? opt.radius : Math.hypot(dx, dy);
        if (R < 0.5) R = Math.max(5, Math.min(ref.max.x - ref.min.x, ref.max.y - ref.min.y) * 0.3);
        const a0 = Math.hypot(dx, dy) > 0.5 ? Math.atan2(dy, dx) : 0;
        moved = [center.x + R * Math.cos(a0), center.y + R * Math.sin(a0), src.position[2]];
        for (let i = 1; i < n; i++) {
          const a = a0 + (i * 2 * Math.PI) / n;
          copies.push({ position: [center.x + R * Math.cos(a), center.y + R * Math.sin(a), src.position[2]], rotation: rotationAfter(src.rotation, AXES[2], (i * 360) / n) });
        }
      } else if (kind === 'corners') {
        const e = opt.inset;
        const pts: [number, number][] = [
          [ref.min.x + e, ref.min.y + e],
          [ref.max.x - e, ref.min.y + e],
          [ref.max.x - e, ref.max.y - e],
          [ref.min.x + e, ref.max.y - e],
        ];
        moved = [pts[0][0], pts[0][1], src.position[2]];
        for (const [x, y] of pts.slice(1)) copies.push({ position: [x, y, src.position[2]], rotation: src.rotation });
      } else {
        const ax = kind === 'mirrorX' ? 0 : 1;
        const pos = [...src.position] as Vec3;
        pos[ax] = 2 * (ax === 0 ? center.x : center.y) - pos[ax];
        const S = new THREE.Matrix4().makeScale(ax === 0 ? -1 : 1, ax === 1 ? -1 : 1, 1);
        const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(src.rotation.map((r) => r * DEG) as Vec3)));
        const e = new THREE.Euler().setFromRotationMatrix(S.clone().multiply(R).multiply(S));
        copies.push({ position: pos, rotation: [e.x, e.y, e.z].map((r) => round(r / DEG, 2)) as Vec3 });
      }
      const next = parts.map((p) => (p.id === src.id ? { ...p, link, position: moved ? r3(moved) : p.position } : p));
      copies.forEach((c, i) => {
        next.push({ ...src, id: uid(), name: `${src.name} · ${i + 2}`, params: { ...src.params }, link, position: r3(c.position), rotation: c.rotation });
      });
      commit(next);
      get().notify(`Dodano ${copies.length} ${copies.length === 1 ? 'kopię' : 'kopii'}. Są powiązane: zmiana wymiarów jednej zmienia wszystkie.`);
    },

    unlink(id) {
      const p = get().parts.find((x) => x.id === id);
      if (!p?.link) return;
      commit(get().parts.map((x) => (x.id === id ? { ...x, link: undefined } : x)));
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
        return { ...p, position: r3(pos.toArray() as Vec3), rotation: rotationAfter(p.rotation, AXES[axis], degrees) };
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

/** Body (other than `exclude`) whose solids overlap the given part the most, or null. */
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
