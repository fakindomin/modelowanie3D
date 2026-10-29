import { MAGNETS, type Params } from '../catalog';
import { worldBox } from '../geom/parts';
import type { Part, TextureFace, Vec3, WizValues } from '../types';
import { addLabel, bedOf, lidFace, mm, pl, printerField, r1, texField, texSideField, texture, tiles } from './common';
import { host, type WizTools } from './host';
import { rawPlan } from './raw';
import type { Field, Plan, Wizard } from './types';

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
    ends: close === 'screw' ? String(v.ends ?? 'bottom') : 'bottom',
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
      if (params.ends === 'both') {
        // Second cap and gasket for the other end.
        const cap = t.parts().find((p) => p.type === 'lid')!, g = t.parts().find((p) => p.type === 'gasket');
        t.add('lid', { name: cap.name, params: cap.params, fitTo: cap.fitTo, position: [cap.position[0], r1(cap.position[1] + W + 10), 0], color: cap.color });
        if (g) t.add('gasket', { name: g.name, params: g.params, fitTo: g.fitTo, position: [g.position[0], r1(g.position[1] + W + 10), 0], color: g.color });
      }
    }
    const box = t.parts().find((p) => p.id === id)!;
    const lid = t.parts().find((p) => (p.type === 'lid' || p.type === 'slab') && !p.hole);
    if (v.tex !== 'none') t.update(id, { texture: texture(String(v.tex), shape === 'round' ? 'around' : (String(v.texOn) as TextureFace)) });
    if (knob === 'notch') addNotch(t, t.parts().find((p) => p.id === id)!);
    if (lid && (knob === 'knob' || knob === 'tab')) {
      const b = worldBox(lid);
      // A lid with a rim lies rim up: the knob is printed beside it and glued onto its outside.
      const away = lidFace(lid) === 'bottom';
      const cx = away ? r1(b.max.x + 20) : r1((b.min.x + b.max.x) / 2), cy = r1((b.min.y + b.max.y) / 2);
      const z = away ? 0 : r1(b.max.z);
      if (knob === 'knob') t.add('cylinder', { name: 'Gałka', params: { D: 16, H: 10 }, position: [cx, cy, z], color: '#e8873a', edges: { kind: 'round', r: 2, vertical: false, top: true, bottom: false } });
      else t.add('cube', { name: 'Uchwyt', params: { W: r1(Math.min(40, (b.max.x - b.min.x) * 0.4)), D: 8, H: 6 }, position: [away ? r1(b.max.x + 10 + Math.min(20, (b.max.x - b.min.x) * 0.2)) : cx, r1(b.min.y + 8), z], color: '#e8873a', edges: { kind: 'round', r: 1.5, vertical: true, top: true, bottom: false } });
    }
    if (label) {
      if (v.textOn === 'lid' && lid) {
        const b = worldBox(lid);
        addLabel(t, t.parts().find((p) => p.id === lid.id)!, label, lidFace(lid), true, b.max.x - b.min.x, (b.max.y - b.min.y) * 0.5);
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
  if (close === 'screw') steps.push(params.ends === 'both' ? 'Włóż uszczelki do obu pokrywek pod gwint i zakręć je na końce rury.' : 'Włóż uszczelkę do pokrywki pod gwint i zakręć pokrywkę.');
  if (close === 'slide') steps.push('Wsuń pokrywkę w rowki od przodu.');
  if (close === 'press') steps.push('Wciśnij pokrywkę rantem w pudełko.');
  if (knob === 'knob' || knob === 'tab') steps.splice(1, 0, `Przyklej ${knob === 'knob' ? 'gałkę na środku' : 'uchwyt przy przedniej krawędzi'} pokrywki kroplą kleju CA.`);

  const notes: Plan['notes'] = [];
  if (W > bed[0] || D > bed[1] || H > bed[2]) notes.push({ warn: true, text: `Pudełko nie mieści się na stole (${bed.join(' × ')} mm). Zmniejsz je albo wybierz większą drukarkę.` });
  if (close === 'slide' && Number(v.wall) < 2) notes.push({ text: 'Wsuwana pokrywka potrzebuje ścianki 2 mm na rowki: pogrubiłem ją.' });
  if (close === 'magnet' && !magnets.size) notes.push({ warn: true, text: 'Ścianki są za cienkie na te magnesy. Wybierz mniejsze albo grubszą ściankę.' });
  if (label && v.textOn !== 'lid' && v.tex !== 'none' && (shape === 'round' || v.texOn === 'front')) notes.push({ warn: true, text: 'Napis i faktura są na tej samej ściance, napis będzie słabo widać. Przenieś fakturę na bok albo napis na pokrywkę.' });
  if (close === 'screw') notes.push({ text: 'Gwint ma skok 3 mm: zakręca się w niecały obrót i dobrze się drukuje.' });
  if (params.ends === 'open') notes.push({ text: 'Bez dna: to rura z gwintem u góry, np. osłona albo łącznik.' });
  if (params.ends === 'both') notes.push({ text: 'Rura z gwintem z obu stron: na każdym końcu zakręcana pokrywka z uszczelką.' });

  return { items, placements: [], parts, buy, steps, notes, bed, longest: H, size: size as Vec3 };
}

export const BOX_WIZARD: Wizard = {
  id: 'box',
  label: 'Pudełko z pokrywką',
  desc: 'Pudełko z przegródkami i pokrywką: wciskaną, na zawiasie, wsuwaną, na magnesy albo zakręcaną.',
  defaults: { shape: 'rect', W: 100, D: 70, H: 45, wall: 2, close: 'hinge', ends: 'bottom', mag: '6x3', nx: 1, ny: 1, nr: 0, rad: 4, tex: 'none', texOn: 'front', knob: 'tab', text: '', textOn: 'front', textMode: 'cut', printer: 'p1s' },
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
        ...(v.close === 'screw'
          ? [tiles('ends', [{ value: 'bottom', label: 'Z dnem' }, { value: 'open', label: 'Bez dna', desc: 'rura' }, { value: 'both', label: 'Gwint z obu stron', desc: 'dwie pokrywki' }], 'Dno', 3)]
          : []),
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


// ------------------------------------------------------------------------------------- cabinet with drawers

const HANDLES: Record<string, string> = { notch: 'Wycięcie na palec', knob: 'Gałka', none: 'Bez uchwytu' };

function cabinetPlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const cols = Number(v.cols), rows = Number(v.rows), w = Number(v.w), h = Number(v.h), D = Number(v.D), T = Number(v.T);
  const labels = String(v.text ?? '').split(',').map((s) => s.trim());
  const handle = String(v.handle);
  const built = host.simulate((t) => {
    t.addCabinet({ w, h, D, cols, rows, T, catch: String(v.catch) });
    const drawers = t.parts().filter((p) => p.type === 'drawer');
    if (!drawers.length) return;
    const first = drawers[0];
    t.update(first.id, { params: { ...first.params, handle, nx: Number(v.nx), ny: Number(v.ny), rad: Number(v.rad) } });
    if (v.tex !== 'none') t.update(first.id, { texture: texture(String(v.tex), 'front') });
    // Labels go row by row from the top left, like reading the cabinet's front.
    const order = t
      .parts()
      .filter((p) => p.type === 'drawer')
      .sort((a, b) => b.position[2] - a.position[2] || a.position[0] - b.position[0]);
    order.forEach((d, i) => {
      const text = labels[i];
      if (!text) return;
      addLabel(t, d, text, 'front', v.textMode !== 'raised', w * 0.8, handle === 'knob' ? h * 0.3 : h * 0.45);
      if (handle !== 'knob') return;
      // Under the knob, not over it, and on the front itself (the knob sticks out in front of it).
      const label = t.parts().filter((p) => p.body === d.body && (p.type === 'text' || p.type === 'textCut')).pop();
      const front = d.position[1] - Number(d.params.D) / 2 + (label?.hole ? Number(label.params.depth) || 0 : 0);
      if (label) t.update(label.id, { position: [label.position[0], r1(front), r1(d.position[2] + Number(d.params.H) * 0.2)] });
    });
  });
  const { parts, items, size } = rawPlan(built, (main) =>
    main.type === 'cabinet'
      ? { role: 'S', name: `Szafka ${cols} × ${rows}`, group: 'box', material: 'PLA', where: '', how: 'Tyłem do stołu: otwory szuflad patrzą w górę, drukuje się bez podpór.' }
      : { role: 'D', name: `Szuflada ${mm(w - 0.6)} × ${mm(h - 0.6)} mm`, group: 'box', material: 'PLA', where: 'W otworze szafki, luz 0,3 mm z każdej strony', how: 'Dnem do stołu, bez podpór.' },
  );
  const cw = cols * w + (cols + 1) * T, chh = rows * h + (rows + 1) * T;
  const buy: Plan['buy'] = [];
  if (v.catch !== 'none') {
    const [d, hh] = MAGNETS[String(v.catch)] ?? [0, 0];
    buy.push({ name: `Magnes neodymowy Ø${d} × ${hh} mm`, qty: `${2 * cols * rows} szt.`, note: 'Po jednym w szafce i w szufladzie: szuflada sama się domyka.' }, { name: 'Klej cyjanoakrylowy (CA)', qty: '1 tubka' });
  }
  const steps = ['Wydrukuj szafkę tyłem do stołu, szuflady dnem do stołu.'];
  if (v.catch !== 'none') steps.push('Wklej magnesy w gniazda w tylnej ściance szafki, a potem w szuflady: przyłóż je do magnesów szafki, żeby się przyciągały, i dopiero wtedy wklej.');
  steps.push('Wsuń szuflady w otwory.');
  const notes: Plan['notes'] = [{ text: `Szafka ${mm(cw)} × ${mm(D)} × ${mm(chh)} mm, ${pl(cols * rows, 'szuflada', 'szuflady', 'szuflad')}.` }];
  // Printed on its back: the front (width × height) lies on the bed.
  if (cw > bed[0] || chh > bed[1] || D > bed[2]) notes.push({ warn: true, text: `Szafka nie mieści się na stole (${bed.join(' × ')} mm). Zmniejsz ją albo zrób dwie mniejsze obok siebie.` });
  if (labels.some(Boolean) && v.tex !== 'none') notes.push({ warn: true, text: 'Napisy i faktura są na przodzie szuflad: napisy będzie słabo widać.' });
  if (labels.filter(Boolean).length > cols * rows) notes.push({ text: 'Napisów jest więcej niż szuflad: nadmiarowe pomijam.' });
  return { items, placements: [], parts, buy, steps, notes, bed, longest: chh, size: size as Vec3 };
}

export const CABINET_WIZARD: Wizard = {
  id: 'cabinet',
  label: 'Szafka z szufladami',
  desc: 'Szafka z otworami i dopasowanymi szufladami: uchwyty, przegródki, zatrzask na magnes, napisy na frontach.',
  defaults: { cols: 2, rows: 3, w: 60, h: 30, D: 85, T: 2, catch: 'none', handle: 'notch', nx: 1, ny: 1, rad: 0, tex: 'none', text: '', textMode: 'cut', printer: 'p1s' },
  set: (v, key, value) => ({ ...v, [key]: value }),
  plan: cabinetPlan,
  steps: [
    {
      title: 'Układ',
      desc: 'Ile szuflad obok siebie i jedna nad drugą.',
      focus: [],
      focusLabel: 'szafka',
      fields: () => [
        { kind: 'slider', key: 'cols', label: 'Kolumny', min: 1, max: 6, step: 1, unit: '' },
        { kind: 'slider', key: 'rows', label: 'Rzędy', min: 1, max: 8, step: 1, unit: '' },
      ],
    },
    {
      title: 'Szuflada',
      desc: 'Wymiary otworu na jedną szufladę. Szuflady mają 0,3 mm luzu z każdej strony.',
      focus: [],
      focusLabel: 'szuflady',
      fields: () => [
        { kind: 'slider', key: 'w', label: 'Szerokość', min: 20, max: 250, step: 1, unit: 'mm' },
        { kind: 'slider', key: 'h', label: 'Wysokość', min: 12, max: 150, step: 1, unit: 'mm' },
        { kind: 'slider', key: 'D', label: 'Głębokość', min: 30, max: 250, step: 1, unit: 'mm' },
        tiles('T', [{ value: 1.6, label: '1,6 mm' }, { value: 2, label: '2 mm' }, { value: 3, label: '3 mm' }], 'Ścianki szafki', 3),
      ],
    },
    {
      title: 'Wnętrze',
      desc: 'Przegródki w każdej szufladzie i zatrzask na magnes, który domyka szufladę.',
      focus: [],
      focusLabel: 'szuflady',
      fields: () => [
        { kind: 'slider', key: 'nx', label: 'Komory wszerz', min: 1, max: 6, step: 1, unit: '' },
        { kind: 'slider', key: 'ny', label: 'Komory w głąb', min: 1, max: 6, step: 1, unit: '' },
        tiles('catch', [{ value: 'none', label: 'Bez zatrzasku' }, { value: '6x2', label: 'Magnes Ø6 × 2' }, { value: '8x2', label: 'Magnes Ø8 × 2' }], 'Zatrzask', 3),
      ],
    },
    {
      title: 'Wygląd',
      desc: 'Uchwyt, faktura frontów i napisy: po jednym na szufladę, od lewej górnej, rzędami.',
      focus: [],
      focusLabel: 'fronty',
      fields: (v) => [
        tiles('handle', Object.entries(HANDLES).map(([k, l]) => ({ value: k, label: l })), 'Uchwyt', 3),
        tiles('rad', [{ value: 0, label: 'Ostre' }, { value: 2, label: '2 mm' }, { value: 4, label: '4 mm' }], 'Narożniki szuflad', 3),
        ...texField(false),
        { kind: 'text', key: 'text', label: 'Napisy na frontach, po przecinku', placeholder: 'np. M3, M4, M5, podkładki', max: 200 },
        ...(String(v.text ?? '').trim() ? [tiles('textMode', [{ value: 'cut', label: 'Wycięte', desc: 'drukują się czysto' }, { value: 'raised', label: 'Wypukłe', desc: 'lepiej widać' }], undefined, 2)] : []),
      ],
    },
    { title: 'Drukarka', desc: 'Szafkę drukuje się tyłem do stołu: przód musi się zmieścić na stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia szafkę i szuflady. Szuflady są powiązane: zmiana jednej zmienia wszystkie.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};
