import { stackSizes } from '../parts/useful4';
import type { Vec3, WizValues } from '../types';
import { addLabel, bedOf, mm, pl, printerField, r1, tiles } from './common';
import { host } from './host';
import { rawPlan } from './raw';
import type { Plan, Wizard } from './types';

// ------------------------------------------------------------------------------------- stackable bins

const SIZES: Record<string, { label: string; W: number; D: number; H: number }> = {
  small: { label: 'Małe (śrubki, koraliki)', W: 90, D: 70, H: 35 },
  mid: { label: 'Średnie (narzędzia, kable)', W: 140, D: 100, H: 60 },
  big: { label: 'Duże (zabawki, przybory)', W: 200, D: 150, H: 90 },
};

function stackPlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const W = Number(v.W), D = Number(v.D), H = Number(v.H), n = Math.max(1, Number(v.levels));
  const label = String(v.text ?? '').trim();
  const base = { W, D, H, nx: Number(v.nx), ny: Number(v.ny), grab: !!v.grab, rad: 4, T: 1.6, B: 1.2, f: 4, c: 0.3 };
  const { f, c } = stackSizes(base);
  const rise = H - f - c; // each bin's foot sits in the one below
  const built = host.simulate((t) => {
    for (let i = 0; i < n; i++) {
      const id = t.add('stackBin', { name: `Pojemnik ${i + 1}`, params: { ...base, kind: 'bin' }, position: [0, 0, r1(i * rise)], color: i % 2 ? '#8a9440' : '#6b7530' });
      const text = v.numbers ? `${label ? `${label} ` : ''}${i + 1}` : label;
      if (text) {
        // Below the front opening when there is one (same size as in the part), else in the middle of the front.
        const z0 = f + 6, z1 = v.grab ? H - Math.min((H - f) * 0.45, 40) - 1 : H - 2;
        addLabel(t, t.parts().find((p) => p.id === id)!, text, 'front', true, W * 0.8, z1 - z0);
        const txt = t.parts().filter((p) => p.type === 'textCut').pop();
        if (txt) t.update(txt.id, { position: [txt.position[0], txt.position[1], r1(i * rise + (z0 + z1) / 2)] });
      }
    }
    if (v.lid) t.add('stackBin', { name: 'Pokrywka', params: { ...base, kind: 'lid' }, position: [0, 0, r1(n * rise)], color: '#f26419' });
  });
  const { parts, items, size } = rawPlan(built, (main) =>
    main.params.kind === 'lid'
      ? { role: 'K', name: 'Pokrywka', group: 'lid', material: 'PLA', where: 'Na górnym pojemniku', how: 'Stopką do stołu: przejście do płyty ma 45°, bez podpór.' }
      : { role: v.numbers ? `P${main.name.replace(/\D/g, '')}` : 'P', name: v.numbers ? main.name : 'Pojemnik', group: 'box', material: 'PLA', where: 'Jeden na drugim, stopką w dół', how: 'Dnem do stołu, bez podpór.' },
  );
  const notes: Plan['notes'] = [{ text: `${pl(n, 'piętro', 'piętra', 'pięter')}, razem ${mm(n * rise + f + c)} mm wysokości. Stopka 4 mm wchodzi w pojemnik niżej z luzem ${mm(c)} mm.` }];
  if (Math.max(W, D) > Math.max(bed[0], bed[1]) || Math.min(W, D) > Math.min(bed[0], bed[1])) notes.push({ warn: true, text: 'Pojemnik nie mieści się na stole drukarki: zmniejsz szerokość albo głębokość.' });
  if (H > bed[2]) notes.push({ warn: true, text: 'Pojemnik jest wyższy niż drukarka.' });
  if (n * rise > 4 * Math.min(W, D)) notes.push({ warn: true, text: 'Wysoka i wąska wieża łatwo się przewraca: dodaj szerokości albo zdejmij piętro.' });
  return {
    items,
    placements: [],
    parts,
    buy: [],
    steps: ['Wydrukuj pojemniki dnem do stołu, a pokrywkę stopką w dół.', 'Postaw je jeden na drugim: stopka wchodzi w górę pojemnika niżej.'],
    notes,
    bed,
    longest: H,
    size: size as Vec3,
  };
}

export const STACK_WIZARD: Wizard = {
  id: 'stack',
  label: 'Pojemniki piętrowe',
  desc: 'Pojemniki z tą samą podstawą, które stawiasz jeden na drugim: stopka wchodzi w pojemnik niżej. Przegródki, wycięcie z przodu, pokrywka i napis.',
  defaults: { size: 'mid', W: 140, D: 100, H: 60, levels: 3, nx: 1, ny: 1, grab: true, lid: true, text: '', numbers: false, printer: 'p1s' },
  set(v, key, value) {
    const next = { ...v, [key]: value };
    const s = SIZES[String(value)];
    if (key === 'size' && s) Object.assign(next, { W: s.W, D: s.D, H: s.H });
    return next;
  },
  plan: stackPlan,
  steps: [
    {
      title: 'Podstawa',
      desc: 'Wszystkie piętra mają tę samą podstawę, więc pasują do siebie w dowolnej kolejności.',
      focus: [],
      focusLabel: 'podstawa',
      fields: () => [
        tiles('size', Object.entries(SIZES).map(([k, s]) => ({ value: k, label: s.label, desc: `${s.W} × ${s.D} mm` })), undefined, 3),
        { kind: 'slider', key: 'W', label: 'Szerokość', min: 40, max: 300, step: 1, unit: 'mm' },
        { kind: 'slider', key: 'D', label: 'Głębokość', min: 40, max: 300, step: 1, unit: 'mm' },
      ],
    },
    {
      title: 'Piętra',
      desc: 'Liczba pojemników i wysokość jednego (razem ze stopką).',
      focus: ['box'],
      focusLabel: 'pojemniki',
      fields: () => [
        tiles('levels', [2, 3, 4, 5].map((k) => ({ value: k, label: String(k) })), 'Liczba pięter', 4),
        { kind: 'slider', key: 'H', label: 'Wysokość pojemnika', min: 20, max: 200, step: 1, unit: 'mm' },
      ],
    },
    {
      title: 'Wnętrze',
      desc: 'Przegródki kończą się pod stopką pojemnika wyżej.',
      focus: ['box'],
      focusLabel: 'przegródki',
      fields: () => [
        { kind: 'slider', key: 'nx', label: 'Przegródki wzdłuż', min: 1, max: 8, step: 1, unit: '' },
        { kind: 'slider', key: 'ny', label: 'Przegródki w poprzek', min: 1, max: 8, step: 1, unit: '' },
      ],
    },
    {
      title: 'Dodatki',
      desc: 'Wycięcie z przodu, pokrywka na górę i napis.',
      focus: [],
      focusLabel: 'dodatki',
      fields: () => [
        { kind: 'toggle', key: 'grab', label: 'Wycięcie z przodu', desc: 'Sięgasz do środka bez zdejmowania pięter wyżej.' },
        { kind: 'toggle', key: 'lid', label: 'Pokrywka na górę', desc: 'Płyta ze stopką, zamyka najwyższy pojemnik.' },
        { kind: 'text', key: 'text', label: 'Napis z przodu', placeholder: 'np. ŚRUBY', max: 14 },
        { kind: 'toggle', key: 'numbers', label: 'Numery pięter', desc: 'Dopisuje 1, 2, 3… do napisu.' },
      ],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy pojemnik mieści się na stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia pojemniki ustawione jeden na drugim.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};
