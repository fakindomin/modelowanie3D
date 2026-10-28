import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { partMatrix } from '../geom/parts';
import { sketchFrame, sketchTo3D } from '../parts/sketch';
import { conflicts, edgeLength, edgePath, movePoint, outward, parseNodes, splitEdge, tessellate, type Node } from '../geom/sketch2d';
import { screenScale } from './DimHandles';
import { SketchMenu, sketchPatch } from '../ui/SketchEditor';
import type { Part } from '../types';

const DEG = Math.PI / 180;
const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Outline with edge i moved d mm along its outward normal; the neighbours stretch to follow. */
export function shiftEdge(nodes: Node[], i: number, d: number): Node[] {
  const n = nodes.length;
  const a = nodes[i], b = nodes[(i + 1) % n];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const s = outward(nodes);
  const nx = (s * (b.y - a.y)) / len, ny = (-s * (b.x - a.x)) / len;
  const next = nodes.map((q) => ({ ...q }));
  for (const k of [i, (i + 1) % n]) {
    next[k].x = Math.round((next[k].x + nx * d) * 100) / 100;
    next[k].y = Math.round((next[k].y + ny * d) * 100) / 100;
    delete next[k].A;
  }
  delete next[(i - 1 + n) % n].L;
  delete next[(i + 1) % n].L;
  return next;
}

/** Points and edges of the selected sketch part, drawn on its outline in 3D: drag, click for the menu. */
export function SketchHandles() {
  const part = useStore((s) => s.parts.find((p) => p.id === s.selectedId && (p.type === 'sketch' || p.type === 'sketchRev')));
  if (!part || part.locked) return null;
  return <Handles part={part} />;
}

interface Drag {
  /** face: a side wall pulled sideways, which moves its edge of the outline along its normal. */
  kind: 'pt' | 'edge' | 'face';
  i: number;
  moved: boolean;
  x0: number;
  y0: number;
  /** Height (local Z) of the press on a side wall, and where it hit in sketch coordinates. */
  hz?: number;
  at0?: [number, number];
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
  const [shift, setShift] = useState<number | null>(null);
  const [hotFace, setHotFace] = useState<number | null>(null);
  const near = useNearPoints(part, nodes);

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
    const toSketch = (ev: PointerEvent, p: Part, hz = 0): [number, number] | null => {
      const rect = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1), camera);
      const m = partMatrix(p.position, p.rotation);
      const normal = new THREE.Vector3(0, p.type === 'sketchRev' ? 1 : 0, p.type === 'sketchRev' ? 0 : 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(m));
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...p.position).add(normal.clone().multiplyScalar(hz)));
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
      const step = ev.shiftKey ? 0.1 : st.settings.grid > 0 ? st.settings.grid : 0.5;
      if (d.kind === 'face') {
        const at = toSketch(ev, cur, d.hz);
        if (!at || !d.at0) return;
        const a = d.base[d.i], b = d.base[(d.i + 1) % d.base.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const s = outward(d.base);
        const off = Math.round((((at[0] - d.at0[0]) * s * (b.y - a.y) - (at[1] - d.at0[1]) * s * (b.x - a.x)) / len) / step) * step;
        setShift(off);
        st.updateLive(cur.id, sketchPatch(cur, shiftEdge(d.base, d.i, off)));
        return;
      }
      const at = toSketch(ev, cur);
      if (!at) return;
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
      setShift(null);
      // A pushed wall is done; a click on it (no drag) opens the edge's menu like a click on the edge.
      setSel(d.kind === 'face' && d.moved ? null : { id: d.part.id, kind: d.kind === 'face' ? 'edge' : d.kind, i: d.i, from: '3d' });
    };
    const key = (ev: KeyboardEvent) => {
      const d = drag.current;
      if (ev.key !== 'Escape' || !d) return;
      drag.current = null;
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      setShift(null);
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
  }, [camera, gl, controls, rev, setSel]);

  const press = (e: ThreeEvent<PointerEvent>, kind: 'pt' | 'edge' | 'face', i: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const d: Drag = { kind, i, moved: false, x0: e.nativeEvent.clientX, y0: e.nativeEvent.clientY, base: nodes, part };
    if (kind === 'face') {
      const local = e.point.clone().applyMatrix4(partMatrix(part.position, part.rotation).invert());
      const f = sketchFrame(part.params);
      d.hz = local.z;
      d.at0 = [local.x + f.cx, local.y + f.cy];
    }
    drag.current = d;
  };

  const bad = conflicts(nodes);
  const mine = sel && sel.id === part.id ? sel : null;
  const lift = rev ? new THREE.Vector3(0, -0.05, 0) : new THREE.Vector3(0, 0, 0.05);
  const menuAt = mine ? (mine.kind === 'pt' ? to3(nodes[mine.i]?.x ?? 0, nodes[mine.i]?.y ?? 0) : (() => {
    const path = edgePath(nodes, mine.i);
    const k = Math.floor((path.length - 1) / 2);
    return to3((path[k][0] + path[k + 1][0]) / 2, (path[k][1] + path[k + 1][1]) / 2);
  })()) : null;

  // Top of an extruded outline: scaled by "Góra zwężona do" and turned by "Skręt", H above the base.
  const H = rev ? 0 : Math.max(0.2, Number(part.params.H) || 10);
  const k = Math.max(0, Number(part.params.top ?? 100)) / 100;
  const tw = (Number(part.params.twist) || 0) * DEG;
  const up = (v: THREE.Vector3) => new THREE.Vector3(k * (v.x * Math.cos(tw) - v.y * Math.sin(tw)), k * (v.x * Math.sin(tw) + v.y * Math.cos(tw)), H);
  const walls = !rev;

  return (
    <group position={part.position} rotation={part.rotation.map((v) => v * DEG) as [number, number, number]} renderOrder={5}>
      <Line points={[...outline, outline[0]].map((v) => v.clone().add(lift))} color="#5bb974" lineWidth={2} depthTest={false} />
      {walls && <Line points={[...outline, outline[0]].map(up)} color="#5bb974" lineWidth={1.5} transparent opacity={0.8} />}
      {walls && nodes.map((q, i) => {
        const a = to3(q.x, q.y);
        return <Line key={'v' + i} points={[a, up(a)]} color="#5bb974" lineWidth={1} transparent opacity={0.6} />;
      })}
      {nodes.map((_, i) => {
        const path = edgePath(nodes, i).map(([x, y]) => to3(x, y).add(lift));
        const k2 = Math.floor((path.length - 1) / 2);
        const mid = path[k2].clone().add(path[k2 + 1]).multiplyScalar(0.5);
        const on = (mine?.kind === 'edge' && mine.i === i) || hotFace === i || (shift !== null && drag.current?.i === i);
        const top = path.map(up);
        return (
          <group key={'e' + i}>
            {on && <Line points={path} color="#f3b47e" lineWidth={4} depthTest={false} />}
            {on && walls && <Line points={[...top].reverse().concat([path[0]]).concat(path).concat([top[top.length - 1]])} color="#f3b47e" lineWidth={3} depthTest={false} />}
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
            {walls && <Wall hot={on} side={outward(nodes)} bottom={path} top={top} onPointerDown={(e) => press(e, 'face', i)} onOver={(o) => setHotFace(o ? i : (h) => (h === i ? null : h))} />}
            <Html position={mid} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
              <span className={`sk3d-label ${bad.edges.has(i) ? 'bad' : ''} ${nodes[i].L !== undefined ? 'locked' : ''}`}>{fmt(edgeLength(nodes, i))}</span>
            </Html>
            {shift !== null && drag.current?.i === i && (
              <Html position={top.length ? path[k2].clone().add(top[k2]).multiplyScalar(0.5) : mid} center zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
                <span className="dim-tag">Bok {shift >= 0 ? '+' : '−'}{fmt(Math.abs(shift))} mm</span>
              </Html>
            )}
          </group>
        );
      })}
      {nodes.map((q, i) => (
        <PtDot
          key={'p' + i}
          position={to3(q.x, q.y).add(lift)}
          visible={near.includes(i) || (mine?.kind === 'pt' && mine.i === i) || bad.pts.has(i)}
          color={mine?.kind === 'pt' && mine.i === i ? '#f3b47e' : bad.pts.has(i) ? '#ff6b6b' : '#e9e9e7'}
          onPointerDown={(e) => press(e, 'pt', i)}
        />
      ))}
      {menuAt && mine?.from === '3d' && (
        <Html position={menuAt} zIndexRange={[30, 0]} style={{ transform: 'translate(14px, 14px)' }}>
          <SketchMenu part={part} compact />
        </Html>
      )}
    </group>
  );
}

const noHit = () => null;

/** A corner point: a few pixels wide whatever the zoom, shown only when the cursor comes close. */
function PtDot({ position, visible, color, onPointerDown }: { position: THREE.Vector3; visible: boolean; color: string; onPointerDown: (e: ThreeEvent<PointerEvent>) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  useFrame(() => {
    const m = ref.current;
    if (m) m.scale.setScalar(screenScale(camera, m.getWorldPosition(new THREE.Vector3())));
  });
  return (
    <mesh ref={ref} userData={{ sketchHandle: true }} position={position} onPointerDown={onPointerDown} renderOrder={6} raycast={visible ? THREE.Mesh.prototype.raycast : noHit}>
      <sphereGeometry args={[0.9, 14, 10]} />
      <meshBasicMaterial color={color} transparent opacity={visible ? 1 : 0} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

/** Invisible side wall of one edge: grab it to push or pull that edge. */
function Wall({ hot, side, bottom, top, onPointerDown, onOver }: { hot: boolean; side: number; bottom: THREE.Vector3[]; top: THREE.Vector3[]; onPointerDown: (e: ThreeEvent<PointerEvent>) => void; onOver: (on: boolean) => void }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (let s = 0; s + 1 < bottom.length; s++) {
      // A hair outside the solid so the wall, not the part, is what the cursor finds first.
      const n = new THREE.Vector3(side * (bottom[s + 1].y - bottom[s].y), -side * (bottom[s + 1].x - bottom[s].x), 0).setLength(0.05);
      const [a, b, c, d] = [bottom[s], bottom[s + 1], top[s + 1], top[s]].map((v) => v.clone().add(n));
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [bottom, top, side]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh
      geometry={geo}
      userData={{ sketchHandle: true }}
      onPointerDown={onPointerDown}
      onPointerOver={(e) => {
        e.stopPropagation();
        onOver(true);
      }}
      onPointerOut={() => onOver(false)}
    >
      <meshBasicMaterial color="#f3b47e" transparent opacity={hot ? 0.28 : 0} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

/** Corner points within ~50 px of the cursor. */
function useNearPoints(part: Part, nodes: Node[]) {
  const { camera, gl } = useThree();
  const [near, setNear] = useState<number[]>([]);
  const key = part.params.pts;
  useEffect(() => {
    const m = partMatrix(part.position, part.rotation);
    const pts = nodes.map((q) => new THREE.Vector3(...sketchTo3D(part.params, q.x, q.y)).applyMatrix4(m));
    const onMove = (ev: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      const next: number[] = [];
      pts.forEach((p, i) => {
        const q = p.clone().project(camera);
        if (Math.hypot(((q.x + 1) / 2) * rect.width - x, ((1 - q.y) / 2) * rect.height - y) < 50) next.push(i);
      });
      setNear((old) => (old.join() === next.join() ? old : next));
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [key, part.position, part.rotation, camera, gl]); // eslint-disable-line react-hooks/exhaustive-deps
  return near;
}
