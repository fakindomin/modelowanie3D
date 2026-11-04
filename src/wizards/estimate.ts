import type { Params } from '../catalog';
import { built } from '../geom/parts';
import type { Part, Vec3 } from '../types';

export const DENSITY: Record<string, number> = { PLA: 1.24, PETG: 1.27, TPU: 1.21 };
/** Average volumetric speed of a whole print with travel and walls, mm³/s (a rough figure for planning). */
const FLOW = 11;

export interface Estimate {
  grams: number;
  hours: number;
  plates: number;
  pieces: number;
}

/** Filament, time and number of bed loads for a set of parts, each printed `qty` times as built (resting on its base). */
export function estimate(items: { type: string; params: Params; qty: number; material: string }[], bed: Vec3): Estimate {
  let grams = 0, vol = 0, area = 0, pieces = 0;
  for (const it of items) {
    const b = built({ type: it.type, params: it.params } as Part);
    const v = b.manifold.volume();
    const s = b.box.getSize(b.box.min.clone());
    vol += v * it.qty;
    grams += (v / 1000) * (DENSITY[it.material] ?? 1.25) * it.qty;
    area += (s.x + 6) * (s.y + 6) * it.qty;
    pieces += it.qty;
  }
  // Round parts never pack the bed fully: count on about 70 % of it.
  const plates = pieces ? Math.max(1, Math.ceil(area / (bed[0] * bed[1] * 0.7))) : 0;
  return { grams, hours: vol / FLOW / 3600, plates, pieces };
}

export const fmtKg = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(1).replace('.', ',')} kg` : `${Math.round(g)} g`);
export const fmtH = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${Math.round(h)} h`);
