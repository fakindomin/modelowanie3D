import * as THREE from 'three';
import { DEFS, type Params } from '../catalog';
import { fittingGeo, fittingLift, PROFILE_SIZES } from '../parts/couplings';
import type { Vec3, WizValues } from '../types';
import { bedOf, mm, pl, printerField, r1, tiles } from './common';
import { eulerFor, originFor } from './frame';
import type { Plan, PlanItem, Placement, Wizard } from './types';

// ------------------------------------------------------------------------------------- frame of bought square profiles

/** Bought profiles: hollow ones take a plug (czop) inside, solid laths a socket over the end. */
const STOCK: Record<string, { label: string; std: string; S: number; T: number; end: 'plug' | 'socket'; what: string }> = {
  sq15: { label: 'Profil 15×15', std: 'sq15', S: 15, T: 1.5, end: 'plug', what: 'Profil stalowy lub aluminiowy 15×15' },
  sq20: { label: 'Profil 20×20', std: 'sq20', S: 20, T: 1.5, end: 'plug', what: 'Profil stalowy lub aluminiowy 20×20' },
  sq25: { label: 'Profil 25×25', std: 'sq25', S: 25, T: 2, end: 'plug', what: 'Profil stalowy lub aluminiowy 25×25' },
  sq30: { label: 'Profil 30×30', std: 'sq30', S: 30, T: 2, end: 'plug', what: 'Profil stalowy lub aluminiowy 30×30' },
  wood20: { label: 'Listwa 20×20', std: 'custom', S: 20, T: 0, end: 'socket', what: 'Listwa drewniana 20×20 (sosna, buk)' },
  wood30: { label: 'Listwa 30×30', std: 'custom', S: 30, T: 0, end: 'socket', what: 'Listwa drewniana 30×30 (sosna, buk)' },
};
const TEMPLATES: Record<string, { label: string; desc: string; v: WizValues }> = {
  shelf: { label: 'Regał', desc: 'Półki na poziomach', v: { W: 80, D: 30, H: 120, rings: 2, shelves: true, top: true } },
  table: { label: 'Stolik', desc: 'Niski, z blatem', v: { W: 60, D: 40, H: 45, rings: 0, shelves: false, top: true } },
  box: { label: 'Skrzynia / szkielet', desc: 'Prostopadłościan z profili', v: { W: 50, D: 50, H: 50, rings: 0, shelves: false, top: false } },
};
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

function profilePlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const st = STOCK[String(v.stock)] ?? STOCK.sq20;
  const W = Number(v.W) * 10, Dp = Number(v.D) * 10, H = Number(v.H) * 10, levels = Number(v.rings) + 1, S = st.S;
  const fit = (kind: string): Params => ({
    ...Object.fromEntries(DEFS.profileFitting.params.map((q) => [q.key, q.def])),
    kind,
    end: st.end,
    std: st.std,
    D: S,
    H: S,
    T: st.T || 1.5,
    depth: Math.round(S * 1.1),
    wall: S >= 25 ? 3 : 2.5,
    luz: st.end === 'socket' ? 0.3 : 0.2,
    press: 'ribs',
    screw: v.screws ? 'M4' : 'none',
    screwMode: 'pilot',
  });
  const items: PlanItem[] = [];
  const placements: Placement[] = [];
  const byKey = new Map<string, PlanItem>();
  const use = (key: string, make: () => PlanItem) => {
    let it = byKey.get(key);
    if (!it) byKey.set(key, (it = make())), items.push(it);
    it.qty++;
    return it;
  };
  const xs = [S / 2, W - S / 2], ys = [S / 2, Dp - S / 2];
  const zs = Array.from({ length: levels + 1 }, (_, i) => S / 2 + (i * (H - S)) / levels);
  const stop: Record<string, number> = {};
  const NAMES: Record<string, [string, string]> = { corner3: ['Narożnik 3D', 'Narożniki na dole i na górze'], corner4: ['Łącznik 4-ramienny', 'Słupki na wysokości półek'] };
  for (const x of xs)
    for (const y of ys)
      zs.forEach((z, i) => {
        const dirs = [X.clone().multiplyScalar(x === xs[0] ? 1 : -1), Y.clone().multiplyScalar(y === ys[0] ? 1 : -1)];
        if (i < levels) dirs.push(Z.clone());
        if (i > 0) dirs.push(Z.clone().negate());
        const kind = dirs.length === 3 ? 'corner3' : 'corner4';
        const p = fit(kind);
        const geo = fittingGeo(p, true);
        stop[kind] = geo.stop;
        const it = use(kind, () => ({ role: kind === 'corner3' ? 'N' : 'C', name: NAMES[kind][0], type: 'profileFitting', params: p, qty: 0, group: 'fit', color: kind === 'corner3' ? '#f26419' : '#8a9440', material: 'PETG', where: NAMES[kind][1], how: 'Stoi na jednym ramieniu, podpory drzewkowe pod ramionami poziomymi.' }));
        const rot = eulerFor(geo.dirs, dirs);
        placements.push({ role: it.role, rotation: rot, position: originFor(rot, new THREE.Vector3(0, 0, fittingLift(p, true)), new THREE.Vector3(x, y, z)) });
      });
  // Cut list: each span minus the fittings' stops at both ends.
  const sk = (i: number) => stop[i === 0 || i === levels ? 'corner3' : 'corner4'];
  const cuts = new Map<string, number>();
  const add = (label: string, len: number, n: number) => cuts.set(`${label}|${r1(len)}`, (cuts.get(`${label}|${r1(len)}`) ?? 0) + n);
  for (let i = 0; i < levels; i++) add('słupek', zs[i + 1] - zs[i] - sk(i) - sk(i + 1), 4);
  zs.forEach((_, i) => {
    add('krawędź wzdłuż', W - S - 2 * sk(i), 2);
    add('krawędź w głąb', Dp - S - 2 * sk(i), 2);
  });
  // The bought profiles, drawn in the preview only.
  const rods: Plan['rods'] = [];
  const rod = (a: Vec3, b: Vec3) => rods.push({ a, b, d: S, color: st.end === 'socket' ? '#c8a27a' : '#b3b6aa' });
  for (const x of xs) for (const y of ys) rod([x, y, zs[0]], [x, y, zs[levels]]);
  for (const z of zs) {
    for (const y of ys) rod([xs[0], y, z], [xs[1], y, z]);
    for (const x of xs) rod([x, ys[0], z], [x, ys[1], z]);
  }
  const buy: Plan['buy'] = [...cuts].map(([k, n]) => {
    const [label, len] = k.split('|');
    return { name: `${st.what}: ${label}`, qty: `${n} szt. × ${mm(Number(len))} mm`, note: 'Tnij piłką do metalu (drewna) z prowadnicą, równo pod kątem 90°.' };
  });
  const total = [...cuts].reduce((a, [k, n]) => a + Number(k.split('|')[1]) * n, 0);
  if (v.screws) buy.push({ name: 'Wkręt do tworzyw M4 × 12', qty: `${placements.length * 3 + (levels - 1) * 4} szt.`, note: 'Po jednym w każde ramię łącznika.' });
  const shelfZ = [...(v.shelves ? zs.slice(0, -1) : []), ...(v.top ? [zs[levels]] : [])];
  const boards: Plan['boards'] = shelfZ.map((z) => ({ size: [W - S, Dp - S, 10] as Vec3, position: [W / 2, Dp / 2, z + S / 2 + 5] as Vec3 }));
  if (v.shelves) buy.push({ name: `Półki: sklejka 10 mm ${mm(W - S)} × ${mm(Dp - S)} mm`, qty: `${levels} szt.`, note: `Wytnij w rogach wcięcia ${mm(S + 10)} × ${mm(S + 10)} mm na łączniki. Leżą na krawędziach poziomów.` });
  if (v.top) buy.push({ name: `Blat: sklejka lub płyta ${mm(W - S)} × ${mm(Dp - S)} mm`, qty: '1 szt.', note: 'Leży na górnej ramie, wcięcia w rogach jak w półkach.' });
  const notes: Plan['notes'] = [{ text: `Rama ${mm(W)} × ${mm(Dp)} × ${mm(H)} mm (${st.label.toLowerCase()}): ${pl(placements.length, 'łącznik', 'łączniki', 'łączników')}, razem ${String(r1(total / 1000)).replace('.', ',')} m profilu.` }];
  if (st.end === 'socket') notes.push({ text: 'Łączniki nasuwane na listwy: zmierz listwę suwmiarką, drewno bywa grubsze o 0,5 mm.' });
  if (H > 4 * Math.min(W, Dp)) notes.push({ warn: true, text: 'Wysoka i wąska rama: przykręć ją do ściany albo dodaj poziomy.' });
  return {
    items,
    placements,
    buy,
    steps: [
      'Wydrukuj łączniki (PETG, 4 ścianki).',
      'Potnij profile według listy zakupów.',
      'Złóż dolną ramę, wstaw słupki, potem kolejne poziomy i górną ramę.',
      ...(v.screws ? ['Wkręć wkręty przez otwory w ramionach łączników.'] : []),
      ...(shelfZ.length ? ['Połóż półki i blat na krawędziach poziomów.'] : []),
    ],
    notes,
    bed,
    longest: S * 3,
    size: [W, Dp, H],
    boards,
    rods,
  };
}

export const PROFILE_FRAME_WIZARD: Wizard = {
  id: 'profileFrame',
  label: 'Rama z profili',
  desc: 'Rama z kupnych profili kwadratowych albo listew, łączona drukowanymi narożnikami z czopem lub nasuwką. Poziomy, półki, blat i lista cięcia.',
  defaults: { tpl: 'shelf', W: 80, D: 30, H: 120, rings: 2, shelves: true, top: true, stock: 'sq20', screws: true, printer: 'p1s' },
  set(v, key, value) {
    const next = { ...v, [key]: value };
    if (key === 'tpl' && TEMPLATES[String(value)]) Object.assign(next, TEMPLATES[String(value)].v);
    return next;
  },
  plan: profilePlan,
  steps: [
    {
      title: 'Rodzaj',
      desc: 'Szablon ustawia wymiary; każdy zmienisz w następnym kroku.',
      focus: [],
      focusLabel: 'rama',
      fields: () => [tiles('tpl', Object.entries(TEMPLATES).map(([k, t]) => ({ value: k, label: t.label, desc: t.desc })), undefined, 3)],
    },
    {
      title: 'Wymiary',
      desc: 'Zewnętrzne wymiary ramy i liczba poziomów między dołem a górą.',
      focus: [],
      focusLabel: 'wymiary',
      fields: () => [
        { kind: 'slider', key: 'W', label: 'Szerokość', min: 20, max: 200, step: 1, unit: 'cm' },
        { kind: 'slider', key: 'D', label: 'Głębokość', min: 15, max: 150, step: 1, unit: 'cm' },
        { kind: 'slider', key: 'H', label: 'Wysokość', min: 15, max: 220, step: 1, unit: 'cm' },
        { kind: 'slider', key: 'rings', label: 'Poziomy pośrednie', min: 0, max: 5, step: 1, unit: '' },
      ],
    },
    {
      title: 'Profile i łączniki',
      desc: 'Puste profile dostają czop w środek, drewniane listwy nasuwkę na koniec.',
      focus: ['fit'],
      focusLabel: 'łączniki',
      fields: () => [
        tiles('stock', Object.entries(STOCK).map(([k, s]) => ({ value: k, label: s.label, desc: s.end === 'plug' ? 'Czop do środka' : 'Nasuwka' })), 'Profil', 3),
        { kind: 'toggle', key: 'screws', label: 'Otwory na wkręty', desc: 'Rama nie rozjedzie się przy przesuwaniu.' },
      ],
    },
    {
      title: 'Półki i blat',
      desc: 'Płyty kupne, leżą na krawędziach poziomów.',
      focus: [],
      focusLabel: 'półki',
      fields: () => [
        { kind: 'toggle', key: 'shelves', label: 'Półki', desc: 'Na dole i na każdym poziomie.' },
        { kind: 'toggle', key: 'top', label: 'Blat', desc: 'Na górnej ramie.' },
      ],
    },
    { title: 'Drukarka', desc: 'Łączniki są małe, mieszczą się na każdym stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia łączniki; profile i płyty są na liście zakupów.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};
