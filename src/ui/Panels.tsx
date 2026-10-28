import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CATALOG, CATEGORIES, DEFS, MAGNETS, paramsOf, type Category, type ParamDef } from '../catalog';
import { findLid, type MagnetOptions } from '../geom/magnets';
import { BED_KEY, assembly, bodyBox, finishedBox, groupBody, groupId, isMerged, loadBed, useStore, type PatternKind } from '../store';
import { DEFAULT_TEXTURE, FACE_LABELS, TEXTURE_LABELS } from '../geom/texture';
import { DEFAULT_EDGES } from '../geom/edges';
import { DEFAULT_BEND } from '../geom/bend';
import { DEFAULT_SHELL, DEFAULT_XFORM, finishing, xformActive } from '../geom/modify';
import { FIG_MODELS, FIG_ORDER } from '../parts/figurine';
import type { Bend, Edges, Part, Shell, Texture, Vec3, Xform } from '../types';
import { Icon } from './Icon';
import { REVOLVE_PRESETS, SKETCH_PRESETS, encodePts, sketchPoints, type Pt } from '../parts/sketch';
import { INFO, Info, PATTERN_INFO } from './Info';
import { FAMILIES, IN_FAMILY, type Family, type Size } from '../families';
import { WALL_SIDES, sideOf } from '../parts/connectors';
import { MIN_CELL, addInWidestGap, evenOut, layoutOf, layoutParams, moveLine, segmentsOf, toggleSegment, type DivLayout } from '../geom/dividers';

const FIG_TOOLS: Category[] = ['joints', 'threads', 'hinges', 'basic'];

export function Library() {
  const add = useStore((s) => s.add);
  const addFigurine = useStore((s) => s.addFigurine);
  const tab = useStore((s) => s.tab);
  const selName = useStore((s) => {
    const gb = groupBody(s.selectedId);
    return gb !== null ? `Bryła ${gb}` : s.parts.find((p) => p.id === s.selectedId)?.name;
  });
  const [open, setOpen] = useState<string | null>('box');
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const toggleCat = (id: string) => {
    const next = new Set(closed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setClosed(next);
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify([...next]));
    } catch {
      /* storage unavailable */
    }
  };
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [tab]);
  const query = norm(q.trim());
  const hit = (...texts: string[]) => !query || texts.some((t) => norm(t).includes(query));
  const cats = tab === 'fig' ? FIG_TOOLS.map((id) => CATEGORIES.find((c) => c.id === id)!) : CATEGORIES;
  const figs = tab === 'fig' ? FIG_ORDER.filter((id) => hit(FIG_MODELS[id].n)) : [];
  const sections = cats.map((c) => {
    const fams = tab === 'tech' ? FAMILIES.filter((f) => f.category === c.id).map((f) => ({ f, only: f.variants.filter((v) => hit(f.label, v.label)) })).filter((x) => x.only.length) : [];
    const tiles = CATALOG.filter((d) => d.category === c.id && !d.hidden && (tab !== 'tech' || !IN_FAMILY.has(d.type)) && hit(d.label));
    return { c, fams, tiles };
  });
  const nothing = !figs.length && sections.every((x) => !x.fams.length && !x.tiles.length);
  const head = (id: string, label: string) => (
    <h3 className={!query && closed.has(id) ? 'closed' : ''} onClick={() => toggleCat(id)}>
      {label}
    </h3>
  );
  const shown = (id: string) => !!query || !closed.has(id);
  return (
    <aside className="library" ref={ref}>
      <input className="lib-search" placeholder="Szukaj elementu…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
      {selName && (
        <div className="hint">
          Nowy element pojawi się na górze: <b>{selName}</b>
        </div>
      )}
      {figs.length > 0 && (
        <section>
          {head('figs', 'Żebrowana kolekcja')}
          {shown('figs') && (
            <div className="grid">
              {figs.map((id) => (
                <button key={id} className="tile fig" title={FIG_MODELS[id].desc} onClick={() => addFigurine(id)}>
                  <Icon type="figurine" hole={false} />
                  <span>{FIG_MODELS[id].n}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      {sections
        .filter((x) => x.fams.length || x.tiles.length)
        .map(({ c, fams, tiles }) => (
          <section key={c.id}>
            {head(`${tab}:${c.id}`, tab === 'fig' && c.id === 'joints' ? 'Otwory, magnesy, czopy' : c.label)}
            {shown(`${tab}:${c.id}`) && (
              <div className="grid">
                {fams.map(({ f, only }) => (
                  <FamilyTile key={f.id} family={f} only={query ? only : undefined} open={!!query || open === f.id} onToggle={() => setOpen(open === f.id ? null : f.id)} />
                ))}
                {tiles.map((d) => (
                  <button key={d.type} className={d.hole ? 'tile hole' : 'tile'} title={d.description} onClick={() => add(d.type)}>
                    <Icon type={d.type} hole={d.hole} />
                    <span>{d.label}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))}
      {nothing && <p className="lib-empty">Nic nie pasuje do „{q}”.</p>}
    </aside>
  );
}

const CLOSED_KEY = 'modelowanie3d.closedCategories';
/** Lower case without Polish diacritics, for the library search. */
const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');

/** A family of ready elements: click adds the first variant (size M), the arrow shows all variants with S/M/L. */
function FamilyTile({ family, open, onToggle, only }: { family: Family; open: boolean; onToggle: () => void; only?: Family['variants'] }) {
  const addVariant = useStore((s) => s.addVariant);
  const recent = useStore((s) => s.recent);
  const first = family.variants[0];
  return (
    <>
      <div className={open ? 'tile family open' : 'tile family'}>
        <button className="fam-main" title={`${family.label}: kliknij, żeby dodać „${first.label}”${family.noSizes ? '' : ' (rozmiar M)'}`} onClick={() => addVariant(family, first, 'M')}>
          <Icon type={family.icon} hole={false} />
          <span>{family.label}</span>
        </button>
        <button className="fam-more" onClick={onToggle} title={open ? 'Zwiń' : `Pokaż ${family.variants.length} odmian i rozmiary`}>
          <span>{open ? '▴' : '▾'}</span>
          <span>{family.variants.length}</span>
        </button>
      </div>
      {open && (
        <div className="variants">
          {(only ?? family.variants).map((v) => (
            <div key={v.label} className="variant" title={v.hint ?? DEFS[v.type].description}>
              <span className="vname">
                <Icon type={v.type} hole={false} />
                {v.label}
              </span>
              <span className="sizes">
                {family.noSizes && (
                  <button className="chip main" onClick={() => addVariant(family, v, 'M')} title={v.hint ?? DEFS[v.type].description}>
                    +
                  </button>
                )}
                {!family.noSizes && (['S', 'M', 'L'] as Size[]).map((sz) => (
                  <button key={sz} className={sz === 'M' ? 'chip main' : 'chip'} onClick={() => addVariant(family, v, sz)} title={sizeHint(family, v, sz)}>
                    {sz}
                  </button>
                ))}
                {!family.noSizes && recent[v.type] && (
                  <button className="chip recent" onClick={() => addVariant(family, v, 'recent')} title="Wymiary, których ostatnio użyłeś dla tego elementu">
                    ↺
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function sizeHint(family: Family, v: Family['variants'][number], sz: Size) {
  const preset = (v.sizes ?? family.sizes)?.[sz];
  const label = sz === 'S' ? 'Mały' : sz === 'M' ? 'Średni' : 'Duży';
  if (!preset) return `${label}: ${sz === 'S' ? 'połowa' : sz === 'M' ? 'domyślne wymiary' : 'dwa razy większy'}`;
  const dims = ['W', 'D', 'H', 'T'].filter((k) => preset[k] !== undefined).map((k) => preset[k]);
  return `${label}: ${dims.join(' × ')} mm`;
}

export function NumberInput({ value, onChange, min, max, step = 1, unit }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
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

/** Text field that rebuilds the part when typing pauses, not on every key. */
function TextInput({ value, max, onChange }: { value: string; max?: number; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<number>(undefined);
  useEffect(() => setDraft(value), [value]);
  const push = (v: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => v !== value && onChange(v), 350);
  };
  return (
    <input
      type="text"
      className="text-in"
      value={draft}
      maxLength={max}
      onChange={(e) => {
        setDraft(e.target.value);
        push(e.target.value);
      }}
      onBlur={() => draft !== value && onChange(draft)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

function ParamField({ def, value, onChange }: { def: ParamDef; value: unknown; onChange: (v: number | string | boolean) => void }) {
  return (
    <label className="field" title={def.hint}>
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
      {def.type === 'text' && <TextInput value={String(value ?? '')} max={def.max} onChange={onChange} />}
    </label>
  );
}

function XYZ({ value, onChange, step, unit }: { value: Vec3; onChange: (i: number, v: number) => void; step: number; unit?: string }) {
  return (
    <div className="xyz">
      {(['X', 'Y', 'Z'] as const).map((a, i) => (
        <label key={a}>
          <b className={`ax ax${i}`}>{a}</b>
          <NumberInput value={value[i]} step={step} unit={unit} onChange={(v) => onChange(i, v)} />
        </label>
      ))}
    </div>
  );
}

function Helpers({ part }: { part: Part }) {
  const st = useStore();
  const b = (label: string, fn: () => void, info?: string) => (
    <div key={label} className="action-row">
      <button className="action" onClick={fn}>
        {label}
      </button>
      {info && <Info text={info} />}
    </div>
  );
  const out = [];
  if (part.type === 'peg' || part.type === 'pegSquare' || part.type === 'dovetail') out.push(b('+ Dodaj pasujące gniazdo (z luzem)', () => st.matchingHole(part.id), INFO.matchHole));
  if (part.type === 'angle' || part.type === 'channel' || part.type === 'tee')
    out.push(b('◣ Dodaj żebra w narożnikach', () => st.addRibs(part.id, Math.max(2, Math.round((Number(part.params.L) || 100) / 50) + 1)), INFO.ribs));
  if (part.type === 'cabinet') out.push(b('+ Dodaj dopasowane szuflady', () => st.addDrawers(part.id), INFO.drawers));
  if (part.type === 'box') out.push(b('+ Dodaj pasującą pokrywkę', () => st.addLid(part.id), INFO.lid));
  if ((part.type === 'box' && (!part.params.shape || part.params.shape === 'rect') && !part.params.slide) || part.type === 'drawer')
    out.push(b('⊞ Rozbij na płyty', () => st.explode(part.id), INFO.explode));
  if (part.type === 'threadHole' || part.type === 'threadNut') out.push(b('+ Dodaj pasującą śrubę', () => st.matchingBolt(part.id), INFO.bolt));
  if (part.type === 'bolt') {
    out.push(b('+ Dodaj pasującą nakrętkę', () => st.matchingNut(part.id), INFO.nut));
    out.push(b('+ Dodaj pasujący otwór z gwintem', () => st.matchingThreadHole(part.id), INFO.threadHole));
  }
  const fitBox = part.fitTo ? st.parts.find((p) => p.id === part.fitTo) : undefined;
  if (fitBox) out.push(b(`⛓ Odłącz od pudełka „${fitBox.name}”`, () => st.unfitLid(part.id), INFO.lidFit));
  if (part.hole && !isMerged(st.parts, part.body) && st.parts.some((p) => p.body === part.body && !p.hole))
    out.push(b(`⧉ Pokaż gotowy element (bryła ${part.body})`, () => st.merge(part.body), INFO.merge));
  return <>{out}</>;
}

/** Buttons that move a connector cut-out onto another wall of its body. */
function ConnectorWalls({ part }: { part: Part }) {
  const toWall = useStore((s) => s.connectorToWall);
  const now = sideOf(part.rotation);
  return (
    <>
      <div className="action-row">
        <span className="desc">Wymiary złącza są typowe, zmierz swoje suwmiarką.</span>
        <Info text={INFO.connector} />
      </div>
      <h5>
        Na której ściance <Info text={INFO.connWall} />
      </h5>
      <div className="row">
        {WALL_SIDES.map((w) => (
          <button key={w.side} className={now === w.side ? 'small on' : 'small'} onClick={() => toWall(part.id, w.side)}>
            {w.label}
          </button>
        ))}
      </div>
    </>
  );
}

/** "Dodaj miejsca na magnesy" for a box, a box built from plates (whole body) or a lid. */
function MagnetTool({ target, body }: { target: string; body: number }) {
  const st = useStore();
  const [opt, setOpt] = useState<MagnetOptions>({ size: '6x3', layout: '4', hidden: false, lid: 'flat' });
  const set = (p: Partial<MagnetOptions>) => setOpt((o) => ({ ...o, ...p }));
  const isLid = st.parts.find((p) => p.id === target)?.type === 'lid';
  const lid = isLid ? null : findLid(st.parts, body);
  const targetPart = st.parts.find((p) => p.id === target);
  const boxPart = targetPart?.type === 'lid' && targetPart.fitTo ? st.parts.find((p) => p.id === targetPart.fitTo) : st.parts.find((p) => p.body === body && p.type === 'box');
  const shape = isLid ? targetPart?.params.shape : boxPart?.params.shape;
  const ring = shape === 'round' || shape === 'hex';
  const layout = !ring && opt.layout === '3' ? '4' : opt.layout;
  return (
    <div className="tool">
      <p className="desc">Silnik znajdzie górną krawędź ścianek{ring ? ' i rozłoży gniazda równo po obwodzie' : ' i narożniki'}. Gdzie ścianka jest za cienka, dołoży słupek. W pokrywce zrobi lustrzane gniazda.</p>
      <label className="field">
        <span>Magnes (średnica × grubość)</span>
        <select value={opt.size} onChange={(e) => set({ size: e.target.value })}>
          {Object.keys(MAGNETS).map((k) => (
            <option key={k} value={k}>
              {k.replace('x', ' × ')} mm
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Ile i gdzie</span>
        <select value={layout} onChange={(e) => set({ layout: e.target.value as MagnetOptions['layout'] })}>
          {ring ? (
            <>
              <option value="3">3 równo po obwodzie</option>
              <option value="4">4 równo po obwodzie</option>
              <option value="6">{shape === 'hex' ? '6 w narożnikach' : '6 równo po obwodzie'}</option>
              <option value="8">8 równo po obwodzie</option>
            </>
          ) : (
            <>
              <option value="4">4 w narożnikach</option>
              <option value="6">6: narożniki i środki dłuższych boków</option>
              <option value="8">8: narożniki i środki wszystkich boków</option>
            </>
          )}
        </select>
      </label>
      <label className="field" title="Magnes zamknięty pod warstwą 0,6 mm. W slicerze ustaw pauzę na podanej wysokości i włóż magnesy.">
        <span>Magnesy ukryte (pauza w druku)</span>
        <input type="checkbox" checked={opt.hidden} onChange={(e) => set({ hidden: e.target.checked })} />
      </label>
      {isLid ? (
        <p className="desc">Gniazda dostanie pudełko pasujące do tej pokrywki i sama pokrywka.</p>
      ) : lid ? (
        <p className="desc">Pokrywka: „{lid.part.name}”. Dostanie lustrzane gniazda.</p>
      ) : (
        <label className="field">
          <span>Pokrywka (brak w projekcie)</span>
          <select value={opt.lid} onChange={(e) => set({ lid: e.target.value as MagnetOptions['lid'] })}>
            <option value="flat">Dodaj płaską</option>
            <option value="rim">Dodaj z rantem</option>
            <option value="none">Bez pokrywki</option>
          </select>
        </label>
      )}
      <button className="action" onClick={() => st.addMagnets(target, { ...opt, layout })}>
        🧲 Dodaj miejsca na magnesy
      </button>
    </div>
  );
}

function PatternTool({ part }: { part: Part }) {
  const pattern = useStore((s) => s.pattern);
  const [kind, setKind] = useState<PatternKind>(part.hole ? 'corners' : 'linear');
  const [count, setCount] = useState(4);
  const [distance, setDistance] = useState(10);
  const [axis, setAxis] = useState<0 | 1 | 2>(0);
  const [inset, setInset] = useState(0);
  const [radius, setRadius] = useState(0);
  return (
    <div className="tool">
      <label className="field">
        <span>Rodzaj</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as PatternKind)}>
          <option value="linear">W rzędzie (co odstęp)</option>
          <option value="circle">Po okręgu</option>
          <option value="corners">W narożnikach bryły</option>
          <option value="mirrorX">Lustro względem środka (X)</option>
          <option value="mirrorY">Lustro względem środka (Y)</option>
          <option value="mirrorXY">Lustro X i Y (4 sztuki od tego miejsca)</option>
        </select>
      </label>
      <p className="desc">{PATTERN_INFO[kind]}</p>
      {(kind === 'linear' || kind === 'circle') && (
        <label className="field">
          <span>Ile sztuk razem</span>
          <NumberInput value={count} min={2} max={100} onChange={setCount} />
        </label>
      )}
      {kind === 'linear' && (
        <>
          <label className="field">
            <span>Odstęp</span>
            <NumberInput value={distance} min={-1000} max={1000} unit="mm" onChange={setDistance} />
          </label>
          <label className="field">
            <span>Kierunek</span>
            <select value={axis} onChange={(e) => setAxis(Number(e.target.value) as 0 | 1 | 2)}>
              <option value={0}>X</option>
              <option value={1}>Y</option>
              <option value={2}>Z</option>
            </select>
          </label>
        </>
      )}
      {kind === 'circle' && (
        <label className="field" title="0 = obecna odległość od środka bryły">
          <span>Promień (0 = obecny)</span>
          <NumberInput value={radius} min={0} max={1000} unit="mm" onChange={setRadius} />
        </label>
      )}
      {kind === 'corners' && (
        <label className="field" title="0 = zostaw element tam, gdzie stoi, i skopiuj go z tym samym odsunięciem od rogu">
          <span>Odsunięcie od rogu (0 = jak teraz)</span>
          <NumberInput value={inset} min={0} max={500} unit="mm" onChange={setInset} />
        </label>
      )}
      <button className="action" onClick={() => pattern(part.id, kind, { count, distance, axis, inset, radius })}>
        ⁂ Utwórz kopie
      </button>
    </div>
  );
}

function TextureTool({ part }: { part: Part }) {
  const setTexture = useStore((s) => s.setTexture);
  const t = part.texture;
  const set = (patch: Partial<Texture>) => setTexture(part.id, { ...(t ?? DEFAULT_TEXTURE), ...patch });
  const n = (key: keyof Texture, label: string, min: number, max: number, step: number, unit?: string) => (
    <label className="field">
      <span>{label}</span>
      <NumberInput value={Number(t![key])} min={min} max={max} step={step} unit={unit} onChange={(v) => set({ [key]: v })} />
    </label>
  );
  return (
    <div className="tool">
      <label className="field">
        <span>Faktura</span>
        <select value={t ? t.pattern : 'none'} onChange={(e) => (e.target.value === 'none' ? setTexture(part.id, undefined) : set({ pattern: e.target.value as Texture['pattern'], mode: e.target.value === 'grooves' ? 'cut' : (t?.mode ?? 'add') }))}>
          <option value="none">Gładka</option>
          {Object.entries(TEXTURE_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {t && (
        <>
          <label className="field">
            <span>Ścianka</span>
            <select value={t.face} onChange={(e) => set({ face: e.target.value as Texture['face'] })}>
              {Object.entries(FACE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {t.pattern !== 'grooves' && (
            <label className="field">
              <span>Wzór</span>
              <select value={t.mode} onChange={(e) => set({ mode: e.target.value as Texture['mode'] })}>
                <option value="add">Wypukły</option>
                <option value="cut">Wklęsły (wycięty)</option>
              </select>
            </label>
          )}
          {n('depth', t.mode === 'add' && t.pattern !== 'grooves' ? 'Wysokość' : 'Głębokość', 0.2, 10, 0.1, 'mm')}
          {n('spacing', 'Odstęp', 0.8, 50, 0.2, 'mm')}
          {n('angle', 'Kierunek', -180, 180, 15, '°')}
          {n('margin', 'Margines od krawędzi', 0, 50, 0.5, 'mm')}
        </>
      )}
    </div>
  );
}

/** Rounded or chamfered outer edges of a solid. */
function EdgesTool({ part }: { part: Part }) {
  const setEdges = useStore((s) => s.setEdges);
  const e = part.edges;
  const set = (patch: Partial<Edges>) => setEdges(part.id, { ...(e ?? DEFAULT_EDGES), ...patch });
  const own = DEFS[part.type].params.some((p) => p.key === 'rad');
  const check = (key: 'vertical' | 'top' | 'bottom', label: string) => (
    <label className="field">
      <span>{label}</span>
      <input type="checkbox" checked={!!e?.[key]} onChange={(ev) => set({ [key]: ev.target.checked })} />
    </label>
  );
  return (
    <div className="tool">
      <label className="field">
        <span>Krawędzie</span>
        <select value={e ? e.kind : 'none'} onChange={(ev) => (ev.target.value === 'none' ? setEdges(part.id, undefined) : set({ kind: ev.target.value as Edges['kind'], ...(own && !e ? { vertical: false } : {}) }))}>
          <option value="none">Ostre</option>
          <option value="round">Zaokrąglone</option>
          <option value="chamfer">Fazowane (ścięte)</option>
        </select>
      </label>
      {e && (
        <>
          <label className="field">
            <span>{e.kind === 'round' ? 'Promień' : 'Szerokość fazki'}</span>
            <NumberInput value={e.r} min={0.2} max={50} step={0.2} unit="mm" onChange={(v) => set({ r: v })} />
          </label>
          {check('vertical', 'Pionowe narożniki')}
          {check('top', 'Górna krawędź')}
          {check('bottom', 'Dolna krawędź')}
          {own && e.vertical && <p className="desc">W pudełku lepiej użyć pola „Zaokrąglenie narożników” wyżej: zaokrągli też wnętrze, więc ścianka zostanie równa.</p>}
          {e.bottom && e.kind === 'round' && <p className="desc">Zaokrąglony spód drukuje się z nawisem. Na dole lepsza jest fazka.</p>}
        </>
      )}
    </div>
  );
}

const PATTERN_LABEL = { linear: 'w rzędzie', circle: 'po okręgu', sym: 'symetryczny' } as const;

function Section({ title, children, open = false, info }: { title: string; children: React.ReactNode; open?: boolean; info?: string }) {
  return (
    <details className="section" open={open}>
      <summary>
        {title} {info && <Info text={info} />}
      </summary>
      {children}
    </details>
  );
}

/** Top view of a box's dividers: click a segment to remove or restore it, drag it to move its line. */
function DividerEditor({ part }: { part: Part }) {
  const update = useStore((s) => s.update);
  const p = part.params;
  const [drag, setDrag] = useState<{ axis: 'v' | 'h'; line: number; x0: number; y0: number; key: string; moved: boolean; l: DivLayout } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const shape = (p.shape as string) || 'rect';
  const radialMode = (shape === 'round' || shape === 'hex') && p.divMode === 'radial';
  const t = Number(p.T) || 2;
  const W = Number(p.W) || 0;
  const iw = W - 2 * t;
  const id = shape === 'rect' ? (Number(p.D) || 0) - 2 * t : iw;
  if (iw <= 0 || id <= 0) return null;
  const base = layoutOf(p);
  const l = drag?.l ?? base;
  const segs = segmentsOf({ ...p, ...layoutParams(l) }, iw, id);
  const save = (next: DivLayout) => update(part.id, { params: { ...p, ...layoutParams(next) } });
  const pad = t + 4;
  // Spokes start at the ring when there is one.
  const ringD = radialMode ? Number(p.ring) || 0 : 0;
  const hub = ringD > 2 * t ? ringD / 2 / (shape === 'hex' ? iw / Math.sqrt(3) : iw / 2) : 0;
  const sw = Math.max(t, Math.max(iw, id) / 70);
  const hexPts = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3, r = iw / Math.sqrt(3);
    return `${(Math.cos(a) * r).toFixed(2)},${(-Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
  const outline =
    shape === 'round' ? <circle r={iw / 2} /> : shape === 'hex' ? <polygon points={hexPts} /> : <rect x={-iw / 2} y={-id / 2} width={iw} height={id} />;
  const ext = shape === 'hex' ? iw / Math.sqrt(3) : Math.max(iw, id) / 2;
  const world = (e: React.PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return [0, 0];
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [pt.x, -pt.y];
  };
  const down = (e: React.PointerEvent, key: string, axis: 'v' | 'h' | 'r', line: number) => {
    e.preventDefault();
    if (axis === 'r') return save(toggleSegment(base, key));
    (e.target as Element).setPointerCapture(e.pointerId);
    const [x, y] = world(e);
    setDrag({ axis, line, key, x0: x, y0: y, moved: false, l: base });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const [x, y] = world(e);
    if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) < sw) return;
    const f = drag.axis === 'v' ? (x + iw / 2) / iw : (y + id / 2) / id;
    setDrag({ ...drag, moved: true, l: moveLine(drag.l, drag.axis, drag.line, f, drag.axis === 'v' ? iw : id) });
  };
  const up = () => {
    if (!drag) return;
    save(drag.moved ? drag.l : toggleSegment(base, drag.key));
    setDrag(null);
  };
  const cells = (list: number[], size: number) => [0, ...list, 1].slice(1).map((v, i, a) => Math.round(((v - (i ? a[i - 1] : 0)) * size - t) * 10) / 10);
  return (
    <div className="div-editor">
      <svg
        ref={svg}
        viewBox={`${-ext - pad} ${-(shape === 'rect' ? id / 2 : ext) - pad} ${2 * (ext + pad)} ${2 * ((shape === 'rect' ? id / 2 : ext) + pad)}`}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
      >
        <defs>
          <clipPath id={`clip-${part.id}`}>{outline}</clipPath>
        </defs>
        <g className="div-wall" style={{ strokeWidth: t }}>
          {outline}
        </g>
        <g clipPath={`url(#clip-${part.id})`}>
          {segs.map((s) => (
            <g key={s.key}>
              <line className={s.on ? 'div-seg on' : 'div-seg'} x1={s.axis === 'r' ? s.b[0] * hub : s.a[0]} y1={s.axis === 'r' ? -s.b[1] * hub : -s.a[1]} x2={s.b[0]} y2={-s.b[1]} style={{ strokeWidth: sw }} />
              <line
                className="div-hit"
                x1={s.a[0]}
                y1={-s.a[1]}
                x2={s.b[0]}
                y2={-s.b[1]}
                style={{ strokeWidth: sw * 4, cursor: s.axis === 'r' ? 'pointer' : s.axis === 'v' ? 'ew-resize' : 'ns-resize' }}
                onPointerDown={(e) => down(e, s.key, s.axis, s.line)}
              >
                <title>{s.on ? 'Klik: usuń ten odcinek' : 'Klik: przywróć ten odcinek'}{s.axis !== 'r' ? '. Przeciągnij: przesuń przegródkę.' : ''}</title>
              </line>
            </g>
          ))}
          {radialMode && Number(p.ring) > 2 * t && <circle className="div-seg on" r={Number(p.ring) / 2} style={{ strokeWidth: sw, fill: 'none' }} />}
        </g>
        <text className="div-front" x={0} y={(shape === 'rect' ? id / 2 : ext) + pad * 0.85} style={{ fontSize: Math.max(3, Math.max(iw, id) / 22) }}>
          przód
        </text>
      </svg>
      <p className="desc">
        {radialMode ? 'Klik w przegródkę usuwa ją albo przywraca.' : `Klik w odcinek usuwa go albo przywraca (łączy komory). Przeciągnij, żeby przesunąć. Komora min. ${MIN_CELL} mm.`}
      </p>
      {!radialMode && (
        <>
          <p className="desc">
            Komory wzdłuż X: {cells(l.xs, iw).join(' / ')} mm · wzdłuż Y: {cells(l.ys, id).join(' / ')} mm
          </p>
          <div className="row">
            <button className="small" onClick={() => save(addInWidestGap(base, 'v'))} title="Nowa przegródka od przodu do tyłu, w najszerszej komorze">
              + wzdłuż
            </button>
            <button className="small" onClick={() => save(addInWidestGap(base, 'h'))} title="Nowa przegródka od lewej do prawej, w najgłębszej komorze">
              + w poprzek
            </button>
            <button className="small" onClick={() => save(evenOut(base))}>
              Równe odstępy
            </button>
            <button className="small" onClick={() => save({ ...base, off: [] })} title="Przywraca wszystkie usunięte odcinki">
              Przywróć odcinki
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Outline editor of a sketch part: drag points, click an edge to add one, double-click a point to remove it. */
function SketchEditor({ part }: { part: Part }) {
  const update = useStore((s) => s.update);
  const grid = useStore((s) => s.settings.grid);
  const rev = part.type === 'sketchRev';
  const saved = sketchPoints(part.params);
  const [drag, setDrag] = useState<{ i: number; pts: Pt[]; moved: boolean } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pts = drag?.pts ?? saved;
  if (pts.length < 3 || saved.length < 3) return null;
  const save = (next: Pt[]) => update(part.id, { params: { ...part.params, pts: encodePts(next) } });
  // The view stays put while dragging, so the point does not run away from the cursor.
  const xs = saved.map((q) => q[0]), ys = saved.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs, rev ? 0 : Infinity), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(x1 - x0, y1 - y0, 10);
  const pad = size * 0.12;
  const r = size / 45;
  const step = grid > 0 ? grid : 0.5;
  const snap = (v: number) => Math.round(v / step) * step;
  const world = (e: React.PointerEvent): Pt => {
    const m = svg.current?.getScreenCTM();
    if (!m) return [0, 0];
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [snap(q.x), snap(-q.y)];
  };
  const startDrag = (e: React.PointerEvent, i: number, list: Pt[]) => {
    e.preventDefault();
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    setSel(i);
    setDrag({ i, pts: list, moved: false });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const [x, y] = world(e);
    const next = drag.pts.map((q, k) => (k === drag.i ? ([rev ? Math.max(0, x) : x, y] as Pt) : q));
    setDrag({ ...drag, pts: next, moved: true });
  };
  const up = () => {
    if (!drag) return;
    if (drag.moved) save(drag.pts);
    setDrag(null);
  };
  const remove = (i: number) => {
    if (pts.length <= 3) return;
    save(pts.filter((_, k) => k !== i));
    setSel(null);
  };
  const scaleTo = (axis: 0 | 1, v: number) => {
    const lo = axis ? y0 : rev ? 0 : x0, hi = axis ? y1 : x1;
    const k = hi - lo > 0.01 ? v / (hi - lo) : 1;
    save(pts.map((q) => (axis ? [q[0], lo + (q[1] - lo) * k] : [lo + (q[0] - lo) * k, q[1]]) as Pt));
  };
  const presets = rev ? REVOLVE_PRESETS : SKETCH_PRESETS;
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${-q[1]}`).join(' ') + 'Z';
  const gridStep = size > 120 ? 20 : size > 50 ? 10 : 5;
  const lines: React.ReactNode[] = [];
  for (let gx = Math.ceil((x0 - pad) / gridStep) * gridStep; gx <= x1 + pad; gx += gridStep) lines.push(<line key={'x' + gx} x1={gx} x2={gx} y1={-(y1 + pad)} y2={-(y0 - pad)} />);
  for (let gy = Math.ceil((y0 - pad) / gridStep) * gridStep; gy <= y1 + pad; gy += gridStep) lines.push(<line key={'y' + gy} y1={-gy} y2={-gy} x1={x0 - pad} x2={x1 + pad} />);
  const s = sel !== null && sel < pts.length ? sel : null;
  return (
    <div className="sketch-editor">
      <label className="field">
        <span>Zacznij od</span>
        <select value="" onChange={(e) => e.target.value && (save(presets[e.target.value].pts), setSel(null))}>
          <option value="">wybierz gotowy…</option>
          {Object.entries(presets).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <svg ref={svg} viewBox={`${x0 - pad} ${-(y1 + pad)} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}>
        <g className="sk-grid" style={{ strokeWidth: size / 400 }}>
          {lines}
        </g>
        {rev && <line className="sk-axis" x1={0} x2={0} y1={-(y1 + pad)} y2={-(y0 - pad)} style={{ strokeWidth: size / 150 }} />}
        <path className="sk-fill" d={d} style={{ strokeWidth: size / 200 }} />
        {pts.map((a, i) => {
          const b = pts[(i + 1) % pts.length];
          return (
            <line
              key={'e' + i}
              className="sk-edge"
              x1={a[0]}
              y1={-a[1]}
              x2={b[0]}
              y2={-b[1]}
              style={{ strokeWidth: r * 2.2 }}
              onPointerDown={(e) => {
                const p = world(e);
                const next = [...pts.slice(0, i + 1), p, ...pts.slice(i + 1)];
                startDrag(e, i + 1, next);
                setDrag({ i: i + 1, pts: next, moved: true });
              }}
            >
              <title>Klik: dodaj punkt</title>
            </line>
          );
        })}
        {pts.map((q, i) => (
          <circle key={'p' + i} className={i === s ? 'sk-pt sel' : 'sk-pt'} cx={q[0]} cy={-q[1]} r={r} onPointerDown={(e) => startDrag(e, i, pts)} onDoubleClick={() => remove(i)}>
            <title>Przeciągnij: przesuń · dwuklik: usuń</title>
          </circle>
        ))}
      </svg>
      <p className="desc">
        {rev ? 'Pionowa kreska to oś obrotu. ' : 'Widok z góry. '}Przeciągaj punkty (co {String(step).replace('.', ',')} mm), klik w krawędź dodaje punkt, dwuklik w punkt usuwa go.
      </p>
      {s !== null && (
        <div className="row">
          <span className="desc">Punkt {s + 1}:</span>
          {[0, 1].map((k) => (
            <NumberInput key={k} value={pts[s][k]} min={rev && !k ? 0 : -1000} max={1000} step={step} unit={k ? 'Y' : 'X'} onChange={(v) => save(pts.map((q, j) => (j === s ? ((k ? [q[0], v] : [v, q[1]]) as Pt) : q)))} />
          ))}
          <button className="small" disabled={pts.length <= 3} onClick={() => remove(s)}>
            Usuń
          </button>
        </div>
      )}
      <label className="field">
        <span>{rev ? 'Promień (od osi)' : 'Szerokość obrysu'}</span>
        <NumberInput value={Math.round((x1 - (rev ? 0 : x0)) * 10) / 10} min={1} max={1000} step={1} unit="mm" onChange={(v) => scaleTo(0, v)} />
      </label>
      <label className="field">
        <span>{rev ? 'Wysokość profilu' : 'Głębokość obrysu'}</span>
        <NumberInput value={Math.round((y1 - y0) * 10) / 10} min={1} max={1000} step={1} unit="mm" onChange={(v) => scaleTo(1, v)} />
      </label>
    </div>
  );
}

function PartProperties({ part }: { part: Part }) {
  const st = useStore();
  const def = DEFS[part.type];
  const bodies = [...new Set(st.parts.map((p) => p.body))].sort((a, b) => a - b);
  const newBody = Math.max(0, ...bodies) + 1;
  const linked = part.link ? st.parts.filter((p) => p.link === part.link && p.id !== part.id && (!part.rigid || p.rigid !== part.rigid)).length : 0;
  const patterned = part.pattern ? st.parts.filter((p) => p.pattern?.id === part.pattern!.id && p.id !== part.id).length : 0;
  const pieces = part.rigid ? st.parts.filter((p) => p.rigid === part.rigid).length : 1;
  const [height, setHeight] = useState(150);
  const fields = paramsOf(def, part.params).filter((p) => !p.show || p.show(part.params));
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
      {part.locked && (
        <div className="linkbar">
          🔒 Zablokowany: nie przesuniesz go ani nie usuniesz.
          <button className="small" onClick={() => st.setFlags([part.id], { locked: false })}>
            Odblokuj
          </button>
        </div>
      )}
      {(linked > 0 || patterned > 0) && (
        <div className="linkbar">
          🔗 {linked > 0 ? `Powiązany z ${linked} ${linked === 1 ? 'kopią' : 'kopiami'}: zmiana wymiarów zmienia wszystkie.` : ''}
          {patterned > 0 && ` Szyk (${PATTERN_LABEL[part.pattern!.kind]}): przesuń ten element, a ${patterned === 1 ? 'druga kopia przesunie się' : `${patterned} pozostałe przesuną się`} ${part.pattern!.kind === 'linear' ? 'razem z nim' : 'symetrycznie'}.`}
          <button className="small" onClick={() => st.unlink(part.id)}>
            Odłącz
          </button>
        </div>
      )}
      {pieces > 1 && <p className="desc">Część zestawu ({pieces} elementy). Przesuwają się razem, a zmiana wymiarów dotyczy wszystkich.</p>}

      <h4>
        Wymiary <Info text={INFO.dims} />
      </h4>
      {fields.map((p) => (
        <div key={p.key}>
          {p.group && <h5>{p.group}</h5>}
          <ParamField def={p} value={part.params[p.key]} onChange={(v) => st.update(part.id, { params: { ...part.params, [p.key]: v } })} />
        </div>
      ))}
      {part.type === 'figurine' && (
        <div className="row">
          <NumberInput value={height} min={30} max={300} unit="mm" onChange={setHeight} />
          <button className="small" onClick={() => st.fitFigurine(part.id, height)} title="Dobiera suwak wysokości tak, by cała figurka miała podaną wysokość">
            Całość na {height} mm
          </button>
        </div>
      )}
      {(part.type === 'sketch' || part.type === 'sketchRev') && <SketchEditor key={part.id} part={part} />}
      {(part.type === 'box' || part.type === 'drawer') && (
        <Section title="▦ Układ przegródek" info={INFO.dividers} open={typeof part.params.div === 'string' && part.params.div.length > 0}>
          <DividerEditor part={part} />
        </Section>
      )}
      <Helpers part={part} />
      {part.type === 'connector' && <ConnectorWalls part={part} />}
      {(part.type === 'text' || part.type === 'textCut') && (
        <>
          <h5>Na którą ściankę</h5>
          <div className="row">
            {WALL_SIDES.map((w) => (
              <button key={w.side} className="small" onClick={() => st.textToWall(part.id, w.side)}>
                {w.label}
              </button>
            ))}
          </div>
        </>
      )}

      <h4>
        Położenie <Info text={INFO.position} />
      </h4>
      <XYZ value={part.position} step={st.settings.grid || 1} onChange={setPos} />
      <button className="small" onClick={() => st.dropToFloor(part.id)}>
        Połóż na stole
      </button>

      <h4>
        Obrót <Info text={INFO.rotation} />
      </h4>
      <XYZ value={part.rotation} step={15} unit="°" onChange={setRot} />
      <div className="row">
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <button key={a} className="small" title={`Obróć o 90° wokół osi ${a}`} onClick={() => st.rotateBy(part.id, i as 0 | 1 | 2, 90)}>
            ⟳ {a} 90°
          </button>
        ))}
      </div>

      {(part.type === 'box' || part.type === 'lid') && (
        <Section title="🧲 Miejsca na magnesy" info={INFO.magnets}>
          <MagnetTool target={part.id} body={part.body} />
        </Section>
      )}
      {!part.hole && (
        <Section title="↪ Gięcie" open={st.parts.some((p) => p.body === part.body && p.bend)} info={INFO.bend}>
          <BendTool body={part.body} prefer={part.id} />
        </Section>
      )}
      {!part.hole && (
        <Section title="◫ Skorupa (wydrążenie)" open={st.parts.some((p) => p.body === part.body && p.shell)} info={INFO.shell}>
          <ShellTool body={part.body} prefer={part.id} />
        </Section>
      )}
      {!part.hole && (
        <Section title="⇋ Lustro i skala" open={st.parts.some((p) => p.body === part.body && p.xform)} info={INFO.xform}>
          <XformTool body={part.body} prefer={part.id} />
        </Section>
      )}
      {!part.hole && <SplitTool body={part.body} />}
      {!part.rigid && (
        <Section title="Szyk i kopie" info={INFO.pattern}>
          <PatternTool part={part} />
        </Section>
      )}
      {!part.hole && part.type !== 'figurine' && (
        <Section title="◠ Zaokrąglenia i fazki" open={!!part.edges} info={INFO.edges}>
          <EdgesTool part={part} />
        </Section>
      )}
      {!part.hole && part.type !== 'figurine' && (
        <Section title="Faktura powierzchni" open={!!part.texture} info={INFO.texture}>
          <TextureTool part={part} />
        </Section>
      )}

      <h4>
        Wydruk <Info text={INFO.print} />
      </h4>
      <label className="field">
        <span>
          Rodzaj <Info text={INFO.hole} />
        </span>
        <select
          value={part.clip ? 'clip' : part.hole ? 'hole' : 'solid'}
          onChange={(e) => {
            const v = e.target.value;
            const plain = part.color === '#8b939e' || part.color === '#7fb3d5' ? '#a9aeb3' : part.color;
            st.update(part.id, { hole: v !== 'solid', clip: v === 'clip' ? true : undefined, color: v === 'hole' ? '#8b939e' : v === 'clip' ? '#7fb3d5' : plain });
          }}
        >
          <option value="solid">Bryła (materiał)</option>
          <option value="hole">Otwór (wycina)</option>
          <option value="clip">Część wspólna (zostawia, co w środku)</option>
        </select>
      </label>
      <label className="field" title="Elementy w tej samej bryle są sklejane w jeden wydruk. Otwory wycinają tylko swoją bryłę.">
        <span>
          Należy do bryły <Info text={INFO.body} />
        </span>
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
        <button className="small" onClick={() => st.select(groupId(part.body))}>
          Zaznacz całą bryłę
        </button>
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

/** Hide and lock toggles for one part or a whole body (group id). */
function Flags({ id, hidden, locked }: { id: string; hidden: boolean; locked: boolean }) {
  const setFlags = useStore((s) => s.setFlags);
  return (
    <span className={`flags ${hidden || locked ? 'on' : ''}`}>
      <button className={`flag ${hidden ? 'set' : ''}`} title={hidden ? 'Pokaż' : 'Ukryj (zostaje w wydruku, tylko nie zasłania)'} onClick={(e) => (e.stopPropagation(), setFlags([id], { hidden: !hidden }))}>
        {hidden ? '◌' : '◉'}
      </button>
      <button className={`flag ${locked ? 'set' : ''}`} title={locked ? 'Odblokuj' : 'Zablokuj (nie da się przesunąć ani usunąć)'} onClick={(e) => (e.stopPropagation(), setFlags([id], { locked: !locked }))}>
        {locked ? '🔒' : '🔓'}
      </button>
    </span>
  );
}

/** "Skorupa": hollows the whole body, optionally open on one side. */
function ShellTool({ body, prefer }: { body: number; prefer?: string }) {
  const st = useStore();
  const solids = st.parts.filter((p) => p.body === body && !p.hole);
  const holder = solids.find((p) => p.shell) ?? solids.find((p) => p.id === prefer) ?? solids[0];
  if (!holder) return null;
  const sh = holder.shell;
  const set = (patch: Partial<Shell>) => st.setShell(holder.id, { ...(sh ?? DEFAULT_SHELL), ...patch });
  return (
    <div className="tool">
      <label className="field">
        <span>Wydrąż</span>
        <select value={sh ? sh.open : 'off'} onChange={(e) => (e.target.value === 'off' ? st.setShell(holder.id, undefined) : set({ open: e.target.value as Shell['open'], on: true }))}>
          <option value="off">Nie (pełna)</option>
          <option value="none">Zamknięta w środku</option>
          <option value="top">Otwarta od góry</option>
          <option value="bottom">Otwarta od dołu</option>
        </select>
      </label>
      {sh && (
        <>
          <label className="field">
            <span>Grubość ścianki</span>
            <NumberInput value={sh.t} min={0.4} max={50} step={0.2} unit="mm" onChange={(t) => set({ t })} />
          </label>
          <label className="field">
            <span>Pokaż pełną (do edycji)</span>
            <input type="checkbox" checked={!sh.on} onChange={(e) => set({ on: !e.target.checked })} />
          </label>
          <p className="desc">Ścianka ma wszędzie mniej więcej tę grubość. Otwory dalej wycinają: otwór w ściance otwiera wnętrze.</p>
        </>
      )}
    </div>
  );
}

/** "Lustro i skala" of the whole body, plus a mirrored copy beside it. */
function XformTool({ body, prefer }: { body: number; prefer?: string }) {
  const st = useStore();
  const solids = st.parts.filter((p) => p.body === body && !p.hole);
  const holder = solids.find((p) => p.xform) ?? solids.find((p) => p.id === prefer) ?? solids[0];
  const [lock, setLock] = useState(true);
  if (!holder) return null;
  const x = holder.xform ?? DEFAULT_XFORM;
  const put = (next: Xform) => st.setXform(holder.id, xformActive(next) ? next : undefined);
  const setScale = (i: number, v: number) => put({ ...x, scale: (lock ? [v, v, v] : x.scale.map((s, k) => (k === i ? v : s))) as Vec3 });
  return (
    <div className="tool">
      <label className="field">
        <span>Odbicie</span>
        <select value={x.mirror} onChange={(e) => put({ ...x, mirror: e.target.value as Xform['mirror'] })}>
          <option value="none">Brak</option>
          <option value="x">Lewo ↔ prawo (X)</option>
          <option value="y">Przód ↔ tył (Y)</option>
          <option value="z">Góra ↔ dół (Z)</option>
        </select>
      </label>
      <label className="field">
        <span>Skala</span>
        <span className="row">
          {lock ? (
            <NumberInput value={x.scale[0]} min={1} max={1000} step={5} unit="%" onChange={(v) => setScale(0, v)} />
          ) : (
            (['X', 'Y', 'Z'] as const).map((a, i) => <NumberInput key={a} value={x.scale[i]} min={1} max={1000} step={5} unit={a} onChange={(v) => setScale(i, v)} />)
          )}
        </span>
      </label>
      <label className="field">
        <span>Ta sama w każdą stronę</span>
        <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
      </label>
      <div className="row">
        <button className="small" onClick={() => st.mirrorCopy(body, 'x')} title="Kopia odbita lewo-prawo, obok tej bryły">
          ⇋ Lustrzana kopia (X)
        </button>
        <button className="small" onClick={() => st.mirrorCopy(body, 'y')} title="Kopia odbita przód-tył, obok tej bryły">
          ⇅ Lustrzana kopia (Y)
        </button>
      </div>
      <p className="desc">Liczy się na końcu: wymiary i otwory dalej zmieniasz w zwykłej bryle. Skala zmienia też otwory i gwinty, więc dla śrub zostaw 100%.</p>
    </div>
  );
}

/** "Część wspólna": the body keeps only what it shares with another body. */
function ClipTool({ body }: { body: number }) {
  const st = useStore();
  const others = [...new Set(st.parts.filter((p) => p.body !== body && !p.hole).map((p) => p.body))].sort((a, b) => a - b);
  const [other, setOther] = useState<number | ''>('');
  if (!others.length) return <p className="desc">Dodaj drugą bryłę i nałóż ją na tę: zostanie tylko to, co mają wspólne.</p>;
  const pick = other === '' ? others[0] : other;
  return (
    <div className="tool">
      <label className="field">
        <span>Z bryłą</span>
        <select value={pick} onChange={(e) => setOther(Number(e.target.value))}>
          {others.map((b) => (
            <option key={b} value={b}>
              Bryła {b}
            </option>
          ))}
        </select>
      </label>
      <button className="small" onClick={() => st.clipWith(body, pick)}>
        ∩ Zostaw tylko część wspólną
      </button>
      <p className="desc">Druga bryła staje się niebieskim kształtem przycinającym. Możesz go przesuwać i zmieniać, a w „Rodzaj” wrócić do zwykłej bryły.</p>
    </div>
  );
}

/** Several picks (Ctrl+click): align and spread them. */
function MultiProperties({ ids }: { ids: string[] }) {
  const st = useStore();
  const [gap, setGap] = useState(5);
  const name = (id: string) => {
    const gb = groupBody(id);
    return gb !== null ? `Bryła ${gb}` : (st.parts.find((p) => p.id === id)?.name ?? '');
  };
  const AX = ['X', 'Y', 'Z'];
  const ends: Record<number, [string, string, string]> = { 0: ['⇤ lewo', '↔ środek', 'prawo ⇥'], 1: ['⇣ przód', '↕ środek', 'tył ⇡'], 2: ['⤓ dół', '↕ środek', 'góra ⤒'] };
  return (
    <div className="props">
      <div className="props-head">
        <b className="name">Zaznaczone: {ids.length}</b>
        <Info text={INFO.align} />
      </div>
      <p className="desc">{ids.map(name).join(', ')}. Ctrl+klik dodaje albo zdejmuje element.</p>
      <h4>Wyrównaj</h4>
      {[0, 1, 2].map((a) => (
        <div key={a} className="align-row">
          <span>{AX[a]}</span>
          {(['min', 'mid', 'max'] as const).map((to, k) => (
            <button key={to} className="small" onClick={() => st.align(ids, a as 0 | 1 | 2, to)}>
              {ends[a][k]}
            </button>
          ))}
        </div>
      ))}
      <h4>Rozłóż</h4>
      <div className="row">
        <button className="small" disabled={ids.length < 3} onClick={() => st.distribute(ids, 0, null)} title="Równe odstępy między skrajnymi (3 i więcej)">
          Równo w X
        </button>
        <button className="small" disabled={ids.length < 3} onClick={() => st.distribute(ids, 1, null)} title="Równe odstępy między skrajnymi (3 i więcej)">
          Równo w Y
        </button>
      </div>
      <div className="row">
        <NumberInput value={gap} min={0} max={200} step={1} unit="mm" onChange={setGap} />
        <button className="small" onClick={() => st.distribute(ids, 0, gap)}>
          Rząd w X co {gap} mm
        </button>
        <button className="small" onClick={() => st.distribute(ids, 1, gap)}>
          w Y
        </button>
      </div>
      <div className="row end">
        <button className="small" onClick={() => st.setFlags(ids, { hidden: true })}>
          Ukryj
        </button>
        <button className="small" onClick={() => st.setFlags(ids, { locked: true })}>
          Zablokuj
        </button>
        <button className="small" onClick={() => st.select(null)}>
          Odznacz
        </button>
      </div>
    </div>
  );
}

/** "Gięcie": wraps the whole body round a pipe or folds it by an angle; holes bend with it. */
function BendTool({ body, prefer }: { body: number; prefer?: string }) {
  const st = useStore();
  const solids = st.parts.filter((p) => p.body === body && !p.hole);
  const holder = solids.find((p) => p.bend) ?? solids.find((p) => p.id === prefer) ?? solids[0];
  const flat = useMemo(() => {
    const bb = bodyBox(st.parts, body);
    return bb.isEmpty() ? null : bb;
  }, [st.parts, body]);
  if (!holder || !flat) return null;
  const b = holder.bend;
  const ax = (b?.axis ?? 'x') === 'x' ? 0 : 1;
  const lo = flat.min.getComponent(ax), hi = flat.max.getComponent(ax);
  const t = flat.max.z - flat.min.z;
  const set = (patch: Partial<Bend>) => {
    const base = b ?? { ...DEFAULT_BEND, at: Math.round((lo + hi) / 2), r: Math.max(1, Math.round(t)) };
    st.setBend(holder.id, { ...base, ...patch });
  };
  const n = (key: 'D' | 'luz' | 'at' | 'angle' | 'r', label: string, min: number, max: number, step: number, unit: string) => (
    <label className="field">
      <span>{label}</span>
      <NumberInput value={Number(b![key])} min={min} max={max} step={step} unit={unit} onChange={(v) => set({ [key]: v })} />
    </label>
  );
  const wrapDeg = b && b.mode === 'wrap' ? Math.round(((hi - lo) / (b.D / 2 + b.luz + t / 2)) * (180 / Math.PI)) : 0;
  return (
    <div className="tool">
      <label className="field">
        <span>Gięcie</span>
        <select value={b ? b.mode : 'none'} onChange={(e) => (e.target.value === 'none' ? st.setBend(holder.id, undefined) : set({ mode: e.target.value as Bend['mode'], on: true }))}>
          <option value="none">Brak (płaska)</option>
          <option value="wrap">Owiń na rurę</option>
          <option value="angle">Zegnij o kąt</option>
        </select>
      </label>
      {b && (
        <>
          <label className="field">
            <span>Gięta długość</span>
            <select value={b.axis} onChange={(e) => set({ axis: e.target.value as Bend['axis'], at: Math.round(((e.target.value === 'x' ? flat.min.x + flat.max.x : flat.min.y + flat.max.y) / 2)) })}>
              <option value="x">wzdłuż X</option>
              <option value="y">wzdłuż Y</option>
            </select>
          </label>
          <label className="field">
            <span>Końce idą</span>
            <select value={b.dir} onChange={(e) => set({ dir: e.target.value as Bend['dir'] })}>
              <option value="down">w dół (spód do środka)</option>
              <option value="up">w górę (wierzch do środka)</option>
            </select>
          </label>
          {b.mode === 'wrap' ? (
            <>
              {n('D', 'Średnica rury', 2, 1000, 0.5, 'mm')}
              {n('luz', 'Luz na rurę', 0, 5, 0.1, 'mm')}
              <p className="desc">
                Długość {Math.round(hi - lo)} mm owija {wrapDeg}° rury{wrapDeg > 340 ? ': końce zachodzą na siebie, skróć element.' : '.'} Pełny obwód to {Math.round(Math.PI * (b.D + 2 * b.luz + t))} mm.
              </p>
            </>
          ) : (
            <>
              {n('at', `Linia gięcia (${Math.round(lo)}…${Math.round(hi)})`, Math.ceil(lo), Math.floor(hi), 1, 'mm')}
              {n('angle', 'Kąt', 1, 180, 5, '°')}
              {n('r', 'Promień wewnętrzny', 0, 200, 0.5, 'mm')}
            </>
          )}
          <label className="field">
            <span>Pokaż płasko (do edycji)</span>
            <input type="checkbox" checked={!b.on} onChange={(e) => set({ on: !e.target.checked })} />
          </label>
          <p className="desc">Otwory i napisy gną się razem z bryłą. Gwinty i gniazda magnesów w miejscu gięcia się zniekształcą.</p>
        </>
      )}
    </div>
  );
}

/** "Podziel na części": one cut at a chosen plane, or as many as the printer's bed needs. */
function SplitTool({ body }: { body: number }) {
  const st = useStore();
  const [open, setOpen] = useState(false);
  const [axis, setAxis] = useState<0 | 1 | 2>(0);
  const [dowels, setDowels] = useState(true);
  const [bed, setBed] = useState<Vec3>(loadBed);
  const box = useMemo(() => finishedBox(st.parts, body), [st.parts, body]);
  const lo = box.isEmpty() ? 0 : box.min.getComponent(axis), hi = box.isEmpty() ? 0 : box.max.getComponent(axis);
  const [at, setAt] = useState<number | null>(null);
  const pos = at === null || at <= lo || at >= hi ? Math.round(((lo + hi) / 2) * 10) / 10 : at;
  const setCut = st.setCutPlane;
  useEffect(() => {
    setCut(open && !box.isEmpty() ? { body, axis, at: pos } : null);
  }, [open, body, axis, pos, setCut, box.isEmpty()]);
  useEffect(() => () => setCut(null), [setCut]);
  const size = box.isEmpty() ? [0, 0, 0] : box.getSize(new THREE.Vector3()).toArray();
  const fits = size.every((v, i) => v <= bed[i] - 2);
  const saveBed = (i: number, v: number) => {
    const b = [...bed] as Vec3;
    b[i] = v;
    setBed(b);
    try {
      localStorage.setItem(BED_KEY, JSON.stringify(b));
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <details className="section" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        ✂ Podziel na części <Info text={INFO.split} />
      </summary>
      <div className="tool">
        <label className="field">
          <span>Cięcie w poprzek osi</span>
          <select value={axis} onChange={(e) => (setAxis(Number(e.target.value) as 0 | 1 | 2), setAt(null))}>
            <option value={0}>X (lewo / prawo)</option>
            <option value={1}>Y (przód / tył)</option>
            <option value={2}>Z (dół / góra)</option>
          </select>
        </label>
        <label className="field">
          <span>
            Miejsce cięcia ({Math.round(lo)}…{Math.round(hi)})
          </span>
          <NumberInput value={pos} min={Math.ceil(lo + 1)} max={Math.floor(hi - 1)} step={1} unit="mm" onChange={setAt} />
        </label>
        <label className="field">
          <span>Kołki łączące</span>
          <input type="checkbox" checked={dowels} onChange={(e) => setDowels(e.target.checked)} />
        </label>
        <button className="action" onClick={() => st.splitBody(body, axis, pos, dowels)}>
          ✂ Przetnij tutaj
        </button>
        <h5>Stół drukarki</h5>
        <XYZ value={bed} step={10} unit="mm" onChange={(i, v) => saveBed(i, v)} />
        <p className="desc">
          Bryła: {size.map((v) => Math.round(v)).join(' × ')} mm. {fits ? 'Mieści się na stole.' : 'Nie mieści się na stole.'}
        </p>
        <button className="action" disabled={fits} onClick={() => st.splitToBed(body, bed, dowels)}>
          ⊞ Podziel, żeby zmieściła się na stole
        </button>
      </div>
    </details>
  );
}

function GroupProperties({ body }: { body: number }) {
  const st = useStore();
  const members = st.parts.filter((p) => p.body === body);
  const merged = isMerged(st.parts, body);
  const holes = members.filter((p) => p.hole).length;
  const tied = assembly(st.parts, body).filter((p) => p.body !== body).length;
  const anchor = members.find((p) => !p.hole) ?? members[0];
  if (!anchor) return null;
  const box = bodyBox(st.parts, body);
  const size = box.isEmpty() ? [0, 0, 0] : box.getSize(new THREE.Vector3()).toArray();
  return (
    <div className="props">
      <div className="props-head">
        <Icon type="cube" hole={false} />
        <b className="name">Bryła {body}</b>
        <Info text={INFO.group} />
      </div>
      <p className="desc">
        {members.length} {members.length === 1 ? 'element' : 'elementów'}, w tym {holes} {holes === 1 ? 'otwór' : 'otworów'}. Wymiary: {size.map((v) => Math.round(v * 10) / 10).join(' × ')} mm.
        {tied > 0 && ' Połączona zawiasem lub złączką z inną bryłą, przesuwa się razem z nią.'}
      </p>
      {holes > 0 && !members.some(finishing) && (
        <button className="action" onClick={() => (merged ? st.unmerge(body) : st.merge(body))}>
          {merged ? '⧈ Rozdziel (pokaż otwory osobno)' : '⧉ Złącz otwory z bryłą (pokaż gotowy element)'}
        </button>
      )}
      <Section title="🧲 Miejsca na magnesy (pudełko z płyt)" info={INFO.magnets}>
        <MagnetTool target={groupId(body)} body={body} />
      </Section>
      <Section title="↪ Gięcie" open={members.some((p) => p.bend)} info={INFO.bend}>
        <BendTool body={body} />
      </Section>
      <Section title="◫ Skorupa (wydrążenie)" open={members.some((p) => p.shell)} info={INFO.shell}>
        <ShellTool body={body} />
      </Section>
      <Section title="⇋ Lustro i skala" open={members.some((p) => p.xform)} info={INFO.xform}>
        <XformTool body={body} />
      </Section>
      <Section title="∩ Część wspólna z inną bryłą" info={INFO.clip}>
        <ClipTool body={body} />
      </Section>
      <SplitTool body={body} />
      {merged && <p className="desc">Złączona: widać gotowy element. Otwory nadal możesz kliknąć (na liście albo w modelu) i przesuwać w bryle.</p>}

      <h4>Położenie</h4>
      <XYZ
        value={anchor.position}
        step={st.settings.grid || 1}
        onChange={(i, v) => {
          const p = [...anchor.position] as Vec3;
          p[i] = v;
          st.moveBody(body, p);
        }}
      />
      <button className="small" onClick={() => st.dropBody(body)}>
        Połóż na stole
      </button>
      <h4>Obrót całej bryły</h4>
      <div className="row">
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <button key={a} className="small" onClick={() => st.rotateBody(body, i as 0 | 1 | 2, 90)}>
            ⟳ {a} 90°
          </button>
        ))}
      </div>
      <div className="row end">
        <button className="small" onClick={() => st.duplicateBody(body)}>
          Duplikuj bryłę
        </button>
        <button className="small danger" onClick={() => st.removeBody(body)}>
          Usuń bryłę
        </button>
      </div>
    </div>
  );
}

/** Badge of a body shown finished: what was done to it. */
function badgeOf(members: Part[]) {
  const s = members.filter((p) => !p.hole);
  const out: string[] = [];
  if (s.some((p) => p.bend?.on)) out.push('gięta');
  if (s.some((p) => p.shell?.on)) out.push('skorupa');
  const x = s.find((p) => xformActive(p.xform))?.xform;
  if (x && x.mirror !== 'none') out.push('odbita');
  if (x && x.scale.some((v) => v !== 100)) out.push('skala');
  return out.length ? out.join(', ') : 'złączona';
}

/** Always-visible list of everything in the project, grouped by printed body. */
function Outliner() {
  const parts = useStore((s) => s.parts);
  const selectedId = useStore((s) => s.selectedId);
  const multi = useStore((s) => s.multi);
  const hoveredId = useStore((s) => s.hoveredId);
  const select = useStore((s) => s.select);
  const toggleMulti = useStore((s) => s.toggleMulti);
  const pick = (id: string) => (e: React.MouseEvent) => (e.ctrlKey || e.metaKey || e.shiftKey ? toggleMulti(id) : select(id));
  const setHover = useStore((s) => s.setHover);
  const merge = useStore((s) => s.merge);
  const unmerge = useStore((s) => s.unmerge);
  const mergeAll = useStore((s) => s.mergeAll);
  const bodies = [...new Set(parts.map((p) => p.body))].sort((a, b) => a - b);
  if (!parts.length) return null;
  const cls = (id: string) => [id === selectedId || multi.includes(id) ? 'sel' : '', id === hoveredId ? 'hov' : ''].join(' ');
  return (
    <div className="outliner" onMouseLeave={() => setHover(null)}>
      <h4>Elementy projektu</h4>
      {bodies.map((b) => {
        const members = parts.filter((p) => p.body === b);
        const merged = isMerged(parts, b);
        const bent = members.some(finishing);
        const holes = members.some((p) => p.hole) && !bent;
        const g = groupId(b);
        return (
          <div key={b} className="body">
            <div className={`body-head ${cls(g)}`} onMouseEnter={() => setHover(g)} onClick={pick(g)}>
              <b>Bryła {b}</b>
              {merged && <span className="badge">{badgeOf(members)}</span>}
              {holes && (
                <button
                  className="mini"
                  title={merged ? 'Rozdziel: pokaż otwory osobno' : 'Złącz otwory z bryłą: pokaż gotowy element'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (merged) unmerge(b);
                    else merge(b);
                  }}
                >
                  {merged ? 'Rozdziel' : 'Złącz'}
                </button>
              )}
              <Flags id={g} hidden={members.every((p) => p.hidden)} locked={members.every((p) => p.locked)} />
            </div>
            <ul>
              {members.map((p) => (
                <li key={p.id} className={`${p.hole ? 'is-hole' : ''} ${p.hidden ? 'is-hidden' : ''} ${cls(p.id)}`} onMouseEnter={() => setHover(p.id)} onClick={pick(p.id)}>
                  <span className="dot" style={{ background: p.color }} />
                  <span className="label">{p.name}</span>
                  {p.link && parts.some((q) => q.link === p.link && q.id !== p.id && (!p.rigid || q.rigid !== p.rigid)) && <span title="Powiązana kopia">🔗</span>}
                  <Flags id={p.id} hidden={!!p.hidden} locked={!!p.locked} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {bodies.length > 1 && (
        <button className="small" onClick={mergeAll}>
          Połącz wszystko w jedną bryłę
        </button>
      )}
    </div>
  );
}

function CheckPanel() {
  const check = useStore((s) => s.check);
  const close = useStore((s) => s.closeCheck);
  const select = useStore((s) => s.select);
  const minWall = useStore((s) => s.settings.minWall);
  const setSettings = useStore((s) => s.setSettings);
  const run = useStore((s) => s.runCheck);
  const applyFixes = useStore((s) => s.applyFixes);
  if (!check) return null;
  const problems = check.issues.filter((i) => i.level !== 'info').length;
  const fixes = check.issues.flatMap((i) => (i.fix ? [i.fix] : []));
  return (
    <div className="checkres">
      <div className="checkres-head">
        <b>{check.title ? `${check.title}: ${problems ? `do poprawy ${problems}` : 'w porządku'}` : problems ? `Do poprawy: ${problems}` : '✓ Model gotowy do druku'}</b>
        <button className="mini" onClick={close}>
          ✕
        </button>
      </div>
      {!check.issues.length && <p className="desc">Siatki są szczelne (bez dziur i podwójnych ścianek), bryły nie nachodzą na siebie, nie ma ścianek cieńszych niż {String(minWall).replace('.', ',')} mm.</p>}
      <ul>
        {check.issues.map((i, k) => (
          <li key={k} className={i.level} onClick={() => i.select && select(i.select)}>
            {i.level === 'error' ? '⛔' : i.level === 'warn' ? '⚠️' : 'ℹ️'} {i.text}
          </li>
        ))}
      </ul>
      {fixes.length > 0 && (
        <div className="row">
          <button className="action" onClick={() => applyFixes(fixes)}>
            Popraw wszystkie ({fixes.length})
          </button>
          <button className="small" onClick={() => select(check.issues.find((i) => i.fix)?.select ?? null)} title="Zaznacza pierwszy problem; kliknij wpis na liście, żeby zobaczyć inne">
            Pokaż
          </button>
          <button className="small" onClick={close}>
            Zostaw
          </button>
        </div>
      )}
      <label className="field" title="Najcieńsza ścianka, którą drukarka zrobi porządnie (zwykle 2 × średnica dyszy)">
        <span>Min. ścianka</span>
        <NumberInput value={minWall} min={0.2} max={5} step={0.1} unit="mm" onChange={(v) => setSettings({ minWall: v })} />
      </label>
      <button className="small" onClick={run}>
        Sprawdź ponownie
      </button>
    </div>
  );
}

function Welcome() {
  const tab = useStore((s) => s.tab);
  return (
    <div className="props empty">
      <h4>Jak zacząć</h4>
      {tab === 'fig' ? (
        <ol>
          <li>Wybierz figurkę z menu po lewej, np. <b>Królik</b>.</li>
          <li>Suwaki w tym panelu zmieniają kształt wszystkich jej części.</li>
          <li>Zaznacz część i dodaj <b>magnes</b>, <b>otwór</b> albo <b>czop</b> z narzędzi poniżej figurek.</li>
          <li>Pobierz <b>STL/3MF</b>: każda część jest osobnym wydrukiem.</li>
        </ol>
      ) : (
        <ol>
          <li>Kliknij element w menu po lewej, np. <b>Pudełka</b>. Strzałka obok kafelka pokazuje odmiany i rozmiary S/M/L.</li>
          <li>Zmień wymiary w tym panelu.</li>
          <li>Przeciągaj elementy myszką. Same się przyciągają do sąsiednich ścianek.</li>
          <li>Zaznacz element i dodaj <b>otwór</b>, <b>gwint</b>, <b>zawias</b> albo <b>dławik</b>: pojawi się na jego wierzchu.</li>
          <li><b>📏 Wymiary</b> (klawisz W) pokazują rozmiar ścianki, krawędzi lub otworu pod kursorem.</li>
          <li>Kliknij <b>Sprawdź model</b>, potem pobierz <b>STL/3MF</b>.</li>
        </ol>
      )}
    </div>
  );
}

export function Properties() {
  const part = useStore((s) => s.parts.find((p) => p.id === s.selectedId));
  const body = useStore((s) => {
    const gb = groupBody(s.selectedId);
    return gb !== null && s.parts.some((p) => p.body === gb) ? gb : null;
  });
  const empty = useStore((s) => !s.parts.length);
  const multi = useStore((s) => s.multi);
  const sel = useStore((s) => s.selectedId);
  const picks = multi.length && sel ? [sel, ...multi] : null;
  return (
    <aside className="properties">
      <CheckPanel />
      <Outliner />
      {picks ? <MultiProperties ids={picks} /> : part ? <PartProperties key={part.id} part={part} /> : body !== null ? <GroupProperties key={body} body={body} /> : empty ? <Welcome /> : <p className="desc pad">Kliknij element w modelu albo na liście, żeby zmienić jego wymiary.</p>}
    </aside>
  );
}
