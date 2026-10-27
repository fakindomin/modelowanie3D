import { create } from 'zustand';
import * as THREE from 'three';
import { DEFS, cabinetOpenings, defaultParams, type Params } from './catalog';
import { built, partMatrix, worldBox } from './geom/parts';
import type { Part, Project, Vec3 } from './types';

const PALETTE = ['#4f8edc', '#e0864a', '#5bb37a', '#c96bc4', '#d9b84a', '#53b6c4', '#d76565', '#8a8fdc'];
const HOLE_COLOR = '#8b939e';
const STORAGE_KEY = 'modelowanie3d.project';
const DEG = Math.PI / 180;

export interface Settings {
  grid: number;
  snap: boolean;
  stick: boolean;
}

interface State {
  parts: Part[];
  selectedId: string | null;
  past: Part[][];
  future: Part[][];
  settings: Settings;
  preview: boolean;
  snapTargets: string[];
  toast: string | null;
  fitRequest: number;
  fit(): void;

  select(id: string | null): void;
  add(type: string, overrides?: Partial<Part> & { params?: Params }): string;
  update(id: string, patch: Partial<Part>): void;
  /** Updates without recording history; pair with beginGesture(). */
  updateLive(id: string, patch: Partial<Part>): void;
  beginGesture(): void;
  remove(id: string): void;
  duplicate(id: string): void;
  rotateBy(id: string, axis: 0 | 1 | 2, degrees: number): void;
  dropToFloor(id: string): void;
  matchingHole(id: string): void;
  addDrawers(id: string): void;
  addLid(id: string): void;
  /** Moves holes that no longer touch their own body into the body they now sit in. */
  fixHoles(): void;
  mergeAll(): void;
  undo(): void;
  redo(): void;
  load(project: Project): void;
  reset(): void;
  setSettings(s: Partial<Settings>): void;
  setPreview(v: boolean): void;
  setSnapTargets(ids: string[]): void;
  notify(msg: string): void;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

function nextBody(parts: Part[]) {
  return parts.reduce((m, p) => Math.max(m, p.body), 0) + 1;
}

function overlaps(a: THREE.Box3, b: THREE.Box3, eps = 0.01) {
  return a.min.x < b.max.x - eps && a.max.x > b.min.x + eps && a.min.y < b.max.y - eps && a.max.y > b.min.y + eps && a.min.z < b.max.z - eps && a.max.z > b.min.z + eps;
}

function volume(b: THREE.Box3) {
  const s = b.getSize(new THREE.Vector3());
  return Math.max(s.x, 0) * Math.max(s.y, 0) * Math.max(s.z, 0);
}

function loadSaved(): Part[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      if (Array.isArray(p.parts)) return p.parts.filter((x) => DEFS[x.type]);
    }
  } catch {
    /* ignore broken or blocked storage */
  }
  return [];
}

export const useStore = create<State>((set, get) => {
  const commit = (parts: Part[], extra: Partial<State> = {}) =>
    set((s) => ({ past: [...s.past.slice(-99), s.parts], future: [], parts: fixHolesIn(parts), ...extra }));

  const makePart = (type: string, parts: Part[], overrides: Partial<Part> = {}): Part => {
    const def = DEFS[type];
    const count = parts.filter((p) => p.type === type).length + 1;
    return {
      id: uid(),
      type,
      name: `${def.label} ${count}`,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      color: def.hole ? HOLE_COLOR : PALETTE[parts.length % PALETTE.length],
      hole: def.hole,
      body: nextBody(parts),
      ...overrides,
      params: { ...defaultParams(def), ...(overrides.params ?? {}) },
    };
  };

  return {
    parts: loadSaved(),
    selectedId: null,
    past: [],
    future: [],
    settings: { grid: 1, snap: true, stick: true },
    preview: false,
    snapTargets: [],
    toast: null,
    fitRequest: 0,
    fit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),

    select: (id) => set({ selectedId: id }),

    add(type, overrides = {}) {
      const { parts, selectedId } = get();
      const sel = parts.find((p) => p.id === selectedId);
      const part = makePart(type, parts, overrides);
      if (!overrides.position) {
        const local = built(part).box;
        const size = local.getSize(new THREE.Vector3());
        if (sel) {
          // Build onto the selected part: centred on its top face, holes drilled in from the top.
          const sb = worldBox(sel);
          const c = sb.getCenter(new THREE.Vector3());
          part.position = [round(c.x), round(c.y), round(part.hole ? sb.max.z - size.z : sb.max.z)];
          if (overrides.body === undefined) part.body = sel.body;
        } else if (parts.length) {
          const maxX = Math.max(...parts.map((p) => worldBox(p).max.x));
          part.position = [Math.ceil(maxX + 10 + size.x / 2), 0, 0];
        }
      }
      commit([...parts, part], { selectedId: part.id, fitRequest: get().fitRequest + (sel ? 0 : 1) });
      return part.id;
    },

    update(id, patch) {
      commit(get().parts.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    },

    updateLive(id, patch) {
      set((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    },

    beginGesture() {
      set((s) => ({ past: [...s.past.slice(-99), s.parts], future: [] }));
    },

    remove(id) {
      commit(
        get().parts.filter((p) => p.id !== id),
        { selectedId: null },
      );
    },

    duplicate(id) {
      const { parts } = get();
      const src = parts.find((p) => p.id === id);
      if (!src) return;
      const w = worldBox(src).getSize(new THREE.Vector3()).x;
      const copy: Part = {
        ...src,
        id: uid(),
        name: `${src.name} (kopia)`,
        params: { ...src.params },
        position: [round(src.position[0] + w + 5), src.position[1], src.position[2]],
        body: src.hole ? src.body : nextBody(parts),
      };
      commit([...parts, copy], { selectedId: copy.id });
    },

    rotateBy(id, axis, degrees) {
      const p = get().parts.find((x) => x.id === id);
      if (!p) return;
      const minZ = worldBox(p).min.z;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation.map((r) => r * DEG) as Vec3)));
      const ax = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, degrees * DEG));
      const e = new THREE.Euler().setFromQuaternion(q);
      const rotation = [e.x, e.y, e.z].map((r) => {
        const d = round(r / DEG, 2);
        return Math.abs(d) < 1e-6 ? 0 : d;
      }) as Vec3;
      // Keep the part resting at the same height so rotating doesn't sink it into the bed.
      const nb = worldBox(p, p.position, rotation);
      const position: Vec3 = [p.position[0], p.position[1], round(p.position[2] + minZ - nb.min.z)];
      get().update(id, { rotation, position });
    },

    dropToFloor(id) {
      const p = get().parts.find((x) => x.id === id);
      if (!p) return;
      get().update(id, { position: [p.position[0], p.position[1], round(p.position[2] - worldBox(p).min.z)] });
    },

    matchingHole(id) {
      const { parts } = get();
      const peg = parts.find((x) => x.id === id);
      if (!peg) return;
      const square = peg.type === 'pegSquare';
      const params: Params = square
        ? { W: Number(peg.params.W), D: Number(peg.params.W), H: Number(peg.params.H) + 0.5, luz: 0.3 }
        : { D: Number(peg.params.D), H: Number(peg.params.H) + 0.5, luz: 0.3 };
      const hole = makePart(square ? 'holeBox' : 'hole', parts, {
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
      for (const op of o.openings) {
        const local = new THREE.Vector3(op.cx, -o.D / 2 + D / 2, op.z0 + c).applyMatrix4(mat);
        next.push(
          makePart('drawer', next, {
            params: { ...defaultParams(DEFS.drawer), W: round(w - 2 * c, 2), H: round(h - 2 * c, 2), D: round(D, 2) },
            position: [round(local.x), round(local.y), round(local.z)],
            rotation: [...cab.rotation],
          }),
        );
      }
      commit(next);
      get().notify(`Dodano ${o.openings.length} szuflad z luzem 0,3 mm.`);
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

    fixHoles() {
      const { parts } = get();
      const next = fixHolesIn(parts);
      if (next !== parts) set({ parts: next });
    },

    mergeAll() {
      commit(get().parts.map((p) => ({ ...p, body: 1 })));
      get().notify('Wszystkie elementy tworzą teraz jedną bryłę.');
    },

    undo() {
      const { past, parts, future } = get();
      if (!past.length) return;
      set({ parts: past[past.length - 1], past: past.slice(0, -1), future: [parts, ...future] });
    },

    redo() {
      const { past, parts, future } = get();
      if (!future.length) return;
      set({ parts: future[0], future: future.slice(1), past: [...past, parts] });
    },

    load(project) {
      commit(project.parts.filter((p) => DEFS[p.type]), { selectedId: null });
    },

    reset() {
      commit([], { selectedId: null });
    },

    setSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),
    setPreview: (v) => set({ preview: v, selectedId: v ? null : get().selectedId }),
    setSnapTargets: (ids) => {
      const cur = get().snapTargets;
      if (cur.length !== ids.length || cur.some((c, i) => c !== ids[i])) set({ snapTargets: ids });
    },
    notify(msg) {
      set({ toast: msg });
      setTimeout(() => get().toast === msg && set({ toast: null }), 4000);
    },
  };
});

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
  if (s.parts === prev.parts) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, parts: s.parts } satisfies Project));
  } catch {
    /* storage unavailable */
  }
});
