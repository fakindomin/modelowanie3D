import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { CATALOG, CATEGORIES } from '../catalog';
import { FAMILIES, IN_FAMILY } from '../families';
import { PROJECT_ITEMS, USE_CATS, type ProjectItem } from '../projects';
import { loadBed, useStore } from '../store';
import { export3MF } from '../export';
import type { BodyResult } from '../geom/parts';
import { printBodies, useProjectActions } from '../App';

/**
 * Review mode: steps through every element the library offers, one at a time, so the user can look at it,
 * print it (3MF straight to the slicer) and mark it OK or to change, with a note. Notes are copied as text.
 */
export interface ReviewItem {
  id: string;
  group: string;
  label: string;
  item: ProjectItem;
}

let LIST: ReviewItem[] | null = null;
/** Every project once (under its first use), then every part and family variant of the parts library. */
export function reviewList(): ReviewItem[] {
  if (LIST) return LIST;
  const out: ReviewItem[] = [];
  const seen = new Set<string>();
  const key = (i: ProjectItem) => (i.kind === 'part' ? `part:${i.type}` : i.kind === 'family' ? `fam:${i.family}/${i.variant}` : i.kind === 'wizard' ? `wiz:${i.wizard}` : 'fig');
  for (const c of USE_CATS)
    for (const i of PROJECT_ITEMS) {
      if (i.kind === 'figurines' || i.kind === 'wizard' || i.tags[0] !== c.id) continue;
      const k = key(i);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ id: k, group: c.label, label: i.label, item: i });
    }
  for (const c of CATEGORIES) {
    const group = `Części: ${c.label}`;
    for (const f of FAMILIES.filter((x) => x.category === c.id))
      for (const v of f.variants) {
        const k = `fam:${f.id}/${v.label}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ id: k, group, label: `${f.label}: ${v.label}`, item: { kind: 'family', family: f.id, variant: v.label, label: v.label, desc: '', tags: [], icon: v.type } });
      }
    for (const d of CATALOG.filter((x) => x.category === c.id && !x.hidden && !IN_FAMILY.has(x.type))) {
      const k = `part:${d.type}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ id: k, group, label: d.label, item: { kind: 'part', type: d.type, label: d.label, desc: d.description, tags: [], icon: d.type } });
    }
  }
  // Wizards last: each opens its own dialog, from a button on the bar.
  for (const i of PROJECT_ITEMS) if (i.kind === 'wizard') out.push({ id: `wiz:${i.wizard}`, group: 'Kreatory', label: i.label, item: i });
  return (LIST = out);
}

type Mark = { s: 'ok' | 'fix'; n: string };
interface ReviewState {
  open: boolean;
  i: number;
  marks: Record<string, Mark>;
  setOpen(v: boolean): void;
  go(i: number): void;
  mark(id: string, m: Partial<Mark> | null): void;
}
const KEY = 'modelowanie3d.review';
function load(): { i: number; marks: Record<string, Mark> } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '');
    return { i: Number(v.i) || 0, marks: v.marks ?? {} };
  } catch {
    return { i: 0, marks: {} };
  }
}
function save(i: number, marks: Record<string, Mark>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ i, marks }));
  } catch {
    /* private window: progress lives until the page closes */
  }
}
export const useReview = create<ReviewState>((set, get) => ({
  open: false,
  ...load(),
  setOpen: (open) => set({ open }),
  go: (i) => {
    const n = reviewList().length;
    const j = Math.max(0, Math.min(n - 1, i));
    set({ i: j });
    save(j, get().marks);
  },
  mark: (id, m) => {
    const marks = { ...get().marks };
    if (m === null) delete marks[id];
    else marks[id] = { ...{ s: 'ok' as const, n: '' }, ...marks[id], ...m };
    set({ marks });
    save(get().i, marks);
  },
}));

/** Puts the item alone on the scene (wizards open their dialog). */
function show(it: ReviewItem) {
  const st = useStore.getState();
  if (st.tab !== 'tech') st.setTab('tech');
  const i = it.item;
  st.reset();
  if (i.kind === 'wizard') return;
  if (i.kind === 'part') st.add(i.type);
  else if (i.kind === 'family') {
    const f = FAMILIES.find((x) => x.id === i.family)!;
    st.addVariant(f, f.variants.find((v) => v.label === i.variant)!, 'M');
  }
  useStore.getState().select(null);
  setTimeout(() => useStore.getState().fit(), 60);
}

const fileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim();

/** Notes as text to paste in the chat: the ones to change first, then a count of the OK ones. */
function notesText(marks: Record<string, Mark>): string {
  const list = reviewList();
  const fix = list.filter((x) => marks[x.id]?.s === 'fix');
  const ok = list.filter((x) => marks[x.id]?.s === 'ok');
  const lines = [`Przegląd modeli: ${ok.length + fix.length} z ${list.length} obejrzanych, ${ok.length} OK, ${fix.length} do zmiany.`, ''];
  let g = '';
  for (const x of fix) {
    if (x.group !== g) lines.push(`${g ? '\n' : ''}${(g = x.group)}:`);
    lines.push(`- ${x.label} [${x.id}]: ${marks[x.id].n || '(bez opisu)'}`);
  }
  return lines.join('\n');
}

/** Every element of one group, each on its own plate (a file per element in a zip). */
function exportGroup(group: string) {
  const st = useStore.getState();
  const items = reviewList().filter((x) => x.group === group && x.item.kind !== 'wizard');
  const all: BodyResult[] = [];
  const names = new Map<number, string>(), groups = new Map<number, string>();
  let k = 0;
  for (const it of items) {
    show(it);
    const { bodies, names: nm } = printBodies(useStore.getState().parts);
    k++;
    for (const b of bodies) {
      const id = k * 1000 + b.body;
      names.set(id, nm.get(b.body) ?? it.label);
      groups.set(id, fileName(it.label));
      all.push({ ...b, body: id });
    }
  }
  const cur = reviewList()[useReview.getState().i];
  if (cur) show(cur);
  if (!all.length) return st.notify('W tej grupie nie ma brył do druku.');
  const bed = loadBed();
  const n = export3MF(all, fileName(`przeglad - ${group}`), names, false, [bed[0], bed[1]], groups);
  all.forEach((b) => {
    b.geometry.dispose();
    b.manifold.delete();
  });
  useStore.getState().notify(`Pobrano ${items.length} elementów z grupy „${group}” na ${n} stołach: każdy element w osobnym pliku 3MF w archiwum .zip.`);
}

export function ReviewBar() {
  const r = useReview();
  const act = useProjectActions();
  const list = useMemo(reviewList, []);
  const cur = list[r.i];
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (r.open && cur) show(cur);
  }, [r.open, r.i]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r.open || !cur) return null;
  const m = r.marks[cur.id];
  const done = Object.keys(r.marks).length;
  const groups = [...new Set(list.map((x) => x.group))];
  const nextOpen = () => {
    const j = list.findIndex((x, k) => k > r.i && !r.marks[x.id]);
    r.go(j >= 0 ? j : r.i + 1);
  };
  const copy = async () => {
    const text = notesText(r.marks);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Skopiuj uwagi:', text);
    }
  };
  return (
    <div className="review-bar" onKeyDown={(e) => e.stopPropagation()}>
      <div className="rv-row">
        <button onClick={() => r.go(r.i - 1)} disabled={r.i === 0} title="Poprzedni element">◀</button>
        <select value={r.i} onChange={(e) => r.go(Number(e.target.value))} title="Skocz do elementu">
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {list.map((x, k) => (x.group === g ? <option key={x.id} value={k}>{`${r.marks[x.id]?.s === 'ok' ? '✓ ' : r.marks[x.id]?.s === 'fix' ? '✎ ' : ''}${k + 1}. ${x.label}`}</option> : null))}
            </optgroup>
          ))}
        </select>
        <button onClick={() => r.go(r.i + 1)} disabled={r.i >= list.length - 1} title="Następny element">▶</button>
        <span className="rv-count" title="Obejrzane / wszystkie">{done}/{list.length}</span>
        <span className="rv-prog"><span style={{ width: `${(done / list.length) * 100}%` }} /></span>
        <button className="rv-close" onClick={() => r.setOpen(false)} title="Zamknij przegląd (postęp zostaje zapisany)">✕</button>
      </div>
      <div className="rv-row">
        <span className="rv-group">{cur.group}</span>
        <button className={m?.s === 'ok' ? 'rv-ok on' : 'rv-ok'} onClick={() => { r.mark(cur.id, m?.s === 'ok' ? null : { s: 'ok' }); if (m?.s !== 'ok') nextOpen(); }} title="Element jest dobry; przejdź do następnego nieobejrzanego">✓ OK</button>
        <button className={m?.s === 'fix' ? 'rv-fix on' : 'rv-fix'} onClick={() => r.mark(cur.id, m?.s === 'fix' ? null : { s: 'fix' })} title="Do zmiany: opisz co obok">✎ Do zmiany</button>
        <input className="rv-note" placeholder="Co zmienić? (np. za cienka ścianka, dodać wymiar…)" value={m?.n ?? ''} onChange={(e) => r.mark(cur.id, { s: 'fix', n: e.target.value })} />
      </div>
      <div className="rv-row">
        {cur.item.kind === 'wizard' && (
          <button className="wiz-open" onClick={() => cur.item.kind === 'wizard' && useStore.getState().openWizard({ id: cur.item.wizard })} title="Kreator buduje model na scenie; potem pobierz 3MF">✨ Otwórz kreator</button>
        )}
        <button className="primary" onClick={() => act.exportAs('3mf', fileName(cur.label))} title="Ten element (z wymiarami jak teraz na scenie) jako 3MF do Bambu Studio">⬇ 3MF tego elementu</button>
        <button onClick={() => exportGroup(cur.group)} disabled={cur.item.kind === 'wizard'} title="Wszystkie elementy tej grupy z domyślnymi wymiarami, każdy w osobnym pliku 3MF (archiwum .zip)">⬇ 3MF całej grupy</button>
        <button onClick={copy} title="Uwagi jako tekst do wklejenia w rozmowie">{copied ? '✓ Skopiowano' : '📋 Kopiuj uwagi'}</button>
      </div>
    </div>
  );
}
