import { create } from 'zustand';
import * as THREE from 'three';
import { DEFS } from '../catalog';
import type { Motion, Zone } from '../parts/def';
import type { Part, Vec3 } from '../types';
import { useStore } from '../store';
import { assemblyMotions } from './assembly';

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

/** Moving elements of a part: its own (a lid of the accessory box) and the one carrying it in an assembly (a lid onto its box). */
export function motionsOf(part: Part | undefined): Motion[] {
  if (!part) return [];
  const own = DEFS[part.type]?.motions?.(part.params) ?? [];
  const w = assemblyMotions(useStore.getState().parts).get(part.id);
  return w ? [...own, w] : own;
}

/** The value a part's motion keys under (pieces of one set share it; a gasket follows its cap). */
export const rigFor = (part: Part, m: Motion) => m.rig ?? rigOf(part);

/** What an element shows before anyone moves it. */
const rests = new Map<string, number>();
export function noteRest(rig: string, m: Motion) {
  if (m.rest) rests.set(rig + '/' + m.key, m.rest);
}
export const restOf = (rig: string, key: string) => rests.get(rig + '/' + key) ?? 0;
/** Value drawn now. */
export const shownOf = (s: { shown: Record<string, Record<string, number>> }, rig: string, key: string) => s.shown[rig]?.[key] ?? restOf(rig, key);
/** Value set now. */
export const baseOf = (s: { base: Record<string, Record<string, number>> }, rig: string, key: string) => s.base[rig]?.[key] ?? restOf(rig, key);

export function zonesOf(part: Part): Zone[] {
  return DEFS[part.type]?.zones?.(part.params) ?? [];
}

const target = (s: MotionState, rig: string, key: string) => baseOf(s, rig, key);

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
      const cur = shownOf(s, rig, k), to = target(s, rig, k);
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
export function play(items: { rig: string; key: string }[]) {
  clearTimeout(playTimer);
  const setAll = (v: number) => {
    const base = { ...useMotion.getState().base };
    for (const { rig, key } of items) base[rig] = { ...base[rig], [key]: v };
    useMotion.setState({ base });
    run(1.1);
  };
  const s = useMotion.getState();
  // Closed first, then open, then back where everything was (a lid beside its box returns to the bed).
  const back = items.map(({ rig, key }) => ({ rig, key, v: baseOf(s, rig, key) }));
  setAll(0);
  playTimer = window.setTimeout(() => {
    setAll(1);
    playTimer = window.setTimeout(() => {
      const base = { ...useMotion.getState().base };
      for (const { rig, key, v } of back) base[rig] = { ...base[rig], [key]: v };
      useMotion.setState({ base });
      run(1.1);
    }, 2000);
  }, back.some((b) => b.v > 0) ? 1800 : 0);
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

/** Pose of a moving element at value v (0 = closed), in its part's frame (or the scene's for `world`): turned about its pivot, then moved. */
export function motionPose(m: Motion, v: number): { position: Vec3; quaternion: THREE.Quaternion } {
  let mv: Vec3, rot: Vec3 = [0, 0, 0], at: Vec3 = m.at ?? [0, 0, 0];
  const q = new THREE.Quaternion();
  if (m.keys) {
    const keys = m.keys;
    let i = 0;
    while (i < keys.length - 2 && v > keys[i + 1].v) i++;
    const a = keys[i], b = keys[i + 1] ?? a;
    const t = b.v === a.v ? 0 : Math.min(1, Math.max(0, (v - a.v) / (b.v - a.v)));
    const lerp = (x: Vec3, y: Vec3) => [0, 1, 2].map((k) => x[k] + (y[k] - x[k]) * t) as Vec3;
    mv = lerp(a.move, b.move);
    rot = lerp(a.rot ?? [0, 0, 0], b.rot ?? [0, 0, 0]);
    q.setFromEuler(new THREE.Euler(...(rot.map((d) => (d * Math.PI) / 180) as Vec3), 'ZYX'));
  } else {
    mv = [m.move[0] * v, m.move[1] * v, m.move[2] * v];
    if (m.turn) {
      q.setFromAxisAngle(new THREE.Vector3(...m.turn.axis).normalize(), (m.turn.deg * v * Math.PI) / 180);
      at = m.turn.at;
    }
  }
  const pv = new THREE.Vector3(...at);
  // R·(x − at) + at + move
  const p = pv.clone().sub(pv.clone().applyQuaternion(q)).add(new THREE.Vector3(...mv));
  return { position: [p.x, p.y, p.z], quaternion: q };
}

/** A point of the element (part frame, closed position) where it is at value v. */
export function motionPoint(m: Motion, v: number, local: THREE.Vector3): THREE.Vector3 {
  const { position, quaternion } = motionPose(m, v);
  return local.clone().applyQuaternion(quaternion).add(new THREE.Vector3(...position));
}
