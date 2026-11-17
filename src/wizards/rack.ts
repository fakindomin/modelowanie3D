import * as THREE from 'three';
import { jointCore } from '../parts/useful4';
import type { Vec3, WizValues } from '../types';
import { bedOf, mm, pl, printerField, r1, tiles } from './common';
import { host } from './host';
import { rawPlan } from './raw';
import type { Plan, Wizard } from './types';

// ------------------------------------------------------------------------------------- modular rack of boards

const BOARDS: Record<string, string> = { '12': 'Sklejka 12 mm', '15': 'Sklejka 15 mm', '16': 'Płyta meblowa 16 mm', '18': 'Płyta meblowa / MDF 18 mm' };
const SHAPES: Record<string, { arms: string; name: string; role: string }> = {
  ru: { arms: 'ru', name: 'Narożnik', role: 'N' },
  rlu: { arms: 'rlu', name: 'Trójnik', role: 'T' },
  rlud: { arms: 'rlud', name: 'Krzyżak', role: 'X' },
};
const DIR: Record<string, THREE.Vector3> = { r: new THREE.Vector3(1, 0, 0), l: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1), d: new THREE.Vector3(0, 0, -1) };

/** The canonical connector and its turn about Y that gives the wanted arms. */
function orient(want: string): { shape: string; turn: number } {
  const key = (arms: string, a: number) =>
    [...arms]
      .map((c) => {
        const v = DIR[c].clone().applyEuler(new THREE.Euler(0, (a * Math.PI) / 180, 0));
        return Object.entries(DIR).find(([, d]) => d.distanceTo(v) < 0.01)![0];
      })
      .sort()
      .join('');
  const goal = [...want].sort().join('');
  for (const shape of Object.keys(SHAPES)) for (const a of [0, 90, 180, 270]) if (key(SHAPES[shape].arms, a) === goal) return { shape, turn: a };
  return { shape: 'rlud', turn: 0 };
}

function rackPlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const t = Number(v.t), cols = Number(v.cols), rows = Number(v.rows), W = Number(v.W), H = Number(v.H), D = Number(v.D), L = Number(v.L);
  const base = { t, L, holes: !!v.holes, s: 25, w: 3, cl: 0.3, screwD: 3 };
  const c0 = jointCore(base);
  const built = host.simulate((tt) => {
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const want = (i < cols ? 'r' : '') + (i > 0 ? 'l' : '') + (j < rows ? 'u' : '') + (j > 0 ? 'd' : '');
        const { shape, turn } = orient(want);
        for (const y of [L / 2, D - L / 2])
          tt.add('boardJoint', { name: SHAPES[shape].name, params: { ...base, arms: shape }, position: [r1(c0 + i * W), r1(y), r1(c0 + j * H)], rotation: [0, turn, 0], color: shape === 'rlud' ? '#f26419' : shape === 'rlu' ? '#8a9440' : '#6b7530' });
      }
  });
  const { parts, items, size } = rawPlan(built, (main) => {
    const sh = SHAPES[String(main.params.arms)];
    return { role: sh.role, name: sh.name, group: 'fit', material: 'PETG', where: sh.role === 'N' ? 'Narożniki regału' : sh.role === 'T' ? 'Brzegi: półka z przegrodą' : 'Środek: półki i przegrody się krzyżują', how: 'Przekrojem do stołu, bez podpór.' };
  });
  const gap = 0.5; // between a board's end and the core
  const lh = W - 2 * c0 - 2 * gap, lv = H - 2 * c0 - 2 * gap;
  const nh = cols * (rows + 1), nv = (cols + 1) * rows;
  const boards: Plan['boards'] = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i < cols; i++) boards.push({ size: [lh, D, t], position: [c0 + i * W + W / 2, D / 2, c0 + j * H] });
  for (let j = 0; j < rows; j++) for (let i = 0; i <= cols; i++) boards.push({ size: [t, D, lv], position: [c0 + i * W, D / 2, c0 + j * H + H / 2] });
  const name = BOARDS[String(t)] ?? `Płyta ${mm(t)} mm`;
  const buy: Plan['buy'] = [
    { name: `${name}: półki`, qty: `${nh} szt. ${mm(lh)} × ${mm(D)} mm`, note: 'Docięte w markecie albo w hurtowni płyt.' },
    { name: `${name}: przegrody`, qty: `${nv} szt. ${mm(lv)} × ${mm(D)} mm` },
  ];
  const joints = 2 * (cols + 1) * (rows + 1);
  if (v.holes) buy.push({ name: 'Wkręty 3 × 16 mm', qty: `${joints * 2 * 2} szt.`, note: 'Po jednym w każde ramię złączki, od spodu i od tyłu, żeby nie było ich widać.' });
  const notes: Plan['notes'] = [
    { text: `Regał ${mm(cols * W + 2 * c0)} × ${mm(D)} × ${mm(rows * H + 2 * c0)} mm: ${pl(cols * rows, 'przegródka', 'przegródki', 'przegródek')}, ${pl(joints, 'złączka', 'złączki', 'złączek')}.` },
    { text: 'Rozbudowa: dokładasz płyty i zamieniasz narożniki na trójniki, a trójniki na krzyżaki. Złączki z tej listy pasują do każdej wielkości regału z tymi płytami.' },
  ];
  if (rows * H > 3 * D) notes.push({ warn: true, text: 'Wysoki i płytki regał przykręć do ściany kątownikiem.' });
  if (W > 600) notes.push({ warn: true, text: 'Półka dłuższa niż 60 cm ugnie się pod książkami: dodaj przegrodę.' });
  return {
    items,
    placements: [],
    parts,
    buy,
    steps: [
      'Wydrukuj złączki przekrojem do stołu (PETG jest sprężysty i nie pęka przy wciskaniu płyt).',
      'Zacznij od dolnych półek: wciśnij je w narożniki i trójniki, z przodu i z tyłu.',
      'Wstaw przegrody w ramiona skierowane w górę, na nie górne złączki i kolejne półki.',
      ...(v.holes ? ['Gdy wszystko stoi prosto, wkręć wkręty przez otwory w ramionach.'] : []),
    ],
    notes,
    bed,
    longest: L,
    size: size as Vec3,
    boards,
  };
}

export const RACK_WIZARD: Wizard = {
  id: 'rack',
  label: 'Regał modułowy',
  desc: 'Regał z kupnych płyt łączonych drukowanymi złączkami: narożniki, trójniki i krzyżaki. Liczba półek i przegród, rozbudowa w górę i w bok, lista cięcia płyt.',
  defaults: { t: 18, D: 300, cols: 3, rows: 3, W: 350, H: 330, L: 30, holes: true, printer: 'p1s' },
  set: (v, key, value) => ({ ...v, [key]: value }),
  plan: rackPlan,
  steps: [
    {
      title: 'Płyty',
      desc: 'Grubość płyt ustala szczeliny w złączkach. Głębokość to szerokość płyt.',
      focus: [],
      focusLabel: 'płyty',
      fields: () => [
        tiles('t', Object.entries(BOARDS).map(([k, l]) => ({ value: Number(k), label: `${k} mm`, desc: l.replace(/ \d+ mm$/, '') })), 'Grubość płyty', 4),
        { kind: 'slider', key: 'D', label: 'Głębokość regału', min: 150, max: 500, step: 5, unit: 'mm' },
      ],
    },
    {
      title: 'Układ',
      desc: 'Kolumny i rzędy przegródek oraz wielkość jednej (od środka do środka płyt).',
      focus: [],
      focusLabel: 'regał',
      fields: () => [
        { kind: 'slider', key: 'cols', label: 'Kolumny', min: 1, max: 6, step: 1, unit: '' },
        { kind: 'slider', key: 'rows', label: 'Rzędy', min: 1, max: 6, step: 1, unit: '' },
        { kind: 'slider', key: 'W', label: 'Szerokość przegródki', min: 150, max: 800, step: 5, unit: 'mm' },
        { kind: 'slider', key: 'H', label: 'Wysokość przegródki', min: 150, max: 500, step: 5, unit: 'mm' },
      ],
    },
    {
      title: 'Złączki',
      desc: 'Dwie złączki na każdy węzeł: z przodu i z tyłu.',
      focus: ['fit'],
      focusLabel: 'złączki',
      fields: () => [
        { kind: 'slider', key: 'L', label: 'Długość złączki', min: 25, max: 80, step: 1, unit: 'mm' },
        { kind: 'toggle', key: 'holes', label: 'Otwory na wkręty', desc: 'Regał nie rozjedzie się przy przesuwaniu.' },
      ],
    },
    { title: 'Drukarka', desc: 'Złączki są małe, mieszczą się na każdym stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia złączki; płyty są na liście zakupów.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};
