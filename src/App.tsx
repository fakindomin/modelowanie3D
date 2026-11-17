import { printable } from './simple';
import { swietaFileName } from './figurines/swieta';
import { useEffect, useRef, useState } from 'react';
import { Viewport } from './scene/Viewport';
import { LogoMark, StateIcon, ToolIcon, WizardIcon } from './ui/KindIcons';
import { Library, Outliner, PrinterPicker, Properties } from './ui/Panels';
import { WIZARDS } from './wizards';
import { mainOf } from './simple';
import { MeasurePanel } from './ui/MeasurePanel';
import { WizardDialog } from './ui/WizardDialog';
import { Manual } from './ui/Manual';
import { isLocked, loadBed, useStore } from './store';
import { buildBodies, built } from './geom/parts';
import * as THREE from 'three';
import { type ColoredBody, export3MF, exportSTL, groupPrintWith, saveJSON } from './export';
import { bestPose, keepsPose, turnManifold } from './geom/orient';
import { DEFS } from './catalog';
import { makeManual } from './manual';
import { encodeMeshes } from './geom/meshes';
import type { Part, Project, Tab } from './types';
import { MobileApp, useMobile } from './ui/Mobile';
import { ReviewBar, useReview } from './ui/Review';
import { MotionBar, ZoneTip } from './ui/MotionBar';

function projectOf(): Project {
  const s = useStore.getState();
  const of = (t: Tab): Part[] => (s.tab === t ? s.parts : s.stash[t].parts);
  const tech = of('tech'), fig = of('fig');
  const refs = new Set([...tech, ...fig].filter((p) => p.type === 'mesh').map((p) => String(p.params.ref)));
  return { version: 2, tech, fig, ...(refs.size ? { meshes: encodeMeshes(refs) } : {}) };
}

/** Bodies of the parts ready to print: each in its own print frame and in the pose needing the least support. */
export function printBodies(parts: Part[]) {
  let bodies: ColoredBody[] = buildBodies(parts);
  // Each body is named after its biggest solid part (the one the user knows it by).
  const names = new Map<number, string>();
  const mains = new Map<number, Part>();
  for (const b of bodies) {
    const solids = parts.filter((p) => p.body === b.body && !p.hole);
    const main = solids.reduce<(typeof solids)[number] | undefined>((a, p) => (!a || built(p).box.getSize(new THREE.Vector3()).length() > built(a).box.getSize(new THREE.Vector3()).length() ? p : a), undefined);
    if (!main) continue;
    names.set(b.body, main.name);
    mains.set(b.body, main);
    // Printed as designed: the part's own frame (pipes standing, fittings on an arm, clips flat), not as turned in the assembly.
    if (main.rotation.some((r) => r)) {
      const inv = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(main.rotation.map((r) => (r * Math.PI) / 180) as [number, number, number]))).invert();
      const turned = b.manifold.transform(inv.elements as unknown as Parameters<typeof b.manifold.transform>[0]);
      b.manifold.delete();
      b.manifold = turned;
    }
  }
  // Each body in the pose that needs the least support (kept as designed unless another pose clearly saves supports).
  let turnedN = 0;
  for (const b of bodies) {
    // A piece can name its own print pose (a lid printed top-down); that beats the automatic one.
    const own = parts.find((p) => p.body === b.body && !p.hole && DEFS[p.type]?.printTurn?.(p.params));
    const turn = own && DEFS[own.type].printTurn!(own.params);
    if (turn) {
      const t = turnManifold(b.manifold, turn);
      b.manifold.delete();
      b.manifold = t;
      turnedN++;
      continue;
    }
    if (keepsPose(parts.filter((p) => p.body === b.body && !p.hole))) continue;
    const pose = bestPose(b.manifold);
    if (!pose) continue;
    const t = turnManifold(b.manifold, pose.turn);
    b.manifold.delete();
    b.manifold = t;
    turnedN++;
  }
  // A piece that prints with another (the lid's inlay) joins that body as a second coloured part.
  const info = new Map<number, { group: string; piece: string; printWith?: string; name: string }>();
  for (const [body, m] of mains) {
    const pd = DEFS[m.type]?.pieces?.find((x) => x.value === m.params.piece);
    info.set(body, { group: m.rigid ?? '', piece: String(m.params.piece ?? ''), printWith: pd?.printWith, name: pd?.label ?? m.name });
  }
  bodies = groupPrintWith(bodies, info);
  return { bodies, names, turnedN };
}

/** File, export and other project-wide actions shared by the desktop toolbar and the phone menu. */
export function useProjectActions() {
  const st = useStore();
  const file = useRef<HTMLInputElement>(null);
  const exportAs = (fmt: 'stl' | '3mf', fileName?: string) => {
    const { bodies, names, turnedN } = printBodies(printable(st.parts));
    if (!bodies.length) return st.notify('Brak brył do eksportu. Dodaj jakiś element.');
    // Jeden świąteczny element (etykieta, czubek, foremka): plik nazwany od niego, np. „Dla Ania.stl”.
    const base = fileName ?? (st.tab === 'fig' ? swietaFileName(printable(st.parts)) : null) ?? (st.tab === 'fig' ? 'figurki' : 'model');
    // STL: one file per kind of print (as in the manual: number, name, how many to print), not one per copy.
    let out = bodies;
    let plateN = 0;
    const items = makeManual(printable(st.parts)).items;
    if (fmt === '3mf') {
      // Each material on its own plates (PETG clips, TPU seals, PLA the rest).
      const groups = new Map<number, string>();
      for (const it of items) for (const b of it.bodies) groups.set(b, it.material);
      const bed = loadBed();
      plateN = export3MF(bodies, base, names, false, [bed[0], bed[1]], new Set(groups.values()).size > 1 ? groups : new Map());
    } else {
      out = items.flatMap((it) => {
        const b = bodies.find((x) => x.body === it.bodies[0]);
        if (!b) return [];
        names.set(b.body, `${/^\d+$/.test(it.no) ? it.no.padStart(2, '0') : it.no} ${it.name}${it.qty > 1 ? ` x${it.qty}` : ''}`);
        return [b];
      });
      exportSTL(out, base, names, true);
    }
    bodies.forEach((b) => {
      b.geometry.dispose();
      b.manifold.delete();
    });
    const hidden = st.parts.filter((p) => p.hidden).length;
    st.notify(
      (fmt === 'stl' && bodies.length > 1
        ? `Wyeksportowano ${out.length} ${out.length === 1 ? 'rodzaj części' : 'rodzajów części'} (${bodies.length} wydruków): każdy rodzaj raz, w osobnym pliku STL, w nazwie numer z Instrukcji i ile sztuk wydrukować („x4”).${hidden ? ' Ukryte elementy też są w plikach.' : ''}`
        : fmt === '3mf'
          ? `Wyeksportowano ${bodies.length} ${bodies.length === 1 ? 'część' : 'części'} do 3MF na ${plateN} ${plateN === 1 ? 'stole' : 'stołach'} (stół ${loadBed()[0]} × ${loadBed()[1]} mm z ustawień, każdy materiał osobno). ${plateN > 1 ? 'Każdy stół to osobny plik 3MF w archiwum .zip: otwórz jeden plik na jedną płytę.' : ''}${hidden ? ' Ukryte elementy też są w pliku.' : ''}`
          : `Wyeksportowano ${bodies.length} ${bodies.length === 1 ? 'bryłę' : 'bryły'} do ${fmt.toUpperCase()}.${hidden ? ' Ukryte elementy też są w pliku.' : ''}`) +
        (turnedN ? ` ${turnedN === 1 ? 'Jedną część obrócono' : `Obrócono ${turnedN} części`} na stole tak, żeby potrzebowały jak najmniej podpór.` : ''),
    );
  };
  const fresh = () => {
    st.reset();
    st.notify('Scena wyczyszczona. „Cofnij” przywróci poprzedni model.');
  };
  const open = () => file.current?.click();
  const save = () => saveJSON(JSON.stringify(projectOf(), null, 1), 'projekt');
  const manual = () => (st.parts.length ? st.setManual(true) : st.notify('Model jest pusty. Dodaj elementy albo użyj kreatora.'));
  const input = (
    <input
      ref={file}
      type="file"
      accept=".json,application/json"
      hidden
      onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (/\.stl$/i.test(f.name)) return st.notify('Pliki STL nie są tu edytowane: wybierz gotowy model albo kreator i dopasuj jego wymiary.');
        try {
          st.load(JSON.parse(await f.text()) as Project);
        } catch {
          st.notify('Nie udało się wczytać pliku projektu.');
        }
      }}
    />
  );
  return { exportAs, fresh, open, save, manual, input };
}

const REVIEW_ON = typeof location !== 'undefined' && /przeglad/.test(location.search + location.hash);

function Toolbar() {
  const st = useStore();
  const review = useReview();
  const act = useProjectActions();

  return (
    <header className="toolbar">
      <a className="brand" href="#start" title="Strona startowa: gotowe projekty i kreatory">
        <LogoMark className="logo" /> <span className="brand-name">Modelowanie 3D</span>
      </a>
      <div className="tabs" role="tablist">
        {(['tech', 'fig'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={st.tab === t} className={st.tab === t ? 'on' : ''} onClick={() => st.setTab(t)}>
            {t === 'tech' ? 'Techniczne' : 'Figurki'}
          </button>
        ))}
      </div>
      <span className="sep" />
      <div className="group">
        <button onClick={st.undo} disabled={!st.past.length} title="Cofnij (Ctrl+Z)" aria-label="Cofnij"><ToolIcon id="undo" /></button>
        <button onClick={st.redo} disabled={!st.future.length} title="Ponów (Ctrl+Y)" aria-label="Ponów"><ToolIcon id="redo" /></button>
      </div>
      <span className="sep" />
      <FileMenu act={act} />
      <div className="group right">
        <PrinterPicker />
        {/* Model review (internal): opened with ?przeglad in the address. */}
        {REVIEW_ON && (
          <button className={review.open ? 'toggle on' : 'toggle'} onClick={() => review.setOpen(!review.open)} title="Przegląd: wszystkie elementy po kolei, każdy z 3MF do slicera i oceną OK / do zmiany z uwagą">
            🔍 Przegląd
          </button>
        )}
        <button onClick={() => st.runCheck()} title="Szuka nachodzących brył, za cienkich ścianek i otworów, które nic nie wycinają"><ToolIcon id="check" /> Sprawdź model</button>
        <button onClick={act.manual} title="Co wydrukować, co kupić, co do czego pasuje i jak złożyć. Do wydruku albo PDF">
          <ToolIcon id="manual" /> Instrukcja
        </button>
        <ExportMenu onGo={act.exportAs} />
      </div>
    </header>
  );
}

/** Closes a drop-down on a click elsewhere or Esc. */
function useDismiss(open: boolean, close: () => void) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', out);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', out);
      window.removeEventListener('keydown', key);
    };
  }, [open, close]);
  return box;
}

/** „Plik ▾”: Nowy, Otwórz, Zapisz. */
function FileMenu({ act }: { act: ReturnType<typeof useProjectActions> }) {
  const [open, setOpen] = useState(false);
  const box = useDismiss(open, () => setOpen(false));
  const run = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <div className="drop" ref={box}>
      <button className={open ? 'toggle on' : 'toggle'} onClick={() => setOpen(!open)} aria-expanded={open}>
        Plik <span className="caret">▾</span>
      </button>
      {open && (
        <div className="drop-pop" role="menu">
          <button role="menuitem" onClick={run(act.fresh)}><ToolIcon id="new" /> Nowy</button>
          <button role="menuitem" onClick={run(act.open)} title="Otwiera zapisany projekt (.json)"><ToolIcon id="open" /> Otwórz</button>
          <button role="menuitem" onClick={run(act.save)}><ToolIcon id="save" /> Zapisz</button>
        </div>
      )}
      {act.input}
    </div>
  );
}

/** Tools for looking at the model, as a column of icons on the view's left edge (name on hover). */
function ViewTools() {
  const st = useStore();
  const tools: { id: Parameters<typeof ToolIcon>[0]['id']; label: string; on?: boolean; go: () => void; tip: string }[] = [
    { id: 'fit', label: 'Całość', go: st.fit, tip: 'Pokaż cały model (F)' },
    { id: 'layout', label: 'Ułóż', go: st.layoutOnBed, tip: 'Obraca każdą bryłę tak, żeby potrzebowała jak najmniej podpór, i rozkłada je obok siebie na stole' },
    { id: 'measure', label: 'Wymiary', on: st.measure, go: () => st.setMeasure(!st.measure), tip: 'Najedź na ściankę lub krawędź, żeby zobaczyć jej wymiary; kliknij dwa elementy, żeby zmierzyć odległość (W)' },
    { id: 'section', label: 'Przekrój', on: st.section, go: () => st.setSection(!st.section), tip: 'Ucina przednią połowę zaznaczonej części, żeby zobaczyć wnętrze. Tylko widok, wydruk się nie zmienia.' },
    { id: 'preview', label: 'Podgląd', on: st.preview, go: () => st.setPreview(!st.preview), tip: 'Podgląd wydruku: wynik po wycięciu otworów i sklejeniu brył' },
  ];
  return (
    <div className="view-tools" onPointerDown={(e) => e.stopPropagation()}>
      {tools.map((t) => (
        <button key={t.id} className={t.on ? 'on' : ''} onClick={t.go} aria-label={t.label} aria-pressed={t.on}>
          <ToolIcon id={t.id} size={18} />
          <span className="vt-tip">
            <b>{t.label}</b> {t.tip}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Eksport STL / 3MF: a menu with the parts to print (each can be left out), then the download. */
function ExportMenu({ onGo }: { onGo: (fmt: 'stl' | '3mf') => void }) {
  const [open, setOpen] = useState(false);
  const [fmt, setFmt] = useState<'stl' | '3mf'>('stl');
  const box = useDismiss(open, () => setOpen(false));
  const label = (f: 'stl' | '3mf') => (f === 'stl' ? 'STL' : '3MF');
  return (
    <div className="export-menu" ref={box}>
      <button className="primary" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ToolIcon id="export" /> Eksport <span className="caret">▾</span>
      </button>
      {open && (
        <div className="export-pop" role="dialog" aria-label="Eksport">
          <div className="export-fmt" role="radiogroup" aria-label="Format pliku">
            {(['stl', '3mf'] as const).map((f) => (
              <button key={f} role="radio" aria-checked={fmt === f} className={fmt === f ? 'on' : ''} onClick={() => setFmt(f)}>
                {label(f)}
              </button>
            ))}
          </div>
          <Outliner />
          <div className="row end">
            <button className="small" onClick={() => setOpen(false)}>
              Anuluj
            </button>
            <button
              className="primary"
              onClick={() => {
                onGo(fmt);
                setOpen(false);
              }}
            >
              Pobierz {label(fmt)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Name of the model above the view: the wizard it came from, or the kind of its main part. */
function ModelTitle() {
  const name = useStore((s) => {
    const w = s.parts.find((p) => p.wiz)?.wiz;
    if (w && WIZARDS[w.w]) return WIZARDS[w.w].label;
    const bodies = [...new Set(s.parts.filter((p) => !p.hole).map((p) => p.body))];
    if (!bodies.length) return null;
    const main = mainOf(s.parts, bodies[0]);
    return main ? (DEFS[main.type]?.label ?? main.name) : null;
  });
  if (!name) return null;
  return <div className="model-title">{name}</div>;
}

/** Grid step, snapping and stacking, tucked behind ⚙. */
function Settings() {
  const st = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="settings" ref={ref}>
      <button className={open ? 'toggle on' : 'toggle'} onClick={() => setOpen(!open)} title="Siatka, przyciąganie, kładzenie na wierzchu">
        <StateIcon id="settings" size={16} />
      </button>
      {open && (
        <div className="settings-pop">
          <SettingsFields />
        </div>
      )}
    </div>
  );
}

/** Grid, snapping and stacking controls (⚙ popup on desktop, ⋮ menu on a phone). */
export function SettingsFields() {
  const st = useStore();
  return (
    <>
      <label title="Krok przesuwania">
        Siatka
        <select value={st.settings.grid} onChange={(e) => st.setSettings({ grid: Number(e.target.value) })}>
          <option value={0}>wył.</option>
          <option value={0.5}>0,5 mm</option>
          <option value={1}>1 mm</option>
          <option value={5}>5 mm</option>
          <option value={10}>10 mm</option>
        </select>
      </label>
      <label className="check" title="Przytrzymaj Alt, by chwilowo wyłączyć">
        Przyciąganie do ścianek
        <input type="checkbox" checked={st.settings.snap} onChange={(e) => st.setSettings({ snap: e.target.checked })} />
      </label>
      <label className="check" title="Przytrzymaj Shift, by chwilowo wyłączyć">
        Kładź na wierzchu
        <input type="checkbox" checked={st.settings.stick} onChange={(e) => st.setSettings({ stick: e.target.checked })} />
      </label>
    </>
  );
}

/** Mouse and keyboard hints behind a small "?" in the corner of the scene. */
function Help() {
  const [open, setOpen] = useState(false);
  return (
    <div className={open ? 'help open' : 'help'} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="help-btn" onClick={() => setOpen(!open)} aria-label="Podpowiedzi">
        ?
      </button>
      {open && (
        <div className="help-pop">
          <ul>
            <li><b>Chwyć kropkę</b> na ściance modelu i przeciągnij: zmienia ten wymiar (co 1 mm, z <b>Shift</b> co 0,1 mm, <b>Esc</b> anuluje)</li>
            <li><b>Kliknij kropkę</b>: wpisz dokładną wartość</li>
            <li><b>Dwuklik w ściankę</b>: faktura, napis i magnesy na tej ściance (panel po prawej)</li>
            <li><b>Tło</b>: obrót widoku · <b>prawy przycisk</b>: przesuń widok · <b>kółko</b>: zoom</li>
            <li><b>F</b>: widok całości · <b>W</b>: pomiar · <b>Ctrl+Z / Ctrl+Y</b>: cofnij, ponów</li>
          </ul>
        </div>
      )}
    </div>
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
      const st = useStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const id = st.selectedId;
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
      } else if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if (e.key.toLowerCase() === 'f' && !ctrl) {
        st.fit();
      } else if (e.key.toLowerCase() === 'w' && !ctrl) {
        st.setMeasure(!st.measure);
      } else if (e.key === 'Escape') {
        if (st.measure) {
          if (st.pins.length) st.clearPins();
          else st.setMeasure(false);
        } else st.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** "Skopiować do pozostałych 3 narożników?" after placing an element in a corner of its body. */
export function CornerSuggest() {
  const suggest = useStore((s) => s.suggest);
  const part = useStore((s) => (s.suggest ? s.parts.find((p) => p.id === s.suggest!.id) : undefined));
  const st = useStore.getState();
  if (!suggest || !part) return null;
  return (
    <div className="suggest">
      <span>
        Skopiować „{part.name}” do pozostałych 3 narożników? Odsunięcie od rogu zostanie takie samo, a kopie będą się przesuwać symetrycznie.
      </span>
      <button className="primary" onClick={() => st.pattern(part.id, 'corners', { count: 4, distance: 0, axis: 0, inset: 0, radius: 0 })}>
        Tak, skopiuj
      </button>
      <button onClick={st.dismissSuggest}>Nie</button>
    </div>
  );
}

export function App() {
  useShortcuts();
  useEffect(() => {
    // Frame whatever was restored from the last session.
    const t = setTimeout(() => useStore.getState().fit(), 50);
    return () => clearTimeout(t);
  }, []);
  const toast = useStore((s) => s.toast);
  const mobile = useMobile();
  if (mobile) return <MobileApp />;
  return (
    <div className="app">
      <Toolbar />
      <Library />
      <main className="viewport">
        <Viewport />
        <ModelTitle />
        <ViewTools />
        <Help />
        {toast && <div className="toast">{toast}</div>}
        <MeasurePanel />
        <CornerSuggest />
        <ReviewBar />
        <MotionBar />
        <ZoneTip />
      </main>
      <Properties />
      <WizardDialog />
      <Manual />
    </div>
  );
}
