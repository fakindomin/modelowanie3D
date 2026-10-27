import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges, GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { built, buildBodies, worldBox, type BodyResult } from '../geom/parts';
import { snapPosition } from '../geom/snap';
import type { Part, Vec3 } from '../types';

const DEG = Math.PI / 180;
const BED = 220;

function PartMesh({ part, selected, highlighted, onDragStart }: { part: Part; selected: boolean; highlighted: boolean; onDragStart: (e: ThreeEvent<PointerEvent>, part: Part) => void }) {
  const { geometry } = built(part);
  return (
    <group
      name={part.id}
      position={part.position}
      rotation={part.rotation.map((r) => r * DEG) as Vec3}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onDragStart(e, part);
      }}
    >
      <mesh geometry={geometry} castShadow receiveShadow renderOrder={part.hole ? 2 : 1}>
        {part.hole ? (
          <meshStandardMaterial color={part.color} transparent opacity={0.45} depthWrite={false} roughness={0.6} />
        ) : (
          <meshStandardMaterial color={part.color} roughness={0.55} metalness={0.05} />
        )}
        {(selected || highlighted) && <Edges threshold={20} color={selected ? '#ffffff' : '#3ddc84'} lineWidth={selected ? 2 : 1.5} />}
      </mesh>
    </group>
  );
}

function PreviewBodies() {
  const parts = useStore((s) => s.parts);
  const [bodies, setBodies] = useState<BodyResult[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      const next = buildBodies(parts);
      setBodies((old) => {
        old.forEach((b) => {
          b.geometry.dispose();
          b.manifold.delete();
        });
        return next;
      });
    }, 30);
    return () => clearTimeout(t);
  }, [parts]);
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

interface Drag {
  part: Part;
  plane: THREE.Plane;
  offset: THREE.Vector3;
  startX: number;
  startY: number;
  moved: boolean;
}

function Parts() {
  const parts = useStore((s) => s.parts);
  const selectedId = useStore((s) => s.selectedId);
  const snapTargets = useStore((s) => s.snapTargets);
  const { camera, gl, controls } = useThree();
  const drag = useRef<Drag | null>(null);

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
      const cur = st.parts.find((p) => p.id === d.part.id);
      if (!cur) return;
      const proposed: Vec3 = [hit.x + d.offset.x, hit.y + d.offset.y, cur.position[2]];
      const { position, targets } = snapPosition(cur, proposed, st.parts, {
        grid: st.settings.grid,
        snap: st.settings.snap && !ev.altKey,
        stick: st.settings.stick && !ev.shiftKey,
        axes: [true, true, false],
      });
      st.setSnapTargets(targets);
      st.updateLive(cur.id, { position });
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      if (d?.moved) {
        useStore.getState().setSnapTargets([]);
        useStore.getState().fixHoles();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [camera, gl, controls]);

  const onDragStart = (e: ThreeEvent<PointerEvent>, part: Part) => {
    useStore.getState().select(part.id);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -e.point.z);
    drag.current = {
      part,
      plane,
      offset: new THREE.Vector3(part.position[0] - e.point.x, part.position[1] - e.point.y, 0),
      startX: e.nativeEvent.clientX,
      startY: e.nativeEvent.clientY,
      moved: false,
    };
  };

  return (
    <>
      {parts.map((p) => (
        <PartMesh key={p.id} part={p} selected={p.id === selectedId} highlighted={snapTargets.includes(p.id)} onDragStart={onDragStart} />
      ))}
    </>
  );
}

/** Arrow gizmo on the selected part, mainly for lifting it up/down and precise axis moves. */
function Gizmo() {
  const selectedId = useStore((s) => s.selectedId);
  const parts = useStore((s) => s.parts);
  const grid = useStore((s) => s.settings.grid);
  const { scene } = useThree();
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    setTarget(selectedId ? (scene.getObjectByName(selectedId) ?? null) : null);
  }, [selectedId, parts, scene]);

  if (!target || !selectedId) return null;
  return (
    <TransformControls
      object={target}
      mode="translate"
      size={0.7}
      translationSnap={grid > 0 ? grid : null}
      onMouseDown={() => {
        dragging.current = true;
        useStore.getState().beginGesture();
      }}
      onObjectChange={() => {
        if (!dragging.current) return;
        const st = useStore.getState();
        const cur = st.parts.find((p) => p.id === selectedId);
        if (!cur) return;
        const proposed = target.position.toArray() as Vec3;
        const axes = proposed.map((v, i) => Math.abs(v - cur.position[i]) > 1e-6) as [boolean, boolean, boolean];
        const { position, targets } = snapPosition(cur, proposed, st.parts, { grid: 0, snap: st.settings.snap, stick: false, axes });
        target.position.set(...position);
        st.setSnapTargets(targets);
        st.updateLive(cur.id, { position });
      }}
      onMouseUp={() => {
        dragging.current = false;
        useStore.getState().setSnapTargets([]);
        useStore.getState().fixHoles();
      }}
    />
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
      <mesh position={[0, 0, -0.05]} receiveShadow>
        <planeGeometry args={[BED, BED]} />
        <meshStandardMaterial color="#232833" roughness={1} />
      </mesh>
    </group>
  );
}

export function Viewport() {
  const preview = useStore((s) => s.preview);
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
      camera={{ position: [160, -220, 180], fov: 40, near: 1, far: 10000, up: [0, 0, 1] }}
      onPointerMissed={(e) => e.button === 0 && select(null)}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <color attach="background" args={['#1a1e26']} />
      {lights}
      <Bed />
      {preview ? <PreviewBodies /> : <Parts />}
      {!preview && <Gizmo />}
      <OrbitControls makeDefault enableDamping={false} />
      <CameraFit />
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport axisColors={['#e05555', '#55c065', '#5580e0']} labelColor="#fff" />
      </GizmoHelper>
    </Canvas>
  );
}
