import { useStore } from '../store';
import type { Part } from '../types';
import { focusGroup, motionsOf, play, rigOf, setMotion, useMotion } from './motion';

/** The model whose moving elements the bar shows: the selected one, otherwise the first with motions. */
function movingPart(parts: Part[], selectedId: string | null): Part | undefined {
  const sel = parts.find((p) => p.id === selectedId);
  if (sel && motionsOf(sel).length) return sel;
  return parts.find((p) => !p.hidden && motionsOf(p).length);
}

/**
 * Bar under the model with moving elements (lid, drawers): „Rozsuń” moves them all at once, ▶ shows how it
 * opens and closes, and each element has its own button. Only a preview: the print stays closed.
 */
export function MotionBar() {
  const parts = useStore((s) => s.parts);
  const selectedId = useStore((s) => s.selectedId);
  const preview = useStore((s) => s.preview);
  const part = movingPart(parts, selectedId);
  const rig = part ? rigOf(part) : '';
  const base = useMotion((s) => s.base[rig]);
  const shown = useMotion((s) => s.shown[rig]);
  const hoverKey = useMotion((s) => (s.hoverOpen?.rig === rig ? s.hoverOpen.key : null));
  if (!part || preview) return null;
  const ms = motionsOf(part);
  const keys = ms.map((m) => m.key);
  const all = Math.round((keys.reduce((a, k) => a + (k === hoverKey ? (base?.[k] ?? 0) : (shown?.[k] ?? 0)), 0) / keys.length) * 100);
  const set = (v: number) => setMotion(rig, Object.fromEntries(keys.map((k) => [k, v])));
  return (
    <div className="motion-bar" onPointerDown={(e) => e.stopPropagation()}>
      <button className="mb-play" title="Pokaż, jak się otwiera i zamyka" aria-label="Pokaż ruch" onClick={() => play(rig, keys)}>
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
        {ms.map((m) => {
          const on = (base?.[m.key] ?? 0) >= 0.5;
          return (
            <button
              key={m.key}
              className={on ? 'mb-chip on' : 'mb-chip'}
              title={on ? `Zasuń: ${m.label.toLowerCase()}` : `Wysuń: ${m.label.toLowerCase()}`}
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
      <small>kliknij: wymiary</small>
    </div>
  );
}
