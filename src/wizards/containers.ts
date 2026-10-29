import { MAGNETS, type Params } from '../catalog';
import { worldBox } from '../geom/parts';
import { TEXTURE_LABELS } from '../geom/texture';
import type { WallSide } from '../parts/connectors';
import type { Part, Texture, TextureFace, Vec3, WizValues } from '../types';
import { PRINTERS } from './frame';
import { host, type WizTools } from './host';
import { rawPlan } from './raw';
import type { Field, Plan, Wizard } from './types';

const r1 = (v: number) => Math.round(v * 10) / 10;
const mm = (v: number) => String(r1(v)).replace('.', ',');
const pl = (n: number, one: string, few: string, many: string) => {
  const f = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return `${n} ${n === 1 ? one : f ? few : many}`;
};
const tiles = (key: string, options: Extract<Field, { kind: 'tiles' }>['options'], label?: string, cols?: 2 | 3 | 4): Field => ({ kind: 'tiles', key, label, options, cols });
const printerField: Field = tiles('printer', Object.entries(PRINTERS).map(([k, pr]) => ({ value: k, label: pr.label, desc: `${pr.bed.join(' × ')} mm` })));
const bedOf = (v: WizValues) => (PRINTERS[String(v.printer)] ?? PRINTERS.p1s).bed;

// ------------------------------------------------------------------------------------- looks (shared)

const texture = (pattern: string, face: TextureFace): Texture => ({ pattern: pattern as Texture['pattern'], face, mode: 'add', depth: 0.8, spacing: 3, angle: 0, margin: 3 });
const SIDES: Record<string, string> = { front: 'Przód', back: 'Tył', left: 'Lewy bok', right: 'Prawy bok' };
const texField = (round: boolean): Field[] => [tiles('tex', [{ value: 'none', label: 'Gładko' }, ...Object.entries(TEXTURE_LABELS).map(([k, l]) => ({ value: k, label: l }))], 'Faktura ścianki', 3)];
const texSideField = (v: WizValues, round: boolean): Field[] =>
  v.tex !== 'none' && !round ? [tiles('texOn', Object.entries(SIDES).map(([k, l]) => ({ value: k, label: l })), 'Na której ściance', 4)] : [];

/** A label on one face of the body `host` belongs to, as large as the face allows. */
function addLabel(t: WizTools, on: Part, text: string, side: WallSide, cut: boolean, maxW: number, maxH: number) {
  const len = Math.max(1, [...text].length);
  const size = r1(Math.max(3, Math.min(12, maxH * 0.45, (maxW * 0.8) / (len * 1.0))));
  const id = t.add(cut ? 'textCut' : 'text', { name: 'Napis', params: { text, size, depth: 0.8, bold: size < 6 ? 0.3 : 0 }, body: on.body, color: on.color });
  t.textToWall(id, side);
}

/** Half-round finger notch in the top of the front wall. */
function addNotch(t: WizTools, box: Part) {
  const b = worldBox(box);
  const wall = Number(box.params.T) || 2;
  const r = r1(Math.min(12, (b.max.z - b.min.z) / 2.5, (b.max.x - b.min.x) / 4));
  t.add('hole', { name: 'Wycięcie na palec', params: { D: 2 * r, H: 4 * wall + 2, luz: 0 }, position: [r1((b.min.x + b.max.x) / 2), r1(b.min.y + 2 * wall + 1), r1(b.max.z)], rotation: [90, 0, 0], body: box.body });
}

/** How many columns go into each printed piece so that none is wider than `limit` (as even as possible). */
function split(n: number, cell: number, limit: number) {
  const per = Math.max(1, Math.floor(limit / cell));
  const pieces = Math.ceil(n / per);
  const base = Math.floor(n / pieces), extra = n % pieces;
  return Array.from({ length: pieces }, (_, i) => base + (i < extra ? 1 : 0));
}

// ------------------------------------------------------------------------------------- organizer

function organizer(v: WizValues): Plan {
  const bed = bedOf(v);
  const luz = Number(v.luz);
  const W0 = Number(v.dW) - 2 * luz, D0 = Number(v.dD) - 2 * luz;
  const H = Math.max(10, Number(v.dH) - 3);
  const nx = Number(v.nx), ny = Number(v.ny), wall = Number(v.wall), rad = Number(v.rad);
  const cw = W0 / nx, ch = D0 / ny;
  const bins = v.mode === 'bins';
  // Relief on a wall (texture, raised letters) sticks out 0.8 mm: leave room for it between pieces.
  const GAP = (bins ? 0.6 : 0.3) + (v.tex !== 'none' ? 1 : 0) + (String(v.text ?? '').trim() && v.textMode === 'raised' ? 1 : 0);
  const gx = bins ? Array(nx).fill(1) : split(nx, cw, bed[0] - 6);
  const gy = bins ? Array(ny).fill(1) : split(ny, ch, bed[1] - 6);
  const base: Params = { shape: 'rect', H: r1(H), T: wall, B: 1.2, divMode: 'grid', rad, slide: false, low: 0 };

  const roles = new Map<string, string>();
  const built = host.simulate((t) => {
    let x = 0;
    for (const cx of gx) {
      let y = 0;
      const W = cx * cw;
      for (const cy of gy) {
        const D = cy * ch;
        const key = `${r1(W)}x${r1(D)}x${cx}x${cy}`;
        if (!roles.has(key)) roles.set(key, bins ? 'K' : `W${roles.size + 1}`);
        const id = t.add('box', {
          name: bins ? 'Pojemnik' : 'Wkład',
          params: { ...base, W: r1(W - GAP), D: r1(D - GAP), nx: cx, ny: cy, div: '' },
          position: [r1(x + W / 2), r1(y + D / 2), 0],
          color: '#c9b48a',
          ...(v.tex !== 'none' ? { texture: texture(String(v.tex), String(v.texOn) as TextureFace) } : {}),
        });
        const box = t.parts().find((p) => p.id === id)!;
        if (bins && v.notch) addNotch(t, box);
        const label = String(v.text ?? '').trim();
        if (label) addLabel(t, box, label, 'front', v.textMode !== 'raised', W - GAP, H * 0.5);
        y += D;
      }
      x += W;
    }
  });
  const { parts, items, size } = rawPlan(built, (main) => {
    const key = `${r1(Number(main.params.W) + GAP)}x${r1(Number(main.params.D) + GAP)}x${main.params.nx}x${main.params.ny}`;
    const role = roles.get(key) ?? 'W';
    const cells = Number(main.params.nx) * Number(main.params.ny);
    return {
      role,
      name: bins ? `Pojemnik ${mm(Number(main.params.W))} × ${mm(Number(main.params.D))} mm` : `Wkład ${mm(Number(main.params.W))} × ${mm(Number(main.params.D))} mm, ${pl(cells, 'komora', 'komory', 'komór')}`,
      group: 'box',
      material: 'PLA',
      where: bins ? 'Jedna komora szuflady, pojemniki stoją obok siebie' : role === 'W1' && roles.size === 1 ? 'Cała szuflada' : 'Część wkładu, kawałki stykają się w szufladzie',
      how: 'Dnem do stołu, bez podpór.',
    };
  });

  const pieces = items.reduce((a, i) => a + i.qty, 0);
  const notes: Plan['notes'] = [];
  notes.push({ text: `Komora ${mm(cw - wall)} × ${mm(ch - wall)} mm, wysokość ${mm(H)} mm (3 mm niżej niż szuflada).` });
  if (!bins && pieces > 1) notes.push({ text: `Wkład nie mieści się na stole w całości: dzielę go na ${pl(pieces, 'część', 'części', 'części')} wzdłuż przegródek.` });
  const tooBig = items.some((i) => Number(i.params.W) > bed[0] || Number(i.params.D) > bed[1]);
  if (tooBig) notes.push({ warn: true, text: 'Komora jest większa niż stół drukarki. Dodaj przegródek albo wybierz większą drukarkę.' });
  if (Math.min(cw, ch) < 15) notes.push({ warn: true, text: 'Komory węższe niż 15 mm trudno opróżnić palcami. Zmniejsz liczbę przegródek.' });
  if (String(v.text ?? '').trim() && v.tex !== 'none' && v.texOn === 'front') notes.push({ warn: true, text: 'Napis i faktura są na przedniej ściance, napis będzie słabo widać. Przenieś fakturę na bok.' });
  if (H < 15) notes.push({ warn: true, text: 'Bardzo niski wkład: sprawdź wysokość szuflady.' });

  return {
    items,
    placements: [],
    parts,
    buy: [],
    steps: [
      'Wydrukuj części z listy, dnem do stołu.',
      bins ? 'Ustaw pojemniki w szufladzie rzędami. Luz w szufladzie wynosi ' + mm(luz) + ' mm z każdej strony.' : pieces > 1 ? 'Ułóż części wkładu w szufladzie tak, jak na rysunku: stykają się ściankami.' : 'Włóż wkład do szuflady.',
    ],
    notes,
    bed,
    longest: H,
    size: [size[0], size[1], H],
    boards: [{ size: [Number(v.dW), Number(v.dD), 1.5] as Vec3, position: [W0 / 2, D0 / 2, -1] as Vec3 }],
  };
}

export const ORGANIZER_WIZARD: Wizard = {
  id: 'organizer',
  label: 'Organizer do szuflady',
  desc: 'Wkład z przegródkami albo osobne pojemniki na wymiar szuflady, dzielony na części mieszczące się na stole.',
  defaults: { dW: 300, dD: 400, dH: 60, luz: 1, mode: 'one', nx: 3, ny: 4, wall: 1.6, rad: 3, tex: 'none', texOn: 'front', notch: true, text: '', textMode: 'cut', printer: 'p1s' },
  set: (v, key, value) => ({ ...v, [key]: value }),
  plan: organizer,
  steps: [
    {
      title: 'Szuflada',
      desc: 'Zmierz wnętrze szuflady: szerokość, głębokość i wysokość. Wkład będzie trochę mniejszy, żeby wszedł bez wciskania.',
      focus: [],
      focusLabel: 'wymiary szuflady',
      fields: () => [
        { kind: 'slider', key: 'dW', label: 'Szerokość wnętrza', min: 60, max: 800, step: 5, unit: 'mm' },
        { kind: 'slider', key: 'dD', label: 'Głębokość wnętrza', min: 60, max: 800, step: 5, unit: 'mm' },
        { kind: 'slider', key: 'dH', label: 'Wysokość wnętrza', min: 20, max: 250, step: 1, unit: 'mm' },
        tiles('luz', [{ value: 0.5, label: '0,5 mm', desc: 'ciasno' }, { value: 1, label: '1 mm', desc: 'zwykle' }, { value: 2, label: '2 mm', desc: 'luźno' }], 'Luz od ścianek szuflady', 3),
      ],
    },
    {
      title: 'Układ',
      desc: 'Jeden wkład z przegródkami trzyma się razem. Osobne pojemniki można przestawiać i wyjmować.',
      focus: [],
      focusLabel: 'komory',
      fields: () => [
        tiles('mode', [{ value: 'one', label: 'Wkład z przegródkami', desc: 'dzielony tylko gdy za duży na stół' }, { value: 'bins', label: 'Osobne pojemniki', desc: 'każda komora wyjmowana' }]),
        { kind: 'slider', key: 'nx', label: 'Komory wszerz', min: 1, max: 12, step: 1, unit: '' },
        { kind: 'slider', key: 'ny', label: 'Komory w głąb', min: 1, max: 12, step: 1, unit: '' },
      ],
    },
    {
      title: 'Wykończenie',
      desc: 'Grubsza ścianka jest sztywniejsza, cieńsza drukuje się szybciej. Zaokrąglone narożniki łatwiej wyczyścić.',
      focus: [],
      focusLabel: 'ścianki',
      fields: () => [
        tiles('wall', [{ value: 1.2, label: '1,2 mm', desc: 'lekko, szybko' }, { value: 1.6, label: '1,6 mm', desc: 'zwykle' }, { value: 2, label: '2 mm', desc: 'mocno' }], 'Ścianka', 3),
        tiles('rad', [{ value: 0, label: 'Ostre' }, { value: 3, label: '3 mm' }, { value: 6, label: '6 mm' }], 'Narożniki', 3),
      ],
    },
    {
      title: 'Wygląd',
      desc: 'Faktura i napis na ściance, wycięcie na palec w pojemnikach.',
      focus: [],
      focusLabel: 'wygląd',
      fields: (v) => [
        ...texField(false),
        ...texSideField(v, false),
        ...(v.mode === 'bins' ? [{ kind: 'toggle' as const, key: 'notch', label: 'Wycięcie na palec', desc: 'Półokrągłe wycięcie w przedniej ściance każdego pojemnika: łatwiej go wyjąć.' }] : []),
        { kind: 'text', key: 'text', label: 'Napis na przodzie każdej części', placeholder: 'np. ŚRUBKI', max: 24 },
        ...(String(v.text ?? '').trim() ? [tiles('textMode', [{ value: 'cut', label: 'Wycięty', desc: 'drukuje się czysto' }, { value: 'raised', label: 'Wypukły', desc: 'lepiej widać' }], undefined, 2)] : []),
      ],
    },
    { title: 'Drukarka', desc: 'Wielkość stołu decyduje, na ile części dzielę wkład.', focus: [], focusLabel: 'podział na części', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia wkład do edytora jako zwykłe pudełka z przegródkami.', focus: [], focusLabel: 'cały wkład', fields: () => [] },
  ],
};

// ------------------------------------------------------------------------------------- box with a lid

const CLOSES: Record<string, { label: string; desc: string; shapes: string[] }> = {
  press: { label: 'Wciskana', desc: 'pokrywka z rantem', shapes: ['rect', 'round', 'hex'] },
  hinge: { label: 'Na zawiasie', desc: 'zawias schowany w ściance', shapes: ['rect'] },
  slide: { label: 'Wsuwana', desc: 'w rowki od przodu', shapes: ['rect'] },
  magnet: { label: 'Na magnesy', desc: 'płaska, trzyma magnesami', shapes: ['rect', 'round', 'hex'] },
  screw: { label: 'Zakręcana', desc: 'gwint i uszczelka', shapes: ['round'] },
};

const KNOBS: Record<string, { label: string; desc: string; closes: string[] }> = {
  none: { label: 'Bez', desc: 'gładka pokrywka', closes: ['press', 'hinge', 'slide', 'magnet', 'screw'] },
  tab: { label: 'Uchwyt', desc: 'listewka przy krawędzi', closes: ['press', 'hinge', 'slide', 'magnet'] },
  knob: { label: 'Gałka', desc: 'okrągła, na środku', closes: ['press', 'magnet'] },
  notch: { label: 'Wycięcie na palec', desc: 'w przedniej ściance', closes: ['press', 'hinge', 'magnet'] },
};

function boxPlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const shape = String(v.shape);
  const close = String(v.close);
  const rect = shape === 'rect';
  const W = Number(v.W), D = rect ? Number(v.D) : W, H = Number(v.H);
  const wall = close === 'slide' ? Math.max(2, Number(v.wall)) : Number(v.wall);
  const nr = Number(v.nr);
  const params: Params = {
    shape,
    W,
    D,
    H,
    T: wall,
    B: 2,
    divMode: rect || nr === 0 ? 'grid' : 'radial',
    nx: rect ? Number(v.nx) : 1,
    ny: rect ? Number(v.ny) : 1,
    nr: Math.max(2, nr),
    rot: 0,
    ring: 0,
    rad: rect && close !== 'slide' ? Number(v.rad) : 0,
    slide: close === 'slide',
    screw: close === 'screw',
    div: '',
  };
  const knob = KNOBS[String(v.knob)]?.closes.includes(close) ? String(v.knob) : 'none';
  const label = String(v.text ?? '').trim();
  const built = host.simulate((t) => {
    let id: string;
    if (close === 'hinge') id = t.addHinged(params);
    else {
      id = t.add('box', { name: 'Pudełko', params, color: '#a9aeb3' });
      if (close === 'magnet') t.addMagnets(id, { size: String(v.mag), layout: shape === 'hex' ? '6' : '4', hidden: false, lid: 'flat' });
      else t.addLid(id);
    }
    const box = t.parts().find((p) => p.id === id)!;
    const lid = t.parts().find((p) => (p.type === 'lid' || p.type === 'slab') && !p.hole);
    if (v.tex !== 'none') t.update(id, { texture: texture(String(v.tex), shape === 'round' ? 'around' : (String(v.texOn) as TextureFace)) });
    if (knob === 'notch') addNotch(t, t.parts().find((p) => p.id === id)!);
    if (lid && (knob === 'knob' || knob === 'tab')) {
      const b = worldBox(lid);
      const cx = r1((b.min.x + b.max.x) / 2), cy = r1((b.min.y + b.max.y) / 2);
      if (knob === 'knob') t.add('cylinder', { name: 'Gałka', params: { D: 16, H: 10 }, position: [cx, cy, r1(b.max.z)], color: '#e8873a', edges: { kind: 'round', r: 2, vertical: false, top: true, bottom: false } });
      else t.add('cube', { name: 'Uchwyt', params: { W: r1(Math.min(40, (b.max.x - b.min.x) * 0.4)), D: 8, H: 6 }, position: [cx, r1(b.min.y + 8), r1(b.max.z)], color: '#e8873a', edges: { kind: 'round', r: 1.5, vertical: true, top: true, bottom: false } });
    }
    if (label) {
      if (v.textOn === 'lid' && lid) {
        const b = worldBox(lid);
        addLabel(t, t.parts().find((p) => p.id === lid.id)!, label, 'top', true, b.max.x - b.min.x, (b.max.y - b.min.y) * 0.5);
      } else addLabel(t, box, label, 'front', v.textMode !== 'raised', W, H);
    }
  });
  const { parts, items, size } = rawPlan(built, (main) => {
    if (main.type === 'cylinder' || main.type === 'cube')
      return { role: 'G', name: main.type === 'cylinder' ? 'Gałka' : 'Uchwyt', group: 'box', material: 'PLA', where: main.type === 'cylinder' ? 'Przyklejona na środku pokrywki' : 'Przyklejony przy przedniej krawędzi pokrywki', how: 'Płaskim spodem do stołu, bez podpór.' };
    if (main.type === 'gasket') return { role: 'U', name: 'Uszczelka płaska', group: 'box', material: 'TPU', where: 'W pokrywce, pod gwintem', how: 'Leży płasko, TPU 85A–95A, wolno.' };
    if (main.type === 'lid' || main.type === 'slab')
      return {
        role: 'K',
        name: close === 'slide' ? 'Pokrywka wsuwana' : close === 'screw' ? 'Pokrywka zakręcana' : 'Pokrywka',
        group: 'box',
        material: 'PLA',
        where: close === 'slide' ? 'Wsuwa się w rowki od przodu' : close === 'hinge' ? 'Na zawiasie z tyłu pudełka' : close === 'magnet' ? 'Leży na pudełku, trzyma magnesami' : close === 'screw' ? 'Zakręca się na szyjkę pudełka' : 'Wciska się rantem w pudełko',
        how: close === 'slide' ? 'Płasko, bez podpór.' : 'Wierzchem do stołu, bez podpór.',
      };
    return { role: 'P', name: 'Pudełko', group: 'box', material: 'PLA', where: '', how: 'Dnem do stołu, bez podpór.' };
  });

  const magnets = new Map<string, number>();
  for (const p of parts) if (p.type === 'magnet') magnets.set(String(p.params.size), (magnets.get(String(p.params.size)) ?? 0) + 1);
  const buy: Plan['buy'] = [];
  for (const [s, k] of magnets) {
    const [d, h] = MAGNETS[s] ?? [0, 0];
    buy.push({ name: `Magnes neodymowy Ø${d} × ${h} mm`, qty: `${k} szt.`, note: 'Połowa w pudełku, połowa w pokrywce.' });
  }
  if (knob === 'knob' || knob === 'tab') buy.push({ name: 'Klej cyjanoakrylowy (CA)', qty: '1 tubka', note: knob === 'knob' ? 'Do przyklejenia gałki.' : 'Do przyklejenia uchwytu.' });
  if (close === 'hinge') buy.push({ name: 'Filament 1,75 mm jako oś zawiasu', qty: `${mm(W + 10)} mm`, note: 'Kawałek z tej samej szpuli.' });

  const steps = ['Wydrukuj części z listy: pudełko dnem do stołu, pokrywkę wierzchem do stołu.'];
  if (close === 'magnet') steps.push('Wklej magnesy kroplą kleju CA. Najpierw włóż wszystkie do pudełka, przyłóż do nich magnesy pokrywki i dopiero wtedy wklej, żeby się przyciągały.');
  if (close === 'hinge') steps.push('Nałóż pokrywkę oczkami między oczka pudełka i wsuń z boku kawałek filamentu 1,75 mm jako oś. Wystający koniec przytnij.');
  if (close === 'screw') steps.push('Włóż uszczelkę do pokrywki pod gwint i zakręć pokrywkę.');
  if (close === 'slide') steps.push('Wsuń pokrywkę w rowki od przodu.');
  if (close === 'press') steps.push('Wciśnij pokrywkę rantem w pudełko.');
  if (knob === 'knob' || knob === 'tab') steps.splice(1, 0, `Przyklej ${knob === 'knob' ? 'gałkę na środku' : 'uchwyt przy przedniej krawędzi'} pokrywki kroplą kleju CA.`);

  const notes: Plan['notes'] = [];
  if (W > bed[0] || D > bed[1] || H > bed[2]) notes.push({ warn: true, text: `Pudełko nie mieści się na stole (${bed.join(' × ')} mm). Zmniejsz je albo wybierz większą drukarkę.` });
  if (close === 'slide' && Number(v.wall) < 2) notes.push({ text: 'Wsuwana pokrywka potrzebuje ścianki 2 mm na rowki: pogrubiłem ją.' });
  if (close === 'magnet' && !magnets.size) notes.push({ warn: true, text: 'Ścianki są za cienkie na te magnesy. Wybierz mniejsze albo grubszą ściankę.' });
  if (label && v.textOn !== 'lid' && v.tex !== 'none' && (shape === 'round' || v.texOn === 'front')) notes.push({ warn: true, text: 'Napis i faktura są na tej samej ściance, napis będzie słabo widać. Przenieś fakturę na bok albo napis na pokrywkę.' });
  if (close === 'screw') notes.push({ text: 'Gwint ma skok 3 mm: zakręca się w niecały obrót i dobrze się drukuje.' });

  return { items, placements: [], parts, buy, steps, notes, bed, longest: H, size: size as Vec3 };
}

export const BOX_WIZARD: Wizard = {
  id: 'box',
  label: 'Pudełko z pokrywką',
  desc: 'Pudełko z przegródkami i pokrywką: wciskaną, na zawiasie, wsuwaną, na magnesy albo zakręcaną.',
  defaults: { shape: 'rect', W: 100, D: 70, H: 45, wall: 2, close: 'hinge', mag: '6x3', nx: 1, ny: 1, nr: 0, rad: 4, tex: 'none', texOn: 'front', knob: 'tab', text: '', textOn: 'front', textMode: 'cut', printer: 'p1s' },
  set(v, key, value) {
    const next = { ...v, [key]: value };
    // A closing the new shape cannot have falls back to a plain lid.
    if (key === 'shape' && !CLOSES[String(next.close)].shapes.includes(String(value))) next.close = 'press';
    return next;
  },
  plan: boxPlan,
  steps: [
    {
      title: 'Kształt',
      desc: 'Prostokątne mieści najwięcej, okrągłe może mieć zakręcaną pokrywkę.',
      focus: [],
      focusLabel: 'kształt',
      fields: () => [tiles('shape', [{ value: 'rect', label: 'Prostokątne' }, { value: 'round', label: 'Okrągłe' }, { value: 'hex', label: 'Sześciokątne' }], undefined, 3)],
    },
    {
      title: 'Wymiary',
      desc: 'Wymiary zewnętrzne pudełka, bez pokrywki.',
      focus: [],
      focusLabel: 'wymiary',
      fields: (v) => [
        { kind: 'slider', key: 'W', label: v.shape === 'rect' ? 'Szerokość' : v.shape === 'round' ? 'Średnica' : 'Rozstaw boków', min: 30, max: 250, step: 1, unit: 'mm' },
        ...(v.shape === 'rect' ? [{ kind: 'slider' as const, key: 'D', label: 'Głębokość', min: 30, max: 250, step: 1, unit: 'mm' }] : []),
        { kind: 'slider', key: 'H', label: 'Wysokość', min: 15, max: 200, step: 1, unit: 'mm' },
        tiles('wall', [{ value: 1.6, label: '1,6 mm' }, { value: 2, label: '2 mm' }, { value: 3, label: '3 mm' }], 'Ścianka', 3),
      ],
    },
    {
      title: 'Zamknięcie',
      desc: 'Jak trzyma pokrywka. Zawias i pokrywka wsuwana są tylko w pudełku prostokątnym, gwint tylko w okrągłym.',
      focus: [],
      focusLabel: 'pokrywka',
      fields: (v) => [
        tiles('close', Object.entries(CLOSES).filter(([, c]) => c.shapes.includes(String(v.shape))).map(([k, c]) => ({ value: k, label: c.label, desc: c.desc }))),
        ...(v.close === 'magnet' ? [tiles('mag', ['5x2', '6x3', '8x3', '10x3'].map((s) => ({ value: s, label: `Ø${s.replace('x', ' × ')}` })), 'Magnesy', 4)] : []),
      ],
    },
    {
      title: 'Wnętrze',
      desc: 'Przegródki dzielą pudełko na komory. Pokrywka dostaje na nie wycięcia sama.',
      focus: [],
      focusLabel: 'przegródki',
      fields: (v) =>
        v.shape === 'rect'
          ? [
              { kind: 'slider', key: 'nx', label: 'Komory wszerz', min: 1, max: 8, step: 1, unit: '' },
              { kind: 'slider', key: 'ny', label: 'Komory w głąb', min: 1, max: 8, step: 1, unit: '' },
              ...(v.close !== 'slide' ? [tiles('rad', [{ value: 0, label: 'Ostre' }, { value: 4, label: '4 mm' }, { value: 8, label: '8 mm' }], 'Narożniki', 3)] : []),
            ]
          : [tiles('nr', [{ value: 0, label: 'Bez' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4' }, { value: 6, label: '6' }].slice(0, 5), 'Komory (jak tort)', 4)],
    },
    {
      title: 'Wygląd',
      desc: 'Faktura ścianki, gałka albo uchwyt do otwierania i napis.',
      focus: [],
      focusLabel: 'wygląd',
      fields: (v) => [
        ...texField(v.shape === 'round'),
        ...texSideField(v, v.shape === 'round'),
        ...(v.close !== 'screw' ? [tiles('knob', Object.entries(KNOBS).filter(([, k]) => k.closes.includes(String(v.close))).map(([k, o]) => ({ value: k, label: o.label, desc: o.desc })), 'Do otwierania')] : []),
        { kind: 'text', key: 'text', label: 'Napis', placeholder: 'np. ŚRUBKI M3', max: 24 },
        ...(String(v.text ?? '').trim()
          ? [
              tiles('textOn', [{ value: 'front', label: 'Na przodzie pudełka' }, { value: 'lid', label: 'Na pokrywce', desc: 'wycięty' }]),
              ...(v.textOn !== 'lid' ? [tiles('textMode', [{ value: 'cut', label: 'Wycięty', desc: 'drukuje się czysto' }, { value: 'raised', label: 'Wypukły', desc: 'lepiej widać' }])] : []),
            ]
          : []),
      ],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy pudełko i pokrywka mieszczą się na stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia pudełko i pokrywkę jako zwykłe elementy: pokrywka dalej śledzi pudełko.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};

