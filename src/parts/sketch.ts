import type { PartDef, Params } from './def';
import { M, settle } from '../geom/manifold';

export type Pt = [number, number];

/** Outline points of a sketch part, in mm (x right, y up; for a revolved profile x is the radius). */
export function sketchPoints(p: Params): Pt[] {
  try {
    const v = JSON.parse(String(p.pts));
    if (Array.isArray(v) && v.length >= 3 && v.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite))) return v as Pt[];
  } catch {
    /* fall through */
  }
  return [];
}

export const encodePts = (pts: Pt[]) => JSON.stringify(pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]));

const regular = (n: number, r: number, a0 = Math.PI / 2): Pt[] => Array.from({ length: n }, (_, i) => [r * Math.cos(a0 + (i * 2 * Math.PI) / n), r * Math.sin(a0 + (i * 2 * Math.PI) / n)]);
const star = (n: number, r: number, ri: number): Pt[] =>
  Array.from({ length: 2 * n }, (_, i) => {
    const a = Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? ri : r;
    return [rr * Math.cos(a), rr * Math.sin(a)];
  });

/** Ready outlines to start from. */
export const SKETCH_PRESETS: Record<string, { label: string; pts: Pt[] }> = {
  house: { label: 'Domek', pts: [[-20, -15], [20, -15], [20, 5], [0, 18], [-20, 5]] },
  rect: { label: 'Prostokąt', pts: [[-20, -12], [20, -12], [20, 12], [-20, 12]] },
  tri: { label: 'Trójkąt', pts: regular(3, 20) },
  hex: { label: 'Sześciokąt', pts: regular(6, 20, 0) },
  star: { label: 'Gwiazda', pts: star(5, 22, 9) },
  ell: { label: 'Litera L', pts: [[-15, -20], [15, -20], [15, -10], [-5, -10], [-5, 20], [-15, 20]] },
  arrow: { label: 'Strzałka', pts: [[-25, -6], [5, -6], [5, -15], [25, 0], [5, 15], [5, 6], [-25, 6]] },
};

/** Profiles for a revolved part: x is the distance from the axis. */
export const REVOLVE_PRESETS: Record<string, { label: string; pts: Pt[] }> = {
  vase: { label: 'Wazon', pts: [[0, 0], [22, 0], [24, 6], [16, 34], [20, 58], [18, 58], [14, 34], [22, 6], [20, 2], [0, 2]] },
  cup: { label: 'Kubek', pts: [[0, 0], [30, 0], [32, 70], [30, 70], [28, 3], [0, 3]] },
  knob: { label: 'Gałka', pts: [[0, 0], [10, 0], [10, 6], [16, 8], [17, 14], [14, 20], [0, 21]] },
  bowl: { label: 'Miska', pts: [[0, 0], [20, 0], [32, 10], [40, 25], [38, 25], [30, 12], [18, 3], [0, 3]] },
  spool: { label: 'Szpulka', pts: [[4, 0], [25, 0], [25, 3], [12, 5], [12, 35], [25, 37], [25, 40], [4, 40]] },
};

const outline = (pts: Pt[]) => M().CrossSection.ofPolygons([pts], 'NonZero');

export const SKETCH_DEFS: PartDef[] = [
  {
    type: 'sketch',
    label: 'Własny kształt (obrys)',
    category: 'basic',
    hole: false,
    description: 'Narysuj obrys z góry, a powstanie z niego bryła o podanej wysokości. Przeciągaj punkty, klik w krawędź dodaje punkt, dwuklik w punkt go usuwa.',
    params: [
      { key: 'pts', label: 'Obrys', type: 'text', def: encodePts(SKETCH_PRESETS.house.pts), show: () => false },
      { key: 'H', label: 'Wysokość', type: 'number', def: 10, min: 0.2, max: 1000, step: 0.5, unit: 'mm' },
      { key: 'top', label: 'Góra zwężona do', type: 'number', def: 100, min: 0, max: 300, step: 5, unit: '%', hint: '100% = proste ścianki, mniej = ścięte do środka (piramida przy 0%).' },
      { key: 'twist', label: 'Skręt', type: 'number', def: 0, min: -720, max: 720, step: 15, unit: '°' },
    ],
    build: (p) => {
      const pts = sketchPoints(p);
      const h = Math.max(0.2, Number(p.H) || 10);
      const k = Math.max(0, Number(p.top ?? 100)) / 100;
      const tw = Number(p.twist) || 0;
      const div = tw ? Math.max(4, Math.ceil(Math.abs(tw) / 5)) : 0;
      return settle(outline(pts).extrude(h, div, tw, [k, k]));
    },
  },
  {
    type: 'sketchRev',
    label: 'Kształt obrotowy (profil)',
    category: 'basic',
    hole: false,
    description: 'Narysuj połowę przekroju (od osi w prawo), a powstanie bryła obrotowa: wazon, kubek, gałka, kółko. Przeciągaj punkty, klik w krawędź dodaje punkt, dwuklik w punkt go usuwa.',
    params: [
      { key: 'pts', label: 'Profil', type: 'text', def: encodePts(REVOLVE_PRESETS.vase.pts), show: () => false },
      { key: 'deg', label: 'Kąt obrotu', type: 'number', def: 360, min: 10, max: 360, step: 10, unit: '°', hint: 'Mniej niż 360° daje wycinek (np. ćwiartkę).' },
      { key: 'seg', label: 'Gładkość', type: 'number', def: 96, min: 6, max: 256, step: 2, hint: 'Liczba ścianek dookoła; 6 daje sześciokąt.' },
    ],
    build: (p) => {
      const pts = sketchPoints(p).map(([x, y]) => [Math.max(0, x), y] as Pt);
      return settle(outline(pts).revolve(Math.round(Number(p.seg) || 96), Math.min(360, Number(p.deg) || 360)));
    },
  },
];
