import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { DEFS, paramsOf, type Params } from '../catalog';
import { groupBody, isLocked, useStore } from '../store';
import { built, partMatrix } from '../geom/parts';
import type { Part, Vec3 } from '../types';

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
  const ids = [...new Set([held, hoveredId, selectedId].filter((x): x is string => !!x && groupBody(x) === null))];
  return (
    <>
      {ids.map((id) => {
        const part = parts.find((p) => p.id === id);
        if (!part || part.hidden || isLocked(parts, id) || part.type === 'figurine' || part.type === 'mesh') return null;
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
  const dims = useMemo(() => axisDims(part), [part.type, part.params]); // eslint-disable-line react-hooks/exhaustive-deps
  const handles: HandleDef[] = [];
  dims.forEach((d, a) => {
    if (!d) return;
    handles.push({ axis: a as 0 | 1 | 2, sign: 1, dim: d }, { axis: a as 0 | 1 | 2, sign: -1, dim: d });
  });
  const [hot, setHot] = useState<number | null>(null);
  const [edit, setEdit] = useState<number | null>(null);
  const [live, setLive] = useState<{ i: number; from: number; to: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const near = useNear(part, box, handles);

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
        if (controls) (controls as unknown as { enabled: boolean }).enabled = false;
      }
      const t = along(ev, d);
      if (t === null) return;
      const step = st.settings.grid > 0 && !ev.shiftKey ? st.settings.grid : 0.1;
      const grow = Math.round((t - d.t0) / step) * step;
      const value = d.value + grow / d.h.dim.per;
      const i = handles.findIndex((x) => x.axis === d.h.axis && x.sign === d.h.sign);
      const patch = patchFor(d.start, d.h, value);
      setLive({ i, from: d.value, to: Number(patch.params![d.h.dim.key]) });
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

  const press = (e: ThreeEvent<PointerEvent>, h: HandleDef) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const m = partMatrix(part.position, part.rotation);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const axisWorld = new THREE.Vector3().setComponent(h.axis, h.sign).applyQuaternion(q).normalize();
    const origin = facePoint(h).applyMatrix4(m);
    drag.current = { h, start: part, value: Number(part.params[h.dim.key]), axisWorld, origin, t0: e.point.clone().sub(origin).dot(axisWorld), moved: false, x0: e.nativeEvent.clientX, y0: e.nativeEvent.clientY };
    setEdit(null);
    onHold(true);
  };

  const shown = handles.map((_, i) => (live ? live.i === i : hot === i || edit === i || near.includes(i)));
  return (
    <group position={part.position} rotation={part.rotation.map((r) => r * DEG) as Vec3}>
      {handles.map((h, i) => {
        const at = facePoint(h);
        const active = hot === i || live?.i === i || edit === i;
        return (
          <group key={i}>
            {(active || shown[i]) && <FaceOutline box={box} axis={h.axis} sign={h.sign} strong={active} />}
            <Dot
              position={at}
              visible={shown[i]}
              active={active}
              onPointerDown={(e) => press(e, h)}
              onPointerOver={(e) => (e.stopPropagation(), setHot(i))}
              onPointerOut={() => setHot((x) => (x === i ? null : x))}
            />
            {(active || live?.i === i) && (
              <Html position={at} zIndexRange={[25, 0]} style={{ transform: 'translate(12px, -28px)', pointerEvents: edit === i ? 'auto' : 'none' }}>
                {edit === i ? (
                  <DimInput
                    label={h.dim.label}
                    value={Number(part.params[h.dim.key])}
                    onDone={(v) => {
                      setEdit(null);
                      if (v !== null) useStore.getState().update(part.id, patchFor(part, h, v));
                    }}
                  />
                ) : (
                  <span className="dim-tag">
                    {h.dim.label} {live?.i === i ? `${fmt(live.from)} → ${fmt(live.to)}` : fmt(Number(part.params[h.dim.key]))} mm
                  </span>
                )}
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Indices of the handles within reach of the pointer (about 60 px), so they show only when needed. */
function useNear(part: Part, box: THREE.Box3, handles: HandleDef[]) {
  const { camera, gl } = useThree();
  const [near, setNear] = useState<number[]>([]);
  const key = handles.map((h) => h.axis * 2 + (h.sign > 0 ? 1 : 0)).join(',');
  useEffect(() => {
    const m = partMatrix(part.position, part.rotation);
    const pts = handles.map((h) => {
      const c = box.getCenter(new THREE.Vector3());
      c.setComponent(h.axis, h.sign > 0 ? box.max.getComponent(h.axis) : box.min.getComponent(h.axis));
      return c.applyMatrix4(m);
    });
    const onMove = (ev: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      const next: number[] = [];
      pts.forEach((p, i) => {
        const q = p.clone().project(camera);
        const sx = ((q.x + 1) / 2) * rect.width, sy = ((1 - q.y) / 2) * rect.height;
        if (Math.hypot(sx - x, sy - y) < 60) next.push(i);
      });
      setNear((old) => (old.join() === next.join() ? old : next));
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [part.position, part.rotation, box, key, camera, gl]); // eslint-disable-line react-hooks/exhaustive-deps
  return near;
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
      <sphereGeometry args={[active ? 1.3 : 0.9, 14, 10]} />
      <meshBasicMaterial color={active ? '#f3b47e' : '#ffffff'} transparent opacity={visible ? 1 : 0} depthTest={false} depthWrite={false} />
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
      <lineBasicMaterial color={strong ? '#f3b47e' : '#c99a6e'} transparent opacity={strong ? 1 : 0.55} depthTest={!strong} />
    </line>
  );
}

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
