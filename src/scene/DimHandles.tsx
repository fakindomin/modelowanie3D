import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { DEFS, paramsOf, type Params } from '../catalog';
import { groupBody, isLocked, useStore } from '../store';
import { built, partMatrix, segments } from '../geom/parts';
import { motionPose, motionsOf, rigOf, shownOf, useMotion } from '../ui/motion';
import type { Part, Vec3 } from '../types';
import { REMOVED_TYPES, mainOf } from '../simple';

const DEG = Math.PI / 180;
const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Which parameter sets the size along one local axis, and how much the size grows per unit of it. */
interface AxisDim {
  key: string;
  label: string;
  per: number;
  min: number;
  max: number;
}

const dimCache = new Map<string, (AxisDim | null)[]>();

/**
 * Finds, by trying, which numeric parameter drives the part's size along X, Y and Z: each one is nudged
 * and the box that grows by the most (ideally one for one) is its axis. Works for every part type.
 */
export function axisDims(part: Part): (AxisDim | null)[] {
  const k = part.type + JSON.stringify(part.params);
  const hit = dimCache.get(k);
  if (hit) return hit;
  const job = dimJob(part);
  let step = job.next();
  while (!step.done) step = job.next();
  return step.value;
}

/**
 * The same search one parameter at a time: each try rebuilds the whole part (a big model takes a second or two
 * for all of them), so it runs between frames and the view never freezes on the first grab.
 */
function* dimJob(part: Part): Generator<void, (AxisDim | null)[]> {
  const k = part.type + JSON.stringify(part.params);
  const def = DEFS[part.type];
  const out: (AxisDim | null)[] = [null, null, null];
  const best = [0, 0, 0];
  const size = (p: Params) => built({ ...part, params: p, texture: undefined, edges: undefined }).box.getSize(new THREE.Vector3()).toArray();
  if (def && !part.params.ref) {
    const s0 = size(part.params);
    for (const d of paramsOf(def, part.params)) {
      if (d.type !== 'number' || (d.show && !d.show(part.params))) continue;
      if (d.unit !== 'mm') continue;
      const v = Number(part.params[d.key]);
      if (!Number.isFinite(v)) continue;
      yield;
      const step = v + 1 <= d.max ? 1 : -1;
      const s1 = size({ ...part.params, [d.key]: v + step });
      for (let a = 0; a < 3; a++) {
        const per = (s1[a] - s0[a]) / step;
        // One for one is a plain size; a smaller share (a lip, a wall) only counts when nothing better exists.
        const score = Math.abs(per) > 0.3 ? 1 / (1 + Math.abs(Math.abs(per) - 1)) : 0;
        if (score > best[a]) {
          best[a] = score;
          out[a] = { key: d.key, label: d.label, per, min: d.min, max: d.max };
        }
      }
    }
  }
  dimCache.set(k, out);
  if (dimCache.size > 300) dimCache.delete(dimCache.keys().next().value!);
  return out;
}

const running = new Map<string, Promise<(AxisDim | null)[]>>();
/** Size parameters of a part, found in small steps between frames (at once when already known). */
function axisDimsLater(part: Part): Promise<(AxisDim | null)[]> {
  const k = part.type + JSON.stringify(part.params);
  const hit = dimCache.get(k);
  if (hit) return Promise.resolve(hit);
  let pr = running.get(k);
  if (!pr) {
    const job = dimJob(part);
    pr = new Promise((done) => {
      const tick = () => {
        // Sizes changed meanwhile (a slider dragged): this part no longer exists, stop.
        if (!useStore.getState().parts.some((p) => p.type + JSON.stringify(p.params) === k)) {
          running.delete(k);
          done([null, null, null]);
          return;
        }
        const t0 = performance.now();
        let step = job.next();
        // A few cheap tries per frame; one heavy try at most.
        while (!step.done && performance.now() - t0 < 8) step = job.next();
        if (step.done) {
          running.delete(k);
          done(step.value);
        } else setTimeout(tick, 0);
      };
      setTimeout(tick, 0);
    });
    running.set(k, pr);
  }
  return pr;
}

/** Size handles wait for their parameters (found in the background). */
function useAxisDims(part: Part): (AxisDim | null)[] {
  const k = part.type + JSON.stringify(part.params);
  const [dims, setDims] = useState<{ k: string; d: (AxisDim | null)[] } | null>(() => (dimCache.has(k) ? { k, d: dimCache.get(k)! } : null));
  useEffect(() => {
    if (dims?.k === k) return;
    let live = true;
    axisDimsLater(part).then((d) => live && setDims({ k, d }));
    return () => {
      live = false;
    };
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return dims?.k === k ? dims.d : (dimCache.get(k) ?? [null, null, null]);
}

/** Warms the size parameters of the model's parts in the background, so the first grab shows its handles at once. */
export function warmDims(parts: Part[]) {
  for (const p of parts) if (!p.hole && !p.hidden && p.type !== 'figurine' && p.type !== 'mesh') void axisDimsLater(p);
}

interface HandleDef {
  axis: 0 | 1 | 2;
  sign: 1 | -1;
  dim: AxisDim;
}

/** Size handles of the part under the cursor (or the selected one): drag a face, the opposite one stays. */
export function DimHandles() {
  const parts = useStore((s) => s.parts);
  const selectedId = useStore((s) => s.selectedId);
  const hoveredId = useStore((s) => s.hoveredId);
  const [held, setHeld] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => warmDims(parts), 400);
    return () => clearTimeout(t);
  }, [parts]);
  // A picked body, a magnet pocket or a label stands for the part the body is known by.
  const resolve = (x: string | null) => {
    if (!x) return null;
    // A moving element (a drawer, a lid) shows its own sizes, which travel with it.
    const own = parts.find((p) => p.id === x);
    if (own && !own.hole && motionsOf(own).some((m) => m.world || m.pieces.includes(String(own.params.piece ?? '')))) return x;
    const gb = groupBody(x) ?? parts.find((p) => p.id === x && (p.hole || REMOVED_TYPES.has(p.type)) && !p.wiz)?.body ?? null;
    return gb !== null ? (mainOf(parts, gb)?.id ?? null) : x;
  };
  // A model with moving elements and named places (the accessory box): the pointer only outlines, sizes show on a click.
  const hov = parts.find((p) => p.id === hoveredId);
  const quiet = !!hov && !!(DEFS[hov.type]?.motions || DEFS[hov.type]?.zones || motionsOf(hov).some((m) => m.world));
  // Such a model shows sizes only for the element clicked in it (a drawer, the lid), not for the whole piece picked on loading.
  const picked = useMotion((s) => s.picked);
  const zonedSel = (x: string | null) => {
    const p = parts.find((q) => q.id === x);
    return !!p && !!(DEFS[p.type]?.motions || DEFS[p.type]?.zones || motionsOf(p).some((m) => m.world)) && picked?.part !== x;
  };
  const ids = [...new Set([held, quiet ? null : resolve(hoveredId), zonedSel(selectedId) ? null : resolve(selectedId)].filter((x): x is string => !!x))];
  return (
    <>
      {ids.map((id) => {
        const part = parts.find((p) => p.id === id);
        if (!part || part.hidden || part.hole || isLocked(parts, id) || part.type === 'figurine' || part.type === 'mesh') return null;
        return <PartHandles key={id} part={part} onHold={(on) => setHeld(on ? id : null)} />;
      })}
    </>
  );
}

interface Drag {
  h: HandleDef;
  start: Part;
  value: number;
  axisWorld: THREE.Vector3;
  origin: THREE.Vector3;
  t0: number;
  moved: boolean;
  x0: number;
  y0: number;
}

function PartHandles({ part, onHold }: { part: Part; onHold: (on: boolean) => void }) {
  const { camera, gl, controls } = useThree();
  const box = built(part).box;
  // A drawer or lid moved in the preview carries its sizes along: the world pose of an assembly, then the
  // part's own pose, then the element's pose in the part (the furthest-out element when there are several).
  const w = motionsOf(part).find((m) => m.world) ?? null;
  const rig = w ? w.rig! : rigOf(part);
  const wv = useMotion((s) => (w ? shownOf(s, rig, w.key) : 0));
  const row = useMotion((s) => s.shown[rig]);
  const wpose = w ? motionPose(w, wv) : null;
  let lm = null as ReturnType<typeof motionPose> | null;
  let best = 0;
  // With several elements in one piece (two drawers) the lines measure the one that is out.
  const segs = segments(part);
  let seg: (typeof segs)[number] | null = null;
  // The clicked drawer is measured even when the other one is further out.
  const pick = useMotion((s) => (s.picked && s.picked.rig === rig ? s.picked.motion : null));
  const chosen = segs.length > 1 && pick ? segs.find((sg) => sg.m?.key === pick) : undefined;
  for (const sg of chosen ? [chosen] : segs) {
    const v = sg.m ? (row?.[sg.m.key] ?? 0) : 0;
    if (sg.m && (chosen || v > best)) {
      best = v;
      lm = motionPose(sg.m, v);
      seg = segs.length > 1 ? sg : null;
    }
  }
  const poseMatrix = (mt: { position: Vec3; quaternion: THREE.Quaternion } | null) => (mt ? new THREE.Matrix4().compose(new THREE.Vector3(...mt.position), mt.quaternion, new THREE.Vector3(1, 1, 1)) : new THREE.Matrix4());
  const fullMatrix = () => poseMatrix(wpose).multiply(partMatrix(part.position, part.rotation)).multiply(poseMatrix(lm));
  const dims = useAxisDims(part);
  // Like a drawing: one dimension line per size, on the sides facing the viewer; its knob moves that side.
  const side = useViewSide(part, box);
  const handles: HandleDef[] = [];
  dims.forEach((d, a) => {
    if (!d) return;
    // Width and depth grow from either end (a knob on each); height only upwards, the part stands on the bed.
    if (a === 2) handles.push({ axis: 2, sign: 1, dim: d });
    else handles.push({ axis: a as 0 | 1, sign: 1, dim: d }, { axis: a as 0 | 1, sign: -1, dim: d });
  });
  const [hot, setHot] = useState<number | null>(null);
  const [edit, setEdit] = useState<number | null>(null);
  const [live, setLive] = useState<{ i: number; from: number; to: number; limit?: string } | null>(null);
  const dimHover = useStore((s) => s.dimHover);
  const setDimHover = useStore((s) => s.setDimHover);
  // The handle under the cursor (or held) lights up its row in the panel.
  const lit = live?.i ?? hot;
  const litKey = lit !== null && handles[lit] ? handles[lit].dim.key : null;
  useEffect(() => {
    if (litKey) setDimHover(litKey);
    return () => {
      if (litKey && useStore.getState().dimHover === litKey) setDimHover(null);
    };
  }, [litKey, setDimHover]);
  const drag = useRef<Drag | null>(null);

  const facePoint = (h: HandleDef, b = box) => {
    const c = b.getCenter(new THREE.Vector3());
    c.setComponent(h.axis, h.sign > 0 ? b.max.getComponent(h.axis) : b.min.getComponent(h.axis));
    return c;
  };

  /** Part patch for a new value: size changes, the face opposite the handle stays where it was. */
  const patchFor = (src: Part, h: HandleDef, value: number): Partial<Part> => {
    const v = Math.round(Math.min(h.dim.max, Math.max(h.dim.min, value)) * 100) / 100;
    const params = { ...src.params, [h.dim.key]: v };
    const b0 = built(src).box;
    const b1 = built({ ...src, params }).box;
    const shift = new THREE.Vector3();
    for (let a = 0; a < 3; a++) {
      if (a === h.axis) shift.setComponent(a, h.sign > 0 ? b0.min.getComponent(a) - b1.min.getComponent(a) : b0.max.getComponent(a) - b1.max.getComponent(a));
      else if (a === 2) shift.setComponent(a, b0.min.z - b1.min.z);
      else shift.setComponent(a, (b0.min.getComponent(a) + b0.max.getComponent(a)) / 2 - (b1.min.getComponent(a) + b1.max.getComponent(a)) / 2);
    }
    shift.applyEuler(new THREE.Euler(...(src.rotation.map((r) => r * DEG) as Vec3)));
    const position = src.position.map((p, k) => Math.round((p + shift.getComponent(k)) * 1000) / 1000) as Vec3;
    return { params, position };
  };

  useEffect(() => {
    const ray = new THREE.Raycaster();
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 3) return;
      const st = useStore.getState();
      if (!d.moved) {
        d.moved = true;
        st.beginGesture();
      }
      const t = along(ev, d);
      if (t === null) return;
      // Whole millimetres; Shift for tenths.
      const step = ev.shiftKey ? 0.1 : 1;
      const grow = Math.round((t - d.t0) / step) * step;
      const value = d.value + grow / d.h.dim.per;
      const i = handles.findIndex((x) => x.axis === d.h.axis && x.sign === d.h.sign);
      const patch = patchFor(d.start, d.h, value);
      const to = Number(patch.params![d.h.dim.key]);
      // The handle stops at the limit and says so.
      setLive({ i, from: d.value, to, limit: value > d.h.dim.max ? 'maks.' : value < d.h.dim.min ? 'min.' : undefined });
      st.updateLive(d.start.id, patch);
    };
    const along = (ev: PointerEvent, d: Drag) => {
      const rect = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1), camera);
      // Closest point of the pointer ray to the handle's line.
      const w0 = d.origin.clone().sub(ray.ray.origin);
      const a = d.axisWorld, b = ray.ray.direction;
      const ab = a.dot(b), aw = a.dot(w0), bw = b.dot(w0);
      const den = 1 - ab * ab;
      if (den < 1e-4) return null;
      return (ab * bw - aw) / den;
    };
    const up = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      onHold(false);
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      setLive(null);
      if (!d.moved) setEdit(handles.findIndex((x) => x.axis === d.h.axis && x.sign === d.h.sign));
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !drag.current) return;
      const d = drag.current;
      drag.current = null;
      onHold(false);
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      setLive(null);
      if (d.moved) useStore.getState().undo();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  });

  const press = (e: ThreeEvent<PointerEvent>, h: HandleDef, knob: THREE.Vector3) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const m = fullMatrix();
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const axisWorld = new THREE.Vector3().setComponent(h.axis, h.sign).applyQuaternion(q).normalize();
    // Measure along a line through the knob's centre, so the first move does not jump by the knob's offset from the face.
    const origin = knob.clone().applyMatrix4(m);
    drag.current = { h, start: part, value: Number(part.params[h.dim.key]), axisWorld, origin, t0: 0, moved: false, x0: e.nativeEvent.clientX, y0: e.nativeEvent.clientY };
    setEdit(null);
    onHold(true);
    // The view must not turn while a size is held: the camera would grab the very first move.
    if (controls) (controls as unknown as { enabled: boolean }).enabled = false;
  };

  const geo = seg ? seg.geometry : built(part).geometry;
  if (seg && !seg.geometry.boundingBox) seg.geometry.computeBoundingBox();
  const lineBox = seg ? seg.geometry.boundingBox! : box;
  const off = Math.max(4, 0.09 * Math.max(...lineBox.getSize(new THREE.Vector3()).toArray()));
  return (
    <group position={wpose?.position ?? [0, 0, 0]} quaternion={wpose?.quaternion}>
    <group position={part.position} rotation={part.rotation.map((r) => r * DEG) as Vec3}>
    <group position={lm?.position ?? [0, 0, 0]} quaternion={lm?.quaternion}>
      {[0, 1, 2].map((axis) => {
        const own = handles.map((h, i) => [h, i] as const).filter(([h]) => h.axis === axis);
        if (!own.length) return null;
        const h = own[0][0];
        const mine = (x: number | null | undefined) => x != null && own.some(([, i]) => i === x);
        const { p1, p2, out, ticks } = dimLine(lineBox, h.axis, side, off, geo);
        const mid = p1.clone().add(p2).multiplyScalar(0.5);
        const active = mine(hot) || mine(live?.i) || mine(edit) || (!live && h.dim.key === dimHover);
        const param = Number(part.params[h.dim.key]);
        // The line shows the length it measures. A size set by something else (the box's width follows the grinder's
        // diameter) is named by its direction, and a typed length is turned into that parameter.
        const len = Math.round((lineBox.max.getComponent(axis) - lineBox.min.getComponent(axis)) * 10) / 10;
        const plain = Math.abs(len - param) <= Math.max(2, 0.05 * len);
        const name = plain ? h.dim.label : AXIS_NAME[axis];
        const value = !plain ? len : mine(live?.i) ? live!.to : param;
        const editing = own.find(([, i]) => i === edit);
        return (
          <group key={axis}>
            <DimLine pts={[p1, p2, ...ticks]} active={active} />
            {/* A knob on each end that can move: it sits on the side it moves, so it stays under the cursor. */}
            {own.map(([k, i]) => {
              const at = k.sign > 0 ? p2 : p1;
              return (
                <Dot
                  key={i}
                  position={at}
                  visible
                  active={hot === i || live?.i === i}
                  onPointerDown={(e) => press(e, k, at)}
                  onPointerOver={(e) => (e.stopPropagation(), setHot(i))}
                  onPointerOut={() => setHot((x) => (x === i ? null : x))}
                />
              );
            })}
            <Html position={mid.clone().addScaledVector(out, off * 1.5)} center zIndexRange={[25, 0]} style={{ pointerEvents: editing ? 'auto' : 'none' }}>
              {editing ? (
                <DimInput
                  label={name}
                  value={plain ? param : len}
                  onDone={(typed) => {
                    setEdit(null);
                    const v = typed === null || plain ? typed : Math.round((param + (typed - len) / h.dim.per) * 100) / 100;
                    if (v !== null) useStore.getState().update(part.id, patchFor(part, editing[0], v));
                    if (v !== null && (v > h.dim.max || v < h.dim.min)) useStore.getState().notify(`${h.dim.label}: ${v > h.dim.max ? 'maks.' : 'min.'} ${fmt(v > h.dim.max ? h.dim.max : h.dim.min)} mm.`);
                  }}
                />
              ) : (
                <span className={active ? 'dim-tag on' : 'dim-tag'}>
                  {active && <i>{name} </i>}
                  {fmt(value)} mm
                  {mine(live?.i) && live!.limit && <b className="dim-limit"> {live!.limit}</b>}
                </span>
              )}
            </Html>
          </group>
        );
      })}
    </group>
    </group>
    </group>
  );
}

/** Which way (±1 on X and Y, in the part's own axes) the viewer looks from; follows the camera as it turns. */
function useViewSide(part: Part, box: THREE.Box3): [1 | -1, 1 | -1] {
  const { camera } = useThree();
  const [side, setSide] = useState<[1 | -1, 1 | -1]>([1, -1]);
  useFrame(() => {
    const inv = partMatrix(part.position, part.rotation).invert();
    const c = camera.position.clone().applyMatrix4(inv).sub(box.getCenter(new THREE.Vector3()));
    const next: [1 | -1, 1 | -1] = [c.x >= 0 ? 1 : -1, c.y >= 0 ? 1 : -1];
    if (next[0] !== side[0] || next[1] !== side[1]) setSide(next);
  });
  return side;
}

/**
 * A drawing's dimension line for one axis, beside the box on the viewer's side: width along the front
 * bottom edge, depth along the side bottom edge, height up the far front corner.
 */
function dimLine(b: THREE.Box3, axis: 0 | 1 | 2, side: [1 | -1, 1 | -1], off: number, geo?: THREE.BufferGeometry) {
  const [sx, sy] = side;
  const fy = sy > 0 ? b.max.y : b.min.y, fx = sx > 0 ? b.max.x : b.min.x;
  const z = b.min.z;
  let p1: THREE.Vector3, p2: THREE.Vector3, out: THREE.Vector3, e1: THREE.Vector3, e2: THREE.Vector3;
  if (axis === 0) {
    out = new THREE.Vector3(0, sy, 0);
    p1 = new THREE.Vector3(b.min.x, fy + sy * off, z);
    p2 = new THREE.Vector3(b.max.x, fy + sy * off, z);
    e1 = new THREE.Vector3(b.min.x, fy, z);
    e2 = new THREE.Vector3(b.max.x, fy, z);
  } else if (axis === 1) {
    out = new THREE.Vector3(sx, 0, 0);
    p1 = new THREE.Vector3(fx + sx * off, b.min.y, z);
    p2 = new THREE.Vector3(fx + sx * off, b.max.y, z);
    e1 = new THREE.Vector3(fx, b.min.y, z);
    e2 = new THREE.Vector3(fx, b.max.y, z);
  } else {
    const cx = sx > 0 ? b.min.x : b.max.x;
    out = new THREE.Vector3(-sx, 0, 0);
    p1 = new THREE.Vector3(cx - sx * off, fy, b.min.z);
    p2 = new THREE.Vector3(cx - sx * off, fy, b.max.z);
    e1 = new THREE.Vector3(cx, fy, b.min.z);
    e2 = new THREE.Vector3(cx, fy, b.max.z);
  }
  const over = (p: THREE.Vector3) => p.clone().addScaledVector(out, off * 0.25);
  // Extension lines from the edge to a little past the dimension line, as on a drawing.
  // Arrowheads at both ends, in the plane of the line and its extension lines, as on a drawing.
  const dir = p2.clone().sub(p1).normalize(), a = off * 0.45;
  const head = (p: THREE.Vector3, d: THREE.Vector3) => [p, p.clone().addScaledVector(d, a).addScaledVector(out, a * 0.35), p, p.clone().addScaledVector(d, a).addScaledVector(out, -a * 0.35)];
  const heads = [...head(p1, dir), ...head(p2, dir.clone().negate())];
  return { p1, p2, out, ticks: [touch(geo, e1, axis), over(p1), touch(geo, e2, axis), over(p2), ...heads] };
}

const touchCache = new WeakMap<THREE.BufferGeometry, Map<string, THREE.Vector3>>();
/**
 * Where an extension line meets the model: the point of the model on the same end plane (top, side…)
 * closest to the corner of its box, so the line touches the part and not empty air beside it.
 */
function touch(geo: THREE.BufferGeometry | undefined, corner: THREE.Vector3, axis: number): THREE.Vector3 {
  const pos = geo?.getAttribute('position');
  if (!geo || !pos) return corner;
  let m = touchCache.get(geo);
  if (!m) touchCache.set(geo, (m = new Map()));
  const k = axis + ':' + corner.toArray().map((v) => v.toFixed(2)).join();
  const hit = m.get(k);
  if (hit) return hit;
  const c = corner.getComponent(axis);
  let best = corner, bd = Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (Math.abs(v.getComponent(axis) - c) > 0.02) continue;
    const d = v.distanceToSquared(corner);
    if (d < bd) {
      bd = d;
      best = v.clone();
    }
  }
  m.set(k, best);
  return best;
}

/** The dimension line and its two extension lines; orange while its knob is under the cursor or held. */
function DimLine({ pts, active }: { pts: THREE.Vector3[]; active: boolean }) {
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints(pts), [pts.map((p) => p.toArray().join()).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo} renderOrder={6}>
      <lineBasicMaterial color={active ? '#ff9a5c' : '#dfe6e0'} transparent opacity={active ? 1 : 0.8} depthTest={false} depthWrite={false} />
    </lineSegments>
  );
}

/** Small dot that keeps the same size on screen at any zoom. */
const noHit = () => null;

/** World size of one "unit" that looks the same on screen at this point, whatever the zoom. */
export function screenScale(camera: THREE.Camera, w: THREE.Vector3) {
  return camera instanceof THREE.PerspectiveCamera ? w.distanceTo(camera.position) * Math.tan((camera.fov * DEG) / 2) * 0.012 : (1 / (camera as THREE.OrthographicCamera).zoom) * 6;
}
type PEv = (e: ThreeEvent<PointerEvent>) => void;
function Dot({ position, visible, active, ...ev }: { position: THREE.Vector3; visible: boolean; active: boolean; onPointerDown: PEv; onPointerOver: PEv; onPointerOut: PEv }) {
  const ref = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const w = m.getWorldPosition(new THREE.Vector3());
    const k = screenScale(camera, w);
    // The parent may be rotated but never scaled, so a plain scale is the on-screen size.
    m.scale.setScalar(k);
  });
  return (
    <mesh ref={ref} position={position} userData={{ handle: true }} renderOrder={7} raycast={visible ? THREE.Mesh.prototype.raycast : noHit} {...ev}>
      <sphereGeometry args={[active ? 1.8 : 1.3, 16, 12]} />
      <meshBasicMaterial color={active ? '#ff9a5c' : '#ffffff'} transparent opacity={visible ? 1 : 0} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

/** Outline of one face of the part's box, lit while its handle is near or held. */
function FaceOutline({ box, axis, sign, strong }: { box: THREE.Box3; axis: 0 | 1 | 2; sign: 1 | -1; strong: boolean }) {
  const geo = useMemo(() => {
    const [u, v] = [0, 1, 2].filter((a) => a !== axis);
    const f = sign > 0 ? box.max.getComponent(axis) : box.min.getComponent(axis);
    const corner = (cu: number, cv: number) => {
      const p = new THREE.Vector3();
      p.setComponent(axis, f);
      p.setComponent(u, cu);
      p.setComponent(v, cv);
      return p;
    };
    const lo = box.min, hi = box.max;
    const pts = [corner(lo.getComponent(u), lo.getComponent(v)), corner(hi.getComponent(u), lo.getComponent(v)), corner(hi.getComponent(u), hi.getComponent(v)), corner(lo.getComponent(u), hi.getComponent(v))];
    return new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
  }, [box, axis, sign]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    // @ts-expect-error three's <line> clashes with the SVG one in JSX types
    <line geometry={geo} renderOrder={6}>
      <lineBasicMaterial color={strong ? '#ff9a5c' : '#c94f10'} transparent opacity={strong ? 1 : 0.55} depthTest={!strong} />
    </line>
  );
}

const AXIS_NAME = ['Szerokość', 'Głębokość', 'Wysokość'];

function DimInput({ label, value, onDone }: { label: string; value: number; onDone: (v: number | null) => void }) {
  const [text, setText] = useState(String(value).replace('.', ','));
  return (
    <span className="dim-tag edit" onPointerDown={(e) => e.stopPropagation()}>
      {label}
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            const v = Number(text.replace(',', '.'));
            onDone(Number.isFinite(v) && v > 0 ? v : null);
          }
          if (e.key === 'Escape') onDone(null);
        }}
        onBlur={() => onDone(null)}
      />
      mm
    </span>
  );
}
