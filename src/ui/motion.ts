import { create } from 'zustand';
import { DEFS } from '../catalog';
import type { Motion, Zone } from '../parts/def';
import type { Part, Vec3 } from '../types';

/**
 * Preview of the moving elements (a lid sliding out, drawers): only in the editor, the print stays closed.
 * `base` is what the bar under the model set, `shown` is drawn (it eases towards the target), and hovering
 * an element slides it out on top of `base`.
 */
export interface ZoneHover {
  part: string;
  rig: string;
  label: string;
  group: string;
  motion: string | null;
  /** Static place on the piece (part frame) to outline; moving elements are outlined themselves. */
  box: [Vec3, Vec3] | null;
  x: number;
  y: number;
}

interface MotionState {
  base: Record<string, Record<string, number>>;
  shown: Record<string, Record<string, number>>;
  hover: ZoneHover | null;
  /** The element slid out by hovering: it stays out while the pointer is over the model (until another one is hovered). */
  hoverOpen: { rig: string; key: string } | null;
  /** Group of sizes to open in the panel (n changes on every click, so the same group opens again). */
  focus: { group: string; n: number } | null;
}

export const useMotion = create<MotionState>(() => ({ base: {}, shown: {}, hover: null, hoverOpen: null, focus: null }));

/** Pieces of one model share their motions. */
export const rigOf = (p: Part) => p.rigid ?? p.id;

export function motionsOf(part: Part | undefined): Motion[] {
  if (!part) return [];
  return DEFS[part.type]?.motions?.(part.params) ?? [];
}

export function zonesOf(part: Part): Zone[] {
  return DEFS[part.type]?.zones?.(part.params) ?? [];
}

const target = (s: MotionState, rig: string, key: string) => (s.hoverOpen?.rig === rig && s.hoverOpen.key === key ? 1 : (s.base[rig]?.[key] ?? 0));

let raf = 0;
let last = 0;
let speed = 2.5;   // share of the full travel per second
function tick(t: number) {
  const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
  last = t;
  const s = useMotion.getState();
  const rigs = new Set([...Object.keys(s.base), ...Object.keys(s.shown), ...(s.hoverOpen ? [s.hoverOpen.rig] : [])]);
  let moving = false;
  const shown: MotionState['shown'] = {};
  for (const rig of rigs) {
    const keys = new Set([...Object.keys(s.base[rig] ?? {}), ...Object.keys(s.shown[rig] ?? {}), ...(s.hoverOpen?.rig === rig ? [s.hoverOpen.key] : [])]);
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

let leaveTimer = 0;
/** Pointer over a place of the model (or off the model: null). A moving element slides out and stays out a moment after leaving. */
export function hoverZone(h: ZoneHover | null) {
  const s = useMotion.getState();
  if (h) {
    clearTimeout(leaveTimer);
    leaveTimer = 0;
    const same = s.hover && s.hover.part === h.part && s.hover.label === h.label && s.hover.box === h.box;
    let hoverOpen = s.hoverOpen;
    if (h.motion) hoverOpen = { rig: h.rig, key: h.motion };
    else if (hoverOpen && hoverOpen.rig !== h.rig) hoverOpen = null;
    const changed = hoverOpen?.key !== s.hoverOpen?.key || hoverOpen?.rig !== s.hoverOpen?.rig;
    useMotion.setState({ hover: same ? { ...s.hover!, x: h.x, y: h.y } : h, hoverOpen });
    if (changed) run();
    return;
  }
  if (s.hover) useMotion.setState({ hover: null });
  if (s.hoverOpen && !leaveTimer)
    leaveTimer = window.setTimeout(() => {
      leaveTimer = 0;
      useMotion.setState({ hoverOpen: null });
      run();
    }, 400);
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
