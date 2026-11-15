import * as THREE from 'three';
import { domeCore, geodesic, hubsOf, socketsToString } from '../parts/dome';
import type { Vec3, WizValues } from '../types';
import { bedOf, mm, pl, printerField, r1, tiles } from './common';
import type { Plan, PlanItem, Placement, Wizard } from './types';

/** What the struts are made of: outer diameter, colour in the preview, and how to buy them. */
const STRUTS: Record<string, { label: string; desc: string; d: number; color: string; buy: string; stock: number; maxD: number }> = {
  dowel8: { label: 'Kołek Ø8', desc: 'drewniany, do 1 m', d: 8, color: '#d2b48c', buy: 'Kołek drewniany (bukowy) Ø8 mm', stock: 1000, maxD: 1000 },
  dowel12: { label: 'Kołek Ø12', desc: 'drewniany, do 2 m', d: 12, color: '#c8a26e', buy: 'Kołek drewniany (bukowy) Ø12 mm', stock: 1000, maxD: 2000 },
  pvc16: { label: 'Rurka 16', desc: 'elektryczna PVC, do 2,5 m', d: 16, color: '#e6e6e6', buy: 'Rurka elektryczna sztywna PVC 16 mm', stock: 3000, maxD: 2500 },
  pvc20: { label: 'Rurka 20', desc: 'elektryczna PVC, do 4 m', d: 20, color: '#dcdcdc', buy: 'Rurka elektryczna sztywna PVC 20 mm', stock: 3000, maxD: 4000 },
  print: { label: 'Drukowane', desc: 'pręty Ø8 z drukarki, małe kopuły', d: 8, color: '#5b9be8', buy: '', stock: 0, maxD: 700 },
};

const HEIGHTS: Record<string, { label: string; share: number }> = {
  low: { label: 'Niższa (⅜)', share: 0.375 },
  half: { label: 'Pół kuli', share: 0.5 },
  high: { label: 'Wyższa (⅝)', share: 0.625 },
};

const TEMPLATES: Record<string, { label: string; desc: string; v: WizValues }> = {
  desk: { label: 'Mini na biurko', desc: 'Ø40 cm, drukowane pręty', v: { D: 400, freq: 2, height: 'half', strut: 'print' } },
  garden: { label: 'Szklarenka', desc: 'Ø2,5 m pod folię', v: { D: 2500, freq: 3, height: 'high', strut: 'pvc20' } },
  kids: { label: 'Namiot dla dzieci', desc: 'Ø1,5 m pod tkaninę', v: { D: 1500, freq: 2, height: 'half', strut: 'pvc16' } },
};

const DEG = 180 / Math.PI;

function domePlan(v: WizValues): Plan {
  const bed = bedOf(v);
  const D = Number(v.D), R = D / 2;
  const freq = Number(v.freq);
  const height = HEIGHTS[String(v.height)] ?? HEIGHTS.half;
  const st = STRUTS[String(v.strut)] ?? STRUTS.pvc20;
  const dome = geodesic(freq, freq === 3 ? (height.share === 0.5 ? 0.375 : height.share) : 0.5);
  const hubs = hubsOf(dome);
  const luz = 0.4, wall = 2.4;
  const depth = Math.round(Math.max(12, Math.min(26, st.d * 1.3)));
  const maxSockets = Math.max(...hubs.map((h) => h.sockets.length));
  const core = Math.ceil(domeCore(st.d + luz, wall, maxSockets) * 2) / 2;
  const z0 = dome.zCut * R;

  // Hub kinds: equal ones share a role (W1, W2…), most common first.
  const kinds = new Map<string, { n: number; sockets: (typeof hubs)[number]['sockets'] }>();
  hubs.forEach((h) => {
    const k = kinds.get(h.key);
    if (k) k.n++;
    else kinds.set(h.key, { n: 1, sockets: h.sockets });
  });
  const order = [...kinds.entries()].sort((a, b) => b[1].n - a[1].n || b[1].sockets.length - a[1].sockets.length);
  const roleOf = new Map(order.map(([k], i) => [k, `W${i + 1}`]));
  const items: PlanItem[] = order.map(([k, kind]) => ({
    role: roleOf.get(k)!,
    name: `Węzeł ${kind.sockets.length}-ramienny`,
    type: 'domeHub',
    params: { d: st.d, luz, depth, wall, core, sockets: socketsToString(kind.sockets), label: roleOf.get(k)! },
    qty: kind.n,
    group: 'hub',
    color: '#e0782b',
    material: 'PETG',
    where: `Gniazda: ${kind.sockets.map((s) => s.cls).join('-')}`,
    how: 'Płaską stroną (z literami) do stołu, bez podpór.',
  }));
  const at = (p: THREE.Vector3) => new THREE.Vector3(p.x * R + R, p.y * R + R, p.z * R - z0);
  const placements: Placement[] = hubs.map((h, i) => {
    const e = new THREE.Euler().setFromQuaternion(h.frame, 'XYZ');
    const p = at(dome.nodes[i]);
    return { role: roleOf.get(h.key)!, position: [r1(p.x), r1(p.y), r1(p.z)] as Vec3, rotation: [e.x * DEG, e.y * DEG, e.z * DEG] as Vec3 };
  });

  // Struts: cut to reach the bottom of both sockets.
  const cut = (cls: string) => dome.lengths[cls] * R - 2 * core;
  const classes = Object.keys(dome.lengths);
  const count = (cls: string) => dome.edges.filter((e) => e.cls === cls).length;
  const rods: NonNullable<Plan['rods']> = [];
  for (const e of dome.edges) {
    const a = at(dome.nodes[e.a]), b = at(dome.nodes[e.b]);
    const dir = b.clone().sub(a).normalize();
    const pa = a.clone().addScaledVector(dir, core), pb = b.clone().addScaledVector(dir, -core);
    if (st.buy) rods.push({ a: [pa.x, pa.y, pa.z], b: [pb.x, pb.y, pb.z], d: st.d, color: st.color });
    else {
      // Printed struts: a cylinder standing on its end, turned onto the strut's line.
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      const eu = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      placements.push({ role: e.cls, position: [r1(pa.x), r1(pa.y), r1(pa.z)], rotation: [eu.x * DEG, eu.y * DEG, eu.z * DEG] });
    }
  }
  if (!st.buy)
    for (const c of classes)
      items.push({
        role: c,
        name: `Pręt ${c} (${mm(cut(c))} mm)`,
        type: 'cylinder',
        params: { D: st.d, H: r1(cut(c)) },
        qty: count(c),
        group: 'strut',
        color: st.color,
        material: 'PLA',
        where: `Pręt ${c}: wchodzi w gniazda oznaczone literą ${c}`,
        how: 'Na stojąco, 3 ścianki, albo na leżąco ze ściętym bokiem.',
      });

  const buy: Plan['buy'] = [];
  if (st.buy) {
    for (const c of classes) buy.push({ name: `${st.buy}, odcinek ${c}`, qty: `${count(c)} × ${mm(cut(c))} mm`, note: `Litera ${c} na węzłach` });
    const total = classes.reduce((s, c) => s + count(c) * cut(c), 0);
    const bars = Math.ceil(total / (st.stock * 0.9));
    buy.push({ name: st.buy, qty: `${bars} × ${st.stock / 1000} m`, note: `łącznie ${mm(total / 1000)} m z zapasem na cięcie` });
  }
  buy.push({ name: 'Wkręty 3 × 16 mm', qty: `${dome.edges.length * 2 + 10}`, note: 'po jednym w każde gniazdo, przez otwór od góry węzła' });

  const steps = [
    `Wydrukuj węzły (${pl(hubs.length, 'sztuka', 'sztuki', 'sztuk')}): litery W1, W2… na środku mówią, który to rodzaj, a litery przy gniazdach, jaki pręt w nie wchodzi.`,
    st.buy ? `Potnij pręty na odcinki ${classes.map((c) => `${c} = ${mm(cut(c))} mm (${count(c)} szt.)`).join(', ')} i oznacz końce literą.` : 'Wydrukuj pręty i oznacz je literą.',
    'Zacznij od pierścienia na dole: węzły leżą płaską stroną na zewnątrz kopuły.',
    'Dokładaj kolejne pierścienie ku górze, pręt zawsze w gniazdo z tą samą literą.',
    'W każde gniazdo wkręć wkręt 3 × 16 przez otwór od góry węzła.',
  ];
  const notes: Plan['notes'] = [
    { text: `${freq}V, ${pl(hubs.length, 'węzeł', 'węzły', 'węzłów')} (${pl(order.length, 'rodzaj', 'rodzaje', 'rodzajów')}), ${pl(dome.edges.length, 'pręt', 'pręty', 'prętów')} w ${pl(classes.length, 'długości', 'długościach', 'długościach')}.` },
    { text: `Średnica ${mm(D / 1000)} m, wysokość ${mm(((1 - dome.zCut) * R) / 1000)} m.` },
  ];
  if (freq === 3 && height.share === 0.5) notes.push({ text: '3V nie ma pierścienia dokładnie w połowie: wybrałem najbliższy, niższy (⅜).' });
  if (dome.baseSpread * R > 2) notes.push({ warn: true, text: `Dolny pierścień nie leży idealnie płasko (różnica ${mm(dome.baseSpread * R)} mm): podłóż kliny albo przykręć węzły do obręczy z desek.` });
  if (D > st.maxD) notes.push({ warn: true, text: `${st.label} to za słaby pręt na kopułę Ø${mm(D / 1000)} m: wybierz grubszy.` });
  if (D > 2000) notes.push({ warn: true, text: 'Drukowane węzły trzymają lekkie pokrycie (folia, tkanina). Kopuły nie wolno obciążać ani się na nią wspinać. Przy wietrze przymocuj dolne węzły do ziemi.' });
  const hubBox = 2 * (core + depth) + 6;
  if (hubBox > Math.min(bed[0], bed[1])) notes.push({ warn: true, text: 'Węzeł nie mieści się na stole drukarki: wybierz cieńsze pręty.' });
  if (!st.buy && Math.max(...classes.map(cut)) > bed[2]) notes.push({ warn: true, text: 'Najdłuższy pręt nie mieści się w wysokości drukarki: zmniejsz kopułę albo wybierz kupione pręty.' });

  return {
    items,
    placements,
    rods,
    buy,
    steps,
    notes,
    bed,
    longest: st.buy ? hubBox : Math.max(...classes.map(cut)),
    size: [D, D, (1 - dome.zCut) * R],
  };
}

export const DOME_WIZARD: Wizard = {
  id: 'dome',
  label: 'Kopuła geodezyjna',
  desc: 'Drukowane węzły i pręty z kołków, rurek albo z drukarki. Rozmiar i częstotliwość podziału.',
  defaults: { tpl: 'kids', D: 1500, freq: 2, height: 'half', strut: 'pvc16', printer: 'p1s' },
  set: (v, key, value) => (key === 'tpl' ? { ...v, ...TEMPLATES[String(value)].v, tpl: value } : { ...v, [key]: value }),
  plan: domePlan,
  steps: [
    {
      title: 'Rodzaj',
      desc: 'Gotowy punkt wyjścia; wszystko zmienisz w następnych krokach.',
      focus: [],
      focusLabel: 'kopuła',
      fields: () => [tiles('tpl', Object.entries(TEMPLATES).map(([k, t]) => ({ value: k, label: t.label, desc: t.desc })), undefined, 3)],
    },
    {
      title: 'Wielkość i podział',
      desc: 'Średnica to odległość między węzłami u podstawy. Większa częstotliwość = więcej krótszych prętów i krąglejsza kopuła.',
      focus: [],
      focusLabel: 'kształt',
      fields: (v) => [
        { kind: 'slider', key: 'D', label: 'Średnica', min: 300, max: 5000, step: 50, unit: 'mm' },
        tiles('freq', [{ value: 2, label: '2V', desc: '2 długości prętów' }, { value: 3, label: '3V', desc: '3 długości' }, { value: 4, label: '4V', desc: '6 długości' }], 'Częstotliwość', 3),
        ...(Number(v.freq) === 3
          ? [tiles('height', [{ value: 'low', label: HEIGHTS.low.label, desc: 'płaska' }, { value: 'high', label: HEIGHTS.high.label, desc: 'wyższe ściany' }], 'Wysokość', 2)]
          : [{ kind: 'hint' as const, text: 'Przy 2V i 4V kopuła to dokładnie pół kuli, z płaskim dolnym pierścieniem.' }]),
      ],
    },
    {
      title: 'Pręty',
      desc: 'Z czego są pręty. Węzły dopasowują gniazda do ich średnicy.',
      focus: ['strut'],
      focusLabel: 'pręty',
      fields: () => [tiles('strut', Object.entries(STRUTS).map(([k, s]) => ({ value: k, label: s.label, desc: s.desc })), undefined, 3)],
    },
    { title: 'Drukarka', desc: 'Sprawdzam, czy węzły i pręty mieszczą się na stole.', focus: ['hub'], focusLabel: 'węzły', fields: () => [printerField] },
    { title: 'Podsumowanie', desc: '„Utwórz projekt” wstawia węzły (i drukowane pręty). Kupione pręty są tylko w podglądzie i na liście zakupów.', focus: [], focusLabel: 'całość', fields: () => [] },
  ],
};
