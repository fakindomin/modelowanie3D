import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges, GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { assembly, bodyBox, groupBody, groupId, isLocked, useStore } from '../store';
import { built, buildBodies, worldBox, type BodyResult } from '../geom/parts';
import { finishing, warped } from '../geom/modify';
import { moverFor, snapMover, snapPosition } from '../geom/snap';
import type { Part, TextureFace, Vec3 } from '../types';
import type { WallSide } from '../parts/connectors';
import { distance, featureAt, type Feature } from './measure';
import { SketchHandles } from './SketchHandles';
import { DimHandles } from './DimHandles';

const DEG = Math.PI / 180;
const BED = 220;
const noRaycast = () => null;

/** The arrow gizmo: while one of its handles is under the pointer, clicks belong to it, not to the parts behind. */
const gizmo: { controls: { axis: string | null; dragging: boolean } | null; pick: { prev: string | null } | null } = { controls: null, pick: null };
(globalThis as unknown as { __gizmo: typeof gizmo }).__gizmo = gizmo;
export const gizmoBusy = () => !!gizmo.controls && (gizmo.controls.axis !== null || gizmo.controls.dragging);

interface Look {
  selected: boolean;
  hovered: boolean;
  /** Linked copy of the selection (edits go to both). */
  sibling: boolean;
  snap: boolean;
}

/** Above this many vertices, outlines cost too much: highlight with a tint instead. */
const EDGE_LIMIT = 60000;

function PartMesh({ part, look, ghost }: { part: Part; look: Look; ghost: boolean }) {
  const { geometry } = built(part);
  const heavy = geometry.attributes.position.count > EDGE_LIMIT;
  const edge = heavy ? null : look.selected ? '#ffffff' : look.snap ? '#5bb974' : look.hovered ? '#f3b47e' : look.sibling ? '#c99a6e' : null;
  const tint = look.selected && heavy ? '#5a3c22' : look.hovered ? '#3e3a36' : '#000000';
  return (
    <group name={part.id} position={part.position} rotation={part.rotation.map((r) => r * DEG) as Vec3}>
      <mesh geometry={geometry} castShadow={!part.hole} receiveShadow renderOrder={part.hole ? 2 : 1} userData={{ pick: part.id }}>
        {part.hole ? (
          <meshStandardMaterial color={look.hovered || look.selected ? '#d6d8da' : part.color} transparent opacity={ghost ? (look.hovered || look.selected ? 0.3 : 0.1) : look.hovered ? 0.6 : 0.42} depthWrite={false} roughness={0.6} />
        ) : (
          <meshStandardMaterial color={part.color} roughness={0.55} metalness={0.05} emissive={tint} emissiveIntensity={tint === '#000000' ? 0 : 0.55} />
        )}
        {edge && <Edges threshold={20} color={edge} lineWidth={look.selected ? 2 : 1.5} />}
        {!edge && ghost && !heavy && <Edges threshold={20} color="#8b939e" lineWidth={1} />}
      </mesh>
    </group>
  );
}

/** Solid of a merged body: invisible pick-through anchor for gizmos, outline when selected. */
function MergedMember({ part, look }: { part: Part; look: Look }) {
  const { geometry } = built(part);
  return (
    <group name={part.id} position={part.position} rotation={part.rotation.map((r) => r * DEG) as Vec3}>
      {(look.selected || look.hovered) && geometry.attributes.position.count <= EDGE_LIMIT && (
        <mesh geometry={geometry} raycast={noRaycast}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Edges threshold={20} color={look.selected ? '#ffffff' : '#f3b47e'} lineWidth={1.5} />
        </mesh>
      )}
    </group>
  );
}

/** Builds the cut result of the given bodies in the background of edits (debounced). */
function useBodies(parts: Part[], only: number[] | undefined, key: string) {
  const [bodies, setBodies] = useState<BodyResult[]>([]);
  // Results on screen; the ones they replace are freed after the new ones are committed (not inside a
  // state updater, which React may call twice).
  const shown = useRef<BodyResult[]>([]);
  useEffect(() => {
    const t = setTimeout(() => setBodies(only && !only.length ? [] : buildBodies(parts, only)), 30);
    return () => clearTimeout(t);
  }, [parts, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const prev = shown.current;
    shown.current = bodies;
    if (prev !== bodies) prev.forEach(freeBody);
  }, [bodies]);
  useEffect(
    () => () => {
      shown.current.forEach(freeBody);
      shown.current = [];
    },
    [],
  );
  return bodies;
}

function freeBody(b: BodyResult) {
  b.geometry.dispose();
  b.manifold.delete();
}

function PreviewBodies() {
  const parts = useStore((s) => s.parts);
  const bodies = useBodies(parts, undefined, 'all');
  const shown = (body: number) => parts.some((p) => p.body === body && !p.hole && !p.hidden);
  return (
    <>
      {bodies.filter((b) => shown(b.body)).map((b) => (
        <mesh key={b.body} geometry={b.geometry} castShadow receiveShadow>
          <meshStandardMaterial color={b.color} roughness={0.5} />
        </mesh>
      ))}
    </>
  );
}

function MergedBodies({ selectedBody, hoveredBody }: { selectedBody: number | null; hoveredBody: number | null }) {
  const parts = useStore((s) => s.parts);
  const merged = useMemo(() => [...new Set(parts.filter((p) => (p.merged || finishing(p)) && !p.hole).map((p) => p.body))].sort((a, b) => a - b), [parts]);
  const bodies = useBodies(parts, merged, merged.join(','));
  const hidden = new Set(merged.filter((b) => parts.filter((p) => p.body === b && !p.hole).every((p) => p.hidden)));
  return (
    <>
      {bodies.filter((b) => !hidden.has(b.body)).map((b) => (
        <mesh key={b.body} geometry={b.geometry} castShadow receiveShadow userData={{ pick: groupId(b.body) }}>
          <meshStandardMaterial
            color={b.color}
            roughness={0.5}
            emissive={selectedBody === b.body && b.geometry.attributes.position.count > EDGE_LIMIT ? '#5a3c22' : hoveredBody === b.body ? '#3e3a36' : '#000000'}
            emissiveIntensity={hoveredBody === b.body || selectedBody === b.body ? 0.55 : 0}
          />
          {selectedBody === b.body && b.geometry.attributes.position.count <= EDGE_LIMIT && <Edges threshold={20} color="#ffffff" lineWidth={2} />}
        </mesh>
      ))}
    </>
  );
}

/** Pick ids under the pointer, best first: holes of the body under the cursor win over its solids. */
function candidates(e: ThreeEvent<PointerEvent>): string[] {
  const parts = useStore.getState().parts;
  const hits: { id: string; d: number }[] = [];
  const seen = new Set<string>();
  for (const it of e.intersections) {
    let o: THREE.Object3D | null = it.object;
    while (o && o.userData.pick === undefined) o = o.parent;
    const id = o?.userData.pick as string | undefined;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    hits.push({ id, d: it.distance });
  }
  if (!hits.length) return [];
  const byId = new Map(parts.map((p) => [p.id, p]));
  const bodyOf = (id: string) => groupBody(id) ?? byId.get(id)?.body ?? null;
  const front = bodyOf(hits[0].id);
  const isHole = (id: string) => byId.get(id)?.hole === true;
  const preferred = hits.filter((h) => isHole(h.id) && bodyOf(h.id) === front);
  return [...preferred.map((h) => h.id), ...hits.filter((h) => !preferred.includes(h)).map((h) => h.id)];
}

let cancelDrag = () => {};

interface Drag {
  /** Part id, or group id for a whole body. */
  target: string;
  plane: THREE.Plane;
  offset: THREE.Vector3;
  startX: number;
  startY: number;
  moved: boolean;
  /** Clicking again (without moving) on the selection picks the next thing under the cursor. */
  cycle: string[] | null;
  start: Record<string, Vec3>;
  anchor: Vec3;
}

function Scene() {
  const parts = useStore((s) => s.parts);
  const selectedId = useStore((s) => s.selectedId);
  const hoveredId = useStore((s) => s.hoveredId);
  const snapTargets = useStore((s) => s.snapTargets);
  const { camera, gl, controls } = useThree();
  if (import.meta.env.DEV) (globalThis as unknown as { __camera: THREE.Camera }).__camera = camera;
  const drag = useRef<Drag | null>(null);
  cancelDrag = () => (drag.current = null);

  useEffect(() => {
    const ray = new THREE.Raycaster();
    const hit = new THREE.Vector3();
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved) {
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 4) return;
        d.moved = true;
        useStore.getState().beginGesture();
        if (controls) (controls as unknown as { enabled: boolean }).enabled = false;
      }
      const rect = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1), camera);
      if (!ray.ray.intersectPlane(d.plane, hit)) return;
      const st = useStore.getState();
      const opt = { grid: st.settings.grid, snap: st.settings.snap && !ev.altKey, stick: st.settings.stick && !ev.shiftKey, axes: [true, true, false] as [boolean, boolean, boolean] };
      const proposed: Vec3 = [hit.x + d.offset.x, hit.y + d.offset.y, d.anchor[2]];
      const gb = groupBody(d.target);
      if (gb !== null) {
        const group = st.parts.filter((p) => d.start[p.id]);
        const startParts = group.map((p) => ({ ...p, position: d.start[p.id] }));
        const { position, targets } = snapMover(moverFor(startParts, d.anchor), proposed, st.parts.filter((p) => !d.start[p.id]), opt);
        st.setSnapTargets(targets);
        st.moveManyLive(d.start, [position[0] - d.anchor[0], position[1] - d.anchor[1], position[2] - d.anchor[2]]);
        return;
      }
      const cur = st.parts.find((p) => p.id === d.target);
      if (!cur) return;
      const { position, targets } = snapPosition(cur, [proposed[0], proposed[1], cur.position[2]], st.parts, opt);
      st.setSnapTargets(targets);
      st.updateLive(cur.id, { position });
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      if (!d) return;
      const st = useStore.getState();
      if (d.moved) {
        st.setSnapTargets([]);
        if (groupBody(d.target) === null) st.afterMove(d.target);
        else st.fixHoles();
      } else if (d.cycle && d.cycle.length > 1) {
        const i = d.cycle.indexOf(d.target);
        st.select(d.cycle[(i + 1) % d.cycle.length]);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [camera, gl, controls]);

  /** "Wymiary" mode: the feature under the pointer (first surface hit). */
  const measureAt = (e: ThreeEvent<PointerEvent>): Feature | null => {
    const it = e.intersections.find((i) => i.object instanceof THREE.Mesh && i.faceIndex != null);
    if (!it) return null;
    let o: THREE.Object3D | null = it.object;
    while (o && o.userData.pick === undefined) o = o.parent;
    const mesh = it.object as THREE.Mesh;
    const rect = gl.domElement.getBoundingClientRect();
    const toScreen = (v: THREE.Vector3) => {
      const q = v.clone().project(camera);
      return new THREE.Vector2(((q.x + 1) / 2) * rect.width, ((1 - q.y) / 2) * rect.height);
    };
    return featureAt({
      geometry: mesh.geometry,
      matrix: mesh.matrixWorld,
      faceIndex: it.faceIndex!,
      point: it.point,
      pick: (o?.userData.pick as string) ?? '',
      toScreen,
      cursor: new THREE.Vector2(e.nativeEvent.clientX - rect.left, e.nativeEvent.clientY - rect.top),
    });
  };

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    // A point or edge of the selected sketch takes the press, even behind the solid.
    if (e.intersections.some((i) => i.object.userData.sketchHandle || i.object.userData.handle)) return;
    e.stopPropagation();
    if (gizmoBusy()) return;
    if (useStore.getState().measure) {
      const f = measureAt(e);
      if (f) useStore.getState().addPin(f);
      return;
    }
    const cands = candidates(e);
    if (!cands.length) return;
    const st = useStore.getState();
    const sel = st.selectedId;
    // Touch has no hover: if the gizmo turns out to take this press, it undoes this pick (see Gizmo).
    gizmo.pick = { prev: sel };
    setTimeout(() => (gizmo.pick = null), 0);
    const target = sel && cands.includes(sel) ? sel : cands[0];
    if (e.nativeEvent.ctrlKey || e.nativeEvent.metaKey || e.nativeEvent.shiftKey) {
      st.toggleMulti(cands.find((c) => c !== sel && !st.multi.includes(c)) ?? target);
      return;
    }
    st.select(target);
    if (isLocked(st.parts, target)) return;
    const gb = groupBody(target);
    const members = gb !== null ? assembly(st.parts, gb) : [];
    const part = st.parts.find((p) => p.id === target);
    const anchor: Vec3 = gb !== null ? [...(members.find((p) => !p.hole) ?? members[0]).position] : [...part!.position];
    drag.current = {
      target,
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -e.point.z),
      offset: new THREE.Vector3(anchor[0] - e.point.x, anchor[1] - e.point.y, 0),
      startX: e.nativeEvent.clientX,
      startY: e.nativeEvent.clientY,
      moved: false,
      cycle: target === sel ? cands : null,
      start: Object.fromEntries(members.map((p) => [p.id, [...p.position] as Vec3])),
      anchor,
    };
  };

  /** Double click on a face: pick the part and that face (texture, label and magnets in the panel). */
  const onDouble = (e: ThreeEvent<MouseEvent>) => {
    const st = useStore.getState();
    if (st.measure || gizmoBusy()) return;
    const it = e.intersections.find((i) => i.object instanceof THREE.Mesh && i.faceIndex != null && i.face && !i.object.userData.sketchHandle && !i.object.userData.handle);
    if (!it) return;
    e.stopPropagation();
    let o: THREE.Object3D | null = it.object;
    while (o && o.userData.pick === undefined) o = o.parent;
    const pick = (o?.userData.pick as string) ?? '';
    let part = st.parts.find((p) => p.id === pick);
    const gb = groupBody(pick) ?? (part?.hole ? part.body : null);
    if (gb !== null) {
      // A group or a hole: the face belongs to the body's largest solid.
      const solids = st.parts.filter((p) => p.body === gb && !p.hole);
      part = solids.sort((a, b) => worldBox(b).getSize(new THREE.Vector3()).length() - worldBox(a).getSize(new THREE.Vector3()).length())[0];
    }
    if (!part) return;
    const mesh = it.object as THREE.Mesh;
    const nWorld = it.face!.normal.clone().transformDirection(mesh.matrixWorld);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation.map((r) => (r * Math.PI) / 180) as Vec3)));
    const nLocal = nWorld.clone().applyQuaternion(q.invert());
    const rect = gl.domElement.getBoundingClientRect();
    const toScreen = (v: THREE.Vector3) => {
      const p = v.clone().project(camera);
      return new THREE.Vector2(((p.x + 1) / 2) * rect.width, ((1 - p.y) / 2) * rect.height);
    };
    // Far from the cursor, so the face is taken, never an edge.
    const f = featureAt({ geometry: mesh.geometry, matrix: mesh.matrixWorld, faceIndex: it.faceIndex!, point: it.point, pick, toScreen, cursor: new THREE.Vector2(-1e6, -1e6) });
    st.select(part.id);
    st.setFaceSel({ id: part.id, face: faceOf(nLocal), side: sideOfNormal(nWorld), tris: f?.tris ?? [] });
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (drag.current?.moved) return;
    if (gizmoBusy()) return useStore.getState().setHover(null);
    if (useStore.getState().measure) {
      const f = measureAt(e);
      const rect = gl.domElement.getBoundingClientRect();
      useStore.getState().setMeasureHover(f ? { ...f, x: e.nativeEvent.clientX - rect.left, y: e.nativeEvent.clientY - rect.top } : null);
      useStore.getState().setHover(f ? f.pick : null);
      return;
    }
    const cands = candidates(e);
    const sel = useStore.getState().selectedId;
    useStore.getState().setHover(cands.length ? (sel && cands.includes(sel) ? sel : cands[0]) : null);
  };

  const multi = useStore((s) => s.multi);
  const selectedPart = parts.find((p) => p.id === selectedId);
  const selBody = groupBody(selectedId);
  const hovBody = groupBody(hoveredId);
  const mergedBodies = new Set(parts.filter((p) => (p.merged || finishing(p)) && !p.hole).map((p) => p.body));
  const bentBodies = new Set(parts.filter(warped).map((p) => p.body));
  const look = (p: Part): Look => ({
    selected: p.id === selectedId || multi.includes(p.id) || (((selBody !== null && p.body === selBody) || multi.includes(groupId(p.body))) && !mergedBodies.has(p.body)),
    hovered: p.id === hoveredId || (hovBody !== null && p.body === hovBody && !mergedBodies.has(p.body)),
    sibling: !!selectedPart?.link && p.link === selectedPart.link && p.id !== selectedPart.id,
    snap: snapTargets.includes(p.id),
  });

  return (
    <group
      onPointerDown={onDown}
      onDoubleClick={onDouble}
      onPointerMove={onMove}
      onPointerOut={() => {
        useStore.getState().setHover(null);
        useStore.getState().setMeasureHover(null);
      }}
    >
      {parts.map((p) =>
        p.hidden && p.id !== selectedId ? null : // A bent body's flat holes would float beside the bent shape: shown only when picked.
        bentBodies.has(p.body) && p.hole && p.id !== selectedId ? null : mergedBodies.has(p.body) && !p.hole ? (
          <MergedMember key={p.id} part={p} look={look(p)} />
        ) : (
          <PartMesh key={p.id} part={p} look={look(p)} ghost={mergedBodies.has(p.body)} />
        ),
      )}
      <MergedBodies selectedBody={selBody ?? multi.map(groupBody).find((b) => b !== null) ?? null} hoveredBody={hovBody} />
      {selBody !== null && <GroupAnchor body={selBody} />}
    </group>
  );
}

/** Empty object at a group's reference point, so the gizmo can grab a whole group. */
function GroupAnchor({ body }: { body: number }) {
  const parts = useStore((s) => s.parts);
  const anchor = parts.find((p) => p.body === body && !p.hole) ?? parts.find((p) => p.body === body);
  if (!anchor) return null;
  return <group name={groupId(body)} position={anchor.position} />;
}

/** Arrow gizmo on the selection, mainly for lifting it up/down and precise axis moves. */
function Gizmo() {
  const selectedId = useStore((s) => s.selectedId);
  const parts = useStore((s) => s.parts);
  const grid = useStore((s) => s.settings.grid);
  const { scene } = useThree();
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const dragging = useRef<{ start: Record<string, Vec3>; anchor: Vec3 } | null>(null);

  useEffect(() => {
    setTarget(selectedId ? (scene.getObjectByName(selectedId) ?? null) : null);
  }, [selectedId, parts, scene]);

  if (!target || !selectedId || scene.getObjectByName(selectedId) !== target || isLocked(parts, selectedId)) return null;
  const gb = groupBody(selectedId);
  return (
    <TransformControls
      ref={(c) => {
        gizmo.controls = c as unknown as typeof gizmo.controls;
      }}
      object={target}
      mode="translate"
      size={0.85}
      translationSnap={grid > 0 ? grid : null}
      onMouseDown={() => {
        const st = useStore.getState();
        if (gizmo.pick) {
          // The same press also hit a part behind the arrow: keep the selection and skip the part drag.
          cancelDrag();
          if (st.selectedId !== gizmo.pick.prev) st.select(gizmo.pick.prev);
          gizmo.pick = null;
        }
        st.beginGesture();
        const members = gb !== null ? assembly(st.parts, gb) : [];
        dragging.current = { start: Object.fromEntries(members.map((p) => [p.id, [...p.position] as Vec3])), anchor: target.position.toArray() as Vec3 };
      }}
      onObjectChange={() => {
        const d = dragging.current;
        if (!d) return;
        const st = useStore.getState();
        const proposed = target.position.toArray() as Vec3;
        if (gb !== null) {
          const delta: Vec3 = [proposed[0] - d.anchor[0], proposed[1] - d.anchor[1], proposed[2] - d.anchor[2]];
          st.moveManyLive(d.start, delta);
          return;
        }
        const cur = st.parts.find((p) => p.id === selectedId);
        if (!cur) return;
        const axes = proposed.map((v, i) => Math.abs(v - cur.position[i]) > 1e-6) as [boolean, boolean, boolean];
        const { position, targets } = snapPosition(cur, proposed, st.parts, { grid: 0, snap: st.settings.snap, stick: false, axes });
        target.position.set(...position);
        st.setSnapTargets(targets);
        st.updateLive(cur.id, { position });
      }}
      onMouseUp={() => {
        dragging.current = null;
        useStore.getState().setSnapTargets([]);
        if (gb === null) useStore.getState().afterMove(selectedId);
        else useStore.getState().fixHoles();
      }}
    />
  );
}

/** Texture face (in the part's own axes) for a normal; round sides give "around", slopes nothing. */
function faceOf(n: THREE.Vector3): TextureFace | null {
  const a = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
  if (a[2] > 0.9) return n.z > 0 ? 'top' : 'bottom';
  if (a[0] > 0.9) return n.x > 0 ? 'right' : 'left';
  if (a[1] > 0.9) return n.y > 0 ? 'back' : 'front';
  return a[2] < 0.3 ? 'around' : null;
}

/** World wall side a normal points to (labels and magnets go there), or nothing for a slope. */
function sideOfNormal(n: THREE.Vector3): WallSide | null {
  const a = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
  if (a[2] > 0.9) return n.z > 0 ? 'top' : 'bottom';
  if (a[0] > 0.9) return n.x > 0 ? 'right' : 'left';
  if (a[1] > 0.9) return n.y > 0 ? 'back' : 'front';
  return null;
}

/** The face picked by a double click, tinted while its part stays selected. */
function FaceSelMark() {
  const fs = useStore((s) => s.faceSel);
  const sel = useStore((s) => s.selectedId);
  const f = useMemo(() => (fs && fs.tris.length ? ({ kind: 'face', pick: fs.id, label: '', values: [], tris: fs.tris, anchor: [0, 0, 0] } as Feature) : null), [fs]);
  if (!f || fs!.id !== sel) return null;
  return <FeatureMark f={f} color="#e8873a" />;
}

const HOVER_COLOR = '#ffd54a';
const PIN_COLOR = '#5bb974';

/** Highlight of one measured feature: its faces, or its edge line. */
function FeatureMark({ f, color }: { f: Feature; color: string }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(f.tris ?? f.line ?? [], 3));
    return g;
  }, [f]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (f.tris)
    return (
      <mesh geometry={geo} raycast={noRaycast} renderOrder={10}>
        <meshBasicMaterial color={color} transparent opacity={0.45} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
    );
  if (f.line) return <LineOf geo={geo} color={color} />;
  return null;
}

function LineOf({ geo, color }: { geo: THREE.BufferGeometry; color: string }) {
  const line = useMemo(() => {
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false }));
    l.renderOrder = 11;
    l.raycast = noRaycast;
    return l;
  }, [geo, color]);
  useEffect(() => () => (line.material as THREE.Material).dispose(), [line]);
  return <primitive object={line} />;
}

function Segment({ from, to }: { from: Vec3; to: Vec3 }) {
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]), [from, to]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <LineOf geo={geo} color="#ffffff" />;
}

function MeasureMarks() {
  const hover = useStore((s) => s.measureHover);
  const pins = useStore((s) => s.pins);
  const on = useStore((s) => s.measure);
  if (!on) return null;
  return (
    <>
      {hover && <FeatureMark f={hover} color={HOVER_COLOR} />}
      {pins.map((p, i) => (
        <FeatureMark key={i} f={p} color={PIN_COLOR} />
      ))}
      {pins.map((p, i) => {
        if (i % 2 === 0 || !pins[i - 1]) return null;
        const d = distance(pins[i - 1], p);
        return <Segment key={`d${i}`} from={d.from} to={d.to} />;
      })}
    </>
  );
}

/** Frames all parts (or the bed when empty) whenever a fit is requested. */
/** The plane where the split tool will cut, across the body it cuts. */
function CutPlane() {
  const cut = useStore((s) => s.cutPlane);
  const parts = useStore((s) => s.parts);
  if (!cut) return null;
  const b = bodyBox(parts, cut.body);
  if (b.isEmpty()) return null;
  const c = b.getCenter(new THREE.Vector3());
  const sz = b.getSize(new THREE.Vector3()).addScalar(16);
  c.setComponent(cut.axis, cut.at);
  const size: [number, number] = cut.axis === 0 ? [sz.z, sz.y] : cut.axis === 1 ? [sz.x, sz.z] : [sz.x, sz.y];
  const rot: [number, number, number] = cut.axis === 0 ? [0, Math.PI / 2, 0] : cut.axis === 1 ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <mesh position={c.toArray()} rotation={rot} raycast={noRaycast} renderOrder={5}>
      <planeGeometry args={size} />
      <meshBasicMaterial color="#e8873a" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function CameraFit() {
  const fitRequest = useStore((s) => s.fitRequest);
  const { camera, controls } = useThree();
  useEffect(() => {
    if (!fitRequest) return;
    const parts = useStore.getState().parts;
    const box = new THREE.Box3();
    parts.forEach((p) => box.union(worldBox(p)));
    if (box.isEmpty()) box.set(new THREE.Vector3(-BED / 2, -BED / 2, 0), new THREE.Vector3(BED / 2, BED / 2, 20));
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 30);
    const dist = radius / Math.sin(((camera as THREE.PerspectiveCamera).fov * DEG) / 2);
    camera.position.copy(center).add(new THREE.Vector3(0.55, -0.75, 0.6).normalize().multiplyScalar(dist * 1.15));
    const c = controls as unknown as { target: THREE.Vector3; update(): void } | null;
    if (c) {
      c.target.copy(center);
      c.update();
    } else camera.lookAt(center);
  }, [fitRequest, camera, controls]);
  return null;
}

function Bed() {
  return (
    <group>
      <Grid
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, -0.01]}
        args={[BED, BED]}
        cellSize={5}
        sectionSize={50}
        cellColor="#3a3c3f"
        sectionColor="#585b60"
        cellThickness={0.6}
        sectionThickness={1.1}
        fadeDistance={2000}
        infiniteGrid
      />
      <mesh position={[0, 0, -0.05]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[BED, BED]} />
        <meshStandardMaterial color="#252628" roughness={1} />
      </mesh>
    </group>
  );
}

export function Viewport() {
  const preview = useStore((s) => s.preview);
  const measure = useStore((s) => s.measure);
  const select = useStore((s) => s.select);
  const lights = useMemo(
    () => (
      <>
        <hemisphereLight args={['#ffffff', '#4a4946', 1.6]} />
        <directionalLight position={[150, -200, 300]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-250} shadow-camera-right={250} shadow-camera-top={250} shadow-camera-bottom={-250} shadow-bias={-0.0004} shadow-normalBias={0.6} />
        <directionalLight position={[-200, 150, 120]} intensity={0.5} />
      </>
    ),
    [],
  );
  return (
    <Canvas
      shadows
      frameloop="demand"
      camera={{ position: [160, -220, 180], fov: 40, near: 1, far: 10000, up: [0, 0, 1] }}
      onPointerMissed={(e) => e.button === 0 && !gizmoBusy() && select(null)}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <color attach="background" args={['#1c1d1f']} />
      {lights}
      <Bed />
      {preview ? <PreviewBodies /> : <Scene />}
      {!preview && !measure && <Gizmo />}
      {!preview && !measure && <SketchHandles />}
      {!preview && !measure && <DimHandles />}
      <MeasureMarks />
      <FaceSelMark />
      <CutPlane />
      <OrbitControls makeDefault enableDamping={false} />
      <CameraFit />
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport axisColors={['#e05555', '#55c065', '#5580e0']} labelColor="#fff" />
      </GizmoHelper>
    </Canvas>
  );
}
