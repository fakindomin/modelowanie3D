import type { Params } from '../catalog';
import type { Vec3, WizValues } from '../types';
import { bedOf, mm, printerField, r1, tiles } from './common';
import { host } from './host';
import { rawPlan } from './raw';
import type { Field, Plan, Wizard } from './types';

// ------------------------------------------------------------------------------------- spare part from caliper measurements

const s = (key: string, label: string, min: number, max: number, step = 0.1): Field => ({ kind: 'slider', key, label, min, max, step, unit: 'mm' });
const hint = (text: string): Field => ({ kind: 'hint', text });

const KINDS: Record<string, { label: string; desc: string; measure: (v: WizValues) => Field[]; params: (v: WizValues) => Params; test: (v: WizValues) => Params; how: string }> = {
  sleeve: {
    label: 'Tuleja', desc: 'Dystans, tulejka ślizgowa, przedłużka',
    measure: (v) => [
      hint('1. Średnicę zewnętrzną zmierz szczękami w dwóch miejscach, obróconych o 90°. Wpisz większą.'),
      s('OD', 'Średnica zewnętrzna', 3, 150),
      hint('2. Otwór zmierz szczękami wewnętrznymi (górnymi). Jeśli otworu nie masz, zmierz wałek, który ma w nim siedzieć.'),
      s('ID', 'Średnica otworu', 1, 140),
      hint('3. Długość zmierz od czoła do czoła.'),
      s('L', 'Długość', 1, 200),
      s('flD', 'Kołnierz: średnica (0 = bez)', 0, 200),
      ...(Number(v.flD) > 0 ? [s('flT', 'Kołnierz: grubość', 0.8, 20)] : []),
    ],
    params: (v) => ({ OD: v.OD, ID: v.ID, L: v.L, flD: v.flD, flT: v.flT }),
    test: (v) => ({ OD: v.OD, ID: v.ID, L: 3, flD: 0 }),
    how: 'Czołem do stołu (kołnierzem w dół).',
  },
  washer: {
    label: 'Podkładka', desc: 'Dystansowa, pod śrubę, do zawiasu',
    measure: () => [hint('1. Zmierz średnicę zewnętrzną i otwór starej podkładki albo śrubę, na którą ma wejść.'), s('OD', 'Średnica zewnętrzna', 3, 150), s('ID', 'Średnica otworu', 1, 140), hint('2. Grubość zmierz w kilku miejscach: zużyta bywa cieńsza po jednej stronie.'), s('T', 'Grubość', 0.6, 20)],
    params: (v) => ({ OD: v.OD, ID: v.ID, T: v.T }),
    test: (v) => ({ OD: v.OD, ID: v.ID, T: Math.min(Number(v.T), 1.2) }),
    how: 'Płasko.',
  },
  legCap: {
    label: 'Nasadka na nogę', desc: 'Krzesło, stół, stelaż: chroni podłogę',
    measure: () => [
      hint('1. Zmierz nogę tuż przy końcu: okrągłą w dwóch miejscach, kwadratową na każdym boku. Wpisz większy wymiar.'),
      tiles('shape', [{ value: 'round', label: 'Okrągła' }, { value: 'square', label: 'Kwadratowa' }], 'Przekrój nogi', 2),
      s('A', 'Noga: średnica / bok', 5, 120),
      hint('2. Głębokość: ile nogi ma schować się w nasadce. Spód: im grubszy, tym dłużej posłuży.'),
      s('P', 'Głębokość nasadki', 3, 80, 0.5),
      s('B', 'Grubość spodu', 1, 15, 0.5),
    ],
    params: (v) => ({ shape: v.shape, A: v.A, P: v.P, B: v.B, w: 2 }),
    test: (v) => ({ shape: v.shape, A: v.A, P: 5, B: 1, w: 2 }),
    how: 'Spodem do stołu, z TPU (cicha, nie rysuje) albo PETG.',
  },
  knob: {
    label: 'Gałka na oś', desc: 'Kuchenka, pralka, potencjometr',
    measure: (v) => [
      hint('1. Zmierz oś (trzpień), na którą wchodzi gałka.'),
      s('d', 'Średnica osi', 2, 30),
      hint('2. Jeśli oś ma ścięcie (kształt litery D), zmierz ją w poprzek ścięcia i wpisz różnicę: średnica minus ten wymiar.'),
      s('flat', 'Ścięcie osi (0 = okrągła)', 0, 10),
      s('depth', 'Ile osi wchodzi w gałkę', 3, 70, 0.5),
      hint('3. Wielkość samej gałki: jak starej albo jak wygodnie.'),
      s('D', 'Średnica gałki', 8, 120, 0.5),
      s('H', 'Wysokość gałki', Math.max(5, Number(v.depth) + 2), 80, 0.5),
    ],
    params: (v) => ({ d: v.d, flat: v.flat, depth: v.depth, D: v.D, H: Math.max(Number(v.H), Number(v.depth) + 2) }),
    test: (v) => ({ d: v.d, flat: v.flat, depth: 4, D: Number(v.d) + 8, H: 6 }),
    how: 'Otworem do stołu.',
  },
  wheel: {
    label: 'Kółko', desc: 'Szuflada, wózek, rolka prowadząca',
    measure: () => [hint('1. Zmierz średnicę i szerokość starego kółka (bieżnię, nie zużyte miejsce).'), s('OD', 'Średnica kółka', 5, 200), s('W', 'Szerokość', 2, 80), hint('2. Zmierz oś albo śrubę, na której się kręci.'), s('ax', 'Średnica osi', 1, 60)],
    params: (v) => ({ OD: v.OD, W: v.W, ax: v.ax }),
    test: (v) => ({ OD: Number(v.ax) + 8, W: 3, ax: v.ax }),
    how: 'Bokiem do stołu.',
  },
};
const FIT: Record<string, { label: string; desc: string; v: number }> = {
  tight: { label: 'Ciasno', desc: 'Wcisk, nie spada', v: 0.1 },
  normal: { label: 'Normalnie', desc: 'Wchodzi ręką', v: 0.25 },
  loose: { label: 'Luźno', desc: 'Obraca się', v: 0.45 },
};

function sparePlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const kind = String(v.kind);
  const k = KINDS[kind] ?? KINDS.sleeve;
  const fit = (FIT[String(v.fit)] ?? FIT.normal).v;
  const built = host.simulate((t) => {
    const id = t.add('measured', { name: k.label, params: { kind, fit, ...k.params(v) }, position: [0, 0, 0], color: '#6b7530' });
    if (v.test) {
      const p = t.parts().find((q) => q.id === id)!;
      const w = Math.max(Number(v.OD) || 0, Number(v.D) || 0, (Number(v.A) || 0) + 6, 20);
      t.add('measured', { name: 'Próbka pasowania', params: { kind, fit, ...k.params(v), ...k.test(v) }, position: [r1(p.position[0] + w + 10), 0, 0], color: '#f26419' });
    }
  });
  const { parts, items, size } = rawPlan(built, (main) =>
    main.name === 'Próbka pasowania'
      ? { role: 'P', name: 'Próbka pasowania', group: 'clip', material: 'PLA', where: 'Najpierw sprawdź na oryginale, potem drukuj część', how: k.how }
      : { role: 'C', name: k.label, group: 'box', material: kind === 'legCap' ? 'TPU' : 'PETG', where: '', how: k.how },
  );
  const notes: Plan['notes'] = [{ text: `Luz w otworach ${String(fit).replace('.', ',')} mm (${(FIT[String(v.fit)] ?? FIT.normal).label.toLowerCase()}). Wpisuj wymiary z suwmiarki: luz dodaję sam.` }];
  if (v.test) notes.push({ text: 'Próbka to cienki plasterek tej samej części: kilka minut druku. Gdy nie pasuje, zmień pasowanie i wydrukuj ją jeszcze raz.' });
  if (kind === 'sleeve' && Number(v.ID) >= Number(v.OD) - 1) notes.push({ warn: true, text: 'Ścianka tulei jest cieńsza niż 0,5 mm: zwiększ średnicę zewnętrzną albo zmniejsz otwór.' });
  return {
    items,
    placements: [],
    parts,
    buy: [],
    steps: [...(v.test ? ['Wydrukuj próbkę i przymierz ją do oryginału (oś, noga, otwór).'] : []), 'Wydrukuj część.', 'Gdy jest za ciasno, zmień pasowanie na „Luźno” (i odwrotnie), zamiast poprawiać wymiary.'],
    notes,
    bed,
    longest: Math.max(...size),
    size: size as Vec3,
  };
}

export const SPARE_WIZARD: Wizard = {
  id: 'spare',
  label: 'Część z pomiaru',
  desc: 'Część zamienna z wymiarów suwmiarki, krok po kroku: tuleja, podkładka, nasadka na nogę, gałka na oś albo kółko. Pasowanie i próbka do przymiarki.',
  defaults: { kind: 'legCap', OD: 20, ID: 8, L: 15, flD: 0, flT: 2, T: 2, shape: 'round', A: 22, P: 15, B: 3, d: 6, flat: 0, depth: 10, D: 30, H: 18, W: 12, ax: 6, fit: 'normal', test: true, printer: 'p1s' },
  set: (v, key, value) => ({ ...v, [key]: value }),
  plan: sparePlan,
  steps: [
    {
      title: 'Co drukujesz',
      desc: 'Wybierz część, którą chcesz odtworzyć.',
      focus: [],
      focusLabel: 'część',
      fields: () => [tiles('kind', Object.entries(KINDS).map(([k, d]) => ({ value: k, label: d.label, desc: d.desc })), undefined, 3)],
    },
    {
      title: 'Pomiary',
      desc: 'Mierz suwmiarką krok po kroku i wpisuj to, co pokazuje.',
      focus: [],
      focusLabel: 'wymiary',
      fields: (v) => (KINDS[String(v.kind)] ?? KINDS.sleeve).measure(v),
    },
    {
      title: 'Pasowanie',
      desc: 'Jak ciasno część ma siedzieć. Próbka pozwala sprawdzić to w kilka minut.',
      focus: [],
      focusLabel: 'pasowanie',
      fields: () => [
        tiles('fit', Object.entries(FIT).map(([k, f]) => ({ value: k, label: f.label, desc: f.desc })), 'Pasowanie', 3),
        { kind: 'toggle', key: 'test', label: 'Próbka do przymiarki', desc: 'Cienki plasterek tej części, drukuje się kilka minut.' },
      ],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy część mieści się na stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia część (i próbkę).', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};
