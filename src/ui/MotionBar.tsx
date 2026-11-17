import { useStore } from '../store';
import type { Part } from '../types';
import type { Motion } from '../parts/def';
import { baseOf, focusGroup, motionsOf, noteRest, play, rigFor, setMotion, shownOf, useMotion } from './motion';

/** Every moving element of the model (a set of pieces counts once), in the order of the parts. */
function movingItems(parts: Part[]): { rig: string; m: Motion }[] {
  const out: { rig: string; m: Motion }[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (p.hidden) continue;
    for (const m of motionsOf(p).filter((q) => (q.world ? !q.hidden : q.pieces.includes(String(p.params.piece ?? ''))))) {
      const rig = rigFor(p, m);
      noteRest(rig, m);
      if (seen.has(rig + '/' + m.key)) continue;
      seen.add(rig + '/' + m.key);
      out.push({ rig, m });
    }
  }
  return out;
}

/**
 * Bar under the model with moving elements (lid, drawers, a door): „Rozsuń” moves them all at once, ▶ shows how
 * it opens and closes, and each element has its own button. Only a preview: the print stays as it is.
 */
export function MotionBar() {
  const parts = useStore((s) => s.parts);
  const preview = useStore((s) => s.preview);
  const base = useMotion((s) => s.base);
  const shown = useMotion((s) => s.shown);
  const items = movingItems(parts);
  if (!items.length || preview) return null;
  const all = Math.round((items.reduce((a, { rig, m }) => a + Math.min(1, shownOf({ shown }, rig, m.key)), 0) / items.length) * 100);
  const set = (v: number) => {
    const by = new Map<string, Record<string, number>>();
    for (const { rig, m } of items) by.set(rig, { ...by.get(rig), [m.key]: v });
    for (const [rig, vals] of by) setMotion(rig, vals);
  };
  return (
    <div className="motion-bar" onPointerDown={(e) => e.stopPropagation()}>
      <button className="mb-play" title="Pokaż, jak się otwiera i zamyka" aria-label="Pokaż ruch" onClick={() => play(items.map(({ rig, m }) => ({ rig, key: m.key })))}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 1.8v10.4L12 7z" fill="currentColor" />
        </svg>
      </button>
      <label className="mb-main">
        <span>Rozsuń</span>
        <input
          type="range"
          className="size-slider"
          min={0}
          max={100}
          step={1}
          value={all}
          style={{ ['--p' as string]: `${all}%` }}
          onChange={(e) => set(Number(e.target.value) / 100)}
          aria-label="Rozsuń wszystkie elementy"
        />
        <output>{all}%</output>
      </label>
      <div className="mb-chips">
        {items.map(({ rig, m }) => {
          const on = baseOf({ base }, rig, m.key) >= 0.5;
          return (
            <button
              key={rig + m.key}
              className={on ? 'mb-chip on' : 'mb-chip'}
              title={on ? `Zamknij: ${m.label.toLowerCase()}` : `Otwórz: ${m.label.toLowerCase()}`}
              onClick={() => {
                setMotion(rig, { [m.key]: on ? 0 : 1 }, true);
                focusGroup(m.group);
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <span className="mb-note">tylko podgląd, wydruk bez zmian</span>
    </div>
  );
}

/** Name of the place under the pointer (a grinder socket, a drawer), next to the cursor. */
export function ZoneTip() {
  const h = useMotion((s) => s.hover);
  if (!h) return null;
  return (
    <div className="zone-tip" style={{ left: h.x + 14, top: h.y + 16 }}>
      {h.label}
      <small>{h.motion ? 'kliknij: zaznacz, potem przeciągnij' : 'kliknij: wymiary'}</small>
    </div>
  );
}
