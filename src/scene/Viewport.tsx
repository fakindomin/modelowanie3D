import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges, GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { assembly, groupBody, groupId, useStore } from '../store';
import { built, buildBodies, worldBox, type BodyResult } from '../geom/parts';
import { moverFor, snapMover, snapPosition } from '../geom/snap';
import type { Part, Vec3 } from '../types';
import { distance, featureAt, type Feature } from './measure';

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
  const edge = heavy ? null : look.selected ? '#ffffff' : look.snap ? '#3ddc84' : look.hovered ? '#9cc6ff' : look.sibling ? '#6f9ad8' : null;
  const tint = look.selected && heavy ? '#3c5f99' : look.hovered ? '#30507a' : '#000000';
  return (
    <group name={part.id} position={part.position} rotation={part.rotation.map((r) => r * DEG) as Vec3}>
      <mesh geometry={geometry} castShadow={!part.hole} receiveShadow renderOrder={part.hole ? 2 : 1} userData={{ pick: part.id }}>
        {part.hole ? (
          <meshStandardMaterial color={look.hovered || look.selected ? '#b9c4d4' : part.color} transparent opacity={ghost ? (look.hovered || look.selected ? 0.3 : 0.1) : look.hovered ? 0.6 : 0.42} depthWrite={false} roughness={0.6} />
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
          <Edges threshold={20} color={look.selected ? '#ffffff' : '#9cc6ff'} lineWidth={1.5} />
        </mesh>
      )}
    </group>
  );
}

/** Builds the cut result of the given bodies in the background of edits (debounced). */
function useBodies(parts: Part[], only: number[] | undefined, key: string) {
  const [bodies, setBodies] = useState<BodyResult[]>([]);
  const live = useRef<BodyResult[]>([]);
  live.current = bodies;
  useEffect(() => {
    const t = setTimeout(() => {
      const next = only && !only.length ? [] : buildBodies(parts, only);
      setBodies((old) => {
        old.forEach((b) => {
          b.geometry.dispose();
          b.manifold.delete();
        });
        return next;
      });
    }, 30);
    return () => clearTimeout(t);
  }, [parts, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () =>
      live.current.forEach((b) => {
        b.geometry.dispose();
        b.manifold.delete();
      }),
    [],
  );
  return bodies;
}

function PreviewBodies() {
  const parts = useStore((s) => s.parts);
  const bodies = useBodies(parts, undefined, 'all');
  return (
    <>
      {bodies.map((b) => (
        <mesh key={b.body} geometry={b.geometry} castShadow receiveShadow>
          <meshStandardMaterial color={b.color} roughness={0.5} />
        </mesh>
      ))}
    </>
  );
}

function MergedBodies({ selectedBody, hoveredBody }: { selectedBody: number | null; hoveredBody: number | null }) {
  const parts = useStore((s) => s.parts);
  const merged = useMemo(() => [...new Set(parts.filter((p) => p.merged && !p.hole).map((p) => p.body))].sort((a, b) => a - b), [parts]);
  const bodies = useBodies(parts, merged, merged.join(','));
  return (
    <>
      {bodies.map((b) => (
        <mesh key={b.body} geometry={b.geometry} castShadow receiveShadow userData={{ pick: groupId(b.body) }}>
          <meshStandardMaterial
            color={b.color}
            roughness={0.5}
            emissive={selectedBody === b.body && b.geometry.attributes.position.count > EDGE_LIMIT ? '#3c5f99' : hoveredBody === b.body ? '#30507a' : '#000000'}
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
    st.select(target);
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

  const selectedPart = parts.find((p) => p.id === selectedId);
  const selBody = groupBody(selectedId);
  const hovBody = groupBody(hoveredId);
  const mergedBodies = new Set(parts.filter((p) => p.merged && !p.hole).map((p) => p.body));
  const look = (p: Part): Look => ({
    selected: p.id === selectedId || (selBody !== null && p.body === selBody && !mergedBodies.has(p.body)),
    hovered: p.id === hoveredId || (hovBody !== null && p.body === hovBody && !mergedBodies.has(p.body)),
    sibling: !!selectedPart?.link && p.link === selectedPart.link && p.id !== selectedPart.id,
    snap: snapTargets.includes(p.id),
  });

  return (
    <group
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerOut={() => {
        useStore.getState().setHover(null);
        useStore.getState().setMeasureHover(null);
      }}
    >
      {parts.map((p) =>
        mergedBodies.has(p.body) && !p.hole ? (
          <MergedMember key={p.id} part={p} look={look(p)} />
        ) : (
          <PartMesh key={p.id} part={p} look={look(p)} ghost={mergedBodies.has(p.body)} />
        ),
      )}
      <MergedBodies selectedBody={selBody} hoveredBody={hovBody} />
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

  if (!target || !selectedId || scene.getObjectByName(selectedId) !== target) return null;
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

const HOVER_COLOR = '#ffd54a';
const PIN_COLOR = '#3ddc84';

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
        cellColor="#3b4250"
        sectionColor="#5b6578"
        cellThickness={0.6}
        sectionThickness={1.1}
        fadeDistance={2000}
        infiniteGrid
      />
      <mesh position={[0, 0, -0.05]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[BED, BED]} />
        <meshStandardMaterial color="#232833" roughness={1} />
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
        <hemisphereLight args={['#ffffff', '#445066', 1.6]} />
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
      <color attach="background" args={['#1a1e26']} />
      {lights}
      <Bed />
      {preview ? <PreviewBodies /> : <Scene />}
      {!preview && !measure && <Gizmo />}
      <MeasureMarks />
      <OrbitControls makeDefault enableDamping={false} />
      <CameraFit />
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport axisColors={['#e05555', '#55c065', '#5580e0']} labelColor="#fff" />
      </GizmoHelper>
    </Canvas>
  );
}
