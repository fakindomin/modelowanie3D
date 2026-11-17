import { railSizes } from '../parts/useful4';
import type { Vec3, WizValues } from '../types';
import { bedOf, mm, printerField, r1, tiles } from './common';
import { host } from './host';
import { rawPlan } from './raw';
import type { Plan, Wizard } from './types';

// ------------------------------------------------------------------------------------- linear guide on two rods

const RODS: Record<string, { label: string; d: number; lm?: { name: string; B: number; L: number }; what: string }> = {
  r8: { label: 'Pręt 8 mm', d: 8, lm: { name: 'LM8UU', B: 15, L: 24 }, what: 'Wałek liniowy 8 mm (stal hartowana)' },
  r10: { label: 'Pręt 10 mm', d: 10, lm: { name: 'LM10UU', B: 19, L: 29 }, what: 'Wałek liniowy 10 mm (stal hartowana)' },
  r12: { label: 'Pręt 12 mm', d: 12, lm: { name: 'LM12UU', B: 21, L: 30 }, what: 'Wałek liniowy 12 mm (stal hartowana)' },
  p16: { label: 'Rurka 16 mm', d: 16, what: 'Rurka aluminiowa lub stalowa 16 mm' },
  p20: { label: 'Rurka 20 mm', d: 20, what: 'Rurka aluminiowa lub stalowa 20 mm' },
};

function slidePlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const rod = RODS[String(v.rod)] ?? RODS.r8;
  const lm = !!rod.lm && v.bush !== 'print';
  const base = { d: rod.d, S: Number(v.S), bush: lm ? 'lm' : 'print', Lc: Math.max(Number(v.Lc), lm ? rod.lm!.L + 8 : 30), B: rod.lm?.B ?? 15, BL: rod.lm?.L ?? 24, screwD: 3 };
  const { h, R, Te, Lc, tp } = railSizes(base);
  const zc = tp + R - 1;
  const stroke = Number(v.stroke);
  const Lrod = stroke + Lc + 2 * Te;
  const built = host.simulate((t) => {
    t.add('linearRail', { name: 'Podpora końcowa', params: { ...base, piece: 'end' }, position: [0, 0, 0], color: '#6b7530' });
    t.add('linearRail', { name: 'Podpora końcowa', params: { ...base, piece: 'end' }, position: [r1(Lrod - Te), 0, 0], color: '#6b7530' });
    // The carriage is printed plate down and turned over onto the rods; here it stands at the start of its travel.
    t.add('linearRail', { name: 'Wózek', params: { ...base, piece: 'carriage' }, position: [r1(Te + Lc / 2 + stroke / 2), 0, r1(h + zc)], rotation: [180, 0, 0], color: '#f26419' });
  });
  const { parts, items, size } = rawPlan(built, (main) =>
    main.params.piece === 'end'
      ? { role: 'P', name: 'Podpora końcowa', group: 'fit', material: 'PETG', where: 'Na obu końcach prętów, przykręcona do podstawy', how: 'Podstawą do stołu, otwory łezkowe bez podpór.' }
      : { role: 'W', name: 'Wózek', group: 'box', material: 'PETG', where: 'Na prętach', how: 'Płytą do stołu (do góry nogami), bez podpór.' },
  );
  const dx = parts[0].position[0] - built[0].position[0], dy = parts[0].position[1] - built[0].position[1];
  const rods: Plan['rods'] = [-1, 1].map((sg) => ({ a: [dx, dy + (sg * base.S) / 2, h] as Vec3, b: [dx + Lrod, dy + (sg * base.S) / 2, h] as Vec3, d: rod.d, color: '#b3b6aa' }));
  const buy: Plan['buy'] = [{ name: rod.what, qty: `2 szt. × ${mm(Lrod)} mm`, note: 'Końce lekko zfazuj pilnikiem, żeby nie zarysowały łożysk.' }];
  if (lm) buy.push({ name: `Łożysko liniowe ${rod.lm!.name}`, qty: `${Lc >= 2 * rod.lm!.L ? 4 : 2} szt.`, note: 'Wciśnij z obu końców obudowy aż do wewnętrznego rantu.' });
  buy.push({ name: 'Wkręty 3 mm do podstawy', qty: '4 szt.', note: 'Po dwa w każdą podporę końcową.' });
  const notes: Plan['notes'] = [{ text: `Skok ${mm(stroke)} mm, pręty ${mm(Lrod)} mm, rozstaw ${mm(base.S)} mm, oś prętów ${mm(h)} mm nad podstawą.` }];
  if (!lm) notes.push({ text: 'Drukowana tuleja: PETG albo nylon, przesmaruj pręty smarem PTFE. Gdy wózek idzie ciężko, rozwierć otwory wiertłem o 0,1 mm większym.' });
  if (Lrod > 600) notes.push({ warn: true, text: 'Długie pręty uginają się pośrodku: dodaj podporę środkową albo grubsze pręty.' });
  return {
    items,
    placements: [],
    parts,
    buy,
    steps: [
      'Wydrukuj wózek płytą do stołu i obie podpory podstawą do stołu.',
      ...(lm ? ['Wciśnij łożyska w obudowy wózka (imadło, przez kawałek drewna).'] : []),
      'Wsuń pręty w jedną podporę, nałóż wózek, wsuń pręty w drugą podporę.',
      'Przykręć podpory do podstawy, przesuwając wózek od końca do końca: pręty muszą być równoległe.',
    ],
    notes,
    bed,
    longest: Math.max(...size),
    size: size as Vec3,
    rods,
  };
}

export const SLIDE_WIZARD: Wizard = {
  id: 'slide',
  label: 'Prowadnica liniowa',
  desc: 'Wózek na dwóch kupnych prętach z łożyskami liniowymi albo drukowanymi tulejami, z podporami na końcach. Skok, rozstaw, płyta z otworami na Twoje mocowanie.',
  defaults: { rod: 'r8', bush: 'lm', S: 60, Lc: 60, stroke: 200, printer: 'p1s' },
  set: (v, key, value) => ({ ...v, [key]: value }),
  plan: slidePlan,
  steps: [
    {
      title: 'Pręty',
      desc: 'Wałki liniowe 8–12 mm z łożyskami albo zwykłe rurki z drukowanymi tulejami.',
      focus: [],
      focusLabel: 'pręty',
      fields: (v) => [
        tiles('rod', Object.entries(RODS).map(([k, r]) => ({ value: k, label: r.label, desc: r.lm ? r.lm.name : 'Tuleja' })), undefined, 3),
        ...(RODS[String(v.rod)]?.lm ? [tiles('bush', [{ value: 'lm', label: 'Łożyska', desc: 'Lekko i bez luzu' }, { value: 'print', label: 'Drukowana tuleja', desc: 'Nic do kupienia' }], 'Ślizg', 2)] : []),
      ],
    },
    {
      title: 'Wymiary',
      desc: 'Skok to droga wózka między podporami.',
      focus: [],
      focusLabel: 'prowadnica',
      fields: () => [
        { kind: 'slider', key: 'stroke', label: 'Skok', min: 50, max: 1000, step: 10, unit: 'mm' },
        { kind: 'slider', key: 'S', label: 'Rozstaw prętów', min: 30, max: 200, step: 1, unit: 'mm' },
        { kind: 'slider', key: 'Lc', label: 'Długość wózka', min: 30, max: 200, step: 1, unit: 'mm' },
      ],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy wózek i podpory mieszczą się na stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia wózek i podpory; pręty i łożyska są na liście zakupów.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};
