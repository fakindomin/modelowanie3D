/**
 * Outline of a sketch part: a closed list of nodes. Each node may carry what belongs to it:
 * b: the edge from this node to the next is an arc bulging b mm to the right of its direction
 *    (outwards on an anticlockwise outline), r: rounded corner radius, ch: chamfer length,
 * L: locked length of the edge from this node to the next (chord for an arc), A: locked inside angle.
 * Stored as [x, y] or [x, y, {…}] so plain point lists stay valid.
 */
export interface Node {
  x: number;
  y: number;
  b?: number;
  r?: number;
  ch?: number;
  L?: number;
  A?: number;
}

export type Pt = [number, number];

const EPS = 0.05;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function parseNodes(s: unknown): Node[] {
  try {
    const v = JSON.parse(String(s));
    if (!Array.isArray(v)) return [];
    const out: Node[] = [];
    for (const q of v) {
      if (!Array.isArray(q) || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) return [];
      const n: Node = { x: q[0], y: q[1] };
      const e = q[2];
      if (e && typeof e === 'object') for (const k of ['b', 'r', 'ch', 'L', 'A'] as const) if (Number.isFinite(e[k]) && e[k] !== 0) n[k] = e[k];
      out.push(n);
    }
    return out.length >= 3 ? out : [];
  } catch {
    return [];
  }
}

export function encodeNodes(nodes: Node[]): string {
  return JSON.stringify(
    nodes.map((n) => {
      const e: Record<string, number> = {};
      for (const k of ['b', 'r', 'ch', 'L', 'A'] as const) if (n[k] !== undefined && n[k] !== 0) e[k] = r2(n[k]!);
      return Object.keys(e).length ? [r2(n.x), r2(n.y), e] : [r2(n.x), r2(n.y)];
    }),
  );
}

export const fromPoints = (pts: Pt[]): Node[] => pts.map(([x, y]) => ({ x, y }));

/** Positive when the outline runs anticlockwise. */
export function signedArea(nodes: Node[]) {
  let a = 0;
  nodes.forEach((p, i) => {
    const q = nodes[(i + 1) % nodes.length];
    a += p.x * q.y - q.x * p.y;
  });
  return a / 2;
}

export const edgeLength = (nodes: Node[], i: number) => {
  const a = nodes[i], b = nodes[(i + 1) % nodes.length];
  return Math.hypot(b.x - a.x, b.y - a.y);
};

/** Inside angle at node i in degrees (over 180 at a notch). */
export function insideAngle(nodes: Node[], i: number) {
  const n = nodes.length;
  const p = nodes[(i - 1 + n) % n], c = nodes[i], q = nodes[(i + 1) % n];
  const a1 = Math.atan2(p.y - c.y, p.x - c.x), a2 = Math.atan2(q.y - c.y, q.x - c.x);
  // Anticlockwise outline: the inside is swept from the next edge round to the previous one.
  let d = signedArea(nodes) >= 0 ? a1 - a2 : a2 - a1;
  while (d < 0) d += 2 * Math.PI;
  while (d >= 2 * Math.PI) d -= 2 * Math.PI;
  return (d * 180) / Math.PI;
}

const clone = (nodes: Node[]) => nodes.map((n) => ({ ...n }));

const dirOf = (nodes: Node[], i: number) => {
  const a = nodes[i], b = nodes[(i + 1) % nodes.length];
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return [(b.x - a.x) / l, (b.y - a.y) / l];
};

/**
 * Edge that gives way when edge i (or the corner at i) changes: the first later edge that is not
 * locked, preferring one running alongside edge i (the far side of a rectangle), so the shape keeps
 * its look. The last edge closes the outline when nothing else can give.
 */
function giver(nodes: Node[], i: number, parallel: boolean) {
  const n = nodes.length;
  const [ux, uy] = dirOf(nodes, i);
  let first = -1;
  for (let j = i + 1; j < n; j++) {
    if (nodes[j].L !== undefined || nodes[j].b) continue;
    if (first < 0) first = j;
    const [vx, vy] = dirOf(nodes, j);
    if (parallel && Math.abs(ux * vx + uy * vy) > 0.9) return j;
  }
  return first >= 0 ? first : n - 1;
}

/** Moves node i+1 along the edge so it is L long; the nodes up to the giving edge shift with it. */
function applyLength(nodes: Node[], i: number, L: number) {
  const n = nodes.length;
  if (i >= n - 1) return;
  const a = nodes[i], b = nodes[i + 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = len > 1e-6 ? (b.x - a.x) / len : 1, uy = len > 1e-6 ? (b.y - a.y) / len : 0;
  const dx = a.x + ux * L - b.x, dy = a.y + uy * L - b.y;
  const k = giver(nodes, i, true);
  for (let j = i + 1; j <= k; j++) {
    nodes[j].x += dx;
    nodes[j].y += dy;
  }
}

/** Turns the nodes after i (up to the giving edge) about node i so the inside angle at i becomes A. */
function applyAngle(nodes: Node[], i: number, A: number) {
  const n = nodes.length;
  if (i <= 0 || i >= n - 1) return;
  const d = (((A - insideAngle(nodes, i)) * Math.PI) / 180) * (signedArea(nodes) >= 0 ? -1 : 1);
  const c = nodes[i], cos = Math.cos(d), sin = Math.sin(d);
  const k = giver(nodes, i, false);
  for (let j = i + 1; j <= k; j++) {
    const x = nodes[j].x - c.x, y = nodes[j].y - c.y;
    nodes[j].x = c.x + x * cos - y * sin;
    nodes[j].y = c.y + x * sin + y * cos;
  }
}

/**
 * Makes locked lengths and angles true, walking from the first node: each one moves only what comes
 * after it, so earlier ones stay put. The first node is the anchor and the last edge closes the outline,
 * so a lock there (or locks that cannot all be true) is reported by `conflicts`.
 */
export function solve(input: Node[]): Node[] {
  const nodes = clone(input);
  const n = nodes.length;
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < n - 1; i++) {
      if (nodes[i].A !== undefined && i > 0) applyAngle(nodes, i, nodes[i].A!);
      if (nodes[i].L !== undefined) applyLength(nodes, i, nodes[i].L!);
    }
  return nodes;
}

export function conflicts(nodes: Node[]) {
  const edges = new Set<number>(), pts = new Set<number>();
  nodes.forEach((p, i) => {
    if (p.L !== undefined && Math.abs(edgeLength(nodes, i) - p.L) > EPS) edges.add(i);
    if (p.A !== undefined && Math.abs(insideAngle(nodes, i) - p.A) > 0.2) pts.add(i);
  });
  return { edges, pts };
}

// ---------------------------------------------------------------- edits (all return a solved copy)

export function setLength(nodes: Node[], i: number, L: number): Node[] {
  const next = clone(nodes);
  next[i].L = Math.max(0.1, L);
  if (i === nodes.length - 1) {
    // The closing edge: move the last node instead of the first.
    const a = next[0], b = next[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    b.x = a.x + ((b.x - a.x) / len) * next[i].L!;
    b.y = a.y + ((b.y - a.y) / len) * next[i].L!;
  }
  return solve(next);
}

export function setAngle(nodes: Node[], i: number, A: number): Node[] {
  const next = clone(nodes);
  next[i].A = Math.min(359, Math.max(1, A));
  return solve(next);
}

export function unlock(nodes: Node[], kind: 'L' | 'A', i: number): Node[] {
  const next = clone(nodes);
  delete next[i][kind];
  return next;
}

export function movePoint(nodes: Node[], i: number, x: number, y: number): Node[] {
  const next = clone(nodes);
  next[i].x = x;
  next[i].y = y;
  return solve(next);
}

/** Splits edge i into `parts` equal pieces (a lock on it no longer applies). */
export function splitEdge(nodes: Node[], i: number, parts = 2, at?: Pt): Node[] {
  const next = clone(nodes);
  const a = next[i], b = next[(i + 1) % next.length];
  delete a.L;
  delete a.b;
  const extra: Node[] = at ? [{ x: at[0], y: at[1] }] : Array.from({ length: Math.max(1, parts - 1) }, (_, k) => ({ x: a.x + ((b.x - a.x) * (k + 1)) / parts, y: a.y + ((b.y - a.y) * (k + 1)) / parts }));
  next.splice(i + 1, 0, ...extra);
  return next;
}

export function removePoint(nodes: Node[], i: number): Node[] {
  if (nodes.length <= 3) return nodes;
  const n = nodes.length;
  const next = clone(nodes);
  const prev = next[(i - 1 + n) % n];
  delete prev.L;
  delete prev.b;
  next.splice(i, 1);
  return solve(next);
}

/** Collapses edge i into a point at its middle. */
export function removeEdge(nodes: Node[], i: number): Node[] {
  if (nodes.length <= 3) return nodes;
  const n = nodes.length;
  const next = clone(nodes);
  const a = next[i], b = next[(i + 1) % n];
  a.x = (a.x + b.x) / 2;
  a.y = (a.y + b.y) / 2;
  a.b = b.b;
  a.L = b.L;
  delete a.A;
  next.splice((i + 1) % n, 1);
  return solve(next);
}

/** Turns edge i level (horizontal) or upright (vertical), keeping its length; later nodes follow. */
export function straighten(nodes: Node[], i: number, dir: 'h' | 'v'): Node[] {
  const next = clone(nodes);
  const n = next.length;
  const a = next[i], b = next[(i + 1) % n];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const tx = dir === 'h' ? a.x + Math.sign(b.x - a.x || 1) * len : a.x;
  const ty = dir === 'v' ? a.y + Math.sign(b.y - a.y || 1) * len : a.y;
  if (i === n - 1) {
    // Closing edge: move the last node to line up with the first.
    a.x = dir === 'h' ? a.x : b.x;
    a.y = dir === 'v' ? a.y : b.y;
    return solve(next);
  }
  const dx = tx - b.x, dy = ty - b.y;
  for (let k = i + 1; k < n; k++) {
    next[k].x += dx;
    next[k].y += dy;
  }
  return solve(next);
}

/** Bulge of edge i, mm; 0 makes it straight again. */
export function setBulge(nodes: Node[], i: number, b: number): Node[] {
  const next = clone(nodes);
  if (Math.abs(b) < 0.01) delete next[i].b;
  else next[i].b = b;
  return next;
}

/** Bulge that gives an arc of radius R over the chord (the shorter arc), keeping the side. */
export function bulgeForRadius(chord: number, R: number, side: number) {
  const h = chord / 2;
  const s = R <= h ? h : R - Math.sqrt(R * R - h * h);
  return (side < 0 ? -1 : 1) * s;
}

export function radiusOfBulge(chord: number, s: number) {
  const a = Math.abs(s);
  return a < 1e-6 ? Infinity : (chord * chord) / 4 / (2 * a) + a / 2;
}

/** Sign of a bulge that points out of the shape. */
export const outward = (nodes: Node[]) => (signedArea(nodes) >= 0 ? 1 : -1);

export function setCorner(nodes: Node[], i: number, kind: 'sharp' | 'round' | 'chamfer', v: number): Node[] {
  const next = clone(nodes);
  delete next[i].r;
  delete next[i].ch;
  if (kind === 'round' && v > 0) next[i].r = v;
  if (kind === 'chamfer' && v > 0) next[i].ch = v;
  return next;
}

// ---------------------------------------------------------------- outline as a polygon

function arcPoints(a: Pt, b: Pt, s: number, out: Pt[]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const c = Math.hypot(dx, dy);
  if (c < 1e-6) return;
  const nx = dy / c, ny = -dx / c;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const R = radiusOfBulge(c, s);
  const sg = Math.sign(s);
  const ox = mx + nx * sg * (Math.abs(s) - R), oy = my + ny * sg * (Math.abs(s) - R);
  const a0 = Math.atan2(a[1] - oy, a[0] - ox), a1 = Math.atan2(b[1] - oy, b[0] - ox);
  const ap = Math.atan2(my + ny * s - oy, mx + nx * s - ox);
  const norm = (v: number) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const ccw = norm(a1 - a0);
  const sweep = norm(ap - a0) < ccw ? ccw : ccw - 2 * Math.PI;
  const steps = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 32)));
  for (let k = 1; k < steps; k++) {
    const t = a0 + (sweep * k) / steps;
    out.push([ox + Math.cos(t) * R, oy + Math.sin(t) * R]);
  }
}

/** Points that replace corner i (one point when it stays sharp). */
function cornerPoints(nodes: Node[], i: number): Pt[] {
  const n = nodes.length;
  const p = nodes[(i - 1 + n) % n], c = nodes[i], q = nodes[(i + 1) % n];
  const straight = !p.b && !c.b;
  const want = c.r ?? c.ch ?? 0;
  if (!straight || want <= 0) return [[c.x, c.y]];
  const l1 = Math.hypot(p.x - c.x, p.y - c.y), l2 = Math.hypot(q.x - c.x, q.y - c.y);
  if (l1 < 1e-6 || l2 < 1e-6) return [[c.x, c.y]];
  const u: Pt = [(p.x - c.x) / l1, (p.y - c.y) / l1], v: Pt = [(q.x - c.x) / l2, (q.y - c.y) / l2];
  const phi = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
  if (phi < 1e-3 || phi > Math.PI - 1e-3) return [[c.x, c.y]];
  const max = 0.49 * Math.min(l1, l2);
  let d = c.ch ? Math.min(c.ch, max) : (c.r ?? 0) / Math.tan(phi / 2);
  d = Math.min(d, max);
  const t1: Pt = [c.x + u[0] * d, c.y + u[1] * d], t2: Pt = [c.x + v[0] * d, c.y + v[1] * d];
  if (c.ch) return [t1, t2];
  const r = d * Math.tan(phi / 2);
  const bl = Math.hypot(u[0] + v[0], u[1] + v[1]);
  const k = r / Math.sin(phi / 2) / bl;
  const ox = c.x + (u[0] + v[0]) * k, oy = c.y + (u[1] + v[1]) * k;
  const s0 = Math.atan2(t1[1] - oy, t1[0] - ox);
  let sweep = Math.atan2(t2[1] - oy, t2[0] - ox) - s0;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const steps = Math.max(3, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
  const out: Pt[] = [];
  for (let s = 0; s <= steps; s++) out.push([ox + Math.cos(s0 + (sweep * s) / steps) * r, oy + Math.sin(s0 + (sweep * s) / steps) * r]);
  return out;
}

/** The outline with arcs, roundings and chamfers turned into straight pieces. */
export function tessellate(nodes: Node[]): Pt[] {
  const n = nodes.length;
  const corners = nodes.map((_, i) => cornerPoints(nodes, i));
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    out.push(...corners[i]);
    const b = nodes[i].b;
    if (b) arcPoints(corners[i][corners[i].length - 1], corners[(i + 1) % n][0], b, out);
  }
  return out;
}

/** Edge i as drawn without corner roundings: its two ends, with the arc between them when bulged. */
export function edgePath(nodes: Node[], i: number): Pt[] {
  const a = nodes[i], b = nodes[(i + 1) % nodes.length];
  const out: Pt[] = [[a.x, a.y]];
  if (a.b) arcPoints([a.x, a.y], [b.x, b.y], a.b, out);
  out.push([b.x, b.y]);
  return out;
}
