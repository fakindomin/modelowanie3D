import { useEffect, useMemo, useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { partMatrix } from '../geom/parts';
import { sketchFrame, sketchTo3D } from '../parts/sketch';
import { conflicts, edgeLength, edgePath, movePoint, parseNodes, splitEdge, tessellate, type Node } from '../geom/sketch2d';
import { SketchMenu, sketchPatch } from '../ui/SketchEditor';
import type { Part } from '../types';

const DEG = Math.PI / 180;
const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Points and edges of the selected sketch part, drawn on its outline in 3D: drag, click for the menu. */
export function SketchHandles() {
  const part = useStore((s) => s.parts.find((p) => p.id === s.selectedId && (p.type === 'sketch' || p.type === 'sketchRev')));
  if (!part || part.locked) return null;
  return <Handles part={part} />;
}

interface Drag {
  kind: 'pt' | 'edge';
  i: number;
  moved: boolean;
  x0: number;
  y0: number;
  /** Outline and pose when the press started (an edge pull splits it first). */
  base: Node[];
  part: Part;
}

function Handles({ part }: { part: Part }) {
  const { camera, gl, controls } = useThree();
  const sel = useStore((s) => s.sketchSel);
  const setSel = useStore((s) => s.setSketchSel);
  const nodes = parseNodes(part.params.pts);
  const rev = part.type === 'sketchRev';
  const drag = useRef<Drag | null>(null);

  const to3 = (x: number, y: number) => new THREE.Vector3(...sketchTo3D(part.params, x, y));
  const outline = useMemo(() => tessellate(nodes).map(([x, y]) => to3(x, y)), [part.params]); // eslint-disable-line react-hooks/exhaustive-deps
  const size = useMemo(() => {
    const b = new THREE.Box3().setFromPoints(outline);
    return Math.max(10, b.getSize(new THREE.Vector3()).length());
  }, [outline]);
  const r = Math.min(3, Math.max(0.6, size / 70));

  useEffect(() => {
    const ray = new THREE.Raycaster();
    const hit = new THREE.Vector3();
    const toSketch = (ev: PointerEvent, p: Part): [number, number] | null => {
      const rect = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1), camera);
      const m = partMatrix(p.position, p.rotation);
      const normal = new THREE.Vector3(0, p.type === 'sketchRev' ? 1 : 0, p.type === 'sketchRev' ? 0 : 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(m));
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...p.position));
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      const local = hit.clone().applyMatrix4(m.clone().invert());
      const f = sketchFrame(p.params);
      return p.type === 'sketchRev' ? [local.x, local.z + f.cy] : [local.x + f.cx, local.y + f.cy];
    };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 4) return;
      const st = useStore.getState();
      const cur = st.parts.find((p) => p.id === d.part.id);
      if (!cur) return;
      if (!d.moved) {
        d.moved = true;
        st.beginGesture();
        if (controls) (controls as unknown as { enabled: boolean }).enabled = false;
      }
      const at = toSketch(ev, cur);
      if (!at) return;
      const step = st.settings.grid > 0 ? st.settings.grid : 0.5;
      const sx = Math.round(at[0] / step) * step, sy = Math.round(at[1] / step) * step;
      if (d.kind === 'edge') {
        d.base = splitEdge(d.base, d.i, 2, [sx, sy]);
        d.kind = 'pt';
        d.i += 1;
      }
      const next = movePoint(d.base, d.i, rev ? Math.max(0, sx) : sx, sy);
      st.updateLive(cur.id, sketchPatch(cur, next));
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      setSel({ id: d.part.id, kind: d.kind, i: d.i, from: '3d' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [camera, gl, controls, rev, setSel]);

  const press = (e: ThreeEvent<PointerEvent>, kind: 'pt' | 'edge', i: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag.current = { kind, i, moved: false, x0: e.nativeEvent.clientX, y0: e.nativeEvent.clientY, base: nodes, part };
  };

  const bad = conflicts(nodes);
  const mine = sel && sel.id === part.id ? sel : null;
  const lift = rev ? new THREE.Vector3(0, -0.05, 0) : new THREE.Vector3(0, 0, 0.05);
  const menuAt = mine ? (mine.kind === 'pt' ? to3(nodes[mine.i]?.x ?? 0, nodes[mine.i]?.y ?? 0) : (() => {
    const path = edgePath(nodes, mine.i);
    const k = Math.floor((path.length - 1) / 2);
    return to3((path[k][0] + path[k + 1][0]) / 2, (path[k][1] + path[k + 1][1]) / 2);
  })()) : null;

  return (
    <group position={part.position} rotation={part.rotation.map((v) => v * DEG) as [number, number, number]} renderOrder={5}>
      <Line points={[...outline, outline[0]].map((v) => v.clone().add(lift))} color="#5bb974" lineWidth={2} depthTest={false} />
      {nodes.map((_, i) => {
        const path = edgePath(nodes, i).map(([x, y]) => to3(x, y).add(lift));
        const k = Math.floor((path.length - 1) / 2);
        const mid = path[k].clone().add(path[k + 1]).multiplyScalar(0.5);
        const on = mine?.kind === 'edge' && mine.i === i;
        return (
          <group key={'e' + i}>
            {on && <Line points={path} color="#f3b47e" lineWidth={4} depthTest={false} />}
            {path.slice(1).map((b, s) => {
              const a = path[s];
              const len = a.distanceTo(b);
              if (len < 1e-4) return null;
              const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
              return (
                <mesh key={s} userData={{ sketchHandle: true }} position={a.clone().add(b).multiplyScalar(0.5)} quaternion={q} onPointerDown={(e) => press(e, 'edge', i)} onPointerOver={(e) => e.stopPropagation()}>
                  <cylinderGeometry args={[r * 0.8, r * 0.8, len, 6]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              );
            })}
            <Html position={mid} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
              <span className={`sk3d-label ${bad.edges.has(i) ? 'bad' : ''} ${nodes[i].L !== undefined ? 'locked' : ''}`}>{fmt(edgeLength(nodes, i))}</span>
            </Html>
          </group>
        );
      })}
      {nodes.map((q, i) => (
        <mesh key={'p' + i} userData={{ sketchHandle: true }} position={to3(q.x, q.y).add(lift)} onPointerDown={(e) => press(e, 'pt', i)} renderOrder={6}>
          <sphereGeometry args={[r, 16, 12]} />
          <meshBasicMaterial color={mine?.kind === 'pt' && mine.i === i ? '#f3b47e' : bad.pts.has(i) ? '#ff6b6b' : '#e9e9e7'} depthTest={false} />
        </mesh>
      ))}
      {menuAt && mine?.from === '3d' && (
        <Html position={menuAt} zIndexRange={[30, 0]} style={{ transform: 'translate(14px, 14px)' }}>
          <SketchMenu part={part} compact />
        </Html>
      )}
    </group>
  );
}
