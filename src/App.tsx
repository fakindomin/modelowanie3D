import { useEffect, useRef, useState } from 'react';
import { Viewport } from './scene/Viewport';
import { Library, Properties } from './ui/Panels';
import { MeasurePanel } from './ui/MeasurePanel';
import { WizardDialog } from './ui/WizardDialog';
import { Manual } from './ui/Manual';
import { isLocked, useStore } from './store';
import { buildBodies, built } from './geom/parts';
import * as THREE from 'three';
import { export3MF, exportSTL, saveJSON } from './export';
import { encodeMeshes } from './geom/meshes';
import type { Part, Project, Tab } from './types';
import { MobileApp, useMobile } from './ui/Mobile';

function projectOf(): Project {
  const s = useStore.getState();
  const of = (t: Tab): Part[] => (s.tab === t ? s.parts : s.stash[t].parts);
  const tech = of('tech'), fig = of('fig');
  const refs = new Set([...tech, ...fig].filter((p) => p.type === 'mesh').map((p) => String(p.params.ref)));
  return { version: 2, tech, fig, ...(refs.size ? { meshes: encodeMeshes(refs) } : {}) };
}

/** File, export and other project-wide actions shared by the desktop toolbar and the phone menu. */
export function useProjectActions() {
  const st = useStore();
  const file = useRef<HTMLInputElement>(null);
  const exportAs = (fmt: 'stl' | '3mf') => {
    const bodies = buildBodies(st.parts);
    if (!bodies.length) return st.notify('Brak brył do eksportu. Dodaj jakiś element.');
    // Each body is named after its biggest solid part (the one the user knows it by).
    const names = new Map<number, string>();
    for (const b of bodies) {
      const solids = st.parts.filter((p) => p.body === b.body && !p.hole);
      const main = solids.reduce<(typeof solids)[number] | undefined>((a, p) => (!a || built(p).box.getSize(new THREE.Vector3()).length() > built(a).box.getSize(new THREE.Vector3()).length() ? p : a), undefined);
      if (!main) continue;
      names.set(b.body, main.name);
      // Printed as designed: the part's own frame (pipes standing, fittings on an arm, clips flat), not as turned in the assembly.
      if (main.rotation.some((r) => r)) {
        const inv = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(main.rotation.map((r) => (r * Math.PI) / 180) as [number, number, number]))).invert();
        const turned = b.manifold.transform(inv.elements as unknown as Parameters<typeof b.manifold.transform>[0]);
        b.manifold.delete();
        b.manifold = turned;
      }
    }
    (fmt === 'stl' ? exportSTL : export3MF)(bodies, st.tab === 'fig' ? 'figurki' : 'model', names);
    bodies.forEach((b) => {
      b.geometry.dispose();
      b.manifold.delete();
    });
    const hidden = st.parts.filter((p) => p.hidden).length;
    st.notify(
      fmt === 'stl' && bodies.length > 1
        ? `Wyeksportowano ${bodies.length} części: każda w osobnym pliku STL, razem w archiwum .zip. Każda stoi na stole na środku, slicer sam je rozłoży.${hidden ? ' Ukryte elementy też są w plikach.' : ''}`
        : `Wyeksportowano ${bodies.length} ${bodies.length === 1 ? 'bryłę' : 'bryły'} do ${fmt.toUpperCase()}.${hidden ? ' Ukryte elementy też są w pliku.' : ''}`,
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
      accept=".json,application/json,.stl,model/stl"
      hidden
      onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (/\.stl$/i.test(f.name)) return st.importSTL(f.name, await f.arrayBuffer());
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

function Toolbar() {
  const st = useStore();
  const act = useProjectActions();

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="logo">◆</span> Modelowanie 3D
      </div>
      <div className="tabs" role="tablist">
        {(['tech', 'fig'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={st.tab === t} className={st.tab === t ? 'on' : ''} onClick={() => st.setTab(t)}>
            {t === 'tech' ? 'Techniczne' : 'Figurki'}
          </button>
        ))}
      </div>
      <span className="sep" />
      <div className="group">
        <button onClick={st.undo} disabled={!st.past.length} title="Cofnij (Ctrl+Z)">↶</button>
        <button onClick={st.redo} disabled={!st.future.length} title="Ponów (Ctrl+Y)">↷</button>
      </div>
      <span className="sep" />
      <div className="group">
        <button onClick={act.fresh}>Nowy</button>
        <button onClick={act.open} title="Otwiera zapisany projekt (.json) albo dodaje model z pliku STL">
          Otwórz
        </button>
        <button onClick={act.save}>Zapisz</button>
        {act.input}
      </div>
      <span className="sep" />
      <div className="group">
        <button className="wiz-open" onClick={() => st.openWizard({ id: null })} title="Kreatory projektów: rama, regał… krok po kroku, z modelem na żywo i instrukcją">
          ✨ Kreatory
        </button>
      </div>
      <span className="sep" />
      <div className="group">
        <button onClick={st.fit} title="Pokaż cały model (F)">⤢ Całość</button>
        <button onClick={st.layoutOnBed} title="Ułóż na stole: kładzie każdą bryłę na jej największej płaskiej ściance i rozkłada wszystkie obok siebie na stole drukarki">
          ⊞ Ułóż
        </button>
        <button className={st.measure ? 'toggle on' : 'toggle'} onClick={() => st.setMeasure(!st.measure)} title="Najedź na ściankę lub krawędź, żeby zobaczyć jej wymiary; kliknij dwa elementy, żeby zmierzyć odległość (W)">
          📏 Wymiary
        </button>
        <Settings />
      </div>
      <div className="group right">
        <button className={st.preview ? 'toggle on' : 'toggle'} onClick={() => st.setPreview(!st.preview)} title="Podgląd wydruku: wynik po wycięciu otworów i sklejeniu brył">
          {st.preview ? '✓ Podgląd' : 'Podgląd'}
        </button>
        <button onClick={() => st.runCheck()} title="Szuka nachodzących brył, za cienkich ścianek i otworów, które nic nie wycinają">Sprawdź model</button>
        <button onClick={act.manual} title="Co wydrukować, co kupić, co do czego pasuje i jak złożyć. Do wydruku albo PDF">
          📖 Instrukcja
        </button>
        <button className="primary" onClick={() => act.exportAs('stl')}>Eksport STL</button>
        <button className="primary" onClick={() => act.exportAs('3mf')}>Eksport 3MF</button>
      </div>
    </header>
  );
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
        ⚙
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
            <li><b>Przeciągnij</b> element: przesuń. <b>Shift</b>: bez kładzenia, <b>Alt</b>: bez przyciągania</li>
            <li><b>Kliknij ponownie</b>: wybierz to, co leży pod spodem (np. otwór w bryle)</li>
            <li><b>Dwuklik w ściankę</b>: faktura, napis i magnesy na tej ściance (panel po prawej)</li>
            <li><b>Tło</b>: obrót widoku · <b>prawy przycisk</b>: przesuń widok · <b>kółko</b>: zoom</li>
            <li><b>Strzałki, PgUp/PgDn</b>: przesuń o krok siatki · <b>R</b>: obróć o 90°</li>
            <li><b>F</b>: widok całości · <b>W</b>: wymiary · <b>Ctrl+Z / Ctrl+D / Delete</b></li>
            <li><b>Otwórz</b> wczytuje też plik <b>STL</b>: robisz w nim otwory, napisy, magnesy i go tniesz</li>
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
      const locked = isLocked(st.parts, id);
      const moving = e.key === 'Delete' || e.key === 'Backspace' || e.key.toLowerCase() === 'r' || e.key.startsWith('Arrow') || e.key.startsWith('Page');
      if (locked && moving && !ctrl) {
        if (e.key.startsWith('Arrow') || e.key.startsWith('Page')) e.preventDefault();
        return st.notify('Zaznaczony element jest zablokowany (🔒).');
      }
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
      } else if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if (ctrl && e.key.toLowerCase() === 'd' && id) {
        e.preventDefault();
        if (id.startsWith('g:')) st.duplicateBody(Number(id.slice(2)));
        else st.duplicate(id);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && id) {
        if (id.startsWith('g:')) st.removeBody(Number(id.slice(2)));
        else st.remove(id);
      } else if (e.key.toLowerCase() === 'f' && !ctrl) {
        st.fit();
      } else if (e.key.toLowerCase() === 'w' && !ctrl) {
        st.setMeasure(!st.measure);
      } else if (e.key === 'Escape') {
        if (st.measure) {
          if (st.pins.length) st.clearPins();
          else st.setMeasure(false);
        } else st.select(null);
      } else if (id && e.key.toLowerCase() === 'r') {
        if (id.startsWith('g:')) st.rotateBody(Number(id.slice(2)), 2, e.shiftKey ? -90 : 90);
        else st.rotateBy(id, 2, e.shiftKey ? -90 : 90);
      } else if (id && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        const gb = id.startsWith('g:') ? Number(id.slice(2)) : null;
        const p = gb !== null ? (st.parts.find((x) => x.body === gb && !x.hole) ?? st.parts.find((x) => x.body === gb)) : st.parts.find((x) => x.id === id);
        if (!p) return;
        const step = (st.settings.grid || 1) * (e.shiftKey ? 10 : 1);
        const pos = [...p.position] as [number, number, number];
        if (e.key === 'ArrowLeft') pos[0] -= step;
        if (e.key === 'ArrowRight') pos[0] += step;
        if (e.key === 'ArrowUp') pos[1] += step;
        if (e.key === 'ArrowDown') pos[1] -= step;
        if (e.key === 'PageUp') pos[2] += step;
        if (e.key === 'PageDown') pos[2] -= step;
        const next = pos.map((v) => Math.round(v * 1000) / 1000) as [number, number, number];
        if (gb !== null) st.moveBody(gb, next);
        else st.update(id, { position: next });
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
        <Help />
        {toast && <div className="toast">{toast}</div>}
        <MeasurePanel />
        <CornerSuggest />
      </main>
      <Properties />
      <WizardDialog />
      <Manual />
    </div>
  );
}
