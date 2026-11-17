import { DEFS } from '../catalog';
import { useStore } from '../store';
import { built } from '../geom/parts';
import { motionsOf, pickZone, rigFor, rigOf, zonesOf, type ZoneHover } from './motion';

/**
 * Picks the element of the model that a group of sizes belongs to (a drawer for „Szuflady”, the lid for „Pokrywa”),
 * as a click on it would: it lights up and shows its sizes. `motion` names one element when the group has several.
 */
export function pickGroup(group: string, motion?: string) {
  const st = useStore.getState();
  if (st.preview) return;
  const parts = st.parts.filter((p) => !p.hole && !p.hidden);
  let hit: ZoneHover | null = null;
  for (const p of parts) {
    const m = motionsOf(p).find((q) => (motion ? q.key === motion : q.group === group) && (q.world ? !q.hidden : q.pieces.includes(String(p.params.piece ?? ''))));
    if (m) {
      hit = { part: p.id, rig: rigFor(p, m), label: m.label, group: m.group, motion: m.key, box: null, solid: false, x: 0, y: 0 };
      break;
    }
  }
  if (!hit && !motion)
    for (const p of parts) {
      if (!DEFS[p.type]?.zones) continue;
      const z = zonesOf(p).find((q) => q.group === group);
      if (!z) continue;
      const bb = built(p).box;
      const whole = z.box[0].every((v, i) => v <= bb.min.getComponent(i)) && z.box[1].every((v, i) => v >= bb.max.getComponent(i));
      hit = { part: p.id, rig: rigOf(p), label: z.label, group: z.group, motion: z.motion ?? null, box: whole ? null : z.box, solid: !!z.solid, x: 0, y: 0 };
      break;
    }
  if (!hit) return;
  if (st.selectedId !== hit.part) st.select(hit.part);
  pickZone(hit);
}
