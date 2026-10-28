import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CATALOG, CATEGORIES, DEFS, MAGNETS, paramsOf, type Category, type ParamDef } from '../catalog';
import { findLid, type MagnetOptions } from '../geom/magnets';
import { assembly, bodyBox, groupBody, groupId, isMerged, useStore, type PatternKind } from '../store';
import { DEFAULT_TEXTURE, FACE_LABELS, TEXTURE_LABELS } from '../geom/texture';
import { FIG_MODELS, FIG_ORDER } from '../parts/figurine';
import type { Part, Texture, Vec3 } from '../types';
import { Icon } from './Icon';
import { INFO, Info, PATTERN_INFO } from './Info';
import { FAMILIES, IN_FAMILY, type Family, type Size } from '../families';
import { WALL_SIDES, sideOf } from '../parts/connectors';

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
  return (
    <div className="tool">
      <p className="desc">Silnik znajdzie górną krawędź ścianek i narożniki. Gdzie ścianka jest za cienka, dołoży słupek. W pokrywce zrobi lustrzane gniazda.</p>
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
        <select value={opt.layout} onChange={(e) => set({ layout: e.target.value as MagnetOptions['layout'] })}>
          <option value="4">4 w narożnikach</option>
          <option value="6">6: narożniki i środki dłuższych boków</option>
          <option value="8">8: narożniki i środki wszystkich boków</option>
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
      <button className="action" onClick={() => st.addMagnets(target, opt)}>
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
      <Helpers part={part} />
      {part.type === 'connector' && <ConnectorWalls part={part} />}

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
      {!part.rigid && (
        <Section title="Szyk i kopie" info={INFO.pattern}>
          <PatternTool part={part} />
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
        <select value={part.hole ? 'hole' : 'solid'} onChange={(e) => st.update(part.id, { hole: e.target.value === 'hole', color: e.target.value === 'hole' ? '#8b939e' : part.color === '#8b939e' ? '#a9aeb3' : part.color })}>
          <option value="solid">Bryła (materiał)</option>
          <option value="hole">Otwór (wycina)</option>
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
      {holes > 0 && (
        <button className="action" onClick={() => (merged ? st.unmerge(body) : st.merge(body))}>
          {merged ? '⧈ Rozdziel (pokaż otwory osobno)' : '⧉ Złącz otwory z bryłą (pokaż gotowy element)'}
        </button>
      )}
      <Section title="🧲 Miejsca na magnesy (pudełko z płyt)" info={INFO.magnets}>
        <MagnetTool target={groupId(body)} body={body} />
      </Section>
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

/** Always-visible list of everything in the project, grouped by printed body. */
function Outliner() {
  const parts = useStore((s) => s.parts);
  const selectedId = useStore((s) => s.selectedId);
  const hoveredId = useStore((s) => s.hoveredId);
  const select = useStore((s) => s.select);
  const setHover = useStore((s) => s.setHover);
  const merge = useStore((s) => s.merge);
  const unmerge = useStore((s) => s.unmerge);
  const mergeAll = useStore((s) => s.mergeAll);
  const bodies = [...new Set(parts.map((p) => p.body))].sort((a, b) => a - b);
  if (!parts.length) return null;
  const cls = (id: string) => [id === selectedId ? 'sel' : '', id === hoveredId ? 'hov' : ''].join(' ');
  return (
    <div className="outliner" onMouseLeave={() => setHover(null)}>
      <h4>Elementy projektu</h4>
      {bodies.map((b) => {
        const members = parts.filter((p) => p.body === b);
        const merged = isMerged(parts, b);
        const holes = members.some((p) => p.hole);
        const g = groupId(b);
        return (
          <div key={b} className="body">
            <div className={`body-head ${cls(g)}`} onMouseEnter={() => setHover(g)} onClick={() => select(g)}>
              <b>Bryła {b}</b>
              {merged && <span className="badge">złączona</span>}
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
            </div>
            <ul>
              {members.map((p) => (
                <li key={p.id} className={`${p.hole ? 'is-hole' : ''} ${cls(p.id)}`} onMouseEnter={() => setHover(p.id)} onClick={() => select(p.id)}>
                  <span className="dot" style={{ background: p.color }} />
                  <span className="label">{p.name}</span>
                  {p.link && parts.some((q) => q.link === p.link && q.id !== p.id && (!p.rigid || q.rigid !== p.rigid)) && <span title="Powiązana kopia">🔗</span>}
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
  return (
    <aside className="properties">
      <CheckPanel />
      <Outliner />
      {part ? <PartProperties key={part.id} part={part} /> : body !== null ? <GroupProperties key={body} body={body} /> : empty ? <Welcome /> : <p className="desc pad">Kliknij element w modelu albo na liście, żeby zmienić jego wymiary.</p>}
    </aside>
  );
}
