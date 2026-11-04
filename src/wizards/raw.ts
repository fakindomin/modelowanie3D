import * as THREE from 'three';
import { worldBox } from '../geom/parts';
import type { Part, Vec3 } from '../types';
import type { PlanItem } from './types';

export type Describe = Omit<PlanItem, 'qty' | 'type' | 'params' | 'color'> & { color?: string };

/**
 * Turns parts built in the scratch scene into a plan: moved so the model starts at (0, 0), every body
 * tagged with the role `describe` gives its main solid, and one item per role with the number of bodies.
 */
export function rawPlan(parts: Part[], describe: (main: Part) => Describe) {
  const box = new THREE.Box3();
  parts.filter((p) => !p.hole).forEach((p) => box.union(worldBox(p)));
  const dx = -box.min.x, dy = -box.min.y;
  const items: PlanItem[] = [];
  const roleOf = new Map<number, string>();
  for (const body of new Set(parts.map((p) => p.body))) {
    const solids = parts.filter((p) => p.body === body && !p.hole);
    if (!solids.length) continue;
    const size = (p: Part) => worldBox(p).getSize(new THREE.Vector3()).length();
    const main = solids.reduce((a, b) => (size(b) > size(a) ? b : a));
    const d = describe(main);
    roleOf.set(body, d.role);
    const it = items.find((i) => i.role === d.role);
    if (it) it.qty++;
    else items.push({ ...d, color: d.color ?? main.color, type: main.type, params: main.params, qty: 1 });
  }
  const moved = parts.map((p) => ({
    ...p,
    position: [p.position[0] + dx, p.position[1] + dy, p.position[2]] as Vec3,
    wiz: { run: '', w: '', role: roleOf.get(p.body) ?? '' },
  }));
  const s = box.getSize(new THREE.Vector3());
  return { parts: moved, items, size: [s.x, s.y, s.z] as Vec3 };
}
