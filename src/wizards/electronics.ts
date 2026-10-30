import { MAGNETS, type Params } from '../catalog';
import { worldBox } from '../geom/parts';
import { connectorParams, CONNECTORS, type WallSide } from '../parts/connectors';
import { BOARDS, EDGE_SIDE } from '../parts/raspberry';
import { glandSize } from '../parts/fittings';
import { THREADS } from '../parts/threads';
import type { Part, Vec3, WizValues } from '../types';
import { addLabel, bedOf, lidFace, mm, pl, printerField, r1, SIDES, texField, texSideField, texSides, texture, tiles, wallTextures } from './common';
import { host, type WizTools } from './host';
import { rawPlan } from './raw';
import type { Field, Plan, Wizard } from './types';

const portOn = (v: WizValues, i: number) => v[`port${i}`] !== false;

/** Vertical slots through one wall, spread over its upper half. */
function addSlots(t: WizTools, box: Part, side: 'back' | 'left' | 'right', from = 0.35, to = 0.85) {
  const b = worldBox(box);
  const wall = Number(box.params.T) || 2;
  const along = side === 'back' ? b.max.x - b.min.x : b.max.y - b.min.y;
  const n = Math.max(2, Math.min(14, Math.floor((along - 24) / 6)));
  const z0 = b.min.z + (b.max.z - b.min.z) * from, z1 = b.min.z + (b.max.z - b.min.z) * to;
  const link = `slots-${box.id}-${side}`;
  for (let i = 0; i < n; i++) {
    const u = -((n - 1) * 6) / 2 + i * 6;
    const position: Vec3 =
      side === 'back' ? [r1((b.min.x + b.max.x) / 2 + u), r1(b.max.y - wall / 2), r1(z0)] : [r1(side === 'left' ? b.min.x + wall / 2 : b.max.x - wall / 2), r1((b.min.y + b.max.y) / 2 + u), r1(z0)];
    const params = side === 'back' ? { W: 2.5, D: wall + 2, H: r1(z1 - z0), luz: 0 } : { W: wall + 2, D: 2.5, H: r1(z1 - z0), luz: 0 };
    t.add('holeBox', { name: `Szczelina wentylacyjna ${i + 1}`, params, position, body: box.body, link });
  }
}

/** Two flat ears with a screw hole each, on the left and right of the box bottom. */
function addEars(t: WizTools, box: Part) {
  const b = worldBox(box);
  const cy = r1((b.min.y + b.max.y) / 2);
  for (const [i, x] of [b.min.x - 8, b.max.x + 8].entries()) {
    t.add('cube', { name: `Ucho montażowe ${i + 1}`, params: { W: 16.02, D: 20, H: 3 }, position: [r1(x + (i ? -0.01 : 0.01)), cy, 0], body: box.body, color: box.color, edges: { kind: 'round', r: 3, vertical: true, top: false, bottom: false } });
    t.add('hole', { name: `Otwór na wkręt ${i + 1}`, params: { D: 4.5, H: 5, luz: 0 }, position: [r1(x + (i ? 1 : -1)), cy, -1], body: box.body });
  }
}

// ------------------------------------------------------------------------------------- board case

function casePlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const key = String(v.board);
  const board = BOARDS[key] ?? BOARDS.pi4;
  const vent = String(v.vent), mount = String(v.mount);
  const label = String(v.text ?? '').trim();
  const built = host.simulate((t) => {
    const id = t.addPiCase(key);
    const all = t.parts();
    // Ports the user does not need stay closed.
    board.ports.forEach((port, i) => {
      if (portOn(v, i)) return;
      const cut = all.find((p) => p.type === 'connector' && p.name === `${board.label}: ${port.label}`);
      if (cut) t.remove(cut.id);
    });
    if (!v.sd) {
      const sd = all.find((p) => p.type === 'holeBox' && p.name.endsWith('karta microSD'));
      if (sd) t.remove(sd.id);
    }
    if (mount === 'magnets') t.update(id, { params: { ...t.parts().find((p) => p.id === id)!.params, B: 3.2 } });
    let box = t.parts().find((p) => p.id === id)!;
    const lid = t.parts().find((p) => p.type === 'lid')!;
    if (vent === 'hex' || vent === 'slot')
      t.update(lid.id, { infill: { on: true, pattern: vent === 'hex' ? 'hex' : 'slot', axis: 'z', cell: vent === 'hex' ? 8 : 7, rib: 2, margin: 6, mode: 'through', depth: 1 } });
    if (vent === 'back') addSlots(t, box, 'back');
    if (v.tex !== 'none') {
      t.update(id, { textures: wallTextures(v, false) });
      if (texSides(v).includes('lid')) t.update(lid.id, { textures: [texture(String(v.tex), lidFace(lid))] });
    }
    if (mount === 'ears') {
      addEars(t, box);
      t.update(lid.id, { position: [r1(lid.position[0] + 20), lid.position[1], lid.position[2]] });
    }
    if (mount === 'magnets') t.addFaceMagnets(box.body, { size: '10x2', face: 'bottom', layout: 'corners', n: 4, margin: 2 });
    box = t.parts().find((p) => p.id === id)!;
    if (label) {
      const lb = worldBox(lid);
      addLabel(t, t.parts().find((p) => p.id === lid.id)!, label, lidFace(lid), true, (lb.max.x - lb.min.x) * 0.8, (lb.max.y - lb.min.y) * 0.4);
    }
    // Extra openings the user asked for on the lid (a button, a LED).
    const lb = worldBox(lid);
    const extras: [string, number][] = [];
    if (v.btn) extras.push(['Otwór na przycisk 12 mm', 12.1]);
    if (v.led) extras.push(['Otwór na diodę LED 5 mm', 5.1]);
    extras.forEach(([name, D], i) =>
      t.add('hole', { name, params: { D, H: 6, luz: 0.1 }, position: [r1(lb.min.x + 14 + i * 14), r1(lb.min.y + 12), -1], body: lid.body }),
    );
  });

  const { parts, items, size } = rawPlan(built, (main) =>
    main.type === 'lid'
      ? { role: 'K', name: `Pokrywka ${board.label}`, group: 'box', material: 'PLA', where: 'Wciskana rantem w obudowę', how: 'Rantem do góry, bez podpór.' }
      : { role: 'P', name: `Obudowa ${board.label}`, group: 'box', material: 'PLA', where: 'Płytka leży na słupkach, gniazda w otworach ścianek', how: 'Dnem do stołu. Otwory gniazd mają płaskie stropy: drukują się bez podpór.' },
  );

  const caseBox = parts.find((p) => p.type === 'box')!;
  const screw = key === 'uno' ? 'Wkręt do tworzyw 3 × 8 mm (albo M3 × 8)' : key === 'pico' ? 'Wkręt do tworzyw 2 × 6 mm' : 'Wkręt do tworzyw 2,5 × 6 mm (albo M2,5 × 6)';
  const buy: Plan['buy'] = [{ name: board.label, qty: '1 szt.' }, { name: screw, qty: '4 szt.', note: 'Przykręca płytkę do słupków.' }];
  if (mount === 'ears') buy.push({ name: 'Wkręt do drewna 4 × 20 mm', qty: '2 szt.', note: 'Do przykręcenia obudowy do ściany albo blatu.' });
  if (mount === 'magnets') {
    const [d, h] = MAGNETS['10x2'];
    buy.push({ name: `Magnes neodymowy Ø${d} × ${h} mm`, qty: '4 szt.', note: 'Obudowa trzyma się blachy, lodówki, szafy metalowej.' });
    buy.push({ name: 'Klej cyjanoakrylowy (CA)', qty: '1 tubka' });
  }
  if (v.btn) buy.push({ name: 'Przycisk chwilowy 12 mm', qty: '1 szt.' });
  if (v.led) buy.push({ name: 'Dioda LED 5 mm z rezystorem', qty: '1 szt.' });

  const steps = [
    'Wydrukuj obudowę dnem do stołu, pokrywkę rantem do góry.',
    `Włóż płytkę gniazdami w otwory ścianek i przykręć ją ${pl(board.holes.length, 'wkrętem', 'wkrętami', 'wkrętami')} do słupków. Nie dokręcaj na siłę.`,
  ];
  if (mount === 'magnets') steps.push('Wklej magnesy w gniazda na spodzie kroplą kleju CA.');
  if (v.btn || v.led) steps.push('Wciśnij przycisk i diodę w otwory pokrywki od środka, podłącz przewody do płytki.');
  steps.push('Wciśnij pokrywkę rantem w obudowę.');
  if (mount === 'ears') steps.push('Przykręć obudowę przez uszy do ściany albo blatu.');

  const notes: Plan['notes'] = [{ text: `Obudowa ${mm(Number(caseBox.params.W))} × ${mm(Number(caseBox.params.D))} × ${mm(Number(caseBox.params.H))} mm. Wymiary płytki są typowe: zmierz swoją suwmiarką.` }, { text: board.hint }];
  if (key === 'pi5' && vent === 'none') notes.push({ warn: true, text: 'Pi 5 grzeje się mocno: dodaj wentylację w pokrywce albo z tyłu.' });
  if (label && (vent === 'hex' || vent === 'slot')) notes.push({ warn: true, text: 'Napis i ażur są na pokrywce: napis może wypaść na otwory. Wybierz szczeliny z tyłu.' });
  const portSides = new Set(board.ports.filter((_, i) => portOn(v, i)).map((p) => EDGE_SIDE[p.edge] as string));
  if (v.tex !== 'none' && texSides(v).some((f) => portSides.has(f))) notes.push({ warn: true, text: 'Na tej ściance są gniazda: faktura będzie wokół otworów. Lepiej wybierz tył.' });
  if (v.tex !== 'none' && vent === 'back' && texSides(v).includes('back')) notes.push({ warn: true, text: 'Faktura i szczeliny są na tylnej ściance. Przenieś fakturę na inną.' });
  const W = Number(caseBox.params.W) + (mount === 'ears' ? 32 : 0);
  if (W > bed[0] || Number(caseBox.params.D) > bed[1]) notes.push({ warn: true, text: 'Obudowa nie mieści się na stole drukarki.' });
  return { items, placements: [], parts, buy, steps, notes, bed, longest: Number(caseBox.params.H), size: size as Vec3 };
}

const boardTiles = Object.entries(BOARDS).map(([k, b]) => ({ value: k, label: b.label, desc: `${b.L} × ${b.W} mm` }));

export const CASE_WIZARD: Wizard = {
  id: 'case',
  label: 'Obudowa płytki',
  desc: 'Raspberry Pi, Pico albo Arduino Uno: słupki pod wkręty, otwory na gniazda, wentylacja, mocowanie i pokrywka.',
  defaults: { board: 'pi4', ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`port${i}`, true])), sd: true, vent: 'hex', mount: 'none', btn: false, led: false, tex: 'none', texOn: 'back', text: '', printer: 'p1s' },
  set(v, key, value) {
    const next = { ...v, [key]: value };
    if (key === 'board') for (let i = 0; i < 8; i++) next[`port${i}`] = true;
    return next;
  },
  plan: casePlan,
  steps: [
    { title: 'Płytka', desc: 'Wybierz płytkę. Rozstaw otworów i położenie gniazd biorę z rysunków producenta.', focus: [], focusLabel: 'obudowa', fields: () => [tiles('board', boardTiles, undefined, 3)] },
    {
      title: 'Złącza',
      desc: 'Odznacz gniazda, których nie używasz: ścianka zostanie w tym miejscu pełna. Na pokrywce można dodać przycisk i diodę.',
      focus: [],
      focusLabel: 'otwory na gniazda',
      fields: (v) => {
        const b = BOARDS[String(v.board)] ?? BOARDS.pi4;
        const f: Field[] = b.ports.map((p, i) => ({ kind: 'toggle', key: `port${i}`, label: p.label, desc: `${SIDES[EDGE_SIDE[p.edge]] ?? ''} ścianka` }));
        if (b.sd) f.push({ kind: 'toggle', key: 'sd', label: 'Szczelina na kartę microSD', desc: 'Kartę można wyjąć bez otwierania obudowy.' });
        f.push({ kind: 'toggle', key: 'btn', label: 'Przycisk 12 mm w pokrywce', desc: 'Np. do włączania albo resetu.' });
        f.push({ kind: 'toggle', key: 'led', label: 'Dioda LED 5 mm w pokrywce', desc: 'Lampka stanu.' });
        return f;
      },
    },
    {
      title: 'Wentylacja',
      desc: 'Płytka oddaje ciepło: otwory w pokrywce działają najlepiej, szczeliny z tyłu są mniej widoczne.',
      focus: [],
      focusLabel: 'wentylacja',
      fields: () => [
        tiles('vent', [
          { value: 'hex', label: 'Plaster miodu w pokrywce' },
          { value: 'slot', label: 'Szczeliny w pokrywce' },
          { value: 'back', label: 'Szczeliny z tyłu' },
          { value: 'none', label: 'Bez', desc: 'pełna obudowa' },
        ]),
      ],
    },
    {
      title: 'Mocowanie',
      desc: 'Jak obudowa trzyma się miejsca, w którym stoi.',
      focus: [],
      focusLabel: 'mocowanie',
      fields: () => [
        tiles('mount', [
          { value: 'none', label: 'Stoi luzem' },
          { value: 'ears', label: 'Uszy na wkręty', desc: 'do ściany lub blatu' },
          { value: 'magnets', label: 'Magnesy w dnie', desc: '4 × Ø10 mm, do blachy' },
        ], undefined, 3),
      ],
    },
    {
      title: 'Wygląd',
      desc: 'Faktura na jednej ściance i napis wycięty w pokrywce.',
      focus: [],
      focusLabel: 'wygląd',
      fields: (v) => [
        ...texField(false),
        ...texSideField(v, false, true),
        { kind: 'text', key: 'text', label: 'Napis na pokrywce', placeholder: 'np. SERWER', max: 20 },
      ],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy obudowa mieści się na stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia obudowę i pokrywkę jako zwykłe elementy: otwory i słupki można dalej przesuwać.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};

// ------------------------------------------------------------------------------------- control panel

const DISPLAYS: Record<string, { label: string; desc: string; win: [number, number]; holes: [number, number]; hole: number; module: [number, number]; buy: string; screws: string }> = {
  none: { label: 'Bez', desc: '', win: [0, 0], holes: [0, 0], hole: 0, module: [0, 0], buy: '', screws: '' },
  oled: { label: 'OLED 0,96"', desc: 'I2C, 128 × 64', win: [24, 13], holes: [23.5, 23.8], hole: 2.4, module: [27.3, 27.8], buy: 'Wyświetlacz OLED 0,96" I2C (SSD1306)', screws: 'Śruba M2 × 8 z nakrętką' },
  lcd: { label: 'LCD 16 × 2', desc: 'HD44780 z I2C', win: [72, 25], holes: [75, 31], hole: 3.2, module: [80, 36], buy: 'Wyświetlacz LCD 1602 z konwerterem I2C', screws: 'Śruba M3 × 10 z nakrętką' },
};

const CONTROL_ROWS: { key: string; label: string; D: number; pitch: number; row: number; buy: string }[] = [
  { key: 'pots', label: 'Otwór na potencjometr', D: 7.4, pitch: 28, row: 28, buy: 'Potencjometr 16 mm, gwint M7, oś 6 mm' },
  { key: 'b16', label: 'Otwór na przycisk 16 mm', D: 16.1, pitch: 24, row: 24, buy: 'Przycisk 16 mm (panelowy)' },
  { key: 'b12', label: 'Otwór na przycisk 12 mm', D: 12.1, pitch: 20, row: 20, buy: 'Przycisk 12 mm (panelowy)' },
  { key: 'leds', label: 'Otwór na diodę LED', D: 5.1, pitch: 12, row: 14, buy: 'Dioda LED 5 mm z oprawką i rezystorem' },
];

const BACK: Record<string, { label: string; params: Params }> = {
  dc: { label: 'Gniazdo zasilania DC 5,5 × 2,1', params: { ...connectorParams('dc55'), mode: 'socket' } },
  usbc: { label: 'Gniazdo USB-C', params: { ...connectorParams('usbc'), mode: 'plug' } },
  rocker: { label: 'Wyłącznik kołyskowy', params: { ...connectorParams('rocker'), mode: 'socket' } },
};

function panelPlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const W = Number(v.W), D = Number(v.D), H = Number(v.H), wall = 2;
  const disp = DISPLAYS[String(v.display)] ?? DISPLAYS.none;
  const label = String(v.text ?? '').trim();
  // Rows of the lid from the back of the panel to the front; widths wrap into more rows.
  const rows: { y: number; items: { name: string; D: number; x: number }[] }[] = [];
  let depth = 0;
  if (disp.win[0]) depth += disp.module[1] + 6;
  for (const c of CONTROL_ROWS) {
    let n = Number(v[c.key]) || 0;
    while (n > 0) {
      // Hole edges stay 6 mm inside the lid's rim.
      const fit = Math.max(1, Math.floor((W - 2 * (wall + 6) - c.D) / c.pitch) + 1);
      const k = Math.min(n, fit);
      rows.push({ y: depth + c.row / 2, items: Array.from({ length: k }, (_, i) => ({ name: c.label, D: c.D, x: -((k - 1) * c.pitch) / 2 + i * c.pitch })) });
      depth += c.row;
      n -= k;
    }
  }
  const room = D - 2 * (wall + 6) - (label ? 12 : 0);
  const knobs = Number(v.knobs) ? Number(v.pots) || 0 : 0;

  const built = host.simulate((t) => {
    const id = t.add('box', { name: 'Panel', params: { shape: 'rect', W, D, H, T: wall, B: 2, nx: 1, ny: 1, rad: Number(v.rad), divMode: 'grid', div: '' }, color: '#a9aeb3' });
    t.addLid(id);
    const box = t.parts().find((p) => p.id === id)!;
    const lid = t.parts().find((p) => p.type === 'lid')!;
    const lb = worldBox(lid);
    const cx = (lb.min.x + lb.max.x) / 2;
    // The lid is printed rim up and turned over front to back: its low y is the back of the panel.
    const y0 = (lb.min.y + lb.max.y) / 2 - Math.min(depth, room) / 2;
    if (disp.win[0]) {
      const yc = y0 + disp.module[1] / 2 + 3;
      t.add('holeBox', { name: `Okno wyświetlacza ${disp.label}`, params: { W: disp.win[0], D: disp.win[1], H: 6, luz: 0.2 }, position: [r1(cx), r1(yc), -1], body: lid.body });
      const link = `disp-${lid.id}`;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) t.add('hole', { name: 'Otwór na śrubę wyświetlacza', params: { D: disp.hole, H: 6, luz: 0 }, position: [r1(cx + (sx * disp.holes[0]) / 2), r1(yc + (sy * disp.holes[1]) / 2), -1], body: lid.body, link });
    }
    for (const row of rows) for (const it of row.items) t.add('hole', { name: it.name, params: { D: it.D, H: 6, luz: 0 }, position: [r1(cx + it.x), r1(y0 + row.y), -1], body: lid.body });
    if (label) addLabel(t, t.parts().find((p) => p.id === lid.id)!, label, lidFace(lid), true, W * 0.7, 10);
    if (label) {
      // Keep the title along the front edge of the panel (high y of the lid).
      const txt = t.parts().find((p) => p.type === 'textCut' && p.body === lid.body);
      if (txt) t.update(txt.id, { position: [txt.position[0], r1(lb.max.y - wall - 9), txt.position[2]] });
    }
    // Sockets in the back wall, side by side at half height.
    const back = Object.keys(BACK).filter((k) => v[k]);
    const b = worldBox(box);
    back.forEach((k, i) => t.addConnector(id, BACK[k].params, 'back', { 0: r1((b.min.x + b.max.x) / 2 - ((back.length - 1) * 28) / 2 + i * 28), 2: r1(H / 2) }));
    if (v.tex !== 'none') t.update(id, { texture: texture(String(v.tex), 'front') });
    // Printed knobs for the pots, beside the lid.
    for (let i = 0; i < knobs; i++) {
      const kx = r1(lb.max.x + 20 + i * 26), ky = r1(lb.min.y + 12);
      const kid = t.add('cylinder', { name: 'Gałka potencjometru', params: { D: 20, H: 14 }, position: [kx, ky, 0], color: '#e8873a', edges: { kind: 'round', r: 1.5, vertical: false, top: true, bottom: false }, texture: { ...texture('knurl', 'around'), depth: 0.6, margin: 2 } });
      const knob = t.parts().find((p) => p.id === kid)!;
      t.add('hole', { name: 'Otwór na oś 6 mm', params: { D: 6, H: 11, luz: 0.1 }, position: [kx, ky, -0.01], body: knob.body });
    }
  });

  const { parts, items, size } = rawPlan(built, (main) => {
    if (main.type === 'cylinder') return { role: 'G', name: 'Gałka potencjometru Ø20 mm', group: 'box', material: 'PLA', where: 'Wciśnięta na oś potencjometru', how: 'Otworem do stołu, bez podpór.' };
    if (main.type === 'lid') return { role: 'K', name: 'Płyta panelu (pokrywka)', group: 'box', material: 'PLA', where: 'Na wierzchu, wciskana rantem w pudełko', how: 'Wierzchem do stołu, rantem do góry: otwory wychodzą czyste.' };
    return { role: 'P', name: 'Pudełko panelu', group: 'box', material: 'PLA', where: 'Spód panelu, gniazda w tylnej ściance', how: 'Dnem do stołu, bez podpór.' };
  });

  const buy: Plan['buy'] = [];
  for (const c of CONTROL_ROWS) if (Number(v[c.key])) buy.push({ name: c.buy, qty: `${v[c.key]} szt.` });
  if (disp.buy) buy.push({ name: disp.buy, qty: '1 szt.' }, { name: disp.screws, qty: '4 szt.', note: 'Przykręca wyświetlacz od środka.' });
  for (const k of Object.keys(BACK)) if (v[k]) buy.push({ name: BACK[k].label, qty: '1 szt.', note: k === 'usbc' ? 'Otwór na wtyczkę do płytki w środku.' : 'Panelowe, z nakrętką albo zatrzaskami.' });

  const steps = ['Wydrukuj pudełko dnem do stołu i płytę panelu wierzchem do stołu.'];
  if (disp.buy) steps.push('Przyłóż wyświetlacz od środka szybką w okno i przykręć go czterema śrubami.');
  if (rows.length) steps.push('Wciśnij przyciski i diody w otwory od wierzchu, potencjometry przykręć nakrętką od wierzchu.');
  if (knobs) steps.push('Wciśnij gałki na osie potencjometrów.');
  if (Object.keys(BACK).some((k) => v[k])) steps.push('Wkręć gniazda w tylną ściankę.');
  steps.push('Połącz przewody i wciśnij płytę panelu rantem w pudełko.');

  const notes: Plan['notes'] = [];
  if (depth > room) notes.push({ warn: true, text: `Elementy zajmują ${mm(depth)} mm w głąb, a na płycie jest ${mm(room)} mm. Powiększ panel albo zmniejsz liczbę elementów.` });
  if (disp.win[0] && disp.module[0] + 6 > W - 2 * wall) notes.push({ warn: true, text: 'Wyświetlacz jest szerszy niż wnętrze panelu.' });
  if (W > bed[0] || D > bed[1]) notes.push({ warn: true, text: 'Panel nie mieści się na stole drukarki.' });
  if (Number(v.pots) && H < 30) notes.push({ warn: true, text: 'Potencjometry potrzebują ok. 25 mm pod płytą: podnieś panel.' });
  if (!rows.length && !disp.win[0]) notes.push({ text: 'Dodaj przyciski, pokrętła albo wyświetlacz w kroku „Elementy”.' });
  return { items, placements: [], parts, buy, steps, notes, bed, longest: H, size: size as Vec3 };
}

const count = (key: string, label: string, max: number): Field => ({ kind: 'slider', key, label, min: 0, max, step: 1, unit: 'szt.' });

export const PANEL_WIZARD: Wizard = {
  id: 'panel',
  label: 'Panel sterowania',
  desc: 'Pudełko z płytą na przyciski, pokrętła, diody i wyświetlacz, gniazda z tyłu, gałki do druku.',
  defaults: { W: 160, D: 120, H: 40, rad: 4, display: 'oled', pots: 2, b16: 0, b12: 3, leds: 3, knobs: 1, dc: true, usbc: false, rocker: true, tex: 'none', text: '', printer: 'p1s' },
  set: (v, key, value) => ({ ...v, [key]: value }),
  plan: panelPlan,
  steps: [
    {
      title: 'Wymiary',
      desc: 'Wymiary zewnętrzne pudełka. Elementy na płycie układam rzędami od tyłu: wyświetlacz, pokrętła, przyciski, diody.',
      focus: [],
      focusLabel: 'wymiary',
      fields: () => [
        { kind: 'slider', key: 'W', label: 'Szerokość', min: 60, max: 250, step: 1, unit: 'mm' },
        { kind: 'slider', key: 'D', label: 'Głębokość', min: 50, max: 250, step: 1, unit: 'mm' },
        { kind: 'slider', key: 'H', label: 'Wysokość', min: 20, max: 120, step: 1, unit: 'mm' },
        tiles('rad', [{ value: 0, label: 'Ostre' }, { value: 4, label: '4 mm' }, { value: 8, label: '8 mm' }], 'Narożniki', 3),
      ],
    },
    {
      title: 'Elementy',
      desc: 'Ile czego na płycie. Otwory mają luz na typowe elementy panelowe.',
      focus: [],
      focusLabel: 'płyta panelu',
      fields: (v) => [
        count('b12', 'Przyciski 12 mm', 12),
        count('b16', 'Przyciski 16 mm', 8),
        count('pots', 'Potencjometry (pokrętła)', 6),
        ...(Number(v.pots) ? [{ kind: 'toggle' as const, key: 'knobs', label: 'Gałki do druku', desc: 'Ø20 mm z radełkiem, na oś 6 mm.' }] : []),
        count('leds', 'Diody LED 5 mm', 12),
      ],
    },
    {
      title: 'Wyświetlacz',
      desc: 'Okno w płycie i cztery otwory na śruby. Wyświetlacz przykręca się od środka.',
      focus: [],
      focusLabel: 'wyświetlacz',
      fields: () => [tiles('display', Object.entries(DISPLAYS).map(([k, d]) => ({ value: k, label: d.label, desc: d.desc })), undefined, 3)],
    },
    {
      title: 'Gniazda z tyłu',
      desc: 'Zasilanie i wyłącznik w tylnej ściance pudełka.',
      focus: [],
      focusLabel: 'tylna ścianka',
      fields: () =>
        Object.entries(BACK).map(([k, b]) => ({ kind: 'toggle' as const, key: k, label: b.label, desc: CONNECTORS[String(b.params.kind)]?.hint ?? '' })),
    },
    {
      title: 'Wygląd',
      desc: 'Faktura na przedniej ściance i napis wycięty w płycie przy przedniej krawędzi.',
      focus: [],
      focusLabel: 'wygląd',
      fields: () => [...texField(false), { kind: 'text', key: 'text', label: 'Napis na płycie', placeholder: 'np. MIKSER', max: 20 }],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy pudełko i płyta mieszczą się na stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia pudełko, płytę z otworami i gałki jako zwykłe elementy.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};

// ------------------------------------------------------------------------------------- junction box with glands

const GLAND_SIDES: [string, WallSide, string][] = [
  ['gFront', 'front', 'Przód'],
  ['gBack', 'back', 'Tył'],
  ['gLeft', 'left', 'Lewy bok'],
  ['gRight', 'right', 'Prawy bok'],
];
const PIECE_NAMES: Record<string, [string, string, string]> = {
  body: ['D1', 'Dławik: korpus', 'Wkręcony w ściankę, kołnierzem na zewnątrz'],
  nut: ['D2', 'Dławik: nakrętka kontrująca', 'Od środka puszki na korpusie'],
  cap: ['D3', 'Dławik: nakrętka dociskowa', 'Na korpusie od zewnątrz, ściska uszczelkę'],
  seal: ['D4', 'Dławik: uszczelka', 'W korpusie, wokół kabla'],
};

function junctionPlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const W = Number(v.W), D = Number(v.D), H = Number(v.H), wall = Number(v.wall), B = 2.4;
  const cable = Number(v.cable);
  const g = glandSize({ cable, size: 'auto' });
  const thread = THREADS[g.thread];
  const af = Math.round(thread.d * 1.35 + 3) + 2; // the cap nut, the widest piece
  const pitch = af + 6;
  const label = String(v.text ?? '').trim();
  const posts: [number, number][] = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [sx * (W / 2 - wall - 3.5), sy * (D / 2 - wall - 3.5)] as [number, number]));
  const dropped: string[] = [];
  const built = host.simulate((t) => {
    const id = t.add('box', { name: 'Puszka', params: { shape: 'rect', W, D, H, T: wall, B, nx: 1, ny: 1, rad: Number(v.rad), divMode: 'grid', div: '' }, color: '#a9aeb3' });
    let box = t.parts().find((p) => p.id === id)!;
    const [cx, cy] = box.position;
    // Corner posts for the lid screws, merged with both walls.
    for (const [i, [x, y]] of posts.entries()) {
      t.add('cylinder', { name: `Słupek ${i + 1}`, params: { D: 9, H: H - B + 0.01 }, position: [r1(cx + x), r1(cy + y), B - 0.01], body: box.body, color: box.color });
      t.add('hole', { name: `Otwór pod wkręt ${i + 1}`, params: { D: 2.6, H: 14, luz: 0 }, position: [r1(cx + x), r1(cy + y), r1(H - 13)], body: box.body });
    }
    box = t.parts().find((p) => p.id === id)!;
    const b = worldBox(box);
    // Glands spread along each wall, between the corner posts, at half height.
    for (const [key, side] of GLAND_SIDES) {
      const along = side === 'front' || side === 'back' ? W : D;
      // Nuts (corner to corner) stay clear of the corner posts.
      const maxU = along / 2 - wall - 9 - af / Math.sqrt(3);
      const fit = maxU < 0 ? 0 : Math.floor((2 * maxU) / pitch) + 1;
      const n = Math.min(Number(v[key]) || 0, fit);
      if ((Number(v[key]) || 0) > n) dropped.push(key);
      for (let i = 0; i < n; i++) {
        const u = -((n - 1) * pitch) / 2 + i * pitch;
        const z = r1(B + (H - B) / 2);
        const at: Vec3 =
          side === 'front' ? [r1(cx + u), r1(b.min.y), z] : side === 'back' ? [r1(cx + u), r1(b.max.y), z] : side === 'left' ? [r1(b.min.x), r1(cy + u), z] : [r1(b.max.x), r1(cy + u), z];
        t.addOnWall(id, 'gland', { cable, size: 'auto', wall }, side, at);
      }
    }
    if (v.mount === 'ears') addEars(t, box);
    if (v.mount === 'holes')
      for (const sx of [-1, 1]) t.add('hole', { name: 'Otwór na wkręt do ściany', params: { D: 4.5, H: B + 2, luz: 0 }, position: [r1(cx + sx * Math.min(W / 4, W / 2 - wall - 15)), r1(cy), -1], body: box.body });
    // Flat lid with screw holes, and a TPU gasket as wide as the posts.
    const lx = r1(b.max.x + 20 + W / 2 + (v.mount === 'ears' ? 20 : 0));
    const lidId = t.add('lid', { name: 'Pokrywka puszki', params: { shape: 'rect', W, D, T: 3, wall, R: 0, luz: 0.3, rad: Number(v.rad), nx: 1, ny: 1 }, fitTo: id, position: [lx, r1(cy), 0], color: '#e8873a' });
    const lid = t.parts().find((p) => p.id === lidId)!;
    for (const [x, y] of posts) t.add('hole', { name: 'Otwór na wkręt', params: { D: 3.4, H: 5, luz: 0 }, position: [r1(lx + x), r1(cy + y), -1], body: lid.body });
    if (v.gasket) {
      const gy = r1(cy + D + 15);
      const gid = t.add('cube', { name: 'Uszczelka pokrywki', params: { W: r1(W - 1), D: r1(D - 1), H: 1.5 }, position: [lx, gy, 0], color: '#3d4148' });
      const gs = t.parts().find((p) => p.id === gid)!;
      t.add('holeBox', { name: 'Środek uszczelki', params: { W: r1(W - 2 * (wall + 8)), D: r1(D - 2 * (wall + 8)), H: 3.5, luz: 0 }, position: [lx, gy, -1], body: gs.body });
      for (const [x, y] of posts) t.add('hole', { name: 'Otwór na wkręt', params: { D: 3.4, H: 3.5, luz: 0 }, position: [r1(lx + x), r1(gy + y), -1], body: gs.body });
    }
    if (label) {
      const lb = worldBox(lid);
      addLabel(t, t.parts().find((p) => p.id === lid.id)!, label, 'top', true, (lb.max.x - lb.min.x) * 0.7, (lb.max.y - lb.min.y) * 0.4);
    }
  });

  const { parts, items, size } = rawPlan(built, (main) => {
    if (main.type === 'gland') {
      const [role, name, where] = PIECE_NAMES[String(main.params.piece)] ?? PIECE_NAMES.body;
      return { role, name: `${name} ${g.key}`, group: 'gland', material: main.params.piece === 'seal' ? 'TPU' : 'PETG', where, how: main.params.piece === 'seal' ? 'Na stojąco, TPU, wolno.' : 'Na stojąco, bez podpór.' };
    }
    if (main.type === 'lid') return { role: 'K', name: 'Pokrywka puszki', group: 'box', material: 'PETG', where: 'Przykręcona czterema wkrętami do słupków', how: 'Płasko, bez podpór.' };
    if (main.type === 'cube') return { role: 'U', name: 'Uszczelka pokrywki', group: 'box', material: 'TPU', where: 'Między puszką a pokrywką', how: 'Płasko, TPU 85A–95A.' };
    return { role: 'P', name: 'Puszka', group: 'box', material: 'PETG', where: '', how: 'Dnem do stołu. 3–4 obrysy, żeby ścianki były szczelne.' };
  });

  const glands = parts.filter((p) => p.type === 'gland' && p.params.piece === 'body').length;
  const buy: Plan['buy'] = [{ name: 'Wkręt do tworzyw 3 × 12 mm', qty: '4 szt.', note: 'Przykręca pokrywkę.' }];
  if (v.mount !== 'none') buy.push({ name: 'Wkręt do drewna 4 × 25 mm z kołkiem', qty: '2 szt.', note: 'Do ściany.' });
  const steps = ['Wydrukuj puszkę, pokrywkę i dławiki z PETG, uszczelki z TPU.'];
  if (glands) steps.push(`Wkręć korpusy dławików (${glands} szt.) w otwory w ściankach i skontruj je od środka nakrętkami.`, 'Przełóż kable przez nakrętki dociskowe i uszczelki, włóż uszczelki do korpusów i dokręć nakrętki dociskowe.');
  if (v.mount !== 'none') steps.push('Przykręć puszkę do ściany.');
  steps.push(v.gasket ? 'Połóż uszczelkę na krawędzi puszki i przykręć pokrywkę czterema wkrętami.' : 'Przykręć pokrywkę czterema wkrętami.');

  const notes: Plan['notes'] = [{ text: `Dławiki ${g.key} na kabel Ø${g.min}–${g.max} mm.` }];
  if (cable < g.min || cable > g.max) notes.push({ warn: true, text: `Kabel Ø${mm(cable)} mm jest poza zakresem dławika ${g.key}.` });
  if (dropped.length) notes.push({ warn: true, text: `Na ściance (${dropped.map((k) => GLAND_SIDES.find((x) => x[0] === k)![2]).join(', ')}) nie mieści się tyle dławików: wstawiłem ile się da. Powiększ puszkę.` });
  if (H - B < 2 * thread.d + 4) notes.push({ warn: true, text: 'Puszka jest niska dla tych dławików: nakrętki od środka mogą zahaczać o dno lub pokrywkę.' });
  if (W > bed[0] || D > bed[1] || H > bed[2]) notes.push({ warn: true, text: 'Puszka nie mieści się na stole drukarki.' });
  notes.push({ text: 'Szczelność: PETG, 3–4 obrysy i 4 warstwy dna. Dławiki i uszczelka TPU chronią przed kurzem i chlapaniem (nie do zanurzenia).' });
  return { items, placements: [], parts, buy, steps, notes, bed, longest: H, size: size as Vec3 };
}

export const JUNCTION_WIZARD: Wizard = {
  id: 'junction',
  label: 'Puszka z dławikami',
  desc: 'Szczelna puszka z przykręcaną pokrywką, uszczelką z TPU i dławikami kablowymi na wybranych ściankach.',
  defaults: { W: 120, D: 80, H: 60, wall: 2.5, rad: 4, cable: 6, gFront: 0, gBack: 0, gLeft: 1, gRight: 1, gasket: true, mount: 'holes', text: '', printer: 'p1s' },
  set: (v, key, value) => ({ ...v, [key]: value }),
  plan: junctionPlan,
  steps: [
    {
      title: 'Wymiary',
      desc: 'Wymiary zewnętrzne puszki bez pokrywki.',
      focus: [],
      focusLabel: 'puszka',
      fields: () => [
        { kind: 'slider', key: 'W', label: 'Szerokość', min: 50, max: 250, step: 1, unit: 'mm' },
        { kind: 'slider', key: 'D', label: 'Głębokość', min: 40, max: 250, step: 1, unit: 'mm' },
        { kind: 'slider', key: 'H', label: 'Wysokość', min: 30, max: 150, step: 1, unit: 'mm' },
        tiles('wall', [{ value: 2, label: '2 mm' }, { value: 2.5, label: '2,5 mm' }, { value: 3, label: '3 mm' }], 'Ścianka', 3),
        tiles('rad', [{ value: 0, label: 'Ostre' }, { value: 4, label: '4 mm' }, { value: 8, label: '8 mm' }], 'Narożniki', 3),
      ],
    },
    {
      title: 'Dławiki',
      desc: 'Średnica kabla dobiera rozmiar dławika. Ile dławików na każdej ściance.',
      focus: [],
      focusLabel: 'dławiki',
      fields: (v) => [
        { kind: 'slider', key: 'cable', label: 'Średnica kabla', min: 3, max: 16, step: 0.5, unit: 'mm' },
        { kind: 'hint', text: `Dławik ${glandSize({ cable: Number(v.cable), size: 'auto' }).key}.` },
        ...GLAND_SIDES.map(([key, , label]) => ({ kind: 'slider' as const, key, label, min: 0, max: 4, step: 1, unit: 'szt.' })),
      ],
    },
    {
      title: 'Zamknięcie',
      desc: 'Pokrywka przykręcana czterema wkrętami do słupków w narożnikach.',
      focus: [],
      focusLabel: 'pokrywka',
      fields: () => [
        { kind: 'toggle', key: 'gasket', label: 'Uszczelka pod pokrywką (TPU)', desc: 'Płaska ramka na krawędzi puszki.' },
        { kind: 'text', key: 'text', label: 'Napis na pokrywce', placeholder: 'np. 230 V', max: 20 },
      ],
    },
    {
      title: 'Mocowanie',
      desc: 'Jak puszka trzyma się ściany.',
      focus: [],
      focusLabel: 'mocowanie',
      fields: () => [
        tiles('mount', [
          { value: 'holes', label: 'Otwory w dnie', desc: 'wkręty od środka' },
          { value: 'ears', label: 'Uszy na wkręty', desc: 'na zewnątrz' },
          { value: 'none', label: 'Bez' },
        ], undefined, 3),
      ],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy puszka mieści się na stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia puszkę, pokrywkę, uszczelkę i dławiki jako zwykłe elementy.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};
