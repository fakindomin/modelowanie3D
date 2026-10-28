import { useEffect, useRef } from 'react';
import { Viewport } from './scene/Viewport';
import { Library, Properties } from './ui/Panels';
import { MeasurePanel } from './ui/MeasurePanel';
import { useStore } from './store';
import { buildBodies } from './geom/parts';
import { export3MF, exportSTL, saveJSON } from './export';
import type { Part, Project, Tab } from './types';

function projectOf(): Project {
  const s = useStore.getState();
  const of = (t: Tab): Part[] => (s.tab === t ? s.parts : s.stash[t].parts);
  return { version: 2, tech: of('tech'), fig: of('fig') };
}

function Toolbar() {
  const st = useStore();
  const file = useRef<HTMLInputElement>(null);

  const exportAs = (fmt: 'stl' | '3mf') => {
    const bodies = buildBodies(st.parts);
    if (!bodies.length) return st.notify('Brak brył do eksportu. Dodaj jakiś element.');
    (fmt === 'stl' ? exportSTL : export3MF)(bodies, st.tab === 'fig' ? 'figurki' : 'model');
    bodies.forEach((b) => {
      b.geometry.dispose();
      b.manifold.delete();
    });
    st.notify(`Wyeksportowano ${bodies.length} ${bodies.length === 1 ? 'bryłę' : 'bryły'} do ${fmt.toUpperCase()}.`);
  };

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
      <div className="group">
        <button onClick={st.undo} disabled={!st.past.length} title="Cofnij (Ctrl+Z)">↶ Cofnij</button>
        <button onClick={st.redo} disabled={!st.future.length} title="Ponów (Ctrl+Y)">↷ Ponów</button>
      </div>
      <div className="group">
        <button onClick={() => { st.reset(); st.notify('Scena wyczyszczona. „Cofnij” przywróci poprzedni model.'); }}>Nowy</button>
        <button onClick={() => file.current?.click()}>Otwórz</button>
        <button onClick={() => saveJSON(JSON.stringify(projectOf(), null, 1), 'projekt')}>Zapisz</button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              st.load(JSON.parse(await f.text()) as Project);
            } catch {
              st.notify('Nie udało się wczytać pliku projektu.');
            }
          }}
        />
      </div>
      <div className="group">
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
        <label className="check" title="Przyciąganie ścianek do sąsiednich elementów (przytrzymaj Alt, by chwilowo wyłączyć)">
          <input type="checkbox" checked={st.settings.snap} onChange={(e) => st.setSettings({ snap: e.target.checked })} /> Przyciąganie
        </label>
        <label className="check" title="Przeciągany element kładzie się na tym, co jest pod nim (przytrzymaj Shift, by chwilowo wyłączyć)">
          <input type="checkbox" checked={st.settings.stick} onChange={(e) => st.setSettings({ stick: e.target.checked })} /> Kładź na wierzchu
        </label>
      </div>
      <div className="group">
        <button onClick={st.fit} title="Pokaż cały model (F)">⤢ Widok całości</button>
        <button className={st.measure ? 'toggle on' : 'toggle'} onClick={() => st.setMeasure(!st.measure)} title="Najedź na ściankę lub krawędź, żeby zobaczyć jej wymiary; kliknij dwa elementy, żeby zmierzyć odległość (W)">
          📏 Wymiary
        </button>
      </div>
      <div className="group right">
        <button className={st.preview ? 'toggle on' : 'toggle'} onClick={() => st.setPreview(!st.preview)} title="Pokazuje wynik po wycięciu otworów i sklejeniu brył">
          {st.preview ? '✓ Podgląd wydruku' : 'Podgląd wydruku'}
        </button>
        <button onClick={() => st.runCheck()} title="Szuka nachodzących brył, za cienkich ścianek i otworów, które nic nie wycinają">Sprawdź model</button>
        <button className="primary" onClick={() => exportAs('stl')}>Eksport STL</button>
        <button className="primary" onClick={() => exportAs('3mf')}>Eksport 3MF</button>
      </div>
    </header>
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
function CornerSuggest() {
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
  return (
    <div className="app">
      <Toolbar />
      <Library />
      <main className="viewport">
        <Viewport />
        <div className="help">
          Kliknij ponownie, by wybrać to, co leży pod spodem (np. otwór w bryle) · Przeciągnij: przesuń · Tło: obrót widoku · Prawy: przesuń widok · Kółko: zoom · Strzałki/PgUp/PgDn · R: obróć · Shift: bez kładzenia · Alt: bez przyciągania
        </div>
        {toast && <div className="toast">{toast}</div>}
        <MeasurePanel />
        <CornerSuggest />
      </main>
      <Properties />
    </div>
  );
}
