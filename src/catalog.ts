import type { Manifold } from 'manifold-3d';
import { M, settle } from './geom/manifold';
import type { Category, ParamDef, Params, PartDef } from './parts/def';
import { L, T, bar, block, rblock, clearance, cube, cyl, hex, metric, num, poly, rect, select } from './parts/util';
import { THREAD_DEFS } from './parts/threads';
import { JOINT_DEFS } from './parts/joints';
import { FITTING_DEFS } from './parts/fittings';
import { CONNECTOR_DEFS } from './parts/connectors';
import { FIGURINE_DEF } from './parts/figurine';
import { TEXT_DEFS } from './parts/text';
import { PIPE_DEFS } from './parts/pipes';
import { meshSolid } from './geom/meshes';
import { dividerSolid, segmentsOf } from './geom/dividers';

export type { Category, ParamDef, ParamValue, Params, PartDef } from './parts/def';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'ready', label: 'Gotowe elementy' },
  { id: 'profile', label: 'Profile' },
  { id: 'basic', label: 'Bryły podstawowe' },
  { id: 'joints', label: 'Otwory i połączenia' },
  { id: 'threads', label: 'Gwinty i śruby' },
  { id: 'hinges', label: 'Zawiasy i łączniki' },
  { id: 'fittings', label: 'Przepusty i złączki' },
  { id: 'connectors', label: 'Otwory pod złącza' },
];

export const MAGNETS: Record<string, [number, number]> = {
  '5x2': [5, 2],
  '6x2': [6, 2],
  '6x3': [6, 3],
  '8x2': [8, 2],
  '8x3': [8, 3],
  '10x2': [10, 2],
  '10x3': [10, 3],
  '12x3': [12, 3],
};

// Typical heat-set insert pocket sizes (diameter, depth).
const INSERTS: Record<string, [number, number]> = {
  M2: [3.2, 4],
  M3: [4.0, 5.7],
  M4: [5.6, 8.1],
  M5: [6.4, 9.5],
};

// Hex nut size across flats and thickness.
const NUTS: Record<string, [number, number]> = {
  M2: [4, 1.6],
  M3: [5.5, 2.4],
  M4: [7, 3.2],
  M5: [8, 4],
  M6: [10, 5],
};

/** Inner opening sizes for the drawer cabinet, shared with the "add drawers" helper. */
export function cabinetOpenings(p: Params) {
  const w = num(p, 'w'), h = num(p, 'h'), d = num(p, 'D'), t = num(p, 'T');
  const cols = num(p, 'cols'), rows = num(p, 'rows');
  const W = cols * w + (cols + 1) * t;
  const openings: { cx: number; z0: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) openings.push({ cx: -W / 2 + t + c * (w + t) + w / 2, z0: t + r * (h + t) });
  return { W, H: rows * h + (rows + 1) * t, D: d, depth: d - t, openings };
}

/**
 * Catch magnet between a drawer's back and the cabinet's back wall: pocket centre height above the
 * opening's floor, pocket radius and depth, and the material ring around it.
 */
export function catchMagnet(size: unknown) {
  const m = MAGNETS[String(size)];
  if (!m) return null;
  const [d, h] = m;
  const r = (d + 0.2) / 2;
  const ring = r + 1.2;
  return { r, depth: h + 0.2, ring, z: ring + 2.5 };
}

const CATCH = select('catch', 'Magnes-zatrzask z tyłu', 'none', [['none', 'Brak'], ...Object.keys(MAGNETS).map((k) => [k, `${k.replace('x', '×')} mm`] as [string, string])]);
CATCH.hint = 'Gniazdo na magnes w tylnej ściance: w obudowie i w szufladzie na tej samej wysokości, więc szuflada sama się domyka. Szuflady dodane przyciskiem „Dodaj dopasowane szuflady” dostają to samo. Magnesy wklej parami, żeby się przyciągały.';

const SHAPE = select('shape', 'Kształt', 'rect', [
  ['rect', 'Prostokątny'],
  ['round', 'Okrągły'],
  ['hex', 'Sześciokątny'],
]);
const rectOnly = (p: Params) => !p.shape || p.shape === 'rect';
const RAD = (show?: (p: Params) => boolean): ParamDef => ({
  key: 'rad',
  label: 'Zaokrąglenie narożników',
  type: 'number',
  def: 0,
  min: 0,
  max: 100,
  step: 0.5,
  unit: 'mm',
  show,
  hint: 'Promień pionowych narożników. Wnętrze dostaje promień mniejszy o grubość ścianki, więc ścianka ma wszędzie tę samą grubość.',
});

/** Groove for a sliding lid: 2 mm lid + 0.4 mm play, cut up to 1.2 mm into walls, 1.2 mm under the top. */
export function slideGroove(p: Params) {
  const t = num(p, 'T'), H = num(p, 'H');
  const depth = Math.max(0.4, Math.min(1.2, t - 0.8));
  const h = 2.4;
  return { depth, h, z0: H - 1.2 - h, lidW: num(p, 'W') - 2 * t + 2 * depth - 0.6, lidD: num(p, 'D') - t + depth - 0.3, lidT: 2 };
}

const radial = (p: Params) => (p.shape === 'round' || p.shape === 'hex') && p.divMode === 'radial';
const gridOn = (p: Params) => !radial(p);
const hasDividers = (p: Params) => (radial(p) ? num(p, 'nr') >= 2 || num(p, 'ring') > 0 : num(p, 'nx') > 1 || num(p, 'ny') > 1 || (typeof p.div === 'string' && p.div.length > 0));

/** Inside size of a box-like part for its divider layout (round and hex: across the inside). */
function inside(p: Params) {
  const t = num(p, 'T');
  const iw = num(p, 'W') - 2 * t;
  return { iw, id: p.shape === 'round' || p.shape === 'hex' ? iw : num(p, 'D') - 2 * t };
}

/** Dividers of a box or drawer from the floor to `top`, clipped to the inside (plus half the wall). */
function boxDividers(p: Params, b: number, top: number): Manifold | null {
  if (top <= b + 0.2) return null;
  const t = num(p, 'T'), W = num(p, 'W');
  const { iw, id } = inside(p);
  // A hexagon's corners stick out past the grid's square, so its lines run further and get clipped.
  let m = dividerSolid(segmentsOf(p, iw, id), t, b, top - b, p.shape === 'hex' ? iw * 0.08 + t : t / 2);
  const ring = num(p, 'ring');
  if (radial(p) && ring > 2 * t) {
    // Spokes start at the ring, leaving one round compartment in the middle.
    const hole = M().Manifold.cylinder(top - b + 2, ring / 2 - t / 2).translate([0, 0, b - 1]);
    const rc = M().Manifold.cylinder(top - b, ring / 2 + t / 2).translate([0, 0, b]).subtract(hole);
    m = m ? m.subtract(hole).add(rc) : rc;
  }
  if (!m) return null;
  const clip = p.shape === 'round' ? cyl(top + 1, W / 2 - t / 2) : p.shape === 'hex' ? hex(W - t, top + 1) : rblock(W - t, num(p, 'D') - t, top + 1, Math.max(0, (Number(p.rad) || 0) - t / 2));
  return m.intersect(clip);
}

const DIVIDER_PARAMS: ParamDef[] = [
  select('divMode', 'Przegródki', 'grid', [
    ['grid', 'Na krzyż (siatka)'],
    ['radial', 'Promieniowe (jak tort)'],
  ]),
  { key: 'nx', label: 'Przegródki wzdłuż', type: 'number', def: 1, min: 1, max: 20, step: 1, show: gridOn },
  { key: 'ny', label: 'Przegródki w poprzek', type: 'number', def: 1, min: 1, max: 20, step: 1, show: gridOn },
  { key: 'nr', label: 'Liczba komór', type: 'number', def: 4, min: 2, max: 24, step: 1, show: radial },
  { key: 'rot', label: 'Obrót przegródek', type: 'number', def: 0, min: -180, max: 180, step: 5, unit: '°', show: radial },
  { key: 'ring', label: 'Pierścień w środku (średnica)', type: 'number', def: 0, min: 0, max: 500, unit: 'mm', show: radial, hint: '0 = bez pierścienia.' },
];
DIVIDER_PARAMS[0].show = (p) => p.shape === 'round' || p.shape === 'hex';

/** Plain grid fields edited by hand start a fresh even grid (the editor's layout is dropped). */
function dropLayout(prev: Params, next: Params): Params {
  if (typeof next.div !== 'string' || !next.div) return next;
  if (prev.div === next.div && (prev.nx !== next.nx || prev.ny !== next.ny)) return { ...next, div: '' };
  if (prev.shape !== next.shape || prev.divMode !== next.divMode) return { ...next, div: '' };
  return next;
}

const BASE: PartDef[] = [
  {
    type: 'mesh',
    label: 'Model z pliku',
    category: 'basic',
    hole: false,
    hidden: true,
    description: 'Model wczytany z pliku STL. Robisz w nim otwory, magnesy i napisy, tniesz go i łączysz jak każdą bryłę.',
    params: [
      { key: 'ref', label: 'Plik', type: 'text', def: '', show: () => false },
      { key: 'scale', label: 'Skala', type: 'number', def: 100, min: 1, max: 10000, step: 1, unit: '%', hint: '100% = wymiary z pliku (milimetry). Model w calach powiększ do 2540%.' },
    ],
    build: (p) => {
      const k = num(p, 'scale') / 100;
      return settle(meshSolid(String(p.ref)).scale([k, k, k]));
    },
  },
  // ---------------------------------------------------------------- ready
  {
    type: 'slab',
    label: 'Płyta',
    category: 'ready',
    hole: false,
    description: 'Płaska płyta z grubością. Z kilku płyt złożysz pudło, półkę albo własny profil.',
    params: [
      { key: 'W', label: 'Szerokość (X)', type: 'number', def: 100, min: 1, max: 1000, unit: 'mm' },
      { key: 'D', label: 'Głębokość (Y)', type: 'number', def: 60, min: 1, max: 1000, unit: 'mm' },
      { key: 'T', label: 'Grubość', type: 'number', def: 3, min: 0.4, max: 100, step: 0.2, unit: 'mm' },
    ],
    build: (p) => block(num(p, 'W'), num(p, 'D'), num(p, 'T')),
  },
  {
    type: 'box',
    label: 'Pudełko',
    category: 'ready',
    hole: false,
    description: 'Otwarte pudełko: prostokątne, okrągłe albo sześciokątne, z opcjonalnymi przegródkami lub wsuwaną pokrywką.',
    params: [
      SHAPE,
      { key: 'W', label: 'Szerokość', type: 'number', def: 80, min: 5, max: 500, unit: 'mm', hint: 'Dla okrągłego: średnica. Dla sześciokątnego: rozstaw boków.' },
      { key: 'D', label: 'Głębokość', type: 'number', def: 60, min: 5, max: 500, unit: 'mm', show: rectOnly },
      { key: 'H', label: 'Wysokość', type: 'number', def: 40, min: 3, max: 500, unit: 'mm' },
      T(2),
      { key: 'B', label: 'Grubość dna', type: 'number', def: 2, min: 0.4, max: 20, step: 0.2, unit: 'mm' },
      ...DIVIDER_PARAMS,
      RAD((p) => rectOnly(p) && !p.slide),
      { key: 'slide', label: 'Rowki na wsuwaną pokrywkę', type: 'bool', def: false, show: rectOnly, hint: 'Rowki w ściankach pod górną krawędzią; pokrywka wsuwa się od przodu (ścianka min. 2 mm).' },
      {
        key: 'low',
        label: 'Przegródki niższe o',
        type: 'number',
        def: 0,
        min: 0,
        max: 200,
        step: 0.5,
        unit: 'mm',
        show: hasDividers,
        hint: 'Obniża przegródki pod górną krawędzią, np. o wysokość rantu pokrywki. Przy wsuwanej pokrywce przegródki same kończą się pod rowkiem.',
      },
    ],
    normalize: dropLayout,
    build: (p) => {
      const W = num(p, 'W'), H = num(p, 'H'), t = num(p, 'T'), b = num(p, 'B');
      const rect = !p.shape || p.shape === 'rect';
      // Dividers stop under a sliding lid's groove so the lid can pass over them.
      const top = Math.min(H - (Number(p.low) || 0), rect && p.slide ? slideGroove(p).z0 - 0.3 : H);
      const div = boxDividers(p, b, top);
      if (p.shape === 'round') {
        const m = cyl(H, W / 2).subtract(cyl(H, W / 2 - t).translate([0, 0, b]));
        return div ? m.add(div) : m;
      }
      if (p.shape === 'hex') {
        const m = hex(W, H).subtract(hex(W - 2 * t, H).translate([0, 0, b]));
        return div ? m.add(div) : m;
      }
      const D = num(p, 'D');
      const rad = p.slide ? 0 : Number(p.rad) || 0;
      let m = rblock(W, D, H, rad).subtract(rblock(W - 2 * t, D - 2 * t, H, Math.max(0, rad - t), 0, 0, b));
      if (div) m = m.add(div);
      if (p.slide) {
        const g = slideGroove(p);
        // Groove in the side and back walls, open at the front; the front wall drops to the groove's bottom.
        m = m.subtract(block(W - 2 * t + 2 * g.depth, D - t + g.depth + 1, g.h, 0, -(t - g.depth + 1) / 2, g.z0));
        m = m.subtract(block(W - 2 * t, t + 2, H - g.z0 + 1, 0, -D / 2 + t / 2, g.z0));
      }
      return m;
    },
  },
  {
    type: 'lid',
    label: 'Pokrywka',
    category: 'ready',
    hole: false,
    description: 'Wciskana pokrywka do pudełka (rant od spodu, drukuj rantem do góry). Bez rantu jest płaska.',
    params: [
      SHAPE,
      { key: 'W', label: 'Szerokość pudełka', type: 'number', def: 80, min: 5, max: 500, unit: 'mm' },
      { key: 'D', label: 'Głębokość pudełka', type: 'number', def: 60, min: 5, max: 500, unit: 'mm', show: rectOnly },
      { key: 'T', label: 'Grubość pokrywki', type: 'number', def: 2, min: 0.4, max: 20, step: 0.2, unit: 'mm' },
      { key: 'wall', label: 'Ścianka pudełka', type: 'number', def: 2, min: 0.4, max: 20, step: 0.2, unit: 'mm' },
      { key: 'R', label: 'Wysokość rantu', type: 'number', def: 4, min: 0, max: 50, unit: 'mm' },
      clearance(0.3),
      RAD(rectOnly),
      { key: 'nx', label: 'Szczeliny na przegródki wzdłuż', type: 'number', def: 1, min: 1, max: 20, step: 1, show: (p) => gridOn(p) && num(p, 'R') > 0 && !p.div, hint: 'Tyle samo co przegródek w pudełku: rant dostaje szczeliny tam, gdzie stoją przegródki.' },
      { key: 'ny', label: 'Szczeliny na przegródki w poprzek', type: 'number', def: 1, min: 1, max: 20, step: 1, show: (p) => gridOn(p) && num(p, 'R') > 0 && !p.div },
    ],
    build: (p) => {
      const W = num(p, 'W'), t = num(p, 'T'), wall = num(p, 'wall'), R = num(p, 'R'), c = num(p, 'luz'), lip = 1.6;
      let m: Manifold;
      if (p.shape === 'round' || p.shape === 'hex') {
        const solid = (w: number, h: number) => (p.shape === 'round' ? cyl(h, w / 2) : hex(w, h));
        m = solid(W, t);
        const o = W - 2 * wall - c;
        if (R > 0) m = m.add(solid(o, R).subtract(solid(o - 2 * lip, R + 1)).translate([0, 0, t]));
      } else {
        const D = num(p, 'D'), rad = Number(p.rad) || 0;
        m = rblock(W, D, t, rad);
        if (R > 0) {
          // The rim follows the box's rounded inside, less the clearance.
          const ow = W - 2 * wall - c, od = D - 2 * wall - c, ri = Math.max(0, rad - wall - c / 2);
          m = m.add(rblock(ow, od, R, ri, 0, 0, t).subtract(rblock(ow - 2 * lip, od - 2 * lip, R + 1, Math.max(0, ri - lip), 0, 0, t)));
        }
      }
      if (R > 0) {
        // Slots where the box dividers meet the rim (dividers are as thick as the box wall), mirrored
        // both ways so they fit however the lid is flipped onto the box.
        const sp = { ...p, T: wall };
        const { iw, id } = inside(sp);
        const slots = dividerSolid(segmentsOf(sp, iw, id), wall + 2 * c, t + 0.01, R + 1, wall + 2);
        if (slots) m = m.subtract(M().Manifold.union([slots, slots.mirror([1, 0, 0]), slots.mirror([0, 1, 0])]));
      }
      return m;
    },
  },
  {
    type: 'drawer',
    label: 'Szuflada',
    category: 'ready',
    hole: false,
    description: 'Szuflada z wycięciem na palec lub gałką z przodu, z opcjonalnymi przegródkami.',
    normalize: dropLayout,
    params: [
      { key: 'W', label: 'Szerokość', type: 'number', def: 60, min: 10, max: 500, unit: 'mm' },
      { key: 'D', label: 'Głębokość', type: 'number', def: 80, min: 10, max: 500, unit: 'mm' },
      { key: 'H', label: 'Wysokość', type: 'number', def: 30, min: 5, max: 300, unit: 'mm' },
      T(1.6),
      { key: 'B', label: 'Grubość dna', type: 'number', def: 1.6, min: 0.4, max: 10, step: 0.2, unit: 'mm' },
      { key: 'nx', label: 'Przegródki wzdłuż', type: 'number', def: 1, min: 1, max: 20, step: 1 },
      { key: 'ny', label: 'Przegródki w poprzek', type: 'number', def: 1, min: 1, max: 20, step: 1 },
      RAD(),
      CATCH,
      {
        key: 'handle',
        label: 'Uchwyt',
        type: 'select',
        def: 'notch',
        options: [
          { value: 'notch', label: 'Wycięcie na palec' },
          { value: 'knob', label: 'Gałka' },
          { value: 'none', label: 'Brak' },
        ],
      },
    ],
    build: (p) => {
      const W = num(p, 'W'), D = num(p, 'D'), H = num(p, 'H'), t = num(p, 'T'), b = num(p, 'B');
      const rad = Number(p.rad) || 0;
      let m = rblock(W, D, H, rad).subtract(rblock(W - 2 * t, D - 2 * t, H, Math.max(0, rad - t), 0, 0, b));
      // Dividers stay 2 mm under the top so the drawer slides into its opening.
      const div = boxDividers(p, b, H - 2);
      if (div) m = m.add(div);
      const mag = catchMagnet(p.catch);
      // Same height as the cabinet's pocket: the drawer stands 0.3 mm above the opening's floor.
      const mz = mag ? mag.z - 0.3 : 0;
      if (mag && mz + mag.ring <= H) {
        const pad = mag.depth + 1 - t;
        if (pad > 0) m = m.add(block(2 * mag.ring, pad + 0.01, mz + mag.ring - b, 0, D / 2 - t - pad / 2 + 0.005, b));
        m = m.subtract(cyl(mag.depth + 0.01, mag.r).rotate([90, 0, 0]).translate([0, D / 2 + 0.01, mz]));
      }
      if (p.handle === 'notch') {
        const r = Math.min(12, H / 2.5, W / 4);
        m = m.subtract(cyl(4 * t, r).rotate([90, 0, 0]).translate([0, -D / 2 + 2 * t, H]));
      } else if (p.handle === 'knob') {
        const r = Math.min(6, H / 4);
        m = m.add(cyl(8, r, r * 0.8).rotate([90, 0, 0]).translate([0, -D / 2 + 0.01, H / 2]));
      }
      return m;
    },
  },
  {
    type: 'cabinet',
    label: 'Obudowa na szuflady',
    category: 'ready',
    hole: false,
    description: 'Regał z otworami na szuflady. Przycisk „Dodaj szuflady” sam je dopasuje.',
    params: [
      { key: 'w', label: 'Szerokość otworu', type: 'number', def: 60, min: 10, max: 400, unit: 'mm' },
      { key: 'h', label: 'Wysokość otworu', type: 'number', def: 30, min: 5, max: 300, unit: 'mm' },
      { key: 'D', label: 'Głębokość', type: 'number', def: 85, min: 10, max: 500, unit: 'mm' },
      { key: 'cols', label: 'Kolumny', type: 'number', def: 2, min: 1, max: 10, step: 1 },
      { key: 'rows', label: 'Rzędy', type: 'number', def: 3, min: 1, max: 20, step: 1 },
      T(2),
      CATCH,
    ],
    build: (p) => {
      const o = cabinetOpenings(p);
      const w = num(p, 'w'), h = num(p, 'h'), t = num(p, 'T');
      const cut = o.openings.map((op) => block(w, o.depth + 1, h, op.cx, -o.D / 2 + (o.depth + 1) / 2 - 1, op.z0));
      let m = block(o.W, o.D, o.H).subtract(M().Manifold.union(cut));
      const mag = catchMagnet(p.catch);
      if (mag && h >= 2 * mag.z) {
        // Pocket in the back wall, open toward the drawer; a pad on the back where the wall is too thin.
        const face = -o.D / 2 + o.depth, pad = mag.depth + 1 - t;
        for (const op of o.openings) {
          const z = op.z0 + mag.z;
          if (pad > 0) m = m.add(block(2 * mag.ring, pad + 0.01, 2 * mag.ring, op.cx, o.D / 2 + pad / 2 - 0.005, z - mag.ring));
          m = m.subtract(cyl(mag.depth + 0.01, mag.r).rotate([-90, 0, 0]).translate([op.cx, face - 0.01, z]));
        }
      }
      return m;
    },
  },
  {
    type: 'plate',
    label: 'Płytka montażowa',
    category: 'ready',
    hole: false,
    description: 'Płaska płytka z otworami w narożnikach.',
    params: [
      { key: 'W', label: 'Szerokość', type: 'number', def: 60, min: 5, max: 500, unit: 'mm' },
      { key: 'D', label: 'Głębokość', type: 'number', def: 40, min: 5, max: 500, unit: 'mm' },
      { key: 'T', label: 'Grubość', type: 'number', def: 3, min: 0.4, max: 50, step: 0.2, unit: 'mm' },
      { key: 'hole', label: 'Średnica otworów', type: 'number', def: 3.4, min: 0, max: 20, step: 0.1, unit: 'mm' },
      { key: 'inset', label: 'Odsunięcie od krawędzi', type: 'number', def: 5, min: 1, max: 100, unit: 'mm' },
      RAD(),
    ],
    build: (p) => {
      const W = num(p, 'W'), D = num(p, 'D'), t = num(p, 'T'), d = num(p, 'hole'), e = num(p, 'inset');
      let m = rblock(W, D, t, Number(p.rad) || 0);
      if (d > 0)
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) m = m.subtract(cyl(t + 2, d / 2).translate([sx * (W / 2 - e), sy * (D / 2 - e), -1]));
      return m;
    },
  },
  {
    type: 'perfPlate',
    label: 'Płyta perforowana',
    category: 'ready',
    hole: false,
    hidden: true,
    description: 'Płyta z siatką otworów (wentylacja, maskownica, organizer na narzędzia).',
    params: [
      { key: 'W', label: 'Szerokość (X)', type: 'number', def: 100, min: 5, max: 1000, unit: 'mm' },
      { key: 'D', label: 'Głębokość (Y)', type: 'number', def: 60, min: 5, max: 1000, unit: 'mm' },
      { key: 'T', label: 'Grubość', type: 'number', def: 2, min: 0.4, max: 50, step: 0.2, unit: 'mm' },
      { key: 'hole', label: 'Średnica otworów', type: 'number', def: 4, min: 0.5, max: 50, step: 0.1, unit: 'mm' },
      { key: 'pitch', label: 'Rozstaw otworów', type: 'number', def: 7, min: 1, max: 100, step: 0.5, unit: 'mm' },
      { key: 'margin', label: 'Pełny margines', type: 'number', def: 5, min: 0, max: 100, unit: 'mm' },
      select('grid', 'Układ', 'hex', [
        ['hex', 'Plaster miodu (przesunięte rzędy)'],
        ['square', 'Kwadratowy'],
      ]),
    ],
    build: (p) => {
      const W = num(p, 'W'), D = num(p, 'D'), t = num(p, 'T'), d = num(p, 'hole'), e = num(p, 'margin');
      const pitch = Math.max(num(p, 'pitch'), d + 0.8);
      const rowStep = p.grid === 'hex' ? (pitch * Math.sqrt(3)) / 2 : pitch;
      const holes: ReturnType<typeof cyl>[] = [];
      const ny = Math.floor((D - 2 * e - d) / rowStep) + 1;
      for (let j = 0; j < ny && holes.length < 4000; j++) {
        const y = -((ny - 1) * rowStep) / 2 + j * rowStep;
        const shift = p.grid === 'hex' && j % 2 ? pitch / 2 : 0;
        const nx = Math.floor((W - 2 * e - d - shift) / pitch) + 1;
        for (let i = 0; i < nx; i++) holes.push(cyl(t + 2, d / 2, d / 2, 16).translate([-((nx - 1) * pitch) / 2 + i * pitch + shift / 2, y, -1]));
      }
      const plate = block(W, D, t);
      return holes.length ? plate.subtract(M().Manifold.union(holes)) : plate;
    },
  },
  // -------------------------------------------------------------- profiles
  {
    type: 'flat',
    label: 'Płaskownik',
    category: 'profile',
    hole: false,
    description: 'Płaska listwa.',
    params: [
      L(100),
      { key: 'W', label: 'Szerokość', type: 'number', def: 20, min: 1, max: 500, unit: 'mm' },
      { key: 'T', label: 'Grubość', type: 'number', def: 3, min: 0.4, max: 100, step: 0.2, unit: 'mm' },
    ],
    build: (p) => settle(cube(num(p, 'L'), num(p, 'W'), num(p, 'T'))),
  },
  {
    type: 'angle',
    label: 'Kątownik',
    category: 'profile',
    hole: false,
    description: 'Profil L.',
    params: [
      L(100),
      { key: 'A', label: 'Ramię poziome', type: 'number', def: 20, min: 1, max: 300, unit: 'mm' },
      { key: 'B', label: 'Ramię pionowe', type: 'number', def: 20, min: 1, max: 300, unit: 'mm' },
      T(2),
    ],
    build: (p) => {
      const a = num(p, 'A'), b = num(p, 'B'), t = num(p, 'T');
      return bar(poly([[0, 0], [a, 0], [a, t], [t, t], [t, b], [0, b]]), num(p, 'L'));
    },
  },
  {
    type: 'tee',
    label: 'Teownik',
    category: 'profile',
    hole: false,
    description: 'Profil T (półka na dole, żebro do góry).',
    params: [
      L(100),
      { key: 'W', label: 'Szerokość półki', type: 'number', def: 20, min: 1, max: 300, unit: 'mm' },
      { key: 'H', label: 'Wysokość', type: 'number', def: 20, min: 1, max: 300, unit: 'mm' },
      T(2),
    ],
    build: (p) => {
      const w = num(p, 'W'), h = num(p, 'H'), t = num(p, 'T');
      const cs = M().CrossSection.union([poly(rect(-w / 2, 0, w / 2, t)), poly(rect(-t / 2, 0, t / 2, h))]);
      return bar(cs, num(p, 'L'));
    },
  },
  {
    type: 'channel',
    label: 'Ceownik',
    category: 'profile',
    hole: false,
    description: 'Profil U.',
    params: [
      L(100),
      { key: 'W', label: 'Szerokość', type: 'number', def: 20, min: 1, max: 300, unit: 'mm' },
      { key: 'H', label: 'Wysokość ścianek', type: 'number', def: 15, min: 1, max: 300, unit: 'mm' },
      T(2),
    ],
    build: (p) => {
      const w = num(p, 'W'), h = num(p, 'H'), t = num(p, 'T');
      const cs = M().CrossSection.union([
        poly(rect(-w / 2, 0, w / 2, t)),
        poly(rect(-w / 2, 0, -w / 2 + t, h)),
        poly(rect(w / 2 - t, 0, w / 2, h)),
      ]);
      return bar(cs, num(p, 'L'));
    },
  },
  {
    type: 'rhs',
    label: 'Profil zamknięty',
    category: 'profile',
    hole: false,
    description: 'Prostokątna rura (profil zamknięty).',
    params: [
      L(100),
      { key: 'W', label: 'Szerokość', type: 'number', def: 20, min: 1, max: 300, unit: 'mm' },
      { key: 'H', label: 'Wysokość', type: 'number', def: 20, min: 1, max: 300, unit: 'mm' },
      T(2),
    ],
    build: (p) => {
      const w = num(p, 'W'), h = num(p, 'H'), t = num(p, 'T');
      const cs = poly(rect(-w / 2, 0, w / 2, h)).subtract(poly(rect(-w / 2 + t, t, w / 2 - t, h - t)));
      return bar(cs, num(p, 'L'));
    },
  },
  {
    type: 'tube',
    label: 'Rura',
    category: 'profile',
    hole: false,
    description: 'Okrągła rura (stoi pionowo).',
    params: [
      { key: 'D', label: 'Średnica zewn.', type: 'number', def: 20, min: 1, max: 500, unit: 'mm' },
      T(2),
      { key: 'H', label: 'Wysokość', type: 'number', def: 50, min: 1, max: 1000, unit: 'mm' },
    ],
    build: (p) => {
      const r = num(p, 'D') / 2, t = num(p, 'T'), h = num(p, 'H');
      const inner = Math.max(r - t, 0.1);
      return cyl(h, r).subtract(cyl(h + 2, inner).translate([0, 0, -1]));
    },
  },
  {
    type: 'rod',
    label: 'Pręt',
    category: 'profile',
    hole: false,
    description: 'Pełny okrągły pręt (leży wzdłuż osi X).',
    params: [L(100), { key: 'D', label: 'Średnica', type: 'number', def: 8, min: 0.5, max: 300, step: 0.5, unit: 'mm' }],
    build: (p) => bar(M().CrossSection.circle(num(p, 'D') / 2), num(p, 'L')),
  },
  // ----------------------------------------------------------------- basic
  {
    type: 'cube',
    label: 'Prostopadłościan',
    category: 'basic',
    hole: false,
    description: 'Klocek o dowolnych wymiarach.',
    params: [
      { key: 'W', label: 'Szerokość (X)', type: 'number', def: 20, min: 0.2, max: 1000, unit: 'mm' },
      { key: 'D', label: 'Głębokość (Y)', type: 'number', def: 20, min: 0.2, max: 1000, unit: 'mm' },
      { key: 'H', label: 'Wysokość (Z)', type: 'number', def: 20, min: 0.2, max: 1000, unit: 'mm' },
    ],
    build: (p) => block(num(p, 'W'), num(p, 'D'), num(p, 'H')),
  },
  {
    type: 'cylinder',
    label: 'Walec',
    category: 'basic',
    hole: false,
    description: 'Walec stojący pionowo.',
    params: [
      { key: 'D', label: 'Średnica', type: 'number', def: 20, min: 0.2, max: 1000, unit: 'mm' },
      { key: 'H', label: 'Wysokość', type: 'number', def: 20, min: 0.2, max: 1000, unit: 'mm' },
    ],
    build: (p) => cyl(num(p, 'H'), num(p, 'D') / 2),
  },
  {
    type: 'cone',
    label: 'Stożek',
    category: 'basic',
    hole: false,
    description: 'Stożek lub stożek ścięty.',
    params: [
      { key: 'D1', label: 'Średnica dołu', type: 'number', def: 20, min: 0.2, max: 1000, unit: 'mm' },
      { key: 'D2', label: 'Średnica góry', type: 'number', def: 0, min: 0, max: 1000, unit: 'mm' },
      { key: 'H', label: 'Wysokość', type: 'number', def: 20, min: 0.2, max: 1000, unit: 'mm' },
    ],
    build: (p) => cyl(num(p, 'H'), num(p, 'D1') / 2, num(p, 'D2') / 2),
  },
  {
    type: 'wedge',
    label: 'Klin',
    category: 'basic',
    hole: false,
    description: 'Klin / podpórka trójkątna.',
    params: [
      { key: 'W', label: 'Szerokość (X)', type: 'number', def: 20, min: 0.2, max: 1000, unit: 'mm' },
      { key: 'D', label: 'Głębokość (Y)', type: 'number', def: 20, min: 0.2, max: 1000, unit: 'mm' },
      { key: 'H', label: 'Wysokość (Z)', type: 'number', def: 20, min: 0.2, max: 1000, unit: 'mm' },
    ],
    build: (p) => {
      const d = num(p, 'D'), h = num(p, 'H');
      return bar(poly([[0, 0], [d, 0], [0, h]]), num(p, 'W'));
    },
  },
  {
    type: 'sphere',
    label: 'Kula',
    category: 'basic',
    hole: false,
    description: 'Kula.',
    params: [{ key: 'D', label: 'Średnica', type: 'number', def: 20, min: 0.2, max: 1000, unit: 'mm' }],
    build: (p) => settle(M().Manifold.sphere(num(p, 'D') / 2)),
  },
  // ---------------------------------------------------------------- joints
  {
    type: 'hole',
    label: 'Otwór okrągły',
    category: 'joints',
    hole: true,
    description: 'Wycina okrągły otwór w bryle, w której się znajduje.',
    params: [
      { key: 'D', label: 'Średnica', type: 'number', def: 5, min: 0.2, max: 500, step: 0.1, unit: 'mm' },
      { key: 'H', label: 'Głębokość', type: 'number', def: 10, min: 0.2, max: 1000, unit: 'mm' },
      clearance(0),
    ],
    build: (p) => cyl(num(p, 'H'), (num(p, 'D') + num(p, 'luz')) / 2),
  },
  {
    type: 'holeBox',
    label: 'Otwór prostokątny',
    category: 'joints',
    hole: true,
    description: 'Wycina prostokątne okno lub kieszeń.',
    params: [
      { key: 'W', label: 'Szerokość (X)', type: 'number', def: 10, min: 0.2, max: 1000, unit: 'mm' },
      { key: 'D', label: 'Głębokość (Y)', type: 'number', def: 10, min: 0.2, max: 1000, unit: 'mm' },
      { key: 'H', label: 'Wysokość (Z)', type: 'number', def: 10, min: 0.2, max: 1000, unit: 'mm' },
      clearance(0),
    ],
    build: (p) => {
      const c = num(p, 'luz');
      return block(num(p, 'W') + c, num(p, 'D') + c, num(p, 'H'));
    },
  },
  {
    type: 'peg',
    label: 'Czop okrągły',
    category: 'joints',
    hole: false,
    description: 'Kołek do łączenia części. „Dodaj pasujący otwór” zrobi gniazdo z luzem.',
    params: [
      { key: 'D', label: 'Średnica', type: 'number', def: 6, min: 0.5, max: 100, step: 0.1, unit: 'mm' },
      { key: 'H', label: 'Wysokość', type: 'number', def: 8, min: 0.5, max: 200, unit: 'mm' },
      { key: 'F', label: 'Faza na końcu', type: 'number', def: 0.6, min: 0, max: 5, step: 0.1, unit: 'mm' },
    ],
    build: (p) => {
      const r = num(p, 'D') / 2, h = num(p, 'H'), f = Math.min(num(p, 'F'), r * 0.9, h * 0.5);
      return f > 0 ? cyl(h - f, r).add(cyl(f, r, r - f).translate([0, 0, h - f])) : cyl(h, r);
    },
  },
  {
    type: 'pegSquare',
    label: 'Czop kwadratowy',
    category: 'joints',
    hole: false,
    description: 'Kwadratowy czop, nie obraca się w gnieździe.',
    params: [
      { key: 'W', label: 'Bok', type: 'number', def: 6, min: 0.5, max: 100, step: 0.1, unit: 'mm' },
      { key: 'H', label: 'Wysokość', type: 'number', def: 8, min: 0.5, max: 200, unit: 'mm' },
    ],
    build: (p) => block(num(p, 'W'), num(p, 'W'), num(p, 'H')),
  },
  {
    type: 'magnet',
    label: 'Gniazdo magnesu',
    category: 'joints',
    hole: true,
    description: 'Kieszeń na magnes neodymowy (średnica × grubość).',
    params: [
      { key: 'size', label: 'Magnes', type: 'select', def: '6x3', options: Object.keys(MAGNETS).map((k) => ({ value: k, label: `${k} mm` })) },
      clearance(0.2),
    ],
    build: (p) => {
      const [d, h] = MAGNETS[String(p.size)] ?? MAGNETS['6x3'];
      return cyl(h + 0.2, (d + num(p, 'luz')) / 2);
    },
  },
  {
    type: 'insert',
    label: 'Otwór pod insert',
    category: 'joints',
    hole: true,
    description: 'Otwór pod mosiężny insert wtapiany lutownicą.',
    params: [metric(Object.keys(INSERTS), 'M3'), { key: 'extra', label: 'Dodatkowa głębokość', type: 'number', def: 1, min: 0, max: 50, unit: 'mm' }],
    build: (p) => {
      const [d, h] = INSERTS[String(p.size)] ?? INSERTS.M3;
      return cyl(h + num(p, 'extra'), d / 2);
    },
  },
  {
    type: 'screw',
    label: 'Otwór na śrubę',
    category: 'joints',
    hole: true,
    description: 'Przelotowy otwór z pogłębieniem pod łeb (od góry).',
    params: [
      metric(['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6'], 'M3'),
      { key: 'H', label: 'Głębokość', type: 'number', def: 10, min: 0.5, max: 500, unit: 'mm' },
      {
        key: 'head',
        label: 'Łeb',
        type: 'select',
        def: 'cyl',
        options: [
          { value: 'cyl', label: 'Walcowy (imbus)' },
          { value: 'cone', label: 'Stożkowy (wpuszczany)' },
          { value: 'none', label: 'Bez pogłębienia' },
        ],
      },
    ],
    build: (p) => {
      const m = parseFloat(String(p.size).slice(1)) || 3, h = num(p, 'H');
      let s = cyl(h, (m + 0.4) / 2);
      if (p.head === 'cyl') {
        const hd = Math.min(0.6 * m + 0.6, h);
        s = s.add(cyl(hd, (1.8 * m + 0.6) / 2).translate([0, 0, h - hd]));
      } else if (p.head === 'cone') {
        const D = 2 * m + 0.4, hd = Math.min((D - m) / 2, h);
        s = s.add(cyl(hd, (m + 0.4) / 2, D / 2).translate([0, 0, h - hd]));
      }
      return s;
    },
  },
  {
    type: 'nut',
    label: 'Gniazdo nakrętki',
    category: 'joints',
    hole: true,
    description: 'Sześciokątna kieszeń na nakrętkę.',
    params: [metric(Object.keys(NUTS), 'M3'), clearance(0.3)],
    build: (p) => {
      const [s, h] = NUTS[String(p.size)] ?? NUTS.M3;
      return cyl(h + 0.2, (s + num(p, 'luz')) / Math.sqrt(3), undefined, 6);
    },
  },
];

export const CATALOG: PartDef[] = [...BASE, ...TEXT_DEFS, ...THREAD_DEFS, ...JOINT_DEFS, ...FITTING_DEFS, ...PIPE_DEFS, ...CONNECTOR_DEFS, FIGURINE_DEF];

export const DEFS: Record<string, PartDef> = Object.fromEntries(CATALOG.map((d) => [d.type, d]));

export function paramsOf(def: PartDef, p: Params): ParamDef[] {
  return def.paramsFor ? def.paramsFor(p) : def.params;
}

export function defaultParams(def: PartDef): Params {
  return Object.fromEntries(def.params.map((p) => [p.key, p.def]));
}
