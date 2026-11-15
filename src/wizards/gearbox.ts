import { matePhase } from '../parts/gears';
import type { Vec3, WizValues } from '../types';
import { bedOf, mm, pl, printerField, r1, tiles } from './common';
import { host } from './host';
import { rawPlan } from './raw';
import type { Plan, Wizard } from './types';

/**
 * Spur gear train between two plates. Every stage is the same pinion + wheel; the gears on one axle are printed
 * as one piece (wheel below, pinion above) and spin freely on a fixed steel rod. The input is a hub sticking
 * out through the top plate (turn it by hand or with a knob) or a NEMA 17 motor under the bottom plate;
 * the output is a hub through the top plate.
 */
interface Axis {
  x: number;
  y: number;
}

const PLATE = 4;
const GAP = 0.6;
const DEG = 180 / Math.PI;

export function gearTrain(v: WizValues) {
  // A small pinion can be too small to clear the boss of the next-but-one axle: then take a few more teeth.
  const want = Number(v.zp);
  for (let z = want; z < want + 16; z++) {
    const g = trainWith(v, z);
    if (g.axes.length) return { ...g, raised: z !== want };
  }
  return { ...trainWith(v, want, true), raised: false };
}

function trainWith(v: WizValues, z1: number, force = false) {
  const R = Number(v.ratio), m = Number(v.m), h = Number(v.h), axle = Number(v.axle);
  const n = Math.max(1, Math.min(4, Math.ceil(Math.log(R) / Math.log(6) - 1e-9)));
  const z2 = Math.max(z1 + 1, Math.min(150, Math.round(z1 * R ** (1 / n))));
  const a = (m * (z1 + z2)) / 2;
  const tipP = m * (z1 / 2 + 1), tipW = m * (z2 / 2 + 1);
  const bossR = (axle + 5) / 2, hubD = axle + 6;
  const motor = v.input === 'nema17';
  // Which axes stand at which layer: axis k carries the wheel of stage k−1 and the pinion of stage k.
  // Next to a gear layer an axis shows its boss, or the crank hub on the input axis.
  const rodR = (k: number) => (k === 0 && !motor ? Math.max(bossR, hubD / 2) : bossR);
  const fits = (ax: Axis[]) => {
    for (let i = 0; i < n; i++) {
      // Layer i: pinion on axis i, wheel on axis i+1; every other axis has its rod (or boss / hub) there.
      for (let k = 0; k <= n; k++) {
        if (k === i || k === i + 1) continue;
        if (motor && k === 0 && i > 0) continue;
        const dP = Math.hypot(ax[k].x - ax[i].x, ax[k].y - ax[i].y), dW = Math.hypot(ax[k].x - ax[i + 1].x, ax[k].y - ax[i + 1].y);
        if (dP < tipP + rodR(k) + 1 || dW < tipW + rodR(k) + 1) return false;
      }
    }
    return true;
  };
  // Zigzag as tight as the gears allow: smaller footprint than a straight row.
  let axes: Axis[] = [];
  let turn = 0;
  for (const alpha of [70, 60, 50, 40, 30, 20, 10, 0]) {
    const ax: Axis[] = [{ x: 0, y: 0 }];
    for (let k = 0; k < n; k++) {
      const t = ((k % 2 ? -alpha : alpha) * Math.PI) / 180;
      ax.push({ x: ax[k].x + a * Math.cos(t), y: ax[k].y + a * Math.sin(t) });
    }
    if (fits(ax)) {
      axes = ax;
      turn = alpha;
      break;
    }
  }
  if (!axes.length && force) axes = [{ x: 0, y: 0 }, ...Array.from({ length: n }, (_, k) => ({ x: a * (k + 1), y: 0 }))];
  const ratio = (z2 / z1) ** n;
  return { R, m, h, z1, z2, n, a, tipP, tipW, axes, turn, ratio, axle, bossR, hubD, motor };
}

function gearboxPlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const g = gearTrain(v);
  const { m, h, z1, z2, n, axes, axle, bossR, hubD, motor } = g;
  const kind = String(v.kind);
  const layerZ = (i: number) => PLATE + 1 + i * (h + GAP);
  const stackTop = (k: number) => layerZ(k === n ? n - 1 : k) + h;
  const zt = layerZ(n - 1) + h + 1;
  const hubTop = zt + PLATE + 8;
  const crank = !motor;
  // Plate: around every gear and boss, 12 mm margin.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  axes.forEach((p, k) => {
    const r = Math.max(k === 0 ? g.tipP : k === n ? g.tipW : Math.max(g.tipP, g.tipW), motor && k === 0 ? 22 : 0);
    x0 = Math.min(x0, p.x - r);
    x1 = Math.max(x1, p.x + r);
    y0 = Math.min(y0, p.y - r);
    y1 = Math.max(y1, p.y + r);
  });
  const W = r1(x1 - x0 + 24), D = r1(y1 - y0 + 24), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [cx + sx * (W / 2 - 6), cy + sy * (D / 2 - 6)]));
  const base = { m, kind, fit: 'normal', web: 'full', hubD: 0, hubH: 6, screw: false, beta: 20 };

  const built = host.simulate((t) => {
    // Bottom plate with corner posts and a boss under every axle.
    const bot = t.add('plate', { name: 'Płyta dolna', params: { W, D, T: PLATE, hole: 0, inset: 6, rad: 4 }, position: [cx, cy, 0], color: '#8d939a' });
    const bb = t.parts().find((p) => p.id === bot)!.body;
    for (const [x, y] of corners) {
      t.add('cylinder', { name: 'Słupek', params: { D: 9, H: zt - PLATE + 0.01 }, position: [r1(x), r1(y), PLATE - 0.01], body: bb, color: '#8d939a' });
      t.add('hole', { name: 'Otwór M3', params: { D: 2.6, H: 12.1, luz: 0 }, position: [r1(x), r1(y), zt - 12], body: bb });
    }
    axes.forEach((p, k) => {
      if (motor && k === 0) {
        t.add('hole', { name: 'Otwór na kołnierz silnika', params: { D: 23, H: PLATE + 2, luz: 0 }, position: [r1(p.x), r1(p.y), -1], body: bb });
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) t.add('hole', { name: 'Otwór M3 silnika', params: { D: 3.4, H: PLATE + 2, luz: 0 }, position: [r1(p.x + sx * 15.5), r1(p.y + sy * 15.5), -1], body: bb });
        return;
      }
      const start = layerZ(k === 0 ? 0 : k - 1) - 0.3;
      t.add('cylinder', { name: 'Podkładka osi', params: { D: 2 * bossR, H: start - PLATE + 0.01 }, position: [r1(p.x), r1(p.y), PLATE - 0.01], body: bb, color: '#8d939a' });
      t.add('hole', { name: 'Otwór na oś', params: { D: axle, H: start + 2, luz: 0 }, position: [r1(p.x), r1(p.y), -1], body: bb });
    });
    // Top plate: holes for the posts, bosses down to the gears, the hubs come through.
    const top = t.add('plate', { name: 'Płyta górna', params: { W, D, T: PLATE, hole: 3.4, inset: 6, rad: 4 }, position: [cx, cy, zt], color: '#a3a9b0' });
    const tb = t.parts().find((p) => p.id === top)!.body;
    axes.forEach((p, k) => {
      if (motor && k === 0) return;
      const hub = (crank && k === 0) || k === n;
      if (hub) {
        t.add('hole', { name: 'Otwór na piastę', params: { D: hubD + 1, H: PLATE + 2, luz: 0 }, position: [r1(p.x), r1(p.y), zt - 1], body: tb });
        return;
      }
      const from = stackTop(k) + 0.3;
      t.add('cylinder', { name: 'Podkładka osi', params: { D: 2 * bossR, H: zt - from + 0.01 }, position: [r1(p.x), r1(p.y), r1(from)], body: tb, color: '#a3a9b0' });
      t.add('hole', { name: 'Otwór na oś', params: { D: axle + 0.2, H: zt - from + PLATE + 2, luz: 0 }, position: [r1(p.x), r1(p.y), r1(from - 1)], body: tb });
    });
    // Gears: wheel of stage k−1 below, pinion of stage k above, one piece per axle.
    let spin = 0;
    axes.forEach((p, k) => {
      const out = k === n, inp = k === 0;
      const hub = (crank && inp) || out;
      const color = k % 2 ? '#e0782b' : '#4f8fd6';
      const bore = motor && inp ? { boreT: 'dflat', bore: 5 } : { boreT: 'round', bore: r1(axle + 0.3) };
      let body: number | undefined;
      if (!inp) {
        // Wheel: meshes with the pinion of axis k−1 at the angle between the axes.
        const prev = axes[k - 1];
        const tAng = Math.atan2(p.y - prev.y, p.x - prev.x);
        const rot = (matePhase(tAng, z1, z2) - (spin / DEG) * (z1 / z2)) * DEG;
        const wid = t.add('gear', {
          name: `Koło ${k}`,
          params: { ...base, ...bore, z: z2, h, hand: 'left', ...(out ? { hubD, hubH: r1(hubTop - stackTop(k)) } : {}) },
          position: [r1(p.x), r1(p.y), r1(layerZ(k - 1))],
          rotation: [0, 0, r1(rot)],
          color,
        });
        body = t.parts().find((q) => q.id === wid)!.body;
      }
      if (!out) {
        spin = 0;
        const ph = t.add('gear', {
          name: inp ? 'Zębnik wejściowy' : `Zębnik ${k}`,
          params: { ...base, ...bore, z: z1, h, hand: 'right', ...(crank && inp ? { hubD, hubH: r1(hubTop - stackTop(0)) } : {}) },
          position: [r1(p.x), r1(p.y), r1(layerZ(k))],
          rotation: [0, 0, 0],
          color,
          ...(body !== undefined ? { body } : {}),
        });
        void ph;
        if (body !== undefined) {
          // Plain collar across the gap joins the wheel below to the pinion above (helical teeth keep their phase).
          t.add('cylinder', { name: 'Tuleja', params: { D: r1(m * (z1 - 2.5)), H: r1(GAP + 0.4) }, position: [r1(p.x), r1(p.y), r1(layerZ(k) - GAP - 0.2)], body, color });
          t.add('hole', { name: 'Otwór na oś', params: { D: r1(axle + 0.3), H: GAP + 2, luz: 0 }, position: [r1(p.x), r1(p.y), r1(layerZ(k) - GAP - 1)], body });
        }
      }
    });
  });
  const { parts, items, size } = rawPlan(built, (main) => {
    if (main.name === 'Płyta dolna') return { role: 'D', name: 'Płyta dolna', group: 'case', material: 'PETG', where: 'Na dole, ze słupkami i podkładkami osi', how: 'Płytą do stołu.' };
    if (main.name === 'Płyta górna') return { role: 'G', name: 'Płyta górna', group: 'case', material: 'PETG', where: 'Na górze, przykręcona do słupków', how: 'Odwróć: płytą do stołu, podkładki do góry.' };
    const k = main.name.startsWith('Koło') ? Number(main.name.split(' ')[1]) : 0;
    const label = k === 0 ? 'Zębnik wejściowy' : k === n ? 'Koło wyjściowe' : `Koło pośrednie ${k}`;
    return { role: `K${k}`, name: label, group: 'gear', material: 'PETG', where: k === 0 ? 'Oś wejściowa' : `Oś ${k}`, how: k === 0 ? 'Płaską stroną do stołu.' : 'Większym kołem do stołu.' };
  });

  const rodL = (k: number) => r1(((crank && k === 0) || k === n ? hubTop - 1 : zt + PLATE) - 0.5);
  const rods = axes.map((_, k) => k).filter((k) => !(motor && k === 0));
  const buy: Plan['buy'] = [
    { name: `Pręt stalowy Ø${axle} mm (albo gwintowany M${axle})`, qty: rods.map((k) => `${mm(rodL(k))}`).join(' + ') + ' mm', note: 'osie; wciśnij w dolną płytę' },
    { name: 'Wkręt M3 × 10 (albo 3 × 12 do plastiku)', qty: '4', note: 'płyta górna do słupków' },
  ];
  if (motor) buy.push({ name: 'Silnik krokowy NEMA 17 z wałkiem 5 mm', qty: '1' }, { name: 'Śruba M3 × 8', qty: '4', note: 'silnik do płyty dolnej' });
  const steps = [
    'Wciśnij pręty osi w dolną płytę (w razie potrzeby kropla kleju).',
    motor ? 'Przykręć silnik od spodu i nasuń zębnik na jego wałek (płaska strona do spłaszczenia).' : 'Nasuń zębnik wejściowy na pierwszą oś, piastą do góry.',
    'Nasuwaj kolejne koła po kolei: większe koło na dole, zębnik na górze, aż do koła wyjściowego.',
    'Załóż płytę górną (piasty przechodzą przez otwory) i przykręć ją do słupków.',
    'Pokręć wejściem: koła powinny chodzić lekko. Odrobina smaru PTFE zmniejsza opór.',
  ];
  const notes: Plan['notes'] = [
    { text: `Przełożenie ${mm(g.ratio)} : 1 (${pl(n, 'stopień', 'stopnie', 'stopni')} po ${z1}/${z2} zębów, moduł ${mm(m)}). Wyjście kręci się ${mm(g.ratio)} razy wolniej i ma tyle razy większy moment (minus tarcie, ok. 5–10% na stopień).` },
  ];
  if (g.raised) notes.push({ text: `Zębnik ma ${g.z1} zębów zamiast ${Number(v.zp)}: mniejszy nie minąłby podkładki sąsiedniej osi.` });
  if (Math.abs(g.ratio - g.R) / g.R > 0.03) notes.push({ text: `Dokładnie ${mm(g.R)} : 1 się nie da przy całych zębach: najbliżej jest ${mm(g.ratio)} : 1.` });
  if (z1 < 13) notes.push({ warn: true, text: 'Zębnik poniżej 13 zębów ma podcięte zęby: wybierz 15.' });
  if (motor && g.a < 30) notes.push({ warn: true, text: 'Kołnierz silnika jest za blisko następnej osi: wybierz większy moduł albo więcej zębów.' });
  if (W > bed[0] || D > bed[1]) notes.push({ warn: true, text: 'Płyty nie mieszczą się na stole drukarki: mniejszy moduł albo przełożenie.' });
  return {
    items,
    placements: [],
    parts,
    buy,
    steps,
    notes,
    bed,
    longest: zt + 0.01,
    size: size as Vec3,
  };
}

export const GEARBOX_WIZARD: Wizard = {
  id: 'gearbox',
  label: 'Przekładnia',
  desc: 'Zębate koła na stalowych osiach między dwiema płytami: przełożenie, wielkość zęba, wejście korbką albo silnikiem.',
  defaults: { ratio: 10, m: 1.5, h: 8, zp: 15, axle: 5, input: 'crank', kind: 'spur', printer: 'p1s' },
  set: (v, key, value) => ({ ...v, [key]: value }),
  plan: gearboxPlan,
  steps: [
    {
      title: 'Przełożenie',
      desc: 'Ile razy wolniej (i mocniej) ma się kręcić wyjście. Powyżej 1 : 6 dochodzą kolejne stopnie.',
      focus: [],
      focusLabel: 'koła',
      ghost: ['G'],
      fields: (v) => {
        const g = gearTrain(v);
        return [
          tiles('ratio', [3, 5, 10, 20, 50, 100].map((r) => ({ value: r, label: `1 : ${r}` })), 'Przełożenie', 3),
          { kind: 'hint', text: `${pl(g.n, 'stopień', 'stopnie', 'stopni')}: zębnik ${g.z1} i koło ${g.z2} zębów, razem ${mm(g.ratio)} : 1.` },
        ];
      },
    },
    {
      title: 'Koła',
      desc: 'Większy ząb jest mocniejszy, ale cała przekładnia rośnie.',
      focus: ['gear'],
      focusLabel: 'koła',
      ghost: ['G'],
      fields: () => [
        tiles('m', [{ value: 1, label: 'Moduł 1', desc: 'małe, delikatne' }, { value: 1.5, label: 'Moduł 1,5', desc: 'uniwersalne' }, { value: 2, label: 'Moduł 2', desc: 'mocne' }], 'Wielkość zęba', 3),
        tiles('zp', [{ value: 12, label: '12 zębów', desc: 'mniejsza' }, { value: 15, label: '15 zębów', desc: 'zalecane' }, { value: 18, label: '18 zębów', desc: 'najgładsza' }], 'Zębnik', 3),
        tiles('h', [{ value: 6, label: '6 mm' }, { value: 8, label: '8 mm' }, { value: 10, label: '10 mm' }], 'Grubość koła', 3),
        tiles('kind', [{ value: 'spur', label: 'Proste' }, { value: 'herring', label: 'Jodełka', desc: 'cichsza, mocniejsza' }], 'Zęby', 2),
      ],
    },
    {
      title: 'Osie i napęd',
      desc: 'Koła kręcą się na nieruchomych stalowych prętach. Wejście: piasta do pokręcania albo silnik pod spodem.',
      focus: ['case'],
      focusLabel: 'obudowa',
      fields: () => [
        tiles('axle', [{ value: 3, label: 'Ø3' }, { value: 4, label: 'Ø4' }, { value: 5, label: 'Ø5' }], 'Pręt osi', 3),
        tiles('input', [{ value: 'crank', label: 'Piasta', desc: 'korbka, pokrętło' }, { value: 'nema17', label: 'NEMA 17', desc: 'silnik krokowy' }], 'Wejście', 2),
      ],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy płyty mieszczą się na stole.', focus: [], focusLabel: 'wielkość', ghost: ['G'], fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia płyty i koła ustawione w zazębieniu.', focus: [], focusLabel: 'całość', ghost: ['G'], fields: () => [] },
  ],
};
