import type { Params } from '../catalog';
import type { Vec3, WizValues } from '../types';
import { bedOf, boxOf, pl, printerField, r1, tiles } from './common';
import { host } from './host';
import { rawPlan } from './raw';
import type { Field, Plan, Wizard } from './types';

// ------------------------------------------------------------------------------------- wall holders

interface Kind {
  label: string;
  desc: string;
  type: string;
  /** Size fields shown when the kind is picked: key in the wizard values → the part's parameter. */
  fields: (Field & { kind: 'slider' })[];
  params: (v: WizValues) => Params;
  material: 'PLA' | 'PETG';
  screws: number;
  where: string;
}

const s = (key: string, label: string, min: number, max: number, step = 1, unit = 'mm'): Field & { kind: 'slider' } => ({ kind: 'slider', key, label, min, max, step, unit });

const KINDS: Record<string, Kind> = {
  drivers: {
    label: 'Wkrętaki', desc: 'Półka z okrągłymi otworami.', type: 'toolRail', material: 'PLA', screws: 2, where: 'Warsztat, nad blatem',
    fields: [s('drN', 'Wkrętaki: ile sztuk', 3, 20), s('drD', 'Wkrętaki: średnica trzonka', 4, 14, 0.5)],
    params: (v) => ({ kind: 'holes', N: v.drN, d: Number(v.drD) + 1, gap: Math.max(14, Number(v.drD) + 7) }),
  },
  pliers: {
    label: 'Szczypce i klucze', desc: 'Półka ze szczelinami od przodu.', type: 'toolRail', material: 'PLA', screws: 2, where: 'Warsztat, nad blatem',
    fields: [s('plN', 'Szczypce: ile sztuk', 2, 12), s('plT', 'Szczypce: grubość narzędzia', 6, 20, 0.5)],
    params: (v) => ({ kind: 'slots', N: v.plN, d: Number(v.plT) + 1.5, gap: 28, D: 40 }),
  },
  hooks: {
    label: 'Haczyki', desc: 'Listwa na klucze, smycze, ścierki.', type: 'hookRail', material: 'PLA', screws: 2, where: 'Przedpokój albo kuchnia',
    fields: [s('hkN', 'Haczyki: ile sztuk', 2, 12)],
    params: (v) => ({ N: v.hkN, gap: 24 }),
  },
  coats: {
    label: 'Kurtki i torby', desc: 'Pojedyncze mocne haczyki.', type: 'wallHook', material: 'PETG', screws: 2, where: 'Przedpokój',
    fields: [s('ctN', 'Haczyki na kurtki: ile sztuk', 1, 8)],
    params: () => ({ H: 60, hookW: 20, D: 45, tip: 10, T: 5 }),
  },
  tape: {
    label: 'Taśmy', desc: 'Ramiona na rolki taśmy.', type: 'tapeHolder', material: 'PLA', screws: 2, where: 'Warsztat',
    fields: [s('tpN', 'Taśmy: ile ramion', 1, 4)],
    params: (v) => ({ N: v.tpN }),
  },
  cables: {
    label: 'Kable', desc: 'Grzebień na wiązkę przewodów.', type: 'cableComb', material: 'PLA', screws: 2, where: 'Pod biurkiem albo przy listwie',
    fields: [s('cbN', 'Kable: ile przewodów', 2, 16), s('cbD', 'Kable: średnica przewodu', 3, 12, 0.5)],
    params: (v) => ({ N: v.cbN, d: v.cbD }),
  },
  broom: {
    label: 'Miotła i mop', desc: 'Zatrzaski na kije.', type: 'broomHolder', material: 'PETG', screws: 2, where: 'Spiżarka, schowek',
    fields: [s('brN', 'Kije: ile sztuk', 1, 6), s('brD', 'Kije: średnica', 16, 40)],
    params: (v) => ({ N: v.brN, d: v.brD }),
  },
  keys: {
    label: 'Klucze z półką', desc: 'Haczyki i półeczka na drobiazgi.', type: 'keyShelf', material: 'PLA', screws: 2, where: 'Przy drzwiach',
    fields: [s('kyN', 'Klucze: ile haczyków', 2, 8)],
    params: (v) => ({ N: v.kyN, L: Math.max(120, Number(v.kyN) * 35) }),
  },
  bike: {
    label: 'Rower', desc: 'Hak na koło, rower wisi pionowo.', type: 'wallHook', material: 'PETG', screws: 3, where: 'Garaż, piwnica',
    fields: [s('bkN', 'Rowery: ile sztuk', 1, 4), s('bkW', 'Rower: szerokość opony', 25, 60)],
    params: (v) => ({ H: 150, hookW: Number(v.bkW) + 10, D: 110, tip: 25, T: 9 }),
  },
};
/** How many copies of a single-hook kind. */
const COPIES: Record<string, string> = { coats: 'ctN', bike: 'bkN' };

const picked = (v: WizValues) => String(v.what ?? '').split(',').filter((k) => KINDS[k]);

function holdersPlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const tape = v.mount === 'tape';
  const screw: Params = tape ? { screwS: 'tape' } : { screwS: 'screw', screwD: Number(v.screwD) };
  const kinds = picked(v);
  let x = 0;
  let screws = 0;
  const built = host.simulate((t) => {
    for (const k of kinds) {
      const kd = KINDS[k];
      const n = COPIES[k] ? Number(v[COPIES[k]]) : 1;
      for (let i = 0; i < n; i++) {
        const id = t.add(kd.type, { name: kd.label, params: { ...kd.params(v), ...(tape && k === 'bike' ? { screwS: 'screw', screwD: 5 } : screw) }, position: [0, 0, 0], color: i % 2 ? '#8a9440' : '#6b7530' });
        // Side by side, as they will hang on the wall.
        const p = t.parts().find((q) => q.id === id)!;
        const bb = boxOf(p);
        const b = bb.max.x - bb.min.x;
        t.update(id, { position: [r1(p.position[0] + x - bb.min.x), p.position[1], p.position[2]] });
        x += b + 15;
        screws += kd.screws;
      }
    }
  });
  const { parts, items, size } = rawPlan(built, (main) => {
    const k = kinds.find((kk) => KINDS[kk].type === main.type && KINDS[kk].label === main.name) ?? kinds[0];
    const kd = KINDS[k];
    return { role: String.fromCharCode(65 + kinds.indexOf(k)), name: kd.label, group: 'box', material: kd.material, where: kd.where, how: 'Płytką do stołu, bez podpór.' };
  });
  const buy: Plan['buy'] = [];
  if (tape) buy.push({ name: 'Taśma dwustronna montażowa', qty: `${pl(Math.max(1, kinds.length), 'pasek', 'paski', 'pasków')} ok. 10 cm`, note: 'Na gładką, odtłuszczoną ścianę. Nie na rower.' });
  else buy.push({ name: `Wkręty ${v.screwD} mm z kołkami`, qty: `${screws} szt.`, note: 'Kołki dobierz do ściany (beton, płyta g-k, drewno).' });
  if (tape && kinds.includes('bike')) buy.push({ name: 'Wkręty 5 mm z kołkami do haka na rower', qty: `${3 * Number(v.bkN)} szt.`, note: 'Rower zawsze na wkręty.' });
  const notes: Plan['notes'] = [];
  if (!kinds.length) notes.push({ warn: true, text: 'Wybierz, co chcesz powiesić.' });
  else notes.push({ text: `Razem ${pl(items.reduce((a, i) => a + i.qty, 0), 'uchwyt', 'uchwyty', 'uchwytów')} na ok. ${Math.round(x - 15)} mm ściany.` });
  if (kinds.includes('bike')) notes.push({ warn: true, text: 'Hak na rower drukuj z PETG, 5 ścianek i co najmniej 60% wypełnienia, warstwami wzdłuż ramienia.' });
  if (kinds.some((k) => KINDS[k].material === 'PETG') && !kinds.includes('bike')) notes.push({ text: 'Haczyki na kurtki i zatrzaski na kije lepiej z PETG: są sprężyste i nie pękają.' });
  return {
    items,
    placements: [],
    parts,
    buy,
    steps: ['Wydrukuj uchwyty płytką do stołu.', tape ? 'Odtłuść ścianę, naklej taśmę na płytkę i dociśnij na 30 s.' : 'Przyłóż uchwyt do ściany, zaznacz otwory, nawierć, włóż kołki i przykręć.', 'Odczekaj dobę przed pełnym obciążeniem (taśma) albo od razu wieszaj (wkręty).'],
    notes,
    bed,
    longest: size[2],
    size: size as Vec3,
  };
}

export const HOLDERS_WIZARD: Wizard = {
  id: 'holders',
  label: 'Uchwyty ścienne',
  desc: 'Zestaw uchwytów na ścianę: wkrętaki, szczypce, haczyki, kurtki, taśmy, kable, miotła, klucze i rower. Jeden sposób mocowania dla wszystkich.',
  defaults: { what: 'drivers,pliers,hooks', drN: 8, drD: 6, plN: 4, plT: 10, hkN: 5, ctN: 3, tpN: 2, cbN: 6, cbD: 5, brN: 3, brD: 24, kyN: 4, bkN: 1, bkW: 40, mount: 'screw', screwD: 4, printer: 'p1s' },
  set: (v, key, value) => ({ ...v, [key]: value }),
  plan: holdersPlan,
  steps: [
    {
      title: 'Co powiesić',
      desc: 'Zaznacz kilka: każdy rodzaj to osobny uchwyt.',
      focus: [],
      focusLabel: 'uchwyty',
      fields: () => [{ kind: 'tiles', key: 'what', multi: true, cols: 3, options: Object.entries(KINDS).map(([k, d]) => ({ value: k, label: d.label, desc: d.desc })) }],
    },
    {
      title: 'Ile i jakie',
      desc: 'Liczba i wielkość dla każdego wybranego uchwytu.',
      focus: [],
      focusLabel: 'wymiary',
      fields: (v) => {
        const f = picked(v).flatMap((k) => KINDS[k].fields);
        return f.length ? f : [{ kind: 'hint', text: 'Najpierw wybierz, co chcesz powiesić.' }];
      },
    },
    {
      title: 'Mocowanie',
      desc: 'Wkręty trzymają wszystko. Taśma tylko lekkie rzeczy na gładkiej ścianie.',
      focus: [],
      focusLabel: 'mocowanie',
      fields: (v) => [
        tiles('mount', [{ value: 'screw', label: 'Wkręty', desc: 'Z kołkami, do każdej ściany' }, { value: 'tape', label: 'Taśma', desc: 'Bez wiercenia, do 1–2 kg' }], 'Sposób', 2),
        ...(v.mount === 'tape' ? [] : [tiles('screwD', [3, 3.5, 4, 5].map((d) => ({ value: d, label: `${String(d).replace('.', ',')} mm` })), 'Średnica wkrętu', 4)]),
      ],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy każdy uchwyt mieści się na stole.', focus: [], focusLabel: 'wielkość', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia uchwyty obok siebie, tak jak zawisną na ścianie.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};
