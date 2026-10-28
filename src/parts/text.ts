import type { CrossSection, Manifold } from 'manifold-3d';
import { M } from '../geom/manifold';
import type { Params, PartDef } from './def';
import { num, select } from './util';
import sansBold from './fonts/sans-bold.json';
import sans from './fonts/sans.json';
import serifBold from './fonts/serif-bold.json';
import monoBold from './fonts/mono-bold.json';

/** Glyph outlines exported from the DejaVu fonts by tools/font2json.py (font units, y up). */
interface FontData {
  em: number;
  cap: number;
  glyphs: Record<string, [number, string]>;
}

const FONTS = { 'sans-bold': sansBold, sans, 'serif-bold': serifBold, 'mono-bold': monoBold } as unknown as Record<string, FontData>;

const outlines = new Map<string, [number, number][][]>();

/** Contours of one glyph as polygons, curves split into short straight pieces. */
function glyphPolys(fontKey: string, path: string, steps: number): [number, number][][] {
  const k = `${fontKey}|${steps}|${path}`;
  const hit = outlines.get(k);
  if (hit) return hit;
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  const t = path.match(/[MLQZ]|-?\d+/g) ?? [];
  let i = 0;
  const n = () => Number(t[i++]);
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M') {
      if (cur.length > 2) out.push(cur);
      cur = [[n(), n()]];
    } else if (c === 'L') cur.push([n(), n()]);
    else if (c === 'Q') {
      const [x0, y0] = cur[cur.length - 1];
      const cx = n(), cy = n(), x = n(), y = n();
      for (let s = 1; s <= steps; s++) {
        const u = s / steps, v = 1 - u;
        cur.push([v * v * x0 + 2 * v * u * cx + u * u * x, v * v * y0 + 2 * v * u * cy + u * u * y]);
      }
    } else if (c === 'Z') {
      if (cur.length > 2) out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 2) out.push(cur);
  outlines.set(k, out);
  return out;
}

/** Outline of a line of text, letters `size` mm tall (capital letters), centred on the origin. */
export function textOutline(text: string, fontKey: string, size: number, spacing: number): CrossSection | null {
  const font = FONTS[fontKey] ?? FONTS['sans-bold'];
  const s = size / font.cap;
  // About 0.3 mm long pieces on curves, enough for any nozzle.
  const steps = Math.max(2, Math.min(8, Math.round(size / 3)));
  const polys: [number, number][][] = [];
  let x = 0;
  for (const ch of text) {
    const g = font.glyphs[ch] ?? font.glyphs['?'];
    if (!g) continue;
    for (const poly of glyphPolys(fontKey, g[1], steps)) polys.push(poly.map(([px, py]) => [x + px * s, py * s]));
    x += g[0] * s + spacing;
  }
  if (!polys.length) return null;
  const cs = M().CrossSection.ofPolygons(polys, 'NonZero');
  const b = cs.bounds();
  // Centred on the capital letters' height, so a label sits in the middle of its spot whatever its letters.
  return cs.translate([-(b.min[0] + b.max[0]) / 2, -size / 2]);
}

function buildText(p: Params, cut: boolean): Manifold {
  const size = num(p, 'size'), depth = num(p, 'depth'), bold = Number(p.bold) || 0;
  const text = String(p.text ?? '').replace(/\s+$/, '') || '?';
  let cs = textOutline(text, String(p.font), size, Number(p.spacing) || 0);
  if (!cs) throw new Error('empty text');
  if (bold) cs = cs.offset(bold, 'Round');
  const base = Number(p.plate) || 0;
  // Optional plate under raised letters: a label you can glue on or that stands proud of a surface.
  if (!cut && base > 0) {
    const b = cs.bounds(), m = Number(p.margin) || 0;
    const w = b.max[0] - b.min[0] + 2 * m, h = b.max[1] - b.min[1] + 2 * m;
    const plate = M().CrossSection.square([w - 2, h - 2], true).offset(1, 'Round').translate([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2]).extrude(base);
    return plate.add(cs.extrude(depth).translate([0, 0, base]));
  }
  return cs.extrude(depth);
}

const FONT = select('font', 'Krój pisma', 'sans-bold', [
  ['sans-bold', 'Prosty, gruby'],
  ['sans', 'Prosty, cienki'],
  ['serif-bold', 'Szeryfowy'],
  ['mono-bold', 'Maszynowy (równe litery)'],
]);

const common = (cut: boolean) => [
  { key: 'text', label: 'Napis', type: 'text' as const, def: cut ? 'ŚRUBY M3' : 'Modelowanie', max: 60 },
  FONT,
  { key: 'size', label: 'Wysokość liter', type: 'number' as const, def: 8, min: 2, max: 200, step: 0.5, unit: 'mm', hint: 'Wysokość wielkich liter. Poniżej ok. 5 mm drobne litery mogą się zlewać; wtedy wybierz gruby krój.' },
  { key: 'depth', label: cut ? 'Głębokość' : 'Wysokość (wypukłość)', type: 'number' as const, def: cut ? 0.8 : 1, min: 0.2, max: 50, step: 0.2, unit: 'mm' },
  { key: 'spacing', label: 'Odstęp między literami', type: 'number' as const, def: 0, min: -5, max: 20, step: 0.1, unit: 'mm' },
  { key: 'bold', label: 'Pogrubienie', type: 'number' as const, def: 0, min: 0, max: 2, step: 0.05, unit: 'mm', hint: 'Pogrubia kreski liter, żeby małe napisy dobrze się drukowały (kreska min. ok. 0,8 mm).' },
];

export const TEXT_DEFS: PartDef[] = [
  {
    type: 'text',
    label: 'Napis wypukły',
    category: 'basic',
    hole: false,
    description: 'Napis z liter stojących na powierzchni. Wstawiony przy zaznaczonym elemencie staje na jego górze; obróć go, żeby dać na ściankę.',
    params: [
      ...common(false),
      { key: 'plate', label: 'Tabliczka pod napisem', type: 'number', def: 0, min: 0, max: 20, step: 0.2, unit: 'mm', hint: 'Grubość tabliczki pod literami. 0 = same litery.' },
      { key: 'margin', label: 'Margines tabliczki', type: 'number', def: 3, min: 0, max: 50, step: 0.5, unit: 'mm', show: (p) => num(p, 'plate') > 0 },
    ],
    build: (p) => buildText(p, false),
  },
  {
    type: 'textCut',
    label: 'Napis wycięty',
    category: 'basic',
    hole: true,
    description: 'Napis wycięty w powierzchni (grawer). Wstawiony przy zaznaczonym elemencie wcina się w jego górę; obróć go, żeby dać na ściankę.',
    params: common(true),
    build: (p) => buildText(p, true),
  },
];
