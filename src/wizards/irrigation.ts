import type { Vec3, WizValues } from '../types';
import { bedOf, mm, pl, printerField, r1, tiles } from './common';
import { host } from './host';
import { rawPlan } from './raw';
import type { Plan, Wizard } from './types';

// ------------------------------------------------------------------------------------- drip irrigation from a container

const TUBES: Record<string, { label: string; d: number; od: number; what: string }> = {
  '4': { label: '4/6 mm', d: 4, od: 6, what: 'Wężyk akwarystyczny lub mikrorurka 4/6 mm (PVC, silikon)' },
  '5': { label: '5/7 mm', d: 5, od: 7, what: 'Mikrorurka nawadniająca 5/7 mm' },
  '6': { label: '6/8 mm', d: 6, od: 8, what: 'Wężyk silikonowy lub PVC 6/8 mm' },
};
const FLOW: Record<string, { label: string; out: number; desc: string }> = {
  slow: { label: 'Wolno', out: 0.8, desc: 'Sukulenty, zioła' },
  mid: { label: 'Średnio', out: 1.1, desc: 'Większość roślin' },
  fast: { label: 'Szybko', out: 1.5, desc: 'Pomidory, skrzynki' },
};

function irrigationPlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const tube = TUBES[String(v.tube)] ?? TUBES['4'];
  const n = Math.max(1, Number(v.plants)), gap = Number(v.gap) * 10, branch = Number(v.branch) * 10, feed = Number(v.feed) * 10;
  const out = (FLOW[String(v.flow)] ?? FLOW.mid).out;
  const built = host.simulate((t) => {
    for (let i = 0; i < n; i++) {
      const x = i * gap;
      // A tee at each plant on the line (an elbow at the last one), and the stake at the end of its branch.
      if (n > 1) t.add('hoseTee', { name: i === n - 1 ? 'Kolanko' : 'Trójnik', params: { kind: i === n - 1 ? 'elbow' : 'tee', d: tube.d, La: 16 }, position: [r1(x), 0, 0], rotation: [0, 0, 180], color: '#6b7530' });
      t.add('dripStake', { name: 'Kroplownik', params: { d: tube.d, L: 70, out }, position: [r1(x), r1(-branch), 0], rotation: [0, 0, 90], color: '#f26419' });
    }
  });
  const { parts, items, size } = rawPlan(built, (main) =>
    main.type === 'dripStake'
      ? { role: 'K', name: 'Kroplownik (szpilka)', group: 'clip', material: 'PETG', where: 'Wbity w ziemię przy każdej roślinie', how: 'Na boku, płaskim spodem do stołu.' }
      : main.params.kind === 'elbow'
        ? { role: 'L', name: 'Kolanko', group: 'fit', material: 'PETG', where: 'Koniec linii, przy ostatniej roślinie', how: 'Płasko, bez podpór.' }
        : { role: 'T', name: 'Trójnik', group: 'fit', material: 'PETG', where: 'Na linii przy każdej roślinie', how: 'Płasko, bez podpór.' },
  );
  // Tubes in the preview, moved like the parts.
  const p0 = built[0], m0 = parts[0];
  const dx = m0.position[0] - p0.position[0], dy = m0.position[1] - p0.position[1];
  const z = 2;
  const rods: Plan['rods'] = [];
  const rod = (a: [number, number], b: [number, number]) => rods.push({ a: [a[0] + dx, a[1] + dy, z], b: [b[0] + dx, b[1] + dy, z], d: tube.od, color: '#7fb3d5' });
  rod([-Math.min(feed, 400), 0], [0, 0]);
  for (let i = 0; i < n; i++) {
    if (i < n - 1) rod([i * gap + 12, 0], [(i + 1) * gap - 12, 0]);
    rod([i * gap, -10], [i * gap, -branch + 14]);
  }
  const len = feed + (n - 1) * gap + n * branch;
  const buy: Plan['buy'] = [
    { name: tube.what, qty: `${mm(Math.ceil((len * 1.1) / 100) / 10)} m`, note: `Dopływ ${mm(feed / 10)} cm, linia ${mm(((n - 1) * gap) / 10)} cm, odgałęzienia ${n} × ${mm(branch / 10)} cm, plus 10% zapasu.` },
    { name: 'Pojemnik na wodę z kranikiem (kanister, wiadro z zaworem)', qty: '1 szt.', note: 'Postaw co najmniej 50 cm wyżej niż doniczki: woda płynie grawitacyjnie.' },
    { name: `Zaworek rolkowy na wężyk ${tube.label}`, qty: '1 szt.', note: 'Na dopływie: zakręcasz albo zmniejszasz przepływ dla całej linii.' },
  ];
  const notes: Plan['notes'] = [
    { text: `${pl(n, 'roślina', 'rośliny', 'roślin')}, co ${mm(gap / 10)} cm. Otwór kroplownika ${mm(out)} mm.` },
    { text: 'Przy kilku roślinach te najbliżej pojemnika dostają trochę więcej wody. Wyrównasz to, dając im wolniejsze kroplowniki.' },
  ];
  if (n > 12) notes.push({ warn: true, text: `Przy ${n} roślinach i cienkim wężyku ostatnie dostaną mało wody: podziel linię na dwie z osobnym dopływem.` });
  return {
    items,
    placements: [],
    parts,
    buy,
    steps: [
      'Wydrukuj z PETG (PLA mięknie na słońcu): trójniki, kolanko i kroplowniki.',
      'Przedmuchaj kroplowniki: otworek musi być drożny. W razie potrzeby przepchnij go igłą.',
      'Potnij wężyk: linia między trójnikami i odgałęzienia do kroplowników.',
      'Nasuń wężyk na karby (ciepła woda pomaga), wbij kroplowniki w ziemię otworkiem w stronę rośliny.',
      'Podłącz dopływ do pojemnika, odkręć zaworek i sprawdź, czy każdy kroplownik kapie.',
    ],
    notes,
    bed,
    longest: 80,
    size: size as Vec3,
    rods,
  };
}

export const IRRIGATION_WIZARD: Wizard = {
  id: 'irrigation',
  label: 'Nawadnianie kropelkowe',
  desc: 'Linia z wężyka z drukowanymi trójnikami i kroplownikami wbijanymi w ziemię, zasilana grawitacyjnie z kanistra. Liczba roślin, rozstaw, tempo kapania i lista zakupów.',
  defaults: { plants: 6, gap: 30, branch: 20, feed: 150, tube: '4', flow: 'mid', printer: 'p1s' },
  set: (v, key, value) => ({ ...v, [key]: value }),
  plan: irrigationPlan,
  steps: [
    {
      title: 'Rośliny',
      desc: 'Ile roślin i jak daleko od siebie stoją.',
      focus: [],
      focusLabel: 'rośliny',
      fields: () => [
        { kind: 'slider', key: 'plants', label: 'Liczba roślin', min: 1, max: 20, step: 1, unit: '' },
        { kind: 'slider', key: 'gap', label: 'Odstęp między roślinami', min: 10, max: 100, step: 1, unit: 'cm' },
        { kind: 'slider', key: 'branch', label: 'Odgałęzienie do rośliny', min: 5, max: 60, step: 1, unit: 'cm' },
        { kind: 'slider', key: 'feed', label: 'Dopływ od pojemnika', min: 30, max: 500, step: 10, unit: 'cm' },
      ],
    },
    {
      title: 'Wężyk i kapanie',
      desc: 'Średnica wężyka ustala karby; otwór kroplownika ustala, jak szybko kapie.',
      focus: [],
      focusLabel: 'kroplowniki',
      fields: () => [
        tiles('tube', Object.entries(TUBES).map(([k, t]) => ({ value: k, label: t.label })), 'Wężyk (wewnątrz / na zewnątrz)', 3),
        tiles('flow', Object.entries(FLOW).map(([k, f]) => ({ value: k, label: f.label, desc: f.desc })), 'Tempo kapania', 3),
      ],
    },
    { title: 'Drukarka', desc: 'Części są małe, mieszczą się na każdym stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia trójniki i kroplowniki; wężyk i pojemnik są na liście zakupów.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};
