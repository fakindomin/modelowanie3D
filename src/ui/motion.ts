import { create } from 'zustand';
import { DEFS } from '../catalog';
import type { Motion, Zone } from '../parts/def';
import type { Part, Vec3 } from '../types';

/**
 * Preview of the moving elements (a lid sliding out, drawers): only in the editor, the print stays closed.
 * `base` is what the bar under the model set, `shown` is drawn (it eases towards the target), and hovering
 * hovering or clicking an element only outlines it; a picked element can be dragged along its track.
 */
export interface ZoneHover {
  part: string;
  rig: string;
  label: string;
  group: string;
  motion: string | null;
  /** Static place on the piece (part frame) to outline; moving elements are outlined themselves. */
  box: [Vec3, Vec3] | null;
  /** The place has its own shape (a round socket): outlined by that shape instead of the box. */
  solid: boolean;
  x: number;
  y: number;
}

interface MotionState {
  base: Record<string, Record<string, number>>;
  shown: Record<string, Record<string, number>>;
  hover: ZoneHover | null;
  /** The clicked place or element (outlined until another click; a picked element can be dragged along its track). */
  picked: ZoneHover | null;
  /** Group of sizes to open in the panel (n changes on every click, so the same group opens again). */
  focus: { group: string; n: number } | null;
}

export const useMotion = create<MotionState>(() => ({ base: {}, shown: {}, hover: null, picked: null, focus: null }));

/** Pieces of one model share their motions. */
export const rigOf = (p: Part) => p.rigid ?? p.id;

export function motionsOf(part: Part | undefined): Motion[] {
  if (!part) return [];
  return DEFS[part.type]?.motions?.(part.params) ?? [];
}

export function zonesOf(part: Part): Zone[] {
  return DEFS[part.type]?.zones?.(part.params) ?? [];
}

const target = (s: MotionState, rig: string, key: string) => s.base[rig]?.[key] ?? 0;

let raf = 0;
let last = 0;
let speed = 2.5;   // share of the full travel per second
function tick(t: number) {
  const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
  last = t;
  const s = useMotion.getState();
  const rigs = new Set([...Object.keys(s.base), ...Object.keys(s.shown)]);
  let moving = false;
  const shown: MotionState['shown'] = {};
  for (const rig of rigs) {
    const keys = new Set([...Object.keys(s.base[rig] ?? {}), ...Object.keys(s.shown[rig] ?? {})]);
    const row: Record<string, number> = {};
    for (const k of keys) {
      const cur = s.shown[rig]?.[k] ?? 0, to = target(s, rig, k);
      const d = to - cur, step = speed * dt;
      row[k] = Math.abs(d) <= step ? to : cur + Math.sign(d) * step;
      if (row[k] !== to) moving = true;
    }
    shown[rig] = row;
  }
  useMotion.setState({ shown });
  if (moving) raf = requestAnimationFrame(tick);
  else {
    raf = 0;
    last = 0;
  }
}
function run(v = 2.5) {
  speed = v;
  if (!raf) raf = requestAnimationFrame(tick);
}

/** Sets elements of a model; `ease` slides them there, otherwise they jump (dragging the slider). */
export function setMotion(rig: string, values: Record<string, number>, ease = false) {
  const s = useMotion.getState();
  const base = { ...s.base, [rig]: { ...s.base[rig], ...values } };
  if (ease) {
    useMotion.setState({ base });
    run();
  } else useMotion.setState({ base, shown: { ...s.shown, [rig]: { ...s.shown[rig], ...values } } });
}

let playTimer = 0;
/** ▶: everything slides out together, waits a moment and slides back. */
export function play(rig: string, keys: string[]) {
  clearTimeout(playTimer);
  const all = (v: number) => Object.fromEntries(keys.map((k) => [k, v]));
  const s = useMotion.getState();
  const open = keys.every((k) => (s.base[rig]?.[k] ?? 0) >= 1);
  useMotion.setState({ base: { ...s.base, [rig]: { ...s.base[rig], ...all(open ? 0 : 1) } } });
  run(1.1);
  if (!open)
    playTimer = window.setTimeout(() => {
      const t = useMotion.getState();
      useMotion.setState({ base: { ...t.base, [rig]: { ...t.base[rig], ...all(0) } } });
      run(1.1);
    }, 2200);
}

/** Pointer over a place of the model (or off the model: null): only the outline and the name, nothing moves. */
export function hoverZone(h: ZoneHover | null) {
  const s = useMotion.getState();
  if (!h) {
    if (s.hover) useMotion.setState({ hover: null });
    return;
  }
  const same = s.hover && s.hover.part === h.part && s.hover.label === h.label;
  useMotion.setState({ hover: same ? { ...s.hover!, x: h.x, y: h.y } : h });
}

/** Clicked place: its outline stays until another click. */
export function pickZone(h: ZoneHover | null) {
  useMotion.setState({ picked: h });
}

let focusN = 0;
export function focusGroup(group: string) {
  useMotion.setState({ focus: { group, n: ++focusN } });
}

/** The place of the model under a point of a piece (part frame, closed position): the smallest box holding it. */
export function zoneAt(part: Part, local: Vec3): Zone | null {
  let best: Zone | null = null;
  let vol = Infinity;
  for (const z of zonesOf(part)) {
    const [a, b] = z.box;
    if (local.some((v, i) => v < a[i] || v > b[i])) continue;
    const v = (b[0] - a[0]) * (b[1] - a[1]) * (b[2] - a[2]);
    if (v < vol) {
      vol = v;
      best = z;
    }
  }
  return best;
}
