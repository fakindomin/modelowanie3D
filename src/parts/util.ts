import type { Manifold, CrossSection } from 'manifold-3d';
import { M, settle } from '../geom/manifold';
import { roundRect } from '../geom/edges';
import type { ParamDef, Params } from './def';

export const num = (p: Params, k: string) => Number(p[k]);

export function poly(points: [number, number][]): CrossSection {
  return M().CrossSection.ofPolygons([points]);
}

export function rect(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

/** Extrudes a cross-section drawn in (Y, Z) along the X axis, i.e. a bar lying on the bed. */
export function bar(cs: CrossSection, length: number): Manifold {
  return settle(cs.extrude(length).rotate([90, 0, 90]));
}

/** Same as bar() but centred on X = 0 and keeping the section's own Y/Z position. */
export function barAt(cs: CrossSection, length: number): Manifold {
  return cs.extrude(length).rotate([90, 0, 90]).translate([-length / 2, 0, 0]);
}

export function cube(x: number, y: number, z: number): Manifold {
  return M().Manifold.cube([x, y, z]);
}

/** Cube centred in X/Y with its bottom at z0. */
export function block(x: number, y: number, z: number, cx = 0, cy = 0, z0 = 0): Manifold {
  return M().Manifold.cube([x, y, z], true).translate([cx, cy, z0 + z / 2]);
}

/** block() with rounded vertical corners of radius r. */
export function rblock(x: number, y: number, z: number, r: number, cx = 0, cy = 0, z0 = 0): Manifold {
  if (r < 0.01) return block(x, y, z, cx, cy, z0);
  return roundRect(x, y, r).extrude(z).translate([cx, cy, z0]);
}

/** Axis-aligned box between two corners. */
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Manifold {
  return M().Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
}

export function cyl(h: number, r: number, r2 = r, segments?: number): Manifold {
  return M().Manifold.cylinder(h, r, r2, segments);
}

/** Cylinder lying along X from x0 to x1, axis through (y, z). */
export function cylX(x0: number, x1: number, r: number, y = 0, z = 0, r2 = r): Manifold {
  return M().Manifold.cylinder(x1 - x0, r, r2).rotate([0, 90, 0]).translate([x0, y, z]);
}

/** Hexagonal prism with the given size across flats. */
export function hex(af: number, h: number): Manifold {
  return cyl(h, af / Math.sqrt(3), undefined, 6);
}

/** Cylinder with straight knurl grooves around it (grip for hand-tightened parts). */
export function knurled(d: number, h: number): Manifold {
  const r = d / 2;
  const n = Math.max(12, Math.round((Math.PI * d) / 2.4));
  const groove = M().CrossSection.circle(0.7, 8);
  const cuts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    cuts.push(groove.translate([Math.cos(a) * (r + 0.25), Math.sin(a) * (r + 0.25)]));
  }
  return cyl(h, r).subtract(M().CrossSection.union(cuts).extrude(h + 2).translate([0, 0, -1]));
}

export const union = (ms: Manifold[]) => M().Manifold.union(ms);

export const L = (def = 100): ParamDef => ({ key: 'L', label: 'Długość', type: 'number', def, min: 1, max: 1000, unit: 'mm' });
export const T = (def = 2): ParamDef => ({ key: 'T', label: 'Grubość ścianki', type: 'number', def, min: 0.4, max: 50, step: 0.2, unit: 'mm' });
export const clearance = (def = 0.2, hint = 'Dodawany do średnicy, żeby element wchodził bez siłowania.'): ParamDef => ({
  key: 'luz',
  label: 'Luz',
  type: 'number',
  def,
  min: 0,
  max: 2,
  step: 0.05,
  unit: 'mm',
  hint,
});

export const select = (key: string, label: string, def: string, options: [string, string][]): ParamDef => ({
  key,
  label,
  type: 'select',
  def,
  options: options.map(([value, l]) => ({ value, label: l })),
});

export const metric = (keys: string[], def: string): ParamDef => select('size', 'Rozmiar', def, keys.map((k) => [k, k]));
