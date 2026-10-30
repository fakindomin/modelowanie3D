import type { Params } from '../catalog';
import { worldBox } from '../geom/parts';
import type { Texture, TextureFace, Vec3, WizValues } from '../types';
import { addLabel, bedOf, mm, printerField, r1, texField, texture, tiles } from './common';
import { host } from './host';
import { rawPlan } from './raw';
import type { Plan, Wizard } from './types';

// ------------------------------------------------------------------------------------- flower pot with a saucer

function potPlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const shape = String(v.shape);
  const rect = shape === 'rect';
  const W = Number(v.W), D = rect ? Number(v.D) : W, H = Number(v.H), wall = Number(v.wall), B = 2.4;
  const feet = !!v.feet;
  const z0 = feet ? 4 : 0;
  const label = String(v.text ?? '').trim();
  const base: Params = { shape, W, D, H, T: wall, B, nx: 1, ny: 1, rad: rect ? 6 : 0, divMode: 'grid', div: '' };
  const built = host.simulate((t) => {
    const id = t.add('box', { name: 'Doniczka', params: base, position: [0, 0, z0], color: '#c96f4a' });
    const pot = t.parts().find((p) => p.id === id)!;
    // Drainage holes: one in the middle, the rest on a ring.
    const n = Number(v.holes);
    const ring = Math.min(W, D) * 0.25;
    for (let i = 0; i < n; i++) {
      const a = (i - 1) * ((2 * Math.PI) / Math.max(1, n - 1));
      const [x, y] = i === 0 ? [0, 0] : [ring * Math.cos(a), ring * Math.sin(a)];
      t.add('hole', { name: `Otwór odpływowy ${i + 1}`, params: { D: 8, H: B + 2, luz: 0 }, position: [r1(x), r1(y), z0 - 1], body: pot.body });
    }
    if (feet) {
      const k = rect ? 4 : 3;
      for (let i = 0; i < k; i++) {
        const a = rect ? Math.PI / 4 + (i * Math.PI) / 2 : (i * 2 * Math.PI) / 3 + Math.PI / 2;
        const [x, y] = rect ? [Math.sign(Math.cos(a)) * (W / 2 - 12), Math.sign(Math.sin(a)) * (D / 2 - 12)] : [0.33 * W * Math.cos(a), 0.33 * W * Math.sin(a)];
        t.add('cylinder', { name: `Nóżka ${i + 1}`, params: { D: 10, H: z0 + 0.01 }, position: [r1(x), r1(y), 0], body: pot.body, color: pot.color });
      }
    }
    if (v.tex !== 'none') {
      if (shape === 'round') t.update(id, { texture: texture(String(v.tex), 'around') });
      // The label's face stays smooth so the letters read.
      else if (rect) t.update(id, { textures: ((label ? ['back', 'left', 'right'] : ['front', 'back', 'left', 'right']) as TextureFace[]).map((f): Texture => texture(String(v.tex), f)) });
    }
    if (label && shape !== 'round') addLabel(t, t.parts().find((p) => p.id === id)!, label, 'front', true, W * 0.8, H * 0.3);
    if (v.saucer) {
      const b = worldBox(t.parts().find((p) => p.id === id)!);
      t.add('box', {
        name: 'Podstawka',
        params: { ...base, W: W + 12, D: D + 12, H: 18, T: 2, B: 2, rad: rect ? 10 : 0 },
        position: [r1(b.max.x + 15 + (W + 12) / 2), 0, 0],
        color: '#8a4f35',
      });
    }
  });
  const { parts, items, size } = rawPlan(built, (main) =>
    main.name === 'Podstawka'
      ? { role: 'S', name: 'Podstawka', group: 'box', material: 'PETG', where: 'Pod doniczką, zbiera wodę', how: 'Dnem do stołu.' }
      : { role: 'P', name: 'Doniczka', group: 'box', material: 'PETG', where: '', how: feet ? 'Dnem do stołu: nóżki drukują się pierwsze.' : 'Dnem do stołu.' },
  );
  const notes: Plan['notes'] = [{ text: `Wnętrze ${rect ? `${mm(W - 2 * wall)} × ${mm(D - 2 * wall)}` : `Ø${mm(W - 2 * wall)}`} mm, pojemność ok. ${mm(((rect ? (W - 2 * wall) * (D - 2 * wall) : Math.PI * ((W - 2 * wall) / 2) ** 2) * (H - B)) / 1e6)} l.` }];
  notes.push({ text: 'Do roślin drukuj z PETG albo ASA: PLA mięknie na słońcu.' });
  if (!Number(v.holes)) notes.push({ warn: true, text: 'Bez otworów woda zostaje w doniczce: wsyp na dno keramzyt albo włóż plastikową doniczkę do środka.' });
  if (label && shape === 'round') notes.push({ text: 'Napis kładę na płaskich ściankach: w okrągłej doniczce go pomijam.' });
  if (v.tex !== 'none' && shape === 'hex') notes.push({ text: 'Fakturę w sześciokątnej doniczce dodasz w edytorze: dwuklik w ściankę.' });
  if (W + 12 > bed[0] || D + 12 > bed[1] || H > bed[2]) notes.push({ warn: true, text: 'Doniczka albo podstawka nie mieści się na stole drukarki.' });
  return {
    items,
    placements: [],
    parts,
    buy: [],
    steps: ['Wydrukuj doniczkę i podstawkę dnem do stołu.', 'Na dno wsyp warstwę keramzytu, potem ziemię.'],
    notes,
    bed,
    longest: H + z0,
    size: size as Vec3,
  };
}

export const POT_WIZARD: Wizard = {
  id: 'pot',
  label: 'Doniczka z podstawką',
  desc: 'Okrągła, sześciokątna albo prostokątna, z otworami odpływowymi, nóżkami, podstawką, fakturą i napisem.',
  defaults: { shape: 'round', W: 120, D: 80, H: 110, wall: 2, holes: 3, feet: true, saucer: true, tex: 'ribs', text: '', printer: 'p1s' },
  set: (v, key, value) => ({ ...v, [key]: value }),
  plan: potPlan,
  steps: [
    {
      title: 'Kształt i wymiary',
      desc: 'Wymiary zewnętrzne doniczki.',
      focus: [],
      focusLabel: 'doniczka',
      fields: (v) => [
        tiles('shape', [{ value: 'round', label: 'Okrągła' }, { value: 'hex', label: 'Sześciokątna' }, { value: 'rect', label: 'Prostokątna', desc: 'np. skrzynka' }], undefined, 3),
        { kind: 'slider', key: 'W', label: v.shape === 'rect' ? 'Szerokość' : 'Średnica', min: 50, max: 250, step: 1, unit: 'mm' },
        ...(v.shape === 'rect' ? [{ kind: 'slider' as const, key: 'D', label: 'Głębokość', min: 40, max: 250, step: 1, unit: 'mm' }] : []),
        { kind: 'slider', key: 'H', label: 'Wysokość', min: 40, max: 250, step: 1, unit: 'mm' },
        tiles('wall', [{ value: 1.6, label: '1,6 mm' }, { value: 2, label: '2 mm' }, { value: 3, label: '3 mm' }], 'Ścianka', 3),
      ],
    },
    {
      title: 'Woda',
      desc: 'Otwory odpływowe w dnie, nóżki, żeby woda mogła wyciekać, i podstawka, która ją zbiera.',
      focus: [],
      focusLabel: 'dno',
      fields: () => [
        tiles('holes', [{ value: 0, label: 'Bez' }, { value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }], 'Otwory odpływowe', 4),
        { kind: 'toggle', key: 'feet', label: 'Nóżki 4 mm', desc: 'Doniczka nie stoi w wodzie.' },
        { kind: 'toggle', key: 'saucer', label: 'Podstawka', desc: '6 mm szersza z każdej strony, 18 mm wysoka.' },
      ],
    },
    {
      title: 'Wygląd',
      desc: 'Faktura na bokach i napis z przodu (w prostokątnej i sześciokątnej).',
      focus: [],
      focusLabel: 'wygląd',
      fields: () => [...texField(false), { kind: 'text', key: 'text', label: 'Napis', placeholder: 'np. BAZYLIA', max: 20 }],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy doniczka i podstawka mieszczą się na stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia doniczkę i podstawkę jako zwykłe pudełka.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};

// ------------------------------------------------------------------------------------- phone / tablet stand

const DEVICES: Record<string, { label: string; W: number; t: number; L: number; T: number }> = {
  phone: { label: 'Telefon', W: 70, t: 12, L: 80, T: 5 },
  tablet: { label: 'Tablet', W: 160, t: 14, L: 130, T: 7 },
  book: { label: 'Książka / czytnik', W: 140, t: 25, L: 110, T: 6 },
};

function standPlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const W = Number(v.W), t = Number(v.t), L = Number(v.L), a = Number(v.angle), T = Number(v.T);
  const lipH = Number(v.lip), baseT = 5;
  const tilt = 90 - a; // the back leans back by this much from upright
  const rad = (tilt * Math.PI) / 180;
  const yLip = 0, yDev = yLip + T + t + 0.5; // front of the base at y = 0
  const reach = L * Math.sin(rad);
  const Db = r1(yDev + T * Math.cos(rad) + reach + 8);
  const label = String(v.text ?? '').trim();
  const built = host.simulate((tt) => {
    const id = tt.add('cube', { name: 'Podstawa', params: { W, D: Db, H: baseT }, position: [0, r1(Db / 2), 0], color: '#5b8fb9', edges: { kind: 'round', r: 2, vertical: true, top: true, bottom: false } });
    const base = tt.parts().find((p) => p.id === id)!;
    tt.add('cube', { name: 'Rant', params: { W, D: T, H: baseT + lipH }, position: [0, r1(yLip + T / 2), 0], body: base.body, color: base.color });
    // The back rests on the base, its front bottom edge where the device's back stands.
    const y0 = yDev + (T / 2) * Math.cos(rad);
    tt.add('cube', { name: 'Oparcie', params: { W, D: T, H: L }, position: [0, r1(y0), baseT - 0.6], rotation: [-tilt, 0, 0], body: base.body, color: base.color });
    if (v.slot) tt.add('holeBox', { name: 'Wycięcie na kabel', params: { W: 14, D: T + 2, H: baseT + lipH + 2, luz: 0 }, position: [0, r1(yLip + T / 2), r1(baseT - 1)], body: base.body });
    if (label) {
      // On the lip, not halfway up the back; beside the cable slot when there is one.
      addLabel(tt, tt.parts().find((p) => p.id === id)!, label, 'front', true, v.slot ? W / 2 - 14 : W * 0.8, baseT + lipH);
      const txt = tt.parts().find((p) => p.type === 'textCut');
      if (txt) tt.update(txt.id, { position: [v.slot ? r1(txt.position[0] - W / 4 - 3.5) : txt.position[0], txt.position[1], r1((baseT + lipH) / 2)] });
    }
  });
  const { parts, items, size } = rawPlan(built, () => ({ role: 'S', name: `Stojak (${DEVICES[String(v.device)]?.label ?? 'własny'})`, group: 'box', material: 'PLA', where: '', how: 'Bokiem do stołu: oparcie i podstawa drukują się bez podpór, a warstwy biegną wzdłuż oparcia.' }));
  const notes: Plan['notes'] = [{ text: `Kąt ${a}° od poziomu, szczelina ${mm(t + 0.5)} mm na urządzenie z etui.` }];
  if (W > bed[2] && W > bed[0]) notes.push({ warn: true, text: 'Stojak jest szerszy niż stół drukarki.' });
  if (a < 55) notes.push({ warn: true, text: 'Przy małym kącie urządzenie może się zsuwać: podnieś rant.' });
  return { items, placements: [], parts, buy: [], steps: ['Wydrukuj stojak bokiem do stołu (obróć go w edytorze o 90° wokół osi Y).', 'Postaw urządzenie dolną krawędzią za rantem.'], notes, bed, longest: Math.max(...size), size: size as Vec3 };
}

export const STAND_WIZARD: Wizard = {
  id: 'stand',
  label: 'Stojak na telefon lub tablet',
  desc: 'Podstawa z rantem i pochylonym oparciem pod wybranym kątem, wycięcie na kabel ładowarki i napis.',
  defaults: { device: 'phone', W: 70, t: 12, L: 80, T: 5, angle: 65, lip: 8, slot: true, text: '', printer: 'p1s' },
  set(v, key, value) {
    const next = { ...v, [key]: value };
    const d = DEVICES[String(value)];
    if (key === 'device' && d) Object.assign(next, { W: d.W, t: d.t, L: d.L, T: d.T });
    return next;
  },
  plan: standPlan,
  steps: [
    {
      title: 'Urządzenie',
      desc: 'Wybór ustawia typowe wymiary. Grubość podaj razem z etui.',
      focus: [],
      focusLabel: 'stojak',
      fields: () => [
        tiles('device', Object.entries(DEVICES).map(([k, d]) => ({ value: k, label: d.label })), undefined, 3),
        { kind: 'slider', key: 'W', label: 'Szerokość stojaka', min: 40, max: 250, step: 1, unit: 'mm' },
        { kind: 'slider', key: 't', label: 'Grubość urządzenia z etui', min: 6, max: 40, step: 0.5, unit: 'mm' },
      ],
    },
    {
      title: 'Kąt i oparcie',
      desc: 'Kąt od poziomu: 60–70° do oglądania na biurku, 75° do rozmów wideo.',
      focus: [],
      focusLabel: 'oparcie',
      fields: () => [
        { kind: 'slider', key: 'angle', label: 'Kąt', min: 45, max: 85, step: 1, unit: '°' },
        { kind: 'slider', key: 'L', label: 'Wysokość oparcia', min: 40, max: 220, step: 1, unit: 'mm' },
        { kind: 'slider', key: 'lip', label: 'Wysokość rantu', min: 3, max: 25, step: 1, unit: 'mm' },
        tiles('T', [{ value: 4, label: '4 mm' }, { value: 5, label: '5 mm' }, { value: 7, label: '7 mm' }], 'Grubość', 3),
      ],
    },
    {
      title: 'Dodatki',
      desc: 'Wycięcie w rancie na kabel i napis z przodu podstawy.',
      focus: [],
      focusLabel: 'rant',
      fields: () => [
        { kind: 'toggle', key: 'slot', label: 'Wycięcie na kabel', desc: 'Ładujesz urządzenie, gdy stoi.' },
        { kind: 'text', key: 'text', label: 'Napis z przodu', placeholder: 'np. imię', max: 16 },
      ],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy stojak mieści się na stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia stojak jako jedną bryłę z trzech części.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};
