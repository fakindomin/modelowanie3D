import { useRef, useState } from 'react';
import { useStore } from '../store';
import type { Part } from '../types';
import { NumberInput } from './Panels';
import * as THREE from 'three';
import { REVOLVE_PRESETS, SKETCH_PRESETS, sketchFrame } from '../parts/sketch';
import {
  bulgeForRadius,
  conflicts,
  edgeLength,
  edgePath,
  encodeNodes,
  fromPoints,
  insideAngle,
  movePoint,
  outward,
  parseNodes,
  radiusOfBulge,
  removeEdge,
  removePoint,
  setAngle,
  setBulge,
  setCorner,
  setLength,
  splitEdge,
  straighten,
  tessellate,
  unlock,
  type Node,
  type Pt,
} from '../geom/sketch2d';

const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Saves a changed outline of a sketch part (one undo step). */
export function useSketchEdit(part: Part) {
  const update = useStore((s) => s.update);
  return (next: Node[]) => update(part.id, sketchPatch(part, next));
}

/**
 * New outline plus the position shift that keeps the drawing where it was: the solid is centred on
 * its outline, so without it adding a point on one side would slide the whole shape.
 */
export function sketchPatch(part: Part, next: Node[]): Partial<Part> {
  const rev = part.type === 'sketchRev';
  const params = { ...part.params, pts: encodeNodes(rev ? next.map((n) => ({ ...n, x: Math.max(0, n.x) })) : next) };
  const f0 = sketchFrame(part.params), f1 = sketchFrame(params);
  const local = rev ? new THREE.Vector3(0, 0, f1.cy - f0.cy) : new THREE.Vector3(f1.cx - f0.cx, f1.cy - f0.cy, 0);
  local.applyEuler(new THREE.Euler(...(part.rotation.map((r) => (r * Math.PI) / 180) as [number, number, number])));
  const position = part.position.map((v, k) => Math.round((v + local.getComponent(k)) * 1000) / 1000) as Part['position'];
  return { params, position };
}

/** Menu of one edge or point: lengths, arcs, angles, corners. Used in the panel and as a bubble in 3D. */
export function SketchMenu({ part, compact }: { part: Part; compact?: boolean }) {
  const sel = useStore((s) => s.sketchSel);
  const setSel = useStore((s) => s.setSketchSel);
  const grid = useStore((s) => s.settings.grid);
  const save = useSketchEdit(part);
  const nodes = parseNodes(part.params.pts);
  if (!sel || sel.id !== part.id || sel.i >= nodes.length) return null;
  const n = nodes.length;
  const step = grid > 0 ? grid : 0.5;
  const bad = conflicts(nodes);
  const close = () => setSel(null);
  const head = (title: string) => (
    <div className="sk-menu-head">
      <b>{title}</b>
      <button className="flag" onClick={close} title="Zamknij">
        ✕
      </button>
    </div>
  );
  const lock = (on: boolean, kind: 'L' | 'A', value: number) => (
    <button
      className={`flag ${on ? 'set' : ''}`}
      title={on ? 'Zablokowane: kolejne zmiany tego nie ruszą. Klik odblokowuje.' : 'Zablokuj tę wartość'}
      onClick={() => save(on ? unlock(nodes, kind, sel.i) : kind === 'L' ? setLength(nodes, sel.i, value) : setAngle(nodes, sel.i, value))}
    >
      {on ? '🔒' : '🔓'}
    </button>
  );

  if (sel.kind === 'edge') {
    const i = sel.i;
    const a = nodes[i];
    const len = edgeLength(nodes, i);
    const arc = !!a.b;
    const out = outward(nodes);
    const side = arc ? Math.sign(a.b!) * out : 1;
    return (
      <div className={`sk-menu ${compact ? 'compact' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
        {head(`Bok ${i + 1} (punkty ${i + 1}–${((i + 1) % n) + 1})`)}
        <label className={`field ${bad.edges.has(i) ? 'sk-bad' : ''}`}>
          <span>{arc ? 'Długość (cięciwa)' : 'Długość'}</span>
          <span className="row nowrap">
            <NumberInput value={Math.round(len * 100) / 100} min={0.1} max={2000} step={step} unit="mm" onChange={(v) => save(setLength(nodes, i, v))} />
            {lock(a.L !== undefined, 'L', len)}
          </span>
        </label>
        <div className="row">
          <button className={`small ${!arc ? 'on' : ''}`} onClick={() => save(setBulge(nodes, i, 0))}>
            ─ Prosty
          </button>
          <button className={`small ${arc ? 'on' : ''}`} onClick={() => !arc && save(setBulge(nodes, i, out * Math.max(1, len / 4)))}>
            ◠ Łuk
          </button>
        </div>
        {arc && (
          <>
            <label className="field">
              <span>Wybrzuszenie</span>
              <NumberInput value={Math.round(Math.abs(a.b!) * 100) / 100} min={0.1} max={2000} step={step} unit="mm" onChange={(v) => save(setBulge(nodes, i, Math.sign(a.b!) * v))} />
            </label>
            <label className="field">
              <span>Promień łuku</span>
              <NumberInput
                value={Math.round(radiusOfBulge(len, a.b!) * 100) / 100}
                min={Math.ceil((len / 2) * 100) / 100}
                max={10000}
                step={step}
                unit="mm"
                onChange={(v) => save(setBulge(nodes, i, bulgeForRadius(len, v, Math.sign(a.b!))))}
              />
            </label>
            <div className="row">
              <button className={`small ${side > 0 ? 'on' : ''}`} onClick={() => side < 0 && save(setBulge(nodes, i, -a.b!))}>
                na zewnątrz
              </button>
              <button className={`small ${side < 0 ? 'on' : ''}`} onClick={() => side > 0 && save(setBulge(nodes, i, -a.b!))}>
                do środka
              </button>
            </div>
          </>
        )}
        <div className="row">
          <button className="small" onClick={() => (save(splitEdge(nodes, i, 2)), setSel({ ...sel, kind: 'pt', i: i + 1 }))} title="Nowy punkt w połowie boku">
            ＋ punkt
          </button>
          {[3, 4].map((k) => (
            <button key={k} className="small" onClick={() => save(splitEdge(nodes, i, k))} title={`Podziel na ${k} równe boki`}>
              ÷{k}
            </button>
          ))}
          {!arc && (
            <>
              <button className="small" onClick={() => save(straighten(nodes, i, 'h'))} title="Ustaw poziomo">
                ⟷
              </button>
              <button className="small" onClick={() => save(straighten(nodes, i, 'v'))} title="Ustaw pionowo">
                ↕
              </button>
            </>
          )}
          <button className="small" disabled={n <= 3} onClick={() => (save(removeEdge(nodes, i)), close())} title="Usuń bok: jego końce łączą się w jeden punkt">
            Usuń
          </button>
        </div>
      </div>
    );
  }

  const i = sel.i;
  const p = nodes[i];
  const ang = insideAngle(nodes, i);
  const kind = p.r ? 'round' : p.ch ? 'chamfer' : 'sharp';
  const arcNext = !!p.b || !!nodes[(i - 1 + n) % n].b;
  return (
    <div className={`sk-menu ${compact ? 'compact' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      {head(`Punkt ${i + 1}`)}
      <label className={`field ${bad.pts.has(i) ? 'sk-bad' : ''}`}>
        <span>Kąt między bokami</span>
        <span className="row nowrap">
          <NumberInput value={Math.round(ang * 10) / 10} min={1} max={359} step={1} unit="°" onChange={(v) => save(setAngle(nodes, i, v))} />
          {lock(p.A !== undefined, 'A', ang)}
        </span>
      </label>
      {!arcNext && (
        <label className="field">
          <span>Narożnik</span>
          <span className="row nowrap">
            <select value={kind} onChange={(e) => save(setCorner(nodes, i, e.target.value as 'sharp' | 'round' | 'chamfer', p.r ?? p.ch ?? 3))}>
              <option value="sharp">ostry</option>
              <option value="round">zaokrąglony</option>
              <option value="chamfer">fazka</option>
            </select>
            {kind !== 'sharp' && <NumberInput value={p.r ?? p.ch ?? 0} min={0.1} max={500} step={0.5} unit="mm" onChange={(v) => save(setCorner(nodes, i, kind, v))} />}
          </span>
        </label>
      )}
      <div className="row nowrap">
        <NumberInput value={Math.round(p.x * 100) / 100} min={-2000} max={2000} step={step} unit="X" onChange={(v) => save(movePoint(nodes, i, v, p.y))} />
        <NumberInput value={Math.round(p.y * 100) / 100} min={-2000} max={2000} step={step} unit="Y" onChange={(v) => save(movePoint(nodes, i, p.x, v))} />
      </div>
      <div className="row">
        <button className="small" disabled={n <= 3} onClick={() => (save(removePoint(nodes, i)), close())}>
          Usuń punkt
        </button>
      </div>
    </div>
  );
}

/** Outline editor of a sketch part: drag points, click an edge or point for its menu. */
export function SketchEditor({ part }: { part: Part }) {
  const grid = useStore((s) => s.settings.grid);
  const sel = useStore((s) => s.sketchSel);
  const setSel = useStore((s) => s.setSketchSel);
  const save = useSketchEdit(part);
  const rev = part.type === 'sketchRev';
  const saved = parseNodes(part.params.pts);
  const [drag, setDrag] = useState<{ kind: 'pt' | 'edge'; i: number; x0: number; y0: number; nodes: Node[]; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const nodes = drag?.nodes ?? saved;
  if (nodes.length < 3 || saved.length < 3) return null;
  const n = nodes.length;
  // The view stays put while dragging, so the point does not run away from the cursor.
  const view = tessellate(saved);
  const xs = view.map((q) => q[0]), ys = view.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs, rev ? 0 : Infinity), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(x1 - x0, y1 - y0, 10);
  const pad = size * 0.16;
  const r = size / 45;
  const fs = size / 20;
  const step = grid > 0 ? grid : 0.5;
  const snap = (v: number) => Math.round(v / step) * step;
  const world = (e: React.PointerEvent): Pt => {
    const m = svg.current?.getScreenCTM();
    if (!m) return [0, 0];
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [q.x, -q.y];
  };
  const mine = sel && sel.id === part.id ? sel : null;
  const down = (e: React.PointerEvent, kind: 'pt' | 'edge', i: number) => {
    e.preventDefault();
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    const [x, y] = world(e);
    setDrag({ kind, i, x0: x, y0: y, nodes: saved, moved: false });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const [x, y] = world(e);
    if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) < r * 1.5) return;
    let { kind, i, nodes: base } = drag;
    if (kind === 'edge') {
      // Pulling an edge makes a new point there.
      base = splitEdge(saved, i, 2, [snap(x), snap(y)]);
      kind = 'pt';
      i = i + 1;
    }
    const pt = movePoint(base, i, rev ? Math.max(0, snap(x)) : snap(x), snap(y));
    setDrag({ kind, i, x0: drag.x0, y0: drag.y0, nodes: pt, moved: true });
  };
  const up = () => {
    if (!drag) return;
    if (drag.moved) {
      save(drag.nodes);
      setSel({ id: part.id, kind: 'pt', i: drag.i, from: 'panel' });
    } else setSel({ id: part.id, kind: drag.kind, i: drag.i, from: 'panel' });
    setDrag(null);
  };
  const bad = conflicts(nodes);
  const ccw = outward(nodes);
  const d = tessellate(nodes).map((q, k) => `${k ? 'L' : 'M'}${q[0]} ${-q[1]}`).join(' ') + 'Z';
  const gridStep = size > 120 ? 20 : size > 50 ? 10 : 5;
  const lines: React.ReactNode[] = [];
  for (let gx = Math.ceil((x0 - pad) / gridStep) * gridStep; gx <= x1 + pad; gx += gridStep) lines.push(<line key={'x' + gx} x1={gx} x2={gx} y1={-(y1 + pad)} y2={-(y0 - pad)} />);
  for (let gy = Math.ceil((y0 - pad) / gridStep) * gridStep; gy <= y1 + pad; gy += gridStep) lines.push(<line key={'y' + gy} y1={-gy} y2={-gy} x1={x0 - pad} x2={x1 + pad} />);
  const presets = rev ? REVOLVE_PRESETS : SKETCH_PRESETS;

  return (
    <div className="sketch-editor">
      <label className="field">
        <span>Zacznij od</span>
        <select value="" onChange={(e) => e.target.value && (save(fromPoints(presets[e.target.value].pts)), setSel(null))}>
          <option value="">wybierz gotowy…</option>
          {Object.entries(presets).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <svg
        ref={svg}
        viewBox={`${x0 - pad} ${-(y1 + pad)} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
        onPointerDown={() => setSel(null)}
      >
        <g className="sk-grid" style={{ strokeWidth: size / 400 }}>
          {lines}
        </g>
        {rev && <line className="sk-axis" x1={0} x2={0} y1={-(y1 + pad)} y2={-(y0 - pad)} style={{ strokeWidth: size / 150 }} />}
        <path className="sk-fill" d={d} style={{ strokeWidth: size / 200 }} />
        {nodes.map((_, i) => {
          const path = edgePath(nodes, i);
          const pd = path.map((q, k) => `${k ? 'L' : 'M'}${q[0]} ${-q[1]}`).join(' ');
          const on = mine?.kind === 'edge' && mine.i === i;
          // Length label just outside the middle of the edge.
          const k = Math.floor((path.length - 1) / 2);
          const a = path[k], b = path[k + 1];
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const off = fs * 0.9 * ccw;
          const lx = mx + ((b[1] - a[1]) / dl) * off, ly = my - ((b[0] - a[0]) / dl) * off;
          return (
            <g key={'e' + i}>
              {on && <path className="sk-edge-on" d={pd} style={{ strokeWidth: r * 0.9 }} />}
              <path className="sk-edge" d={pd} style={{ strokeWidth: r * 2.4 }} onPointerDown={(e) => down(e, 'edge', i)}>
                <title>Klik: menu boku · przeciągnij: nowy punkt</title>
              </path>
              <text className={`sk-label ${bad.edges.has(i) ? 'bad' : ''} ${nodes[i].L !== undefined ? 'locked' : ''}`} x={lx} y={-ly} style={{ fontSize: fs }}>
                {fmt(edgeLength(nodes, i))}
              </text>
            </g>
          );
        })}
        {nodes.map((q, i) => {
          const p = nodes[(i - 1 + n) % n], nx = nodes[(i + 1) % n];
          const u = [p.x - q.x, p.y - q.y], v = [nx.x - q.x, nx.y - q.y];
          const lu = Math.hypot(u[0], u[1]) || 1, lv = Math.hypot(v[0], v[1]) || 1;
          let bx = u[0] / lu + v[0] / lv, by = u[1] / lu + v[1] / lv;
          const bl = Math.hypot(bx, by);
          const ang = insideAngle(nodes, i);
          if (bl < 1e-3) [bx, by] = [-v[1] / lv, v[0] / lv];
          else [bx, by] = [bx / bl, by / bl];
          // The bisector points inside for corners under 180°.
          if (ang > 180) [bx, by] = [-bx, -by];
          const show = q.A !== undefined || bad.pts.has(i) || (mine?.kind === 'pt' && mine.i === i) || Math.abs(ang - 180) > 1;
          return (
            <g key={'p' + i}>
              {show && (
                <text className={`sk-label ang ${bad.pts.has(i) ? 'bad' : ''} ${q.A !== undefined ? 'locked' : ''}`} x={q.x + bx * fs * 1.4} y={-(q.y + by * fs * 1.4)} style={{ fontSize: fs * 0.8 }}>
                  {fmt(ang)}°
                </text>
              )}
              <circle
                className={mine?.kind === 'pt' && mine.i === i ? 'sk-pt sel' : 'sk-pt'}
                cx={q.x}
                cy={-q.y}
                r={r}
                onPointerDown={(e) => down(e, 'pt', i)}
                onDoubleClick={() => (save(removePoint(saved, i)), setSel(null))}
              >
                <title>Klik: menu punktu · przeciągnij: przesuń · dwuklik: usuń</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <SketchMenu part={part} />
      <p className="desc">
        {rev ? 'Pionowa kreska to oś obrotu. ' : 'Widok z góry. '}Klik w bok albo punkt otwiera menu: długość, łuk, kąt, zaokrąglenie. Przeciągnij punkt (co {fmt(step)} mm), przeciągnij bok, żeby dodać punkt. 🔒 trzyma wartość, czerwone wartości się wykluczają.
      </p>
      <details className="sk-table">
        <summary>Tabela boków</summary>
        {nodes.map((q, i) => (
          <div key={i} className={`sk-row ${bad.edges.has(i) ? 'sk-bad' : ''}`}>
            <span>
              {i + 1}–{((i + 1) % n) + 1}
              {q.b ? ' ◠' : ''}
            </span>
            <NumberInput value={Math.round(edgeLength(nodes, i) * 100) / 100} min={0.1} max={2000} step={step} unit="mm" onChange={(v) => save(setLength(saved, i, v))} />
            <button className={`flag ${q.L !== undefined ? 'set' : ''}`} onClick={() => save(q.L !== undefined ? unlock(saved, 'L', i) : setLength(saved, i, edgeLength(saved, i)))}>
              {q.L !== undefined ? '🔒' : '🔓'}
            </button>
          </div>
        ))}
      </details>
      <SketchSize part={part} nodes={saved} />
    </div>
  );
}

/** Overall width and height of the drawing: typing a value scales it (locks scale too). */
function SketchSize({ part, nodes }: { part: Part; nodes: Node[] }) {
  const save = useSketchEdit(part);
  const rev = part.type === 'sketchRev';
  const pts = tessellate(nodes);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x0 = rev ? 0 : Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const scaleTo = (axis: 0 | 1, v: number) => {
    const lo = axis ? y0 : x0, hi = axis ? y1 : x1;
    const k = hi - lo > 0.01 ? v / (hi - lo) : 1;
    const sc = (n: Node): Node => {
      const out: Node = axis ? { ...n, y: lo + (n.y - lo) * k } : { ...n, x: lo + (n.x - lo) * k };
      // Lengths stretch with the drawing, so their locks go; angles of a square-on stretch can change too.
      delete out.L;
      delete out.A;
      return out;
    };
    save(nodes.map(sc));
  };
  return (
    <>
      <label className="field">
        <span>{rev ? 'Promień (od osi)' : 'Szerokość obrysu'}</span>
        <NumberInput value={Math.round((x1 - x0) * 10) / 10} min={1} max={2000} step={1} unit="mm" onChange={(v) => scaleTo(0, v)} />
      </label>
      <label className="field">
        <span>{rev ? 'Wysokość profilu' : 'Głębokość obrysu'}</span>
        <NumberInput value={Math.round((y1 - y0) * 10) / 10} min={1} max={2000} step={1} unit="mm" onChange={(v) => scaleTo(1, v)} />
      </label>
    </>
  );
}
