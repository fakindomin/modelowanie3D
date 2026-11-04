import { useStore } from '../store';
import { DEFS, paramsOf } from '../catalog';
import { distance, type Feature } from '../scene/measure';
import { NumberInput } from './Panels';

/** Part parameters whose value is one of the measured numbers: those can be edited right here. */
function matches(f: Feature) {
  const part = useStore.getState().parts.find((p) => p.id === f.pick);
  if (!part) return [];
  const luz = Number(part.params.luz) || 0;
  return paramsOf(DEFS[part.type], part.params).filter(
    (d) => d.type === 'number' && (!d.show || d.show(part.params)) && f.values.some((v) => Math.abs(Number(part.params[d.key]) - v) < 0.06 || (luz && Math.abs(Number(part.params[d.key]) + luz - v) < 0.06)),
  );
}

function Pin({ f, tag }: { f: Feature; tag: string }) {
  const st = useStore();
  const part = st.parts.find((p) => p.id === f.pick);
  return (
    <div className="pin">
      <b>{tag}</b> {f.label}
      {part && <em> · {part.name}</em>}
      {part &&
        matches(f).map((d) =>
          d.type === 'number' ? (
            <label key={d.key} className="field" title="To wymiar elementu: zmień go tutaj">
              <span>{d.label}</span>
              <NumberInput
                value={Number(part.params[d.key])}
                min={d.min}
                max={d.max}
                step={d.step ?? 1}
                unit={d.unit}
                onChange={(v) => {
                  st.update(part.id, { params: { ...part.params, [d.key]: v } });
                  st.clearPins();
                }}
              />
            </label>
          ) : null,
        )}
    </div>
  );
}

/** Label at the cursor and the list of pinned measurements. */
export function MeasurePanel() {
  const on = useStore((s) => s.measure);
  const hover = useStore((s) => s.measureHover);
  const pins = useStore((s) => s.pins);
  const clear = useStore((s) => s.clearPins);
  const removePin = useStore((s) => s.removePin);
  if (!on) return null;
  const pairs: Feature[][] = [];
  for (let i = 0; i < pins.length; i += 2) pairs.push(pins.slice(i, i + 2));
  return (
    <>
      {hover && (
        <div className="mlabel" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.label}
        </div>
      )}
      <div className="measure">
        <div className="measure-head">
          <b>📏 Wymiary</b>
          {pins.length > 0 && (
            <button className="mini" onClick={clear}>
              Wyczyść
            </button>
          )}
        </div>
        {!pins.length && <p className="desc">Najedź na ściankę, krawędź albo otwór. Kliknij, żeby przypiąć wymiar; kliknij drugi element, żeby zmierzyć odległość. W lub Esc kończy.</p>}
        {pairs.map((pair, k) => (
          <div key={k} className="pair">
            <button className="mini x" onClick={() => removePin(2 * k)} title="Usuń ten pomiar">
              ✕
            </button>
            <Pin f={pair[0]} tag="A" />
            {pair[1] ? (
              <>
                <Pin f={pair[1]} tag="B" />
                <div className="dist">{distance(pair[0], pair[1]).text}</div>
              </>
            ) : (
              <p className="desc">Kliknij drugi element, żeby zmierzyć odległość.</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
