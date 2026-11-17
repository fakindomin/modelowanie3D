import { doorSizes } from '../parts/useful4';
import type { Vec3, WizValues } from '../types';
import { bedOf, mm, printerField, r1, tiles } from './common';
import { host } from './host';
import { rawPlan } from './raw';
import type { Plan, Wizard } from './types';

// ------------------------------------------------------------------------------------- door with a hinge

const MAGNETS: Record<string, { d: number; h: number }> = { '6x2': { d: 6, h: 2 }, '8x3': { d: 8, h: 3 }, '10x3': { d: 10, h: 3 } };

function doorPlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const mag = MAGNETS[String(v.mag)] ?? MAGNETS['8x3'];
  const magnets = v.mag !== 'none';
  const T = Math.max(4, magnets ? mag.h + 1.2 : 3);
  const base = { W: Number(v.W), H: Number(v.H), T, handle: String(v.handle), magnets, magD: mag.d, magH: mag.h, screwD: Number(v.screwD), strip: 18, luz: 0.4 };
  const { W, H, xs, Wf } = doorSizes(base);
  const nMag = magnets ? (H > 120 ? 2 : 1) : 0;
  const built = host.simulate((t) => {
    t.add('hingedDoor', { name: 'Drzwiczki', params: { ...base, piece: 'door' }, position: [0, 0, 0], color: '#6b7530' });
    t.add('hingedDoor', { name: 'Listwa zawiasu', params: { ...base, piece: 'strip' }, position: [0, 0, 0], color: '#8a9440' });
    // The catches and the knob go beside the door on the bed.
    for (let i = 0; i < nMag; i++) t.add('magnetCatch', { name: 'Zatrzask magnetyczny', params: { d: mag.d, h: mag.h, screwS: 'screw', screwD: Number(v.screwD), single: true }, position: [r1(W / 2 + 40), r1(-H / 2 + 20 + i * 30), 0], color: '#f26419' });
    if (v.handle === 'knob') t.add('furnitureKnob', { name: 'Gałka', params: { shape: 'mushroom', D: 30, H: 25, M: '4' }, position: [r1(W / 2 + 40), r1(H / 2 - 25), 0], color: '#f26419' });
  });
  const { parts, items, size } = rawPlan(built, (main) =>
    main.type === 'magnetCatch'
      ? { role: 'Z', name: 'Zatrzask magnetyczny', group: 'clip', material: 'PLA', where: 'W szafce, naprzeciw magnesu w drzwiczkach', how: 'Gniazdem do góry.' }
      : main.type === 'furnitureKnob'
        ? { role: 'G', name: 'Gałka', group: 'clip', material: 'PLA', where: 'Na drzwiczkach, śruba M4 od środka', how: 'Górą do stołu.' }
        : main.params.piece === 'strip'
          ? { role: 'L', name: 'Listwa zawiasu', group: 'box', material: 'PLA', where: 'Przykręcona obok otworu szafki', how: 'Razem z drzwiczkami, tak jak leżą: zawias drukuje się złożony.' }
          : { role: 'D', name: 'Drzwiczki', group: 'box', material: 'PLA', where: '', how: 'Wewnętrzną stroną do góry, razem z listwą.' },
  );
  const span = W / 2 + Math.abs(xs) + Wf;
  const notes: Plan['notes'] = [{ text: `Drzwiczki ${mm(W)} × ${mm(H)} mm, grubość ${mm(T)} mm. Zawias na całej wysokości, luz 0,4 mm.` }];
  if (span > bed[0] && span > bed[1]) notes.push({ warn: true, text: `Drzwiczki z listwą mają ${mm(span)} mm szerokości: nie mieszczą się na stole drukarki.` });
  if (H > Math.max(bed[0], bed[1])) notes.push({ warn: true, text: 'Drzwiczki są wyższe niż stół drukarki.' });
  const buy: Plan['buy'] = [
    { name: 'Filament 1,75 mm na oś zawiasu', qty: `${mm(H + 10)} mm`, note: 'Wsuń, utnij i zgrzej końce lutownicą albo zapalniczką.' },
    { name: `Wkręty ${String(v.screwD).replace('.', ',')} mm do listwy`, qty: `${Math.max(2, Math.round(H / 90) + 1) + nMag * 2} szt.`, note: 'Łby stożkowe, długość wg ścianki szafki.' },
  ];
  if (nMag) buy.push({ name: `Magnesy neodymowe ${mag.d} × ${mag.h} mm`, qty: `${nMag * 2} szt.`, note: 'Pary: jeden w drzwiczkach, drugi w zatrzasku. Sprawdź bieguny przed klejeniem.' });
  if (v.handle === 'knob') buy.push({ name: 'Śruba M4 × 12 z podkładką', qty: '1 szt.', note: 'Do gałki, od środka drzwiczek.' });
  return {
    items,
    placements: [],
    parts,
    buy,
    steps: [
      'Wydrukuj drzwiczki razem z listwą, tak jak leżą: zawias jest już złożony.',
      'Wsuń filament 1,75 mm w oś zawiasu, utnij i zgrzej końce.',
      ...(nMag ? ['Wklej magnesy w drzwiczki i zatrzaski. Przyłóż je do siebie, zanim klej zwiąże: muszą się przyciągać.'] : []),
      'Przykręć listwę obok otworu szafki, drzwiczki zamknięte (listwa i drzwiczki w jednej płaszczyźnie).',
      ...(nMag ? ['Przykręć zatrzaski w szafce naprzeciw magnesów w drzwiczkach.'] : []),
      ...(v.handle === 'knob' ? ['Przykręć gałkę śrubą M4 od środka.'] : []),
    ],
    notes,
    bed,
    longest: Math.max(...size),
    size: size as Vec3,
  };
}

export const DOOR_WIZARD: Wizard = {
  id: 'door',
  label: 'Drzwiczki z zawiasem',
  desc: 'Drzwiczki z listwą i zawiasem na całej wysokości, drukowane razem i od razu złożone. Zamknięcie na magnesy, gałka albo wycięcie na palec.',
  defaults: { W: 150, H: 200, handle: 'knob', mag: '8x3', screwD: 4, printer: 'p1s' },
  set: (v, key, value) => ({ ...v, [key]: value }),
  plan: doorPlan,
  steps: [
    {
      title: 'Wymiary',
      desc: 'Wielkość drzwiczek. Żeby zakryły otwór, dodaj po 5–10 mm z każdej strony.',
      focus: [],
      focusLabel: 'drzwiczki',
      fields: () => [
        { kind: 'slider', key: 'W', label: 'Szerokość', min: 40, max: 300, step: 1, unit: 'mm' },
        { kind: 'slider', key: 'H', label: 'Wysokość', min: 40, max: 300, step: 1, unit: 'mm' },
      ],
    },
    {
      title: 'Zamknięcie i uchwyt',
      desc: 'Magnesy trzymają drzwiczki zamknięte; zatrzaski z magnesami przykręcasz w szafce.',
      focus: [],
      focusLabel: 'zamknięcie',
      fields: () => [
        tiles('mag', [{ value: 'none', label: 'Bez magnesów' }, { value: '6x2', label: '6 × 2 mm', desc: 'Lekkie' }, { value: '8x3', label: '8 × 3 mm', desc: 'Typowe' }, { value: '10x3', label: '10 × 3 mm', desc: 'Mocne' }], 'Magnesy', 4),
        tiles('handle', [{ value: 'none', label: 'Bez' }, { value: 'knob', label: 'Gałka', desc: 'Drukowana, na śrubę M4' }, { value: 'notch', label: 'Wycięcie', desc: 'Na palec' }], 'Uchwyt', 3),
      ],
    },
    {
      title: 'Mocowanie',
      desc: 'Listwa przykręca się obok otworu, łbem od zewnątrz.',
      focus: [],
      focusLabel: 'listwa',
      fields: () => [tiles('screwD', [3, 3.5, 4, 5].map((d) => ({ value: d, label: `${String(d).replace('.', ',')} mm` })), 'Średnica wkrętu', 4)],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy drzwiczki z listwą mieszczą się na stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia drzwiczki z listwą, zatrzaski i gałkę.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};
