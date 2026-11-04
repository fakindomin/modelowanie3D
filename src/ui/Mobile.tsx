import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Viewport } from '../scene/Viewport';
import { Library, Properties } from './Panels';
import { MeasurePanel } from './MeasurePanel';
import { WizardDialog } from './WizardDialog';
import { Manual } from './Manual';
import { CornerSuggest, SettingsFields, useProjectActions } from '../App';
import { groupBody, isLocked, useStore } from '../store';
import type { Tab } from '../types';

/** Phones, and tablets held upright: the scene fills the screen and the panels slide up from the bottom. */
const PHONE = '(max-width: 760px), (pointer: coarse) and (orientation: portrait) and (max-width: 1100px)';

const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE) : null;
const subscribe = (cb: () => void) => {
  query?.addEventListener('change', cb);
  return () => query?.removeEventListener('change', cb);
};

export function useMobile() {
  return useSyncExternalStore(subscribe, () => !!query?.matches);
}

type Sheet = 'add' | 'list' | 'props';
type Size = 'closed' | 'half' | 'full';

const SHEETS: { id: Sheet | 'wiz'; icon: string; label: string }[] = [
  { id: 'add', icon: '➕', label: 'Dodaj' },
  { id: 'wiz', icon: '✨', label: 'Kreatory' },
  { id: 'list', icon: '☰', label: 'Elementy' },
  { id: 'props', icon: '⚙', label: 'Właściwości' },
];

export function MobileApp() {
  const st = useStore();
  const toast = useStore((s) => s.toast);
  const [sheet, setSheet] = useState<Sheet>('props');
  const [size, setSize] = useState<Size>('closed');
  const [menu, setMenu] = useState(false);

  // A part picked from "Dodaj" lands in the scene: close the sheet so it can be seen and placed.
  const sel = useStore((s) => s.selectedId);
  const count = useStore((s) => s.parts.length);
  const last = useRef({ sel, count });
  useEffect(() => {
    if (sheet === 'add' && size !== 'closed' && count > last.current.count) setSize('closed');
    last.current = { sel, count };
  }, [sel, count, sheet, size]);

  const openSheet = (id: Sheet) => {
    if (id === sheet && size !== 'closed') return setSize('closed');
    setSheet(id);
    setSize(id === 'add' ? 'full' : 'half');
  };

  return (
    <div className={`app mobile sheet-${size}`}>
      <MobileBar menu={menu} setMenu={setMenu} />
      <main className="viewport">
        <Viewport />
        {toast && <div className="toast">{toast}</div>}
        <MeasurePanel />
        <CornerSuggest />
        {size === 'closed' && <SelectionChip onProps={() => openSheet('props')} />}
      </main>
      <section className="sheet" aria-hidden={size === 'closed'}>
        <SheetHandle size={size} setSize={setSize} />
        <div className="sheet-body">
          {sheet === 'add' && <Library />}
          {sheet === 'list' && <Properties show="list" />}
          {sheet === 'props' && <Properties show="props" />}
        </div>
      </section>
      <nav className="mtabs">
        {SHEETS.map((t) => (
          <button
            key={t.id}
            className={t.id !== 'wiz' && t.id === sheet && size !== 'closed' ? 'on' : ''}
            onClick={() => (t.id === 'wiz' ? st.openWizard({ id: null }) : openSheet(t.id))}
          >
            <span className="mt-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <WizardDialog />
      <Manual />
    </div>
  );
}

/** Thin top bar: name, Techniczne/Figurki, undo/redo and the ⋮ menu with everything else. */
function MobileBar({ menu, setMenu }: { menu: boolean; setMenu: (v: boolean) => void }) {
  const st = useStore();
  const act = useProjectActions();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu, setMenu]);
  const item = (label: string, fn: () => void, cls = '') => (
    <button
      key={label}
      className={cls}
      onClick={() => {
        setMenu(false);
        fn();
      }}
    >
      {label}
    </button>
  );
  return (
    <header className="mbar" ref={ref}>
      <span className="logo">◆</span>
      <div className="tabs" role="tablist">
        {(['tech', 'fig'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={st.tab === t} className={st.tab === t ? 'on' : ''} onClick={() => st.setTab(t)}>
            {t === 'tech' ? 'Techniczne' : 'Figurki'}
          </button>
        ))}
      </div>
      <button className="icon" onClick={st.undo} disabled={!st.past.length} aria-label="Cofnij">
        ↶
      </button>
      <button className="icon" onClick={st.redo} disabled={!st.future.length} aria-label="Ponów">
        ↷
      </button>
      <button className={menu ? 'icon on' : 'icon'} onClick={() => setMenu(!menu)} aria-label="Menu">
        ⋮
      </button>
      {act.input}
      {menu && (
        <div className="mmenu">
          <div className="mmenu-grid">
            {item('Nowy', act.fresh)}
            {item('Otwórz', act.open)}
            {item('Zapisz', act.save)}
            {item('⤢ Całość', st.fit)}
            {item('⊞ Ułóż na stole', st.layoutOnBed)}
            {item(st.measure ? '✓ 📏 Wymiary' : '📏 Wymiary', () => st.setMeasure(!st.measure), st.measure ? 'on' : '')}
            {item(st.preview ? '✓ Podgląd' : 'Podgląd wydruku', () => st.setPreview(!st.preview), st.preview ? 'on' : '')}
            {item('Sprawdź model', st.runCheck)}
            {item('📖 Instrukcja', act.manual)}
          </div>
          <div className="mmenu-grid">
            {item('Eksport STL', () => act.exportAs('stl'), 'primary')}
            {item('Eksport 3MF', () => act.exportAs('3mf'), 'primary')}
          </div>
          <div className="mmenu-settings">
            <SettingsFields />
          </div>
          <p className="mmenu-help">
            Jeden palec: obrót widoku. Dwa palce: przesuw i przybliżenie. Stuknięcie: wybór elementu. Przeciągnięcie zaznaczonego elementu: przesuwanie. Dwa stuknięcia w ściankę: faktura, napis i magnesy na niej.
          </p>
        </div>
      )}
    </header>
  );
}

/** The selected element over the scene, with the most used actions and a way into its properties. */
function SelectionChip({ onProps }: { onProps: () => void }) {
  const st = useStore();
  const id = st.selectedId;
  if (!id) return null;
  const gb = groupBody(id);
  const part = st.parts.find((p) => p.id === id);
  if (!part && gb === null) return null;
  const name = gb !== null ? `Bryła ${gb}` : part!.name;
  const locked = isLocked(st.parts, id);
  return (
    <div className="selchip">
      <button className="selchip-name" onClick={onProps}>
        {locked && '🔒 '}
        {name}
        <span className="muted"> · ustaw ›</span>
      </button>
      <button aria-label="Duplikuj" title="Duplikuj" onClick={() => (gb !== null ? st.duplicateBody(gb) : st.duplicate(id))}>
        ⧉
      </button>
      {part && (
        <button aria-label="Obróć o 90°" title="Obróć o 90° wokół Z" disabled={locked} onClick={() => st.rotateBy(id, 2, 90)}>
          ⟳
        </button>
      )}
      {part && (
        <button aria-label={locked ? 'Odblokuj' : 'Zablokuj'} title={locked ? 'Odblokuj' : 'Zablokuj'} onClick={() => st.setFlags([id], { locked: !part.locked })}>
          {part.locked ? '🔓' : '🔒'}
        </button>
      )}
      <button className="danger" aria-label="Usuń" title="Usuń" disabled={locked} onClick={() => (gb !== null ? st.removeBody(gb) : st.remove(id))}>
        🗑
      </button>
      <button aria-label="Odznacz" title="Odznacz" onClick={() => st.select(null)}>
        ✕
      </button>
    </div>
  );
}

/** Grab bar of the bottom sheet: tap toggles half/full, a swipe changes the size or closes it. */
function SheetHandle({ size, setSize }: { size: Size; setSize: (s: Size) => void }) {
  const start = useRef<number | null>(null);
  return (
    <div
      className="sheet-handle"
      onPointerDown={(e) => {
        start.current = e.clientY;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerUp={(e) => {
        if (start.current === null) return;
        const dy = e.clientY - start.current;
        start.current = null;
        if (Math.abs(dy) < 12) return setSize(size === 'full' ? 'half' : 'full');
        if (dy < 0) setSize('full');
        else setSize(size === 'full' && dy < 200 ? 'half' : 'closed');
      }}
    >
      <span />
    </div>
  );
}
