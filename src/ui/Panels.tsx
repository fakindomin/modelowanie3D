import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ReadyIcon, ToolIcon, WizardIcon } from './KindIcons';
import { CATALOG, CATEGORIES, DEFS, MAGNETS, paramsOf, type Category, type ParamDef } from '../catalog';
import { findLid, type FaceMagnetOptions, type MagnetOptions } from '../geom/magnets';
import { bodyRisk, opOff, type Op } from './ops';
import { BED_KEY, assembly, bodyBox, finishedBox, groupBody, groupId, isMerged, loadBed, useStore, type PatternKind } from '../store';
import { WIZARDS } from '../wizards';
import { DEFAULT_TEXTURE, FACE_LABELS, faceLabel, TEXTURE_LABELS } from '../geom/texture';
import { DEFAULT_EDGES } from '../geom/edges';
import { DEFAULT_BEND } from '../geom/bend';
import { DEFAULT_INFILL, DEFAULT_SHELL, DEFAULT_XFORM, finishing, xformActive } from '../geom/modify';
import { FIG_MODELS, FIG_ORDER, XMAS_ORDER } from '../parts/figurine';
import type { Bend, Edges, Infill, Part, PlainFace, Shell, Texture, TextureFace, Vec3, Xform } from '../types';
import { LATTICE_LABELS } from '../geom/lattice';
import { buildBodies, texturesOf } from '../geom/parts';
import { Icon } from './Icon';
import { SketchEditor } from './SketchEditor';
import { INFO, Info, PATTERN_INFO } from './Info';
import { FAMILIES, IN_FAMILY, type Family, type Size } from '../families';
import { WALL_SIDES, sideOf, type WallSide } from '../parts/connectors';
import { MIN_CELL, addInWidestGap, evenOut, layoutOf, layoutParams, moveLine, segmentsOf, toggleSegment, type DivLayout } from '../geom/dividers';
import { fittingGeo } from '../parts/couplings';
import { PROJECT_ITEMS, USE_CATS, itemsIn, type ProjectItem } from '../projects';
import { cardInfo, fmtMin, type CardInfo } from './modelCard';
import { runProjectItem } from './runItem';
import { GEAR_PAIR, REMOVED_TYPES, TECH_GROUPS, mainOf, printable } from '../simple';
import { PRINTERS } from '../wizards/frame';
import { groupFields, shortLabel, type FieldGroup } from './paramGroups';

const FIG_TOOLS: Category[] = ['joints', 'threads', 'hinges', 'basic'];
const XMAS_ICON: Record<string, string> = { etykieta: 'xmasLabel', czubek: 'xmasTopper', foremka: 'xmasCutter', taca: 'xmasTray' };
/** The „Części” tab: the building blocks in a few groups, each holding one or more of the old categories. */
const PART_GROUPS: { id: string; label: string; cats: Category[] }[] = [
  { id: 'ready', label: 'Gotowe elementy', cats: ['ready'] },
  { id: 'solids', label: 'Bryły i kształty', cats: ['basic'] },
  { id: 'profiles', label: 'Profile i rury', cats: ['profile'] },
  { id: 'joins', label: 'Łączenia', cats: ['joints', 'threads', 'hinges', 'couplings'] },
  { id: 'mech', label: 'Mechanika', cats: ['gears', 'springs'] },
  { id: 'elec', label: 'Elektronika i instalacje', cats: ['connectors', 'fittings'] },
];
type LibMode = 'projects' | 'parts';
const LIB_MODE_KEY = 'modelowanie3d.libraryMode';

/** Floating card next to a project tile: picture, size, filament, time and whether it fits the bed. */
function ModelCard({ item, top, left }: { item: ProjectItem; top: number; left: number }) {
  const [info, setInfo] = useState<CardInfo | null | undefined>(undefined);
  useEffect(() => {
    setInfo(undefined);
    if (item.kind === 'wizard' || item.kind === 'figurines') return setInfo(null);
    // Built after the card is on screen (a heavy model takes a moment).
    const t = window.setTimeout(() => setInfo(cardInfo(item)), 30);
    return () => window.clearTimeout(t);
  }, [item]);
  const bed = loadBed();
  const fits = info ? (() => {
    const a = [...info.size].sort((x, y) => x - y), b = [...bed].sort((x, y) => x - y);
    return a.every((v, i) => v <= b[i]);
  })() : true;
  return (
    <div className="model-card" style={{ top, left }} role="tooltip">
      <div className="mc-pic">{info ? <img src={info.thumb} alt="" /> : info === undefined ? <span className="mc-wait">…</span> : <Icon type={item.icon} hole={false} />}</div>
      <b>{item.label}</b>
      <p>{item.desc}</p>
      {item.kind === 'wizard' && <p className="mc-meta">Kreator krok po kroku: wymiary podasz w kolejnych krokach, na końcu zobaczysz filament i czas.</p>}
      {item.kind === 'figurines' && <p className="mc-meta">Osobna zakładka Figurki.</p>}
      {info && (
        <>
          <p className="mc-meta">
            {info.size.map((v) => Math.round(v)).join(' × ')} mm{info.parts > 1 ? ` · ${info.parts} części` : ''}
            <br />
            ok. {Math.max(1, Math.round(info.grams))} g PLA · ok. {fmtMin(info.minutes)}
          </p>
          <p className={fits ? 'mc-fit ok' : 'mc-fit no'}>{fits ? `✓ Mieści się na stole ${bed[0]} × ${bed[1]} mm` : `✗ Większe niż stół ${bed[0]} × ${bed[1]} × ${bed[2]} mm: zmniejsz albo podziel („Podziel na części”)`}</p>
          <p className="mc-note">Dla wymiarów domyślnych; po wstawieniu zmienisz je w panelu po prawej.</p>
        </>
      )}
    </div>
  );
}

export function Library() {
  const add = useStore((s) => s.add);
  const addFigurine = useStore((s) => s.addFigurine);
  const tab = useStore((s) => s.tab);
  const startNew = useStore((s) => s.startNew);
  const matingGear = useStore((s) => s.matingGear);
  /** A new project from one ready-made part; gears come with their mating partner. */
  const startWith = (type: string) => {
    startNew();
    const id = add(type);
    if (GEAR_PAIR[type]) matingGear(id, GEAR_PAIR[type]);
  };
  const [open, setOpen] = useState<string | null>('box');
  const [q, setQ] = useState('');
  const [card, setCard] = useState<{ item: ProjectItem; top: number; left: number } | null>(null);
  const cardTimer = useRef<number | undefined>(undefined);
  const showCard = (item: ProjectItem, el: HTMLElement) => {
    window.clearTimeout(cardTimer.current);
    const r = el.getBoundingClientRect(), lib = el.closest('.library')?.getBoundingClientRect();
    // A short pause, so sweeping the mouse over the list does not build every model.
    cardTimer.current = window.setTimeout(() => setCard({ item, top: Math.max(8, Math.min(r.top - 20, window.innerHeight - 410)), left: (lib?.right ?? r.right) + 8 }), 350);
  };
  const hideCard = () => {
    window.clearTimeout(cardTimer.current);
    setCard(null);
  };
  const [mode, setModeState] = useState<LibMode>(() => {
    try {
      return localStorage.getItem(LIB_MODE_KEY) === 'parts' ? 'parts' : 'projects';
    } catch {
      return 'projects';
    }
  });
  const setMode = (m: LibMode) => {
    setModeState(m);
    try {
      localStorage.setItem(LIB_MODE_KEY, m);
    } catch {
      /* storage unavailable */
    }
  };
  const openWizard = useStore((s) => s.openWizard);
  const addVariant = useStore((s) => s.addVariant);
  const startVariant = (f: Family, v: Family['variants'][number]) => {
    startNew();
    addVariant(f, v, 'M');
  };
  const setTab = useStore((s) => s.setTab);
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
  }, [tab, mode]);
  const query = norm(q.trim());
  const hit = (...texts: string[]) => !query || texts.some((t) => norm(t).includes(query));
  const figs = tab === 'fig' ? FIG_ORDER.filter((id) => hit(FIG_MODELS[id].n)) : [];
  const xmas = tab === 'fig' ? XMAS_ORDER.filter((id) => hit(FIG_MODELS[id].n, 'święta', 'boże narodzenie', 'christmas', 'taca', 'tray')) : [];
  // Ready-made technical parts only: bare blocks and features are gone (see simple.ts).
  const sections = tab !== 'tech' ? [] : TECH_GROUPS.map((g) => {
    const fams = g.fams
      .map((id) => FAMILIES.find((f) => f.id === id)!)
      .map((f) => ({ f, only: f.variants.filter((v) => !REMOVED_TYPES.has(v.type) && hit(f.label, v.label)) }))
      .filter((x) => x.only.length);
    const tiles = g.types.map((t) => DEFS[t]).filter((d) => d && hit(d.label));
    return { g, fams, tiles };
  });
  // Projects: by use (only the technical tab); while searching, every match once.
  const projectsOn = tab === 'tech' && (mode === 'projects' || !!query);
  const partsOn = tab === 'tech' && (mode === 'parts' || !!query);
  // Wizards have their own place above Projekty / Części; the project lists hold ready-made things only.
  const wizItems = tab === 'tech' ? PROJECT_ITEMS.filter((i) => i.kind === 'wizard' && (!query || hit(i.label, i.desc))) : [];
  const projHits = projectsOn && query ? PROJECT_ITEMS.filter((i) => i.kind !== 'wizard' && hit(i.label, i.desc, ...i.tags.map((t) => USE_CATS.find((c) => c.id === t)!.label))) : [];
  const nothing = !!query && !figs.length && !xmas.length && !projHits.length && !wizItems.length && (!partsOn || sections.every((x) => !x.fams.length && !x.tiles.length));
  // Main part groups start open; project categories start shut (the set lists the ones flipped).
  const shown = (id: string) => !!query || (id.startsWith('proj:') ? closed.has(id) : !closed.has(id));
  const runItem = runProjectItem;
  const itemTile = (i: ProjectItem, key: string, badge = true) => (
    <button key={key} className={i.kind === 'wizard' ? 'tile project by-wizard' : 'tile project'} onMouseEnter={(e) => showCard(i, e.currentTarget)} onMouseLeave={hideCard} onFocus={(e) => showCard(i, e.currentTarget)} onBlur={hideCard} onClick={() => { hideCard(); runItem(i); }}>
      <Icon type={i.icon} hole={false} />
      <span>{i.label}</span>
      {badge && i.kind === 'wizard' && <span className="badge" title="Kreator"><WizardIcon size={11} /></span>}
    </button>
  );
  const groups = sections.filter((x) => x.fams.length || x.tiles.length);
  const sectionBody = ({ g, fams, tiles }: (typeof sections)[number]) => (
    <Fragment key={g.id}>
      {fams.map(({ f, only }) => (
        <FamilyTile key={f.id} family={f} only={only.length < f.variants.length ? only : undefined} open={!!query || open === f.id} onToggle={() => setOpen(open === f.id ? null : f.id)} onPick={(v) => startVariant(f, v)} />
      ))}
      {tiles.map((d) => (
        <button key={d.type} className="tile" title={`${d.label}: ${d.description}`} onClick={() => startWith(d.type)}>
          <Icon type={d.type} hole={false} />
          <span>{d.label}</span>
        </button>
      ))}
    </Fragment>
  );
  /** A main category: a tile with its icon, name and number of elements, opening smoothly. */
  const category = (id: string, label: string, icon: string | React.ReactNode, count: number, groups: number, body: React.ReactNode) => {
    const isOpen = shown(id);
    return (
      <section key={id} className="cat">
        <button
          className={isOpen ? 'cat-tile open' : 'cat-tile'}
          onClick={() => toggleCat(id)}
          aria-expanded={isOpen}
          title={`${label}: ${count} ${elements(count)}${groups > 1 && groups !== count ? ` w ${groups} grupach` : ''}. Kliknij, żeby ${isOpen ? 'zwinąć' : 'rozwinąć'}.`}
        >
          {typeof icon === 'string' ? <Icon type={icon} hole={false} /> : icon}
          <span className="cat-name">{label}</span>
          <span className="count">{count}</span>
          <span className="chev">▾</span>
        </button>
        <Expand open={isOpen}>
          <div className="grid cat-grid">{body}</div>
        </Expand>
      </section>
    );
  };
  return (
    <aside className="library" ref={ref}>
      <input className="lib-search" placeholder={tab === 'tech' ? 'Szukaj projektu albo części…' : 'Szukaj elementu…'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
      {wizItems.length > 0 &&
        category(
          'proj:wizards',
          'Kreatory',
          <span className="cat-ico"><WizardIcon size={22} /></span>,
          wizItems.length,
          wizItems.length,
          wizItems.map((i) => itemTile(i, `wiz:${i.label}`, false)),
        )}
      {tab === 'tech' && (
        <div className="lib-mode" role="tablist">
          <button role="tab" aria-selected={mode === 'projects'} className={mode === 'projects' ? 'on' : ''} onClick={() => setMode('projects')} title="Gotowe rzeczy według miejsca: dom, kuchnia, ogród, warsztat…">
            <ReadyIcon size={14} /> Projekty
          </button>
          <button role="tab" aria-selected={mode === 'parts'} className={mode === 'parts' ? 'on' : ''} onClick={() => setMode('parts')} title="Części techniczne: pojemniki, listwy i łączniki, śruby, zawiasy, zębatki, sprężyny, uszczelki">
            Części
          </button>
        </div>
      )}

      {figs.length > 0 &&
        category(
          'figs',
          'Żebrowana kolekcja',
          'figurine',
          figs.length,
          figs.length,
          figs.map((id) => (
            <button key={id} className="tile fig" title={FIG_MODELS[id].desc} onClick={() => (startNew(), addFigurine(id))}>
              <Icon type="figurine" hole={false} />
              <span>{FIG_MODELS[id].n}</span>
            </button>
          )),
        )}
      {xmas.length > 0 &&
        category(
          'xmas',
          'Święta: etykieta, czubek, foremki, taca',
          'xmasTopper',
          xmas.length,
          xmas.length,
          xmas.map((id) => (
            <button key={id} className="tile fig" title={FIG_MODELS[id].desc} onClick={() => (startNew(), addFigurine(id))}>
              <Icon type={XMAS_ICON[id] ?? 'figurine'} hole={false} />
              <span>{FIG_MODELS[id].n}</span>
            </button>
          )),
        )}
      {projectsOn && query && projHits.length > 0 && category('proj:search', 'Projekty', projHits[0].icon, projHits.length, projHits.length, projHits.map((i) => itemTile(i, i.label)))}
      {projectsOn &&
        !query &&
        USE_CATS.map((c) => {
          const items = itemsIn(c.id).filter((i) => i.kind !== 'wizard');
          if (!items.length) return null;
          return category(`proj:${c.id}`, c.label, c.icon, items.length, items.length, items.map((i) => itemTile(i, `${c.id}:${i.label}`)));
        })}
      {partsOn && tab === 'tech' && query && <div className="lib-head">Części</div>}
      {partsOn &&
        groups.map((x) =>
          category(
            `${tab}:t:${x.g.id}`,
            x.g.label,
            x.fams[0]?.f.icon ?? x.tiles[0].type,
            x.fams.reduce((n, f) => n + f.only.length, 0) + x.tiles.length,
            x.fams.length + x.tiles.length,
            sectionBody(x),
          ),
        )}
      {card && <ModelCard item={card.item} top={card.top} left={card.left} />}
      {nothing && <p className="lib-empty">Nic nie pasuje do „{q}”.</p>}
      <LibraryResize />
    </aside>
  );
}

const elements = (n: number) => (n === 1 ? 'element' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'elementy' : 'elementów');

/** Content that slides open and shut (the grid row grows from 0 to its natural height). */
function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={open ? 'expand open' : 'expand'} inert={!open}>
      <div className="expand-in">{children}</div>
    </div>
  );
}

const LIB_W_KEY = 'modelowanie3d.libraryWidth';
const setLibWidth = (w: number) => document.documentElement.style.setProperty('--lib-w', `${w}px`);
try {
  const w = Number(localStorage.getItem(LIB_W_KEY));
  if (w >= 200 && w <= 440) setLibWidth(w);
} catch {
  /* storage unavailable */
}

/** Drag the library's right edge to make it wider or narrower (double click: back to default). */
function LibraryResize() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const top = () => ref.current && document.documentElement.style.setProperty('--lib-top', `${ref.current.parentElement!.getBoundingClientRect().top}px`);
    top();
    window.addEventListener('resize', top);
    return () => window.removeEventListener('resize', top);
  }, []);
  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const lib = (e.currentTarget as HTMLElement).parentElement!;
    const x0 = e.clientX, w0 = lib.getBoundingClientRect().width;
    let w = w0;
    const move = (ev: PointerEvent) => {
      w = Math.round(Math.min(440, Math.max(200, w0 + ev.clientX - x0)));
      setLibWidth(w);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      try {
        localStorage.setItem(LIB_W_KEY, String(w));
      } catch {
        /* storage unavailable */
      }
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const reset = () => {
    document.documentElement.style.removeProperty('--lib-w');
    try {
      localStorage.removeItem(LIB_W_KEY);
    } catch {
      /* storage unavailable */
    }
  };
  return <div ref={ref} className="lib-resize" onPointerDown={start} onDoubleClick={reset} title="Przeciągnij, żeby poszerzyć panel (dwuklik: domyślna szerokość)" />;
}

const CLOSED_KEY = 'modelowanie3d.closedCategories';
/** Lower case without Polish diacritics, for the library search. */
const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');

/** A family of ready elements: a click on the tile opens its variants; a click on a variant starts a new project from it. */
function FamilyTile({ family, open, onToggle, only, onPick }: { family: Family; open: boolean; onToggle: () => void; only?: Family['variants']; onPick: (v: Family['variants'][number]) => void }) {
  return (
    <>
      <div className={open ? 'tile family open' : 'tile family'}>
        <button className="fam-main" title={open ? 'Zwiń' : `${family.label}: pokaż ${family.variants.length} odmian`} onClick={onToggle} aria-expanded={open}>
          <Icon type={family.icon} hole={false} />
          <span>{family.label}</span>
        </button>
        <button className="fam-more" onClick={onToggle} aria-expanded={open} title={open ? 'Zwiń' : `Pokaż ${family.variants.length} odmian`}>
          <span className="count">{(only ?? family.variants).length}</span>
          <span className="chev">▾</span>
        </button>
      </div>
      <Expand open={open}>
        <div className="variants">
          {(only ?? family.variants).map((v) => (
            <button key={v.label} className="variant pick" title={`${v.label}: ${v.hint ?? DEFS[v.type].description}`} onClick={() => onPick(v)}>
              <span className="vname">
                <Icon type={v.type} hole={false} />
                <span>{v.label}</span>
              </span>
              <span className="chip main">+</span>
            </button>
          ))}
        </div>
      </Expand>
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
  const [limit, setLimit] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => setText(String(value)), [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const commit = (raw: string) => {
    let v = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(v)) return setText(String(value));
    // Out of range: the nearest allowed value, and a short note saying why.
    const want = v;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (v !== want) {
      setLimit(`${v > want ? 'min.' : 'maks.'} ${String(v).replace('.', ',')}${unit ? ` ${unit}` : ''}`);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setLimit(null), 2200);
    }
    if (v !== value) onChange(v);
    setText(String(v));
  };
  return (
    <span className="num">
      {limit && <span className="num-limit">{limit}</span>}
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

/** One size: the exact value typed in the field, or set smoothly with the slider under it. */
export function SizeRow({ label, hint, value, min, max, step = 1, unit, onChange, onStart, onLive, hoverKey }: {
  label: string;
  /** Parameter key: hovering the row lights up its handle on the model, and the other way round. */
  hoverKey?: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  /** Slider drag: called once when it starts, then on every move (no history per step). */
  onStart?: () => void;
  onLive?: (v: number) => void;
}) {
  const dragging = useRef(false);
  const hovered = useStore((s) => !!hoverKey && s.dimHover === hoverKey);
  const setDimHover = useStore((s) => s.setDimHover);
  return (
    <div className={hovered ? 'size-row hot' : 'size-row'} title={hint} onMouseEnter={() => hoverKey && setDimHover(hoverKey)} onMouseLeave={() => hoverKey && setDimHover(null)}>
      <label className="field">
        <span>{label}</span>
        <NumberInput value={value} min={min} max={max} step={step} unit={unit} onChange={onChange} />
      </label>
      <input
        type="range"
        className="size-slider"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        style={{ '--p': `${max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0}%` } as React.CSSProperties}
        onPointerDown={() => {
          if (onLive && !dragging.current) {
            dragging.current = true;
            onStart?.();
          }
        }}
        onPointerUp={() => (dragging.current = false)}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (dragging.current && onLive) onLive(v);
          else onChange(v);
        }}
      />
    </div>
  );
}

function ParamField({ def, value, onChange, onStart, onLive }: { def: ParamDef; value: unknown; onChange: (v: number | string | boolean) => void; onStart?: () => void; onLive?: (v: number) => void }) {
  if (def.type === 'number')
    return <SizeRow label={def.label} hint={def.hint} value={Number(value)} min={def.min} max={def.max} step={def.step ?? 1} unit={def.unit} onChange={onChange} onStart={onStart} onLive={onLive} hoverKey={def.key} />;
  return (
    <label className="field" title={def.hint}>
      <span>{def.label}</span>
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
  const wz = part.wiz && WIZARDS[part.wiz.w] ? part.wiz : undefined;
  if (wz) {
    out.push(b(`✎ Edytuj w kreatorze „${WIZARDS[wz.w].label}”`, () => st.openWizard({ id: wz.w, values: wz.recipe?.values, run: wz.run }), INFO.wizard));
    out.push(b('📖 Instrukcja projektu', () => st.setManual(true), INFO.manual));
  }
  if (part.type === 'cabinet') out.push(b('+ Dodaj dopasowane szuflady', () => st.addDrawers(part.id), INFO.drawers));
  if (part.type === 'box') out.push(b('+ Dodaj pasującą pokrywkę', () => st.addLid(part.id), INFO.lid));
  if (part.type === 'box' && part.params.shape === 'round' && !part.params.screw) out.push(b('+ Gwint i zakręcana pokrywka z uszczelką', () => st.makeJar(part.id), INFO.jar));
  if (part.type === 'box' && part.params.shape === 'round' && part.params.screw && !st.parts.some((p) => p.type === 'gasket' && p.fitTo === part.id))
    out.push(b('+ Dodaj płaską uszczelkę', () => st.addGasket(part.id), INFO.jar));
  if (part.type === 'threadHole' || part.type === 'threadNut') out.push(b('+ Dodaj pasującą śrubę', () => st.matchingBolt(part.id), INFO.bolt));
  if (part.type === 'gear' || part.type === 'rack') out.push(b('+ Dodaj pasującą zębatkę', () => st.matingGear(part.id, 'gear'), INFO.mateGear));
  if (part.type === 'gear' && part.params.kind === 'spur') out.push(b('+ Dodaj listwę zębatą', () => st.matingGear(part.id, 'rack'), INFO.mateGear));
  if (part.type === 'bevelGear') out.push(b('+ Dodaj pasującą zębatkę stożkową', () => st.matingGear(part.id, 'bevel'), INFO.mateGear));
  if (part.type === 'worm') out.push(b('+ Dodaj ślimacznicę', () => st.matingGear(part.id, 'wheel'), INFO.mateGear));
  if (part.type === 'wormWheel') out.push(b('+ Dodaj ślimak', () => st.matingGear(part.id, 'worm'), INFO.mateGear));
  const driver = part.gearMate ? st.parts.find((p) => p.id === part.gearMate!.of) : undefined;
  if (driver) out.push(b(`⛓ Odepnij od „${driver.name}”`, () => st.update(part.id, { gearMate: undefined }), INFO.mateGear));
  if (driver && driver.type === 'gear' && part.type === 'gear')
    out.push(
      <label key="mate-angle" className="field">
        <span>Położenie wokół pary</span>
        <NumberInput value={part.gearMate!.angle} min={-360} max={360} step={15} unit="°" onChange={(angle) => st.update(part.id, { gearMate: { of: driver.id, angle } })} />
      </label>,
    );
  if (part.type === 'text' && !st.parts.some((p) => p.body === part.body && p.bend)) {
    // Wrap around the largest round part in the model, otherwise a 40 mm cylinder (changed in Gięcie).
    const round = st.parts.filter((p) => !p.hole && ['cylinder', 'tube', 'pipeEnd', 'rod'].includes(p.type)).sort((a, c) => Number(c.params.D) - Number(a.params.D))[0];
    const D = round ? Number(round.params.D) : 40;
    out.push(b(`↪ Owiń napis na walec (Ø ${D} mm)`, () => st.setBend(part.id, { ...DEFAULT_BEND, axis: 'x', dir: 'down', D, luz: 0 }), INFO.wrapText));
  }
  if (part.type === 'bolt') {
    out.push(b('+ Dodaj pasującą nakrętkę', () => st.matchingNut(part.id), INFO.nut));
    out.push(b('+ Dodaj pasujący otwór z gwintem', () => st.matchingThreadHole(part.id), INFO.threadHole));
  }
  if (part.type === 'pipeFitting' || part.type === 'profileFitting') {
    const has = st.parts.some((p) => p.armOf?.of === part.id);
    const what = part.type === 'profileFitting' ? 'profile' : 'rury';
    out.push(b(has ? `↻ Wstaw pasujące ${what} od nowa` : `+ Dodaj pasujące ${what}`, () => st.matchingPipes(part.id), INFO.pipes));
  }
  if (part.type === 'tube')
    out.push(
      b('⇄ Końce A i B do łączników (gwint, bagnet, klik)', () =>
        st.update(part.id, {
          type: 'pipeEnd',
          name: part.name,
          params: { ...Object.fromEntries(DEFS.pipeEnd.params.map((d) => [d.key, d.def])), std: 'custom', D: part.params.D, T: part.params.T, L: part.params.H, end: 'socket', bell: 'none' },
        }), INFO.pipeEnds),
    );
  if (part.type === 'pipeEnd' || part.type === 'tube' || part.type === 'rhs') out.push(<FitPipeTo key="fit-pipe" part={part} />);
  if (part.type === 'oring' || ((part.type === 'pipeFitting') && part.params.oring === 'yes'))
    out.push(b('+ Dodaj o-ring do druku', () => st.addOrings(part.id), INFO.oringPart));
  const armFit = part.armOf ? st.parts.find((p) => p.id === part.armOf!.of) : undefined;
  if (armFit) {
    out.push(b(`→ Przejdź do łącznika „${armFit.name}”`, () => st.select(armFit.id), INFO.armOf));
    out.push(b('⛓ Odepnij od łącznika', () => st.update(part.id, { armOf: undefined }), INFO.armOf));
  }
  const fitBox = part.fitTo ? st.parts.find((p) => p.id === part.fitTo) : undefined;
  if (fitBox && part.type !== 'boxHinge') out.push(b(`⛓ Odłącz od pudełka „${fitBox.name}”`, () => st.unfitLid(part.id), INFO.lidFit));
  if (part.hole && !isMerged(st.parts, part.body) && st.parts.some((p) => p.body === part.body && !p.hole))
    out.push(b(`⧉ Pokaż gotowy element (bryła ${part.body})`, () => st.merge(part.body), INFO.merge));
  if (!out.length) return null;
  return (
    <div className="quick">
      <h4>Szybkie akcje</h4>
      {out}
    </div>
  );
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

const ROUND_TYPES = new Set(['cylinder', 'tube', 'rod', 'cone', 'pipeEnd']);
const PLAIN_FACES: PlainFace[] = ['top', 'bottom', 'front', 'back', 'left', 'right'];
const SLOT_LETTERS = 'ABCDEFGH';

/** Pattern, relief and spacing of one texture. */
function TextureSettings({ t, onChange }: { t: Texture; onChange: (patch: Partial<Texture>) => void }) {
  const n = (key: keyof Texture, label: string, min: number, max: number, step: number, unit?: string) => (
    <label className="field">
      <span>{label}</span>
      <NumberInput value={Number(t[key])} min={min} max={max} step={step} unit={unit} onChange={(v) => onChange({ [key]: v })} />
    </label>
  );
  return (
    <div className="tex-set">
      <label className="field">
        <span>Wzór</span>
        <select value={t.pattern} onChange={(e) => onChange({ pattern: e.target.value as Texture['pattern'], mode: e.target.value === 'grooves' ? 'cut' : t.mode })}>
          {Object.entries(TEXTURE_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {t.pattern !== 'grooves' && (
        <label className="field">
          <span>Relief</span>
          <select value={t.mode} onChange={(e) => onChange({ mode: e.target.value as Texture['mode'] })}>
            <option value="add">Wypukły</option>
            <option value="cut">Wklęsły (wycięty)</option>
          </select>
        </label>
      )}
      {n('depth', t.mode === 'add' && t.pattern !== 'grooves' ? 'Wysokość' : 'Głębokość', 0.2, 10, 0.1, 'mm')}
      {n('spacing', 'Odstęp', 0.8, 50, 0.2, 'mm')}
      {n('angle', 'Kierunek (0° = pionowo)', -180, 180, 15, '°')}
      {n('margin', 'Margines od krawędzi', 0, 50, 0.5, 'mm')}
    </div>
  );
}

/**
 * Textures of a part: shared textures A, B, C… set once, and a list of faces where each picks one of them
 * (or its own settings). With `face` it shows just that face (picked by a double click).
 */
function TextureTool({ part, face: fixed }: { part: Part; face?: TextureFace }) {
  const setTextures = useStore((s) => s.setTextures);
  const setFaceHover = useStore((s) => s.setFaceHover);
  const picked = useStore((s) => (s.faceSel?.id === part.id ? s.faceSel.face : null));
  const list = texturesOf(part);
  const [edit, setEdit] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // A face picked by a double click: its row comes into view.
  useEffect(() => {
    if (picked && !fixed) box.current?.querySelector(`[data-face="${picked}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [picked, fixed]);
  const slots = [...new Set(list.map((t) => t.slot).filter((x): x is string => !!x))].sort();
  const def = (slot: string) => list.find((t) => t.slot === slot)!;
  const save = (next: Texture[]) => setTextures(part.id, next);
  const on = (face: TextureFace) => list.find((t) => t.face === face);
  const assign = (face: TextureFace, value: string) => {
    const rest = list.filter((t) => t.face !== face);
    const cur = on(face);
    if (value === 'none') return save(rest);
    if (value === 'own') return;
    if (value.startsWith('new:')) {
      const letter = [...SLOT_LETTERS].find((l) => !slots.includes(l)) ?? 'Z';
      const pattern = value.slice(4) as Texture['pattern'];
      save([...rest, { ...(cur ?? DEFAULT_TEXTURE), pattern, mode: pattern === 'grooves' ? 'cut' : (cur?.mode ?? 'add'), face, slot: letter }]);
      return;
    }
    save([...rest, { ...def(value), face, slot: value }]);
  };
  const editSlot = (slot: string, patch: Partial<Texture>) => save(list.map((t) => (t.slot === slot ? { ...t, ...patch } : t)));
  const editFace = (face: TextureFace, patch: Partial<Texture>) => save(list.map((t) => (t.face === face ? { ...t, ...patch } : t)));
  const faces: TextureFace[] = fixed
    ? [fixed]
    : [
        ...PLAIN_FACES,
        ...(ROUND_TYPES.has(part.type) || part.params.shape === 'round' || on('around') ? (['around'] as TextureFace[]) : []),
        ...list.filter((t) => t.face.startsWith('n:')).map((t) => t.face),
      ];
  const label = (face: TextureFace) => (face.startsWith('n:') ? `Skośna ${list.filter((t) => t.face.startsWith('n:')).findIndex((t) => t.face === face) + 1}` : FACE_LABELS[face as PlainFace].replace(' (walec, rura)', ''));
  const front = on('front');

  const row = (face: TextureFace) => {
    const t = on(face);
    const value = t ? (t.slot ?? 'own') : 'none';
    const own = !!t && !t.slot;
    const open = edit === `face:${face}` || (!!fixed && !!t);
    return (
      <div key={face} className={picked === face ? 'tex-row on' : 'tex-row'} onMouseEnter={() => setFaceHover({ id: part.id, face })} onMouseLeave={() => setFaceHover(null)} data-face={face}>
        <div className="tex-line">
          <span className="tex-face">{label(face)}</span>
          <select value={value} onChange={(e) => assign(face, e.target.value)}>
            <option value="none">Gładka</option>
            {slots.map((sl) => (
              <option key={sl} value={sl}>
                {sl}: {TEXTURE_LABELS[def(sl).pattern]}
              </option>
            ))}
            {own && <option value="own">Własna: {TEXTURE_LABELS[t!.pattern]}</option>}
            <optgroup label={`+ Nowa faktura ${[...SLOT_LETTERS].find((l) => !slots.includes(l)) ?? ''}`}>
              {Object.entries(TEXTURE_LABELS).map(([k, l]) => (
                <option key={k} value={`new:${k}`}>
                  {l}
                </option>
              ))}
            </optgroup>
          </select>
          {t && !fixed && (
            <button
              className={open ? 'mini on' : 'mini'}
              title={t.slot ? `Własne ustawienia tej ścianki (odłącza ją od faktury ${t.slot})` : 'Ustawienia faktury tej ścianki'}
              onClick={() => {
                if (t.slot) editFace(face, { slot: undefined });
                setEdit(open ? null : `face:${face}`);
              }}
            >
              ⚙
            </button>
          )}
        </div>
        {open && t && (
          <>
            {t.slot && <p className="desc">Zmiana zmienia fakturę {t.slot} na wszystkich jej ściankach.</p>}
            <TextureSettings t={t} onChange={(patch) => (t.slot ? editSlot(t.slot, patch) : editFace(face, patch))} />
          </>
        )}
      </div>
    );
  };

  return (
    <div className="tool">
      {!fixed && (
        <>
          <p className="desc">Ustaw fakturę raz jako A, B, C i wybieraj ją przy ściankach. Dwuklik w ściankę modelu pokazuje ją na liście.</p>
          {slots.length > 0 && (
            <div className="tex-slots">
              {slots.map((sl) => (
                <div key={sl} className="tex-slot">
                  <button className={edit === sl ? 'chip on' : 'chip'} onClick={() => setEdit(edit === sl ? null : sl)} title="Ustawienia tej faktury">
                    <b>{sl}</b> {TEXTURE_LABELS[def(sl).pattern]} ✎
                  </button>
                  <span className="desc">{list.filter((t) => t.slot === sl).map((t) => label(t.face)).join(', ')}</span>
                  {edit === sl && <TextureSettings t={def(sl)} onChange={(patch) => editSlot(sl, patch)} />}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div className="tex-rows" ref={box}>
        {faces.map(row)}
      </div>
      {!fixed && list.length > 0 && (
        <div className="row">
          {front && (
            <button className="small" title="Przód, tył i oba boki z tą samą fakturą co przód" onClick={() => save([...list.filter((t) => !['back', 'left', 'right'].includes(t.face)), ...(['back', 'left', 'right'] as TextureFace[]).map((f) => ({ ...front, face: f }))])}>
              Wszystkie boki jak przód
            </button>
          )}
          <button className="small" onClick={() => (save([]), setEdit(null))}>
            Wyczyść
          </button>
        </div>
      )}
    </div>
  );
}

/** A label on the picked wall of the part's body. */
function LabelTool({ part, side }: { part: Part; side: WallSide }) {
  const addLabel = useStore((s) => s.addLabel);
  const [text, setText] = useState('');
  const [cut, setCut] = useState(true);
  return (
    <div className="tool">
      <label className="field">
        <span>Tekst</span>
        <input className="textin" value={text} maxLength={40} placeholder="np. ŚRUBY M3" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </label>
      <label className="field">
        <span>Litery</span>
        <select value={cut ? 'cut' : 'add'} onChange={(e) => setCut(e.target.value === 'cut')}>
          <option value="cut">Wycięte</option>
          <option value="add">Wypukłe</option>
        </select>
      </label>
      <button className="action" disabled={!text.trim()} onClick={() => (addLabel(part.id, side, text, cut), setText(''))}>
        + Dodaj napis na tej ściance
      </button>
    </div>
  );
}

/** Options of the face picked by a double click: texture, label and magnets right there. */
function FaceSection({ part }: { part: Part }) {
  const fs = useStore((s) => s.faceSel);
  const setFaceSel = useStore((s) => s.setFaceSel);
  if (!fs || fs.id !== part.id) return null;
  const off = opOff(part, 'texture');
  const name = fs.face ? faceLabel(fs.face).replace(' (walec, rura)', '') : 'zakrzywiona';
  return (
    <div className="facesel">
      <div className="facesel-head">
        <span>
          ▣ Wybrana ścianka: <b>{name}</b>
        </span>
        <button className="mini" onClick={() => setFaceSel(null)} title="Zamknij (dwuklik w inną ściankę wybiera ją)">
          ✕
        </button>
      </div>
      <h5>Faktura</h5>
      {off ? <p className="desc">{off.why}</p> : fs.face ? <TextureTool part={part} face={fs.face} /> : <p className="desc">Fakturę kładę na płaskich ściankach (także skośnych) i bokach walców, a ta ścianka jest zakrzywiona.</p>}
      {fs.side && !part.hole && (
        <>
          <h5>Napis</h5>
          <LabelTool part={part} side={fs.side} />
          <h5>Magnesy</h5>
          <FaceMagnetTool key={fs.side} part={part} face={fs.side} />
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

/** Rarely changed fields (gaps, thread fit, per-arm ends…) go under "Więcej wymiarów". */
const MORE_KEYS = new Set(['luz', 'fit', 'fw', 'chamfer']);
const isMore = (p: ParamDef) => !!p.more || MORE_KEYS.has(p.key) || /^e\d$/.test(p.key);

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

/** An operation's section; greyed out (with the reason and what to use instead) when it makes no sense for the element. */
function OpSection({ part, op, title, info, open, children }: { part: Part; op: Op; title: string; info?: string; open?: boolean; children?: React.ReactNode }) {
  const off = opOff(part, op);
  if (!off)
    return (
      <Section title={title} open={open} info={info}>
        {children}
      </Section>
    );
  return (
    <details className="section off">
      <summary title={`Niedostępne: ${off.why}${off.use ? ` Zamiast: ${off.use}` : ''}`}>
        {title} <span className="off-tag">niedostępne</span>
      </summary>
      <p className="off-why">
        {off.why}
        {off.use && (
          <>
            {' '}
            <b>Zamiast:</b> {off.use}
          </>
        )}
      </p>
    </details>
  );
}

/** Warning when a whole-body operation would spoil a thread, gear or hinge in that body. */
function Risk({ body, op }: { body: number; op: 'bend' | 'xform' | 'split' }) {
  const parts = useStore((s) => s.parts);
  const text = bodyRisk(parts, body, op);
  return text ? <p className="warn-line">⚠ {text}</p> : null;
}

const FACES: [FaceMagnetOptions['face'], string][] = [
  ['bottom', 'Spód'],
  ['top', 'Góra'],
  ['front', 'Przód'],
  ['back', 'Tył'],
  ['left', 'Lewy bok'],
  ['right', 'Prawy bok'],
];

/** Magnet pockets in one face of any element: a plate on a fridge, a figurine's base, blocks that snap together. */
function FaceMagnetTool({ part, face }: { part: Part; face?: FaceMagnetOptions['face'] }) {
  const add = useStore((s) => s.addFaceMagnets);
  const [opt, setOpt] = useState<FaceMagnetOptions>({ size: '6x3', face: face ?? 'bottom', layout: part.type === 'figurine' ? 'center' : 'corners', n: 3, margin: 2 });
  const set = (p: Partial<FaceMagnetOptions>) => setOpt((o) => ({ ...o, ...p }));
  return (
    <div className="tool">
      {!face && <p className="desc">Kieszenie na magnesy w wybranej ściance bryły. Gniazdo, które wypadłoby poza materiał (np. na krzywiźnie), zostanie pominięte.</p>}
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
      {!face && <label className="field">
        <span>Ścianka</span>
        <select value={opt.face} onChange={(e) => set({ face: e.target.value as FaceMagnetOptions['face'] })}>
          {FACES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>}
      <label className="field">
        <span>Ile i gdzie</span>
        <select value={opt.layout} onChange={(e) => set({ layout: e.target.value as FaceMagnetOptions['layout'] })}>
          <option value="center">1 na środku</option>
          <option value="corners">4 w narożnikach</option>
          <option value="row">Rząd wzdłuż dłuższego boku</option>
        </select>
      </label>
      {opt.layout === 'row' && (
        <label className="field">
          <span>Liczba w rzędzie</span>
          <NumberInput value={opt.n} min={2} max={20} onChange={(n) => set({ n })} />
        </label>
      )}
      {opt.layout !== 'center' && (
        <label className="field">
          <span>Odsunięcie od krawędzi</span>
          <NumberInput value={opt.margin} min={1.2} max={100} step={0.5} unit="mm" onChange={(margin) => set({ margin })} />
        </label>
      )}
      <button className="action" onClick={() => add(part.body, opt)}>
        + Dodaj gniazda na magnesy
      </button>
    </div>
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

/** One row per end of the element (A, B, C…), its letter lit up on the model while pointed at. */
function EndsSection({ part, fields }: { part: Part; fields: ParamDef[] }) {
  const st = useStore();
  const setHover = useStore((s) => s.setEndHover);
  useEffect(() => () => setHover(null), [setHover]);
  const sel = fields.filter((f): f is Extract<ParamDef, { type: 'select' }> => f.type === 'select');
  const fit = part.armOf?.role === 'pipe' ? st.parts.find((p) => p.id === part.armOf!.of) : undefined;
  const a = sel[0];
  const likeA = () => {
    const v = String(part.params[a.key]);
    const plainA = a.options[0].value;
    const next = { ...part.params };
    for (const f of sel.slice(1)) {
      if (f.options.some((o) => o.value === 'same')) next[f.key] = 'same';
      else if (f.options.some((o) => o.value === v)) next[f.key] = v;
      else if (v === plainA) next[f.key] = f.options[0].value;
    }
    st.update(part.id, { params: next });
  };
  return (
    <div className="ends">
      <h5>
        Końce <Info text={INFO.ends} />
      </h5>
      {fit && <p className="desc">Koniec A dobiera się sam do ramienia {'ABCDEF'[part.armOf!.i]} łącznika „{fit.name}”.</p>}
      {sel.map((f) => {
        const rest = f.label.replace(/^Koniec [A-F]\s*/, '');
        return (
          <label key={f.key} className="field end-row" title={f.hint} onMouseEnter={() => setHover(f.end!)} onMouseLeave={() => setHover(null)}>
            <span>
              <b className="end-letter">{f.end}</b> {rest}
            </span>
            <select value={String(part.params[f.key] ?? f.def)} onFocus={() => setHover(f.end!)} onBlur={() => setHover(null)} onChange={(e) => st.update(part.id, { params: { ...part.params, [f.key]: e.target.value } })}>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {sel.length > 1 && (
        <button className="small" onClick={likeA} title="Pozostałe końce dostają to samo co koniec A">
          Wszystkie jak A
        </button>
      )}
    </div>
  );
}

/** Puts a pipe or profile into a chosen arm of a fitting in the model, with the matching end. */
function FitPipeTo({ part }: { part: Part }) {
  const st = useStore();
  const square = part.type === 'rhs';
  const fits = st.parts.filter((p) => p.type === (square ? 'profileFitting' : 'pipeFitting'));
  if (!fits.length) return null;
  const opts = fits.flatMap((f) => {
    const geo = fittingGeo(f.params, square);
    return geo.dirs.map((_, i) => {
      const taken = st.parts.find((p) => p.id !== part.id && p.armOf?.of === f.id && p.armOf.i === i && p.armOf.role === 'pipe');
      const closed = geo.ends[i] === 'closed';
      return { value: `${f.id}:${i}`, label: `${f.name}, ramię ${'ABCDEF'[i]}${closed ? ' (zaślepione)' : taken ? ' (zajęte)' : ''}`, off: closed };
    });
  });
  const now = part.armOf?.role === 'pipe' ? `${part.armOf.of}:${part.armOf.i}` : '';
  return (
    <label className="field" title={INFO.fitPipe}>
      <span>
        ⇄ Dopasuj do łącznika <Info text={INFO.fitPipe} />
      </span>
      <select
        value={now}
        onChange={(e) => {
          const [id, i] = e.target.value.split(':');
          if (id) st.fitPipeTo(part.id, id, Number(i));
        }}
      >
        <option value="">wybierz ramię…</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value} disabled={o.off}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
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
  const ends = fields.filter((p) => p.end && p.type === 'select');
  const main = fields.filter((p) => !p.end && !isMore(p));
  const more = fields.filter((p) => !p.end && isMore(p));
  const groups = groupFields(fields.filter((p) => !p.end));
  const field = (p: ParamDef, sub?: string | null) => (
    <div key={p.key}>
      {!groups && p.group && <h5>{p.group}</h5>}
      <ParamField
        def={groups ? { ...p, label: shortLabel(p.label, sub ?? null) } : p}
        value={part.params[p.key]}
        onChange={(v) => st.update(part.id, { params: { ...part.params, [p.key]: v } })}
        onStart={() => st.beginGesture()}
        onLive={(v) => {
          const cur = useStore.getState().parts.find((x) => x.id === part.id);
          if (cur) st.updateLive(part.id, { params: { ...cur.params, [p.key]: v } });
        }}
      />
    </div>
  );
  const [noteFor, setNoteFor] = useState<string | null>(null);
  // Extra sizes open by default; folding them is remembered for all parts.
  const [moreOpen, setMoreOpenState] = useState(() => {
    try {
      return localStorage.getItem('modelowanie3d.moreDims') !== 'closed';
    } catch {
      return true;
    }
  });
  const setMoreOpen = (v: boolean) => {
    setMoreOpenState(v);
    try {
      localStorage.setItem('modelowanie3d.moreDims', v ? 'open' : 'closed');
    } catch {
      /* not stored */
    }
  };
  const showNote = !!part.note || noteFor === part.id;
  const wiz = part.wiz && WIZARDS[part.wiz.w];
  const status = [];
  if (part.locked)
    status.push(
      <div key="lock" className="linkbar">
        🔒 Zablokowany: nie przesuniesz go ani nie usuniesz.
        <button className="small" onClick={() => st.setFlags([part.id], { locked: false })}>
          Odblokuj
        </button>
      </div>,
    );
  if (linked > 0 || patterned > 0)
    status.push(
      <div key="link" className="linkbar">
        🔗 {linked > 0 ? `Powiązany z ${linked} ${linked === 1 ? 'kopią' : 'kopiami'}: zmiana wymiarów zmienia wszystkie.` : ''}
        {patterned > 0 && ` Szyk (${PATTERN_LABEL[part.pattern!.kind]}): przesuń ten element, a ${patterned === 1 ? 'druga kopia przesunie się' : `${patterned} pozostałe przesuną się`} ${part.pattern!.kind === 'linear' ? 'razem z nim' : 'symetrycznie'}.`}
        <button className="small" onClick={() => st.unlink(part.id)}>
          Odłącz
        </button>
      </div>,
    );
  if (pieces > 1) status.push(<div key="set" className="linkbar">🧩 Część zestawu ({pieces} elementy): przesuwają się razem, a zmiana wymiarów dotyczy wszystkich.</div>);
  if (wiz) status.push(<div key="wiz" className="linkbar"><WizardIcon size={14} /> Z kreatora „{wiz.label}”{part.wiz!.role ? `, część ${part.wiz!.role}` : ''}.</div>);
  def.notes?.(part.params).forEach((n, i) =>
    status.push(
      <div key={`note${i}`} className={n.level === 'ok' ? 'linkbar' : 'warn-line'}>
        {n.level === 'error' ? '⛔' : n.level === 'warn' ? '⚠' : '✓'} {n.text}
      </div>,
    ),
  );
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
        <Info text={def.description} />
        {!showNote && (
          <button className="small ghost" title="Notatka trafi do Instrukcji projektu" onClick={() => setNoteFor(part.id)}>
            + Notatka
          </button>
        )}
      </div>
      {showNote && (
        <textarea
          className="note"
          rows={2}
          autoFocus={!part.note}
          placeholder="Notatka do instrukcji"
          value={part.note ?? ''}
          onChange={(e) => st.updateLive(part.id, { note: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
        />
      )}
      <FaceSection part={part} />
      {status.length > 0 && <div className="statusbar">{status}</div>}
      <Helpers part={part} />

      <h4>
        Wymiary <Info text={INFO.dims} />
      </h4>
      {groups && <DimGroups type={part.type} groups={groups} field={field} />}
      {!groups && main.map((p) => field(p))}
      {!groups && more.length > 0 && (
        <details className="more-dims" open={moreOpen} onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>
            Wymiary dodatkowe <Info text={INFO.moreDims} />
          </summary>
          {more.map((p) => field(p))}
        </details>
      )}
      {ends.length > 0 && <EndsSection part={part} fields={ends} />}
      {part.type === 'figurine' && FIG_MODELS[String(part.params.model)]?.tune && (
        <div className="row">
          <NumberInput value={height} min={30} max={300} unit="mm" onChange={setHeight} />
          <button className="small" onClick={() => st.fitFigurine(part.id, height)} title="Dobiera suwak wysokości tak, by cała figurka miała podaną wysokość">
            Całość na {height} mm
          </button>
        </div>
      )}
      {(part.type === 'box' || part.type === 'drawer') && (
        <Section title="▦ Układ przegródek" info={INFO.dividers} open={typeof part.params.div === 'string' && part.params.div.length > 0}>
          <DividerEditor part={part} />
        </Section>
      )}
      {part.type === 'connector' && <ConnectorWalls part={part} />}

      {/* Every element lists the same operations in the same order; the ones that make no sense for it are greyed out. */}
      <OpSection part={part} op="magnets" title="🧲 Miejsca na magnesy" info={INFO.magnets}>
        {part.type === 'box' || part.type === 'lid' ? <MagnetTool target={part.id} body={part.body} /> : <FaceMagnetTool part={part} />}
      </OpSection>
      <OpSection part={part} op="infill" title="▦ Wypełnienie (ażur)" open={st.parts.some((p) => p.body === part.body && p.infill)} info={INFO.infill}>
        <InfillTool body={part.body} prefer={part.id} />
      </OpSection>
      <OpSection part={part} op="texture" title="Faktura powierzchni" open={texturesOf(part).length > 0} info={INFO.texture}>
        <TextureTool part={part} />
      </OpSection>

      <h4>
        Wydruk <Info text={INFO.print} />
      </h4>
      <label className="field" title="Wyłączona część zostaje w podglądzie jako półprzezroczysta, ale nie trafia do eksportu, instrukcji ani wyliczeń.">
        <span>Drukuj tę część</span>
        <input type="checkbox" checked={!part.noPrint} onChange={(e) => st.setFlags([groupId(part.body)], { noPrint: !e.target.checked })} />
      </label>
      {!part.hole && (
        <label className="field">
          <span>Kolor</span>
          <input type="color" value={part.color} onChange={(e) => st.update(part.id, { color: e.target.value })} />
        </label>
      )}

      <div className="row end">
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

/** "Wypełnienie": a see-through pattern cut into the whole body, with a solid frame. */
function InfillTool({ body, prefer }: { body: number; prefer?: string }) {
  const st = useStore();
  const solids = st.parts.filter((p) => p.body === body && !p.hole);
  const holder = solids.find((p) => p.infill) ?? solids.find((p) => p.id === prefer) ?? solids[0];
  const saved = useInfillSaving(body, !!holder?.infill?.on);
  if (!holder) return null;
  const f = holder.infill;
  const set = (patch: Partial<Infill>) => st.setInfill(holder.id, { ...(f ?? DEFAULT_INFILL), ...patch });
  return (
    <div className="tool">
      <label className="field">
        <span>Wzór</span>
        <select value={f ? f.pattern : 'off'} onChange={(e) => (e.target.value === 'off' ? st.setInfill(holder.id, undefined) : set({ pattern: e.target.value as Infill['pattern'], on: true }))}>
          <option value="off">Pełne (bez ażuru)</option>
          {Object.entries(LATTICE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {f && (
        <>
          <label className="field">
            <span>Kierunek</span>
            <select value={f.axis} onChange={(e) => set({ axis: e.target.value as Infill['axis'] })}>
              <option value="z">Z góry (płyta, dno)</option>
              <option value="x">Na wylot X (ścianki lewa/prawa)</option>
              <option value="y">Na wylot Y (ścianki przód/tył)</option>
            </select>
          </label>
          <label className="field">
            <span>Wielkość oczka</span>
            <NumberInput value={f.cell} min={3} max={200} step={1} unit="mm" onChange={(cell) => set({ cell })} />
          </label>
          <label className="field">
            <span>Grubość żebra</span>
            <NumberInput value={f.rib} min={0.8} max={50} step={0.2} unit="mm" onChange={(rib) => set({ rib })} />
          </label>
          <label className="field">
            <span>Pełna ramka</span>
            <NumberInput value={f.margin} min={0.4} max={100} step={0.5} unit="mm" onChange={(margin) => set({ margin })} />
          </label>
          <label className="field">
            <span>Rodzaj</span>
            <select value={f.mode} onChange={(e) => set({ mode: e.target.value as Infill['mode'] })}>
              <option value="through">Otwory na wylot</option>
              <option value="pocket">Kieszenie od spodu</option>
            </select>
          </label>
          {f.mode === 'pocket' && (
            <label className="field">
              <span>Głębokość kieszeni</span>
              <NumberInput value={f.depth} min={0.2} max={500} step={0.2} unit="mm" onChange={(depth) => set({ depth })} />
            </label>
          )}
          <label className="field">
            <span>Pokaż pełną (do edycji)</span>
            <input type="checkbox" checked={!f.on} onChange={(e) => set({ on: !e.target.checked })} />
          </label>
          {saved !== null && <p className="desc">Oszczędność materiału: ok. {saved}% objętości.</p>}
          <p className="desc">Przy krawędziach i wokół otworów, magnesów i gwintów zostaje pełna ramka. Żebro co najmniej 0,8 mm (2 ścieżki dyszy 0,4).</p>
        </>
      )}
    </div>
  );
}

/** Percent of volume the pattern removes from the body (null while off). */
function useInfillSaving(body: number, on: boolean): number | null {
  const parts = useStore((s) => s.parts);
  return useMemo(() => {
    if (!on) return null;
    try {
      const members = parts.filter((p) => p.body === body);
      const plain = members.map((p) => (p.infill ? { ...p, infill: undefined } : p));
      const a = buildBodies(members)[0]?.manifold.volume() ?? 0;
      const b = buildBodies(plain)[0]?.manifold.volume() ?? 0;
      return b > 0 ? Math.max(0, Math.round((1 - a / b) * 100)) : null;
    } catch {
      return null;
    }
  }, [parts, body, on]);
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
        <Risk body={body} op="split" />
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
      <Section title="▦ Wypełnienie (ażur)" open={members.some((p) => p.infill)} info={INFO.infill}>
        <InfillTool body={body} />
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
  if (s.some((p) => p.infill?.on)) out.push('ażur');
  const x = s.find((p) => xformActive(p.xform))?.xform;
  if (x && x.mirror !== 'none') out.push('odbita');
  if (x && x.scale.some((v) => v !== 100)) out.push('skala');
  return out.length ? out.join(', ') : 'złączona';
}

/** Size of a printed body and whether it fits the bed (turned flat by 90° if that helps). */
export function bodyFit(parts: Part[], body: number, bed: Vec3) {
  const b = bodyBox(parts, body);
  const size = b.isEmpty() ? [0, 0, 0] : b.getSize(new THREE.Vector3()).toArray().map((v) => Math.round(v * 10) / 10);
  const [x, y, z] = size;
  const fits = z <= bed[2] + 0.01 && ((x <= bed[0] + 0.01 && y <= bed[1] + 0.01) || (x <= bed[1] + 0.01 && y <= bed[0] + 0.01));
  return { size, fits };
}

const mmTxt = (v: number[]) => v.map((x) => String(Math.round(x)).replace('.', ',')).join(' × ');

/** The printer of the whole page (top bar): its bed, and live whether every printed part fits it. */
export function PrinterPicker() {
  const printer = useStore((s) => s.printer);
  const bed = useStore((s) => s.bed);
  const setPrinter = useStore((s) => s.setPrinter);
  const parts = useStore((s) => s.parts);
  const own = !PRINTERS[printer] && printer !== 'none';
  const bad = printer === 'none' ? [] : [...new Set(printable(parts).map((p) => p.body))]
    .map((b) => ({ b, fit: bodyFit(parts, b, bed) }))
    .filter((x) => !x.fit.fits)
    .map((x) => `${mainOf(parts, x.b)?.name ?? 'część'} (${mmTxt(x.fit.size)} mm)`);
  return (
    <div className="printer-pick">
      <label title="Drukarka dla całej strony: wymiary zatrzymują się na granicy jej stołu, kreatory i eksport 3MF też z niej korzystają. „Bez limitu” wyłącza ograniczenie.">
        <ToolIcon id="printer" />
        <select value={own ? 'own' : printer} onChange={(e) => (e.target.value === 'own' || e.target.value === 'none' ? setPrinter(e.target.value, bed) : setPrinter(e.target.value, PRINTERS[e.target.value].bed))}>
          {Object.entries(PRINTERS).map(([k, pr]) => (
            <option key={k} value={k} title={`Stół ${mmTxt(pr.bed)} mm`}>
              {pr.label}
            </option>
          ))}
          <option value="own">Własna…</option>
          <option value="none">Bez limitu</option>
        </select>
      </label>
      {own && (
        <span className="bed-own" title="Stół własnej drukarki: szerokość, głębokość, wysokość">
          {(['szer.', 'gł.', 'wys.'] as const).map((l, i) => (
            <NumberInput
              key={l}
              value={bed[i]}
              min={50}
              max={1000}
              unit="mm"
              onChange={(v) => {
                const next = [...bed] as Vec3;
                next[i] = v;
                setPrinter('own', next);
              }}
            />
          ))}
        </span>
      )}
      {parts.length > 0 && printer !== 'none' && (
        <span
          className={bad.length ? 'fit bad' : 'fit ok'}
          title={bad.length ? `Większe niż stół ${mmTxt(bed)} mm: ${bad.join(', ')}. Zmniejsz wymiary albo wybierz większą drukarkę.` : `Wszystkie części mieszczą się na stole ${mmTxt(bed)} mm`}
        >
          {bad.length ? `⚠ Nie mieści się: ${bad.length}` : '✓ Mieści się'}
        </span>
      )}
    </div>
  );
}

/** The sizes of a model in named, foldable groups (folding is remembered per model and group). */
function DimGroups({ type, groups, field }: { type: string; groups: FieldGroup[]; field: (p: ParamDef, sub?: string | null) => React.ReactNode }) {
  const KEY = 'modelowanie3d.dimGroups';
  const [closed, setClosed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]');
    } catch {
      return [];
    }
  });
  const toggle = (id: string, open: boolean) => {
    const next = open ? closed.filter((x) => x !== id) : [...new Set([...closed, id])];
    setClosed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* not stored */
    }
  };
  return (
    <div className="dim-groups">
      {groups.map((g) => {
        const id = `${type}/${g.name}`;
        return (
          <details key={g.name} className="dim-group" open={!closed.includes(id)} onToggle={(e) => toggle(id, (e.currentTarget as HTMLDetailsElement).open)}>
            <summary>
              {g.name} <span className="count">{g.count}</span>
            </summary>
            {g.subs.map((s) => (
              <div key={s.name ?? ''} className={s.name ? 'dim-sub' : undefined}>
                {s.name && <h5>{s.name}</h5>}
                {s.fields.map((p) => field(p, s.name ?? g.name))}
              </div>
            ))}
          </details>
        );
      })}
    </div>
  );
}

/** Always-visible list of the printed parts of the model, each with its „drukuj” switch. */
function Outliner() {
  const parts = useStore((s) => s.parts);
  const selectedId = useStore((s) => s.selectedId);
  const hoveredId = useStore((s) => s.hoveredId);
  const select = useStore((s) => s.select);
  const setHover = useStore((s) => s.setHover);
  const setFlags = useStore((s) => s.setFlags);
  const bed = useStore((s) => s.bed);
  const bodies = [...new Set(parts.map((p) => p.body))].sort((a, b) => a - b);
  if (!parts.length) return null;
  const selBody = parts.find((p) => p.id === selectedId)?.body ?? groupBody(selectedId);
  const hovBody = parts.find((p) => p.id === hoveredId)?.body ?? groupBody(hoveredId);
  const off = bodies.filter((b) => parts.some((p) => p.body === b && p.noPrint)).length;
  return (
    <div className="outliner" onMouseLeave={() => setHover(null)}>
      <h4>
        Części do druku{' '}
        <span className="muted">
          {bodies.length - off} z {bodies.length}
        </span>
      </h4>
      <ul className="print-list">
        {bodies.map((b) => {
          const main = mainOf(parts, b);
          if (!main) return null;
          const on = !parts.some((p) => p.body === b && p.noPrint);
          return (
            <li key={b} className={`${selBody === b ? 'sel' : ''} ${hovBody === b ? 'hov' : ''} ${on ? '' : 'is-off'}`} onMouseEnter={() => setHover(main.id)} onClick={() => select(main.id)}>
              <input
                type="checkbox"
                checked={on}
                title={on ? 'Drukuj (odznacz, żeby pominąć tę część)' : 'Nie drukuj (zaznacz, żeby wrócić)'}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setFlags([groupId(b)], { noPrint: !e.target.checked })}
              />
              <span className="dot" style={{ background: main.color }} />
              <span className="label">{main.name}</span>
              {on && !bodyFit(parts, b, bed).fits && (
                <span className="nofit" title="Nie mieści się na stole drukarki">
                  ⚠
                </span>
              )}
            </li>
          );
        })}
      </ul>
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
          <li>Pobierz <b>STL/3MF</b>: każda część jest osobnym wydrukiem.</li>
        </ol>
      ) : (
        <ol>
          <li>Wybierz gotowy model w <b>Projektach</b> albo w <b>Częściach technicznych</b>, albo zacznij od <b><WizardIcon size={14} /> Kreatora</b>.</li>
          <li>Dopasuj wymiary: wpisz liczbę albo przesuń suwak. Na komputerze możesz też chwycić strzałkę wymiaru na modelu.</li>
          <li>Wybierz opcje: fakturę, napis, magnesy, kolor.</li>
          <li>Odznacz części, których nie chcesz drukować.</li>
          <li>Kliknij <b>Sprawdź model</b>, potem pobierz <b>STL/3MF</b>.</li>
        </ol>
      )}
    </div>
  );
}

/** Right panel; on a phone its two halves live in separate tabs of the bottom sheet. */
export function Properties({ show = 'all' }: { show?: 'all' | 'list' | 'props' }) {
  const picked = useStore((s) => s.parts.find((p) => p.id === s.selectedId));
  // A magnet pocket or a label picked on the model belongs to its part: show that part.
  const part = useStore((s) => (picked && REMOVED_TYPES.has(picked.type) && !picked.wiz ? mainOf(s.parts, picked.body) : picked));
  const body = useStore((s) => {
    const gb = groupBody(s.selectedId);
    return gb !== null && s.parts.some((p) => p.body === gb) ? gb : null;
  });
  const empty = useStore((s) => !s.parts.length);
  const multi = useStore((s) => s.multi);
  const sel = useStore((s) => s.selectedId);
  const picks = null as string[] | null;
  void multi;
  void sel;
  // A body picked on the model shows the part it is known by.
  const main = useStore((s) => (body !== null ? mainOf(s.parts, body) : undefined));
  return (
    <aside className="properties">
      {show !== 'props' && <CheckPanel />}
      {show !== 'props' && <Outliner />}
      {show === 'list' && empty && <p className="desc pad">Projekt jest pusty. Dodaj element w zakładce ➕ Dodaj albo użyj kreatora.</p>}
      {show === 'list' ? null : picks ? <MultiProperties ids={picks} /> : part ? <PartProperties key={part.id} part={part} /> : main ? <PartProperties key={main.id} part={main} /> : empty ? <Welcome /> : <p className="desc pad">Kliknij element w modelu albo na liście, żeby zmienić jego wymiary.</p>}
    </aside>
  );
}
