import { DEFS, defaultParams, slideGroove } from '../catalog';
import type { Motion } from '../parts/def';
import { boxHingeRadius } from '../parts/joints';
import { isJar } from '../parts/jar';
import { worldBox } from '../geom/parts';
import type { Part, Vec3 } from '../types';

/**
 * Moving elements made of separate parts of one model (only a preview in the editor; the parts stay where they are
 * printed): a lid on its hinge, a sliding lid in its grooves, a screw cap on its jar (from the bed onto the jar and
 * off again), drawers of a cabinet, stacked bins and the carriage of a rail. Poses are in the scene's frame.
 * Parts that go with an element (the lid's half of the hinge, a glued-on handle, the cap's gasket) share its value.
 */
const cache = new WeakMap<Part[], Map<string, Motion>>();

const full = (p: Part) => ({ ...defaultParams(DEFS[p.type]), ...p.params });
const strip = (name: string) => name.replace(/^[A-Z]\s+/, '');
const r2 = (v: number) => Math.round(v * 100) / 100;

export function assemblyMotions(parts: Part[]): Map<string, Motion> {
  const hit = cache.get(parts);
  if (hit) return hit;
  const out = new Map<string, Motion>();
  try {
    build(parts, out);
  } catch (e) {
    console.warn('assembly motions failed', e);
  }
  cache.set(parts, out);
  return out;
}

/** Glued-on knob or handle of a lid (made by the box wizard): goes with the lid. */
const handlesOf = (parts: Part[], lid: Part) =>
  parts.filter((p) => p.wiz && lid.wiz && p.wiz.run === lid.wiz.run && p.wiz.role === 'G' && (p.type === 'cube' || p.type === 'cylinder'));

function build(parts: Part[], out: Map<string, Motion>) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const put = (owner: Part, m: Motion, carried: Part[] = []) => {
    out.set(owner.id, { ...m, rig: owner.id });
    for (const c of carried) if (c.id !== owner.id) out.set(c.id, { ...m, rig: owner.id, hidden: true });
  };

  for (const lid of parts) {
    if (lid.hole || !lid.fitTo) continue;
    const box = byId.get(lid.fitTo);
    if (!box || box.type !== 'box') continue;
    const bp = full(box);
    // Lid on a hinge hidden in the back wall: the lid's body (with its half of the hinge) swings up about the axis.
    if (lid.type === 'lid') {
      const leaf = parts.find((p) => p.type === 'boxHinge' && p.fitTo === box.id && p.params.piece === 'B');
      if (leaf) {
        const hp = full(leaf);
        const r = boxHingeRadius(hp);
        const ya = Number(hp.D) / 2 - r, za = Number(hp.H) + Number(hp.lift) + Number(hp.Tl) - r;
        const at: Vec3 = [leaf.position[0], r2(leaf.position[1] + ya), r2(leaf.position[2] + za)];
        const carried = [...parts.filter((p) => p.body === lid.body && !p.hole), ...handlesOf(parts, lid)];
        put(lid, { key: 'open', label: 'Pokrywka', group: '', pieces: [], move: [0, 0, 0], world: true, at, keys: [{ v: 0, move: [0, 0, 0] }, { v: 1, move: [0, 0, 0], rot: [-110, 0, 0] }] }, carried);
        continue;
      }
      // Screw cap lying top down beside its jar: onto the jar (turned over, screwed down), off again, back to the bed.
      if (isJar(bp)) {
        const lp = full(lid);
        const gasket = parts.find((p) => p.type === 'gasket' && p.fitTo === box.id);
        const gT = gasket ? Number(full(gasket).T) : 0;
        const rec = Math.max(0, gT - 0.3);
        const top = worldBox(box).max.z;
        const P = Number(bp.P) || 3, L = Number(bp.threadL) || 8;
        const turns = Math.max(1, Math.ceil(L / P));
        const lift = turns * P + 4;
        const dx = r2(box.position[0] - lid.position[0]), dy = r2(box.position[1] - lid.position[1]);
        const z = r2(top + rec + Number(lp.T) - lid.position[2]);
        const spin = -360 * turns;
        put(lid, {
          key: 'open', label: 'Pokrywka', group: '', pieces: [], move: [0, 0, 0], world: true, at: [...lid.position], rest: 2, max: 2,
          keys: [
            { v: 0, move: [dx, dy, z], rot: [180, 0, 0] },
            { v: 1, move: [dx, dy, r2(z + lift)], rot: [180, 0, spin] },
            { v: 2, move: [0, 0, 0], rot: [0, 0, spin] },
          ],
        });
        if (gasket) {
          const gx = r2(box.position[0] - gasket.position[0]), gy = r2(box.position[1] - gasket.position[1]), gz = r2(top - gasket.position[2]);
          out.set(gasket.id, {
            key: 'open', label: 'Uszczelka', group: '', pieces: [], move: [0, 0, 0], world: true, rig: lid.id, hidden: true, rest: 2, max: 2,
            keys: [
              { v: 0, move: [gx, gy, gz] },
              { v: 1, move: [gx, gy, r2(gz + lift)] },
              { v: 2, move: [0, 0, 0] },
            ],
          });
        }
        continue;
      }
    }
    // Sliding lid lying beside its box: into the grooves, out of them to the front, back to the bed.
    if (lid.type === 'slab' && bp.slide) {
      const g = slideGroove(bp);
      const t = Number(bp.T), D = Number(bp.D);
      const yIn = (-t + g.depth - 0.3) / 2;
      const dx = r2(box.position[0] - lid.position[0]), dy = r2(box.position[1] + yIn - lid.position[1]);
      const z = r2(box.position[2] + g.z0 + (g.h - g.lidT) / 2 - lid.position[2]);
      const out1 = r2(dy - D - 5);
      put(
        lid,
        {
          key: 'open', label: 'Pokrywka', group: '', pieces: [], move: [0, 0, 0], world: true, rest: 2, max: 2,
          keys: [
            { v: 0, move: [dx, dy, z] },
            { v: 1, move: [dx, out1, z] },
            { v: 2, move: [0, 0, 0] },
          ],
        },
        handlesOf(parts, lid),
      );
    }
  }

  // Drawers standing in a cabinet: each slides out to the front.
  const cabinets = parts.filter((p) => p.type === 'cabinet' && !p.hole).map((p) => worldBox(p));
  if (cabinets.length)
    for (const d of parts) {
      if (d.type !== 'drawer' || d.hole) continue;
      const b = worldBox(d);
      const c = b.getCenter(b.min.clone());
      if (!cabinets.some((cb) => cb.containsPoint(c))) continue;
      const depth = b.max.y - b.min.y, run = r2(depth * 0.75);
      put(d, { key: 'open', label: strip(d.name), group: '', pieces: [], move: [0, -run, 0], world: true, max: r2((depth + 5) / run) });
    }

  // Stacked bins: the upper ones rise so it shows how they sit on each other; the lid can be lifted right off.
  const bins = parts.filter((p) => p.type === 'stackBin' && !p.hole).sort((a, b) => a.position[2] - b.position[2]);
  if (bins.length > 1)
    bins.forEach((p, i) => {
      if (!i) return;
      const lid = p.params.kind === 'lid';
      put(p, { key: 'open', label: lid ? 'Pokrywka' : strip(p.name), group: '', pieces: [], move: [0, 0, 25 * i], world: true, max: lid ? 2 : 1 });
    });

  // Carriage of a rail: runs between the two end supports (it starts where it stands).
  const carriage = parts.find((p) => p.type === 'linearRail' && p.params.piece === 'carriage');
  const ends = parts.filter((p) => p.type === 'linearRail' && p.params.piece === 'end').map((p) => worldBox(p));
  if (carriage && ends.length === 2) {
    const cb = worldBox(carriage);
    const half = (cb.max.x - cb.min.x) / 2, cx = (cb.max.x + cb.min.x) / 2;
    const lo = Math.min(ends[0].max.x, ends[1].max.x) + half + 1, hi = Math.max(ends[0].min.x, ends[1].min.x) - half - 1;
    if (hi > lo) {
      const rest = Math.min(1, Math.max(0, (cx - lo) / (hi - lo)));
      put(carriage, { key: 'open', label: 'Wózek', group: '', pieces: [], move: [0, 0, 0], world: true, rest: r2(rest) || undefined, keys: [{ v: 0, move: [r2(lo - cx), 0, 0] }, { v: 1, move: [r2(hi - cx), 0, 0] }] });
    }
  }
}
