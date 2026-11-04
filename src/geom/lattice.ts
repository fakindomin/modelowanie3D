import type { CrossSection } from 'manifold-3d';
import { M } from './manifold';

export type LatticePattern = 'tri' | 'hex' | 'diamond' | 'slot' | 'circle';

export const LATTICE_LABELS: Record<LatticePattern, string> = {
  tri: 'Kratownica (trójkąty)',
  hex: 'Plaster miodu',
  diamond: 'Romby',
  slot: 'Szczeliny',
  circle: 'Koła',
};

type Pt = [number, number];

const MAX_CELLS = 6000;

/**
 * Openings of a see-through pattern covering the square [-half, half]², centred on the origin:
 * `cell` is the repeat, `rib` the width of material left between neighbouring openings.
 * Returns null when the openings would be too small or too many.
 */
export function latticeHoles(pattern: LatticePattern, cell: number, rib: number, half: number): CrossSection | null {
  const c = Math.max(1, cell), w = Math.max(0.4, rib);
  const polys: Pt[][] = [];
  const room = (n: number) => n * n < MAX_CELLS;
  if (pattern === 'tri') {
    // Equilateral triangles of side c, alternately pointing up and down; each shrunk so the strut is w.
    const h = (c * Math.sqrt(3)) / 2;
    const rIn = c / (2 * Math.sqrt(3));
    const k = (rIn - w / 2) / rIn;
    if (k <= 0.15) return null;
    const rows = Math.ceil(half / h) + 1, cols = Math.ceil(half / (c / 2)) + 2;
    if (!room(Math.max(rows, cols) * 2)) return null;
    for (let j = -rows; j <= rows; j++)
      for (let i = -cols; i <= cols; i++) {
        const up = (i + j) % 2 === 0;
        const cx = (i * c) / 2, y0 = j * h;
        const tri: Pt[] = up ? [[cx - c / 2, y0], [cx + c / 2, y0], [cx, y0 + h]] : [[cx - c / 2, y0 + h], [cx, y0], [cx + c / 2, y0 + h]];
        const gx = cx, gy = up ? y0 + h / 3 : y0 + (2 * h) / 3;
        polys.push(tri.map(([x, y]) => [gx + (x - gx) * k, gy + (y - gy) * k] as Pt));
      }
  } else if (pattern === 'hex') {
    // Honeycomb: hexagons c apart (flat to flat), openings c - w across flats.
    const f = c - w;
    if (f < 1) return null;
    const r = f / Math.sqrt(3);
    const dx = c, dy = (c * Math.sqrt(3)) / 2;
    const rows = Math.ceil(half / dy) + 1, cols = Math.ceil(half / dx) + 1;
    if (!room(Math.max(rows, cols) * 2)) return null;
    for (let j = -rows; j <= rows; j++)
      for (let i = -cols; i <= cols; i++) {
        const cx = i * dx + (j % 2 ? dx / 2 : 0), cy = j * dy;
        polys.push(Array.from({ length: 6 }, (_, k) => [cx + r * Math.cos((Math.PI / 3) * k + Math.PI / 6), cy + r * Math.sin((Math.PI / 3) * k + Math.PI / 6)] as Pt));
      }
  } else if (pattern === 'diamond') {
    // Squares turned 45° on a centred grid: neighbours sit c/√2 apart across a strut of width w.
    const a = c / Math.SQRT2 - w;
    if (a < 1) return null;
    const d = a / Math.SQRT2;
    const n = Math.ceil(half / c) + 1;
    if (!room(n * 2)) return null;
    for (let j = -n; j <= n; j++)
      for (let i = -n; i <= n; i++)
        for (const [cx, cy] of [[i * c, j * c], [(i + 0.5) * c, (j + 0.5) * c]] as Pt[])
          polys.push([[cx + d, cy], [cx, cy + d], [cx - d, cy], [cx, cy - d]]);
  } else if (pattern === 'slot') {
    // Rounded slots in staggered rows, three cells long.
    const sw = c - w, len = 3 * c - w;
    if (sw < 1) return null;
    const r = sw / 2;
    const rows = Math.ceil(half / c) + 1, cols = Math.ceil(half / (3 * c)) + 1;
    if (!room(Math.max(rows, cols * 3) * 2)) return null;
    for (let j = -rows; j <= rows; j++)
      for (let i = -cols; i <= cols; i++) {
        const cx = i * 3 * c + (j % 2 ? 1.5 * c : 0), cy = j * c;
        const pts: Pt[] = [];
        for (let k = 0; k <= 6; k++) {
          const t = -Math.PI / 2 + (Math.PI * k) / 6;
          pts.push([cx + len / 2 - r + r * Math.cos(t), cy + r * Math.sin(t)]);
        }
        for (let k = 0; k <= 6; k++) {
          const t = Math.PI / 2 + (Math.PI * k) / 6;
          pts.push([cx - len / 2 + r + r * Math.cos(t), cy + r * Math.sin(t)]);
        }
        polys.push(pts);
      }
  } else {
    // Round openings on a hexagonal grid.
    const d = c - w;
    if (d < 1) return null;
    const dy = (c * Math.sqrt(3)) / 2;
    const rows = Math.ceil(half / dy) + 1, cols = Math.ceil(half / c) + 1;
    if (!room(Math.max(rows, cols) * 2)) return null;
    const seg = d > 8 ? 24 : 16;
    for (let j = -rows; j <= rows; j++)
      for (let i = -cols; i <= cols; i++) {
        const cx = i * c + (j % 2 ? c / 2 : 0), cy = j * dy;
        polys.push(Array.from({ length: seg }, (_, k) => [cx + (d / 2) * Math.cos((2 * Math.PI * k) / seg), cy + (d / 2) * Math.sin((2 * Math.PI * k) / seg)] as Pt));
      }
  }
  if (!polys.length) return null;
  return M().CrossSection.ofPolygons(polys.map(ccw), 'Positive');
}

/** Counter-clockwise copy of a polygon (the fill rule counts only anticlockwise loops). */
function ccw(p: Pt[]): Pt[] {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
    a += x0 * y1 - x1 * y0;
  }
  return a < 0 ? [...p].reverse() : p;
}
