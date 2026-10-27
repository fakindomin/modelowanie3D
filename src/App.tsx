import { useEffect, useRef } from 'react';
import { Viewport } from './scene/Viewport';
import { Library, Properties } from './ui/Panels';
import { useStore } from './store';
import { buildBodies } from './geom/parts';
import { export3MF, exportSTL, saveJSON } from './export';
import type { Project } from './types';

function Toolbar() {
  const st = useStore();
  const file = useRef<HTMLInputElement>(null);

  const exportAs = (fmt: 'stl' | '3mf') => {
    const bodies = buildBodies(st.parts);
    if (!bodies.length) return st.notify('Brak brył do eksportu. Dodaj jakiś element.');
    (fmt === 'stl' ? exportSTL : export3MF)(bodies, 'model');
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
      <div className="group">
        <button onClick={st.undo} disabled={!st.past.length} title="Cofnij (Ctrl+Z)">↶ Cofnij</button>
        <button onClick={st.redo} disabled={!st.future.length} title="Ponów (Ctrl+Y)">↷ Ponów</button>
      </div>
      <div className="group">
        <button onClick={() => { st.reset(); st.notify('Scena wyczyszczona. „Cofnij” przywróci poprzedni model.'); }}>Nowy</button>
        <button onClick={() => file.current?.click()}>Otwórz</button>
        <button onClick={() => saveJSON(JSON.stringify({ version: 1, parts: st.parts } satisfies Project, null, 1), 'projekt')}>Zapisz</button>
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
      </div>
      <div className="group right">
        <button className={st.preview ? 'toggle on' : 'toggle'} onClick={() => st.setPreview(!st.preview)} title="Pokazuje wynik po wycięciu otworów i sklejeniu brył">
          {st.preview ? '✓ Podgląd wydruku' : 'Podgląd wydruku'}
        </button>
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
        st.duplicate(id);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && id) {
        st.remove(id);
      } else if (e.key.toLowerCase() === 'f' && !ctrl) {
        st.fit();
      } else if (e.key === 'Escape') {
        st.select(null);
      } else if (id && e.key.toLowerCase() === 'r') {
        st.rotateBy(id, 2, e.shiftKey ? -90 : 90);
      } else if (id && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        const p = st.parts.find((x) => x.id === id)!;
        const step = (st.settings.grid || 1) * (e.shiftKey ? 10 : 1);
        const pos = [...p.position] as [number, number, number];
        if (e.key === 'ArrowLeft') pos[0] -= step;
        if (e.key === 'ArrowRight') pos[0] += step;
        if (e.key === 'ArrowUp') pos[1] += step;
        if (e.key === 'ArrowDown') pos[1] -= step;
        if (e.key === 'PageUp') pos[2] += step;
        if (e.key === 'PageDown') pos[2] -= step;
        st.update(id, { position: pos.map((v) => Math.round(v * 1000) / 1000) as [number, number, number] });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
          Przeciągnij element, by go przesunąć · Przeciągnij tło: obrót widoku · Prawy: przesuń widok · Kółko: zoom · Strzałki/PgUp/PgDn: przesuń · R: obróć · Shift: bez kładzenia · Alt: bez przyciągania
        </div>
        {toast && <div className="toast">{toast}</div>}
      </main>
      <Properties />
    </div>
  );
}
