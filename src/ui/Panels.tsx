import { useEffect, useState } from 'react';
import { CATALOG, CATEGORIES, DEFS, type ParamDef } from '../catalog';
import { useStore } from '../store';
import type { Part, Vec3 } from '../types';
import { Icon } from './Icon';

export function Library() {
  const add = useStore((s) => s.add);
  const selected = useStore((s) => s.parts.find((p) => p.id === s.selectedId));
  return (
    <aside className="library">
      {selected && <div className="hint">Nowy element pojawi się na górze: <b>{selected.name}</b></div>}
      {CATEGORIES.map((c) => (
        <section key={c.id}>
          <h3>{c.label}</h3>
          <div className="grid">
            {CATALOG.filter((d) => d.category === c.id).map((d) => (
              <button key={d.type} className={d.hole ? 'tile hole' : 'tile'} title={d.description} onClick={() => add(d.type)}>
                <Icon type={d.type} hole={d.hole} />
                <span>{d.label}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, unit }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string) => {
    let v = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(v)) return setText(String(value));
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (v !== value) onChange(v);
    setText(String(v));
  };
  return (
    <span className="num">
      <input
        value={text}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            commit(String(Math.round((value + d) * 1000) / 1000));
          }
          e.stopPropagation();
        }}
      />
      {unit && <em>{unit}</em>}
    </span>
  );
}

function ParamField({ def, value, onChange }: { def: ParamDef; value: unknown; onChange: (v: number | string | boolean) => void }) {
  return (
    <label className="field" title={'hint' in def ? def.hint : undefined}>
      <span>{def.label}</span>
      {def.type === 'number' && <NumberInput value={Number(value)} min={def.min} max={def.max} step={def.step ?? 1} unit={def.unit} onChange={onChange} />}
      {def.type === 'select' && (
        <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {def.type === 'bool' && <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />}
    </label>
  );
}

function PartProperties({ part }: { part: Part }) {
  const st = useStore();
  const def = DEFS[part.type];
  const bodies = [...new Set(st.parts.map((p) => p.body))].sort((a, b) => a - b);
  const newBody = Math.max(0, ...bodies) + 1;
  const setPos = (i: number, v: number) => {
    const position = [...part.position] as Vec3;
    position[i] = v;
    st.update(part.id, { position });
  };
  const setRot = (i: number, v: number) => {
    const rotation = [...part.rotation] as Vec3;
    rotation[i] = v;
    st.update(part.id, { rotation });
  };

  return (
    <div className="props">
      <div className="props-head">
        <Icon type={part.type} hole={part.hole} />
        <input className="name" value={part.name} onChange={(e) => st.updateLive(part.id, { name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <p className="desc">{def.description}</p>

      <h4>Wymiary</h4>
      {def.params.map((p) => (
        <ParamField key={p.key} def={p} value={part.params[p.key]} onChange={(v) => st.update(part.id, { params: { ...part.params, [p.key]: v } })} />
      ))}

      {part.type === 'peg' || part.type === 'pegSquare' ? (
        <button className="action" onClick={() => st.matchingHole(part.id)}>
          + Dodaj pasujące gniazdo (z luzem)
        </button>
      ) : null}
      {part.type === 'cabinet' && (
        <button className="action" onClick={() => st.addDrawers(part.id)}>
          + Dodaj dopasowane szuflady
        </button>
      )}
      {part.type === 'box' && (
        <button className="action" onClick={() => st.addLid(part.id)}>
          + Dodaj pasującą pokrywkę
        </button>
      )}

      <h4>Położenie</h4>
      <div className="xyz">
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <label key={a}>
            <b className={`ax ax${i}`}>{a}</b>
            <NumberInput value={part.position[i]} step={st.settings.grid || 1} onChange={(v) => setPos(i, v)} />
          </label>
        ))}
      </div>
      <button className="small" onClick={() => st.dropToFloor(part.id)}>
        Połóż na stole
      </button>

      <h4>Obrót</h4>
      <div className="xyz">
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <label key={a}>
            <b className={`ax ax${i}`}>{a}</b>
            <NumberInput value={part.rotation[i]} step={15} unit="°" onChange={(v) => setRot(i, v)} />
          </label>
        ))}
      </div>
      <div className="row">
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <button key={a} className="small" title={`Obróć o 90° wokół osi ${a}`} onClick={() => st.rotateBy(part.id, i as 0 | 1 | 2, 90)}>
            ⟳ {a} 90°
          </button>
        ))}
      </div>

      <h4>Wydruk</h4>
      <label className="field">
        <span>Rodzaj</span>
        <select value={part.hole ? 'hole' : 'solid'} onChange={(e) => st.update(part.id, { hole: e.target.value === 'hole', color: e.target.value === 'hole' ? '#8b939e' : part.color === '#8b939e' ? '#4f8edc' : part.color })}>
          <option value="solid">Bryła (materiał)</option>
          <option value="hole">Otwór (wycina)</option>
        </select>
      </label>
      <label className="field" title="Elementy w tej samej bryle są sklejane w jeden wydruk. Otwory wycinają tylko swoją bryłę.">
        <span>Należy do bryły</span>
        <select value={part.body} onChange={(e) => st.update(part.id, { body: Number(e.target.value) })}>
          {bodies.map((b) => (
            <option key={b} value={b}>
              Bryła {b}
            </option>
          ))}
          <option value={newBody}>+ nowa bryła ({newBody})</option>
        </select>
      </label>
      {!part.hole && (
        <label className="field">
          <span>Kolor</span>
          <input type="color" value={part.color} onChange={(e) => st.update(part.id, { color: e.target.value })} />
        </label>
      )}

      <div className="row end">
        <button className="small" onClick={() => st.duplicate(part.id)}>
          Duplikuj
        </button>
        <button className="small danger" onClick={() => st.remove(part.id)}>
          Usuń
        </button>
      </div>
    </div>
  );
}

function BodiesOverview() {
  const parts = useStore((s) => s.parts);
  const select = useStore((s) => s.select);
  const mergeAll = useStore((s) => s.mergeAll);
  const bodies = [...new Set(parts.map((p) => p.body))].sort((a, b) => a - b);
  if (!parts.length)
    return (
      <div className="props empty">
        <h4>Jak zacząć</h4>
        <ol>
          <li>Kliknij element w menu po lewej, np. <b>Pudełko</b>.</li>
          <li>Zmień wymiary w tym panelu.</li>
          <li>Przeciągaj elementy myszką. Same się przyciągają do sąsiednich ścianek.</li>
          <li>Zaznacz element i dodaj <b>otwór</b>, <b>czop</b> lub <b>magnes</b>: pojawi się na jego wierzchu.</li>
          <li>Włącz <b>Podgląd wydruku</b> i pobierz <b>STL/3MF</b>.</li>
        </ol>
      </div>
    );
  return (
    <div className="props">
      <h4>Bryły do druku</h4>
      <p className="desc">Każda bryła to osobny wydruk. Elementy w jednej bryle są sklejane, a jej otwory wycinają tylko ją.</p>
      {bodies.map((b) => (
        <div key={b} className="body">
          <b>Bryła {b}</b>
          <ul>
            {parts
              .filter((p) => p.body === b)
              .map((p) => (
                <li key={p.id} className={p.hole ? 'is-hole' : ''} onClick={() => select(p.id)}>
                  <span className="dot" style={{ background: p.color }} />
                  {p.name}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {bodies.length > 1 && (
        <button className="small" onClick={mergeAll}>
          Połącz wszystko w jedną bryłę
        </button>
      )}
    </div>
  );
}

export function Properties() {
  const part = useStore((s) => s.parts.find((p) => p.id === s.selectedId));
  return <aside className="properties">{part ? <PartProperties key={part.id} part={part} /> : <BodiesOverview />}</aside>;
}
