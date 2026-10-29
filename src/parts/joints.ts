import type { Manifold } from 'manifold-3d';
import type { Params, PartDef } from './def';
import { box, clearance, cylX, num, poly, rblock, select, union } from './util';

const pieceA = { value: 'A', label: 'skrzydełko A', hole: false, body: 'sel' as const };
const pieceB = { value: 'B', label: 'skrzydełko B', hole: false, body: 'above' as const };

/** Knuckle ranges along the axis: even ones belong to leaf A, odd ones to leaf B. */
function knuckles(L: number, n: number, gap: number) {
  const w = (L - (n - 1) * gap) / n;
  return Array.from({ length: n }, (_, i) => {
    const x0 = -L / 2 + i * (w + gap);
    return { i, x0, x1: x0 + w, a: i % 2 === 0 };
  });
}

/**
 * Hinge in its own frame: axis along X through the origin. Leaf A goes down along the back face
 * of the lower body (plane y = -(R+gap)), leaf B goes up along the upper body.
 */
function hinge(p: Params, printInPlace: boolean): Manifold {
  const L = num(p, 'L'), R = num(p, 'D') / 2, g = num(p, 'luz'), t = Math.min(num(p, 'T'), R + g);
  const n = Math.max(2, Math.round(num(p, 'n')));
  const hA = num(p, 'hA'), hB = num(p, 'hB');
  const ks = knuckles(L, n, g);
  const mineA = p.piece !== 'B';
  const mine = ks.filter((k) => k.a === mineA);
  const theirs = ks.filter((k) => k.a !== mineA);
  const y0 = -(R + g);
  const leaf = mineA ? box(-L / 2, y0, -hA, L / 2, y0 + t, -g / 2) : box(-L / 2, y0, g / 2, L / 2, y0 + t, hB);
  let m = union([leaf, ...mine.map((k) => cylX(k.x0, k.x1, R))]);
  // Clear the other leaf's knuckles so the hinge can turn.
  m = m.subtract(union(theirs.map((k) => cylX(k.x0 - g, k.x1 + g, R + g + 0.01))));
  if (!printInPlace) {
    m = m.subtract(cylX(-L / 2 - 1, L / 2 + 1, num(p, 'pin') / 2));
    return m;
  }
  // Print-in-place: cones on A's knuckles sit in conical recesses of B's knuckles.
  const kw = ks[0].x1 - ks[0].x0;
  const rc = Math.max(0.6, Math.min(R * 0.55, kw / 2 - 0.5 - g));
  const cones: Manifold[] = [];
  for (let i = 0; i < ks.length - 1; i++) {
    const left = ks[i], right = ks[i + 1];
    const dir = left.a ? 1 : -1; // cone points from the A knuckle into the B knuckle
    const face = left.a ? left.x1 : right.x0;
    const grow = mineA ? 0 : g * Math.SQRT2;
    const r0 = rc + grow, len = r0 + 0.001;
    const c = cylX(0, len, r0, 0, 0, 0.001);
    cones.push(dir > 0 ? c.translate([face - (mineA ? 0.01 : 0), 0, 0]) : c.mirror([1, 0, 0]).translate([face + (mineA ? 0.01 : 0), 0, 0]));
  }
  return mineA ? m.add(union(cones)) : m.subtract(union(cones));
}

const hingeParams = [
  { key: 'L', label: 'Długość zawiasu', type: 'number' as const, def: 40, min: 10, max: 400, unit: 'mm' },
  { key: 'D', label: 'Średnica oczek', type: 'number' as const, def: 8, min: 4, max: 40, step: 0.5, unit: 'mm' },
  { key: 'n', label: 'Liczba oczek', type: 'number' as const, def: 5, min: 2, max: 15, step: 1 },
  { key: 'T', label: 'Grubość skrzydełek', type: 'number' as const, def: 3, min: 1, max: 20, step: 0.2, unit: 'mm' },
  { key: 'hA', label: 'Wysokość skrzydełka A (dół)', type: 'number' as const, def: 12, min: 2, max: 200, unit: 'mm' },
  { key: 'hB', label: 'Wysokość skrzydełka B (góra)', type: 'number' as const, def: 12, min: 2, max: 200, unit: 'mm' },
];

/** Axis on the back top edge of the selected part, leaves flat against its back face. */
const hingePlace = (sel: import('three').Box3, p: Params) => {
  const R = num(p, 'D') / 2, g = num(p, 'luz');
  const L = Math.min(num(p, 'L'), Math.max(10, Math.round(sel.max.x - sel.min.x - 10)));
  return {
    position: [(sel.min.x + sel.max.x) / 2, sel.max.y + R + g, sel.max.z] as [number, number, number],
    params: { L, hA: Math.min(num(p, 'hA'), Math.max(2, Math.round(sel.max.z - sel.min.z))) },
  };
};

/** Lid lift above the box rim for a box hinge: the gap that keeps a print-in-place lid from fusing. */
export const BOX_HINGE_LIFT = 0.4;

/** Knuckle radius of a box hinge: about one wall thick per side, larger boxes a bit more (5–12 mm across). */
export function boxHingeRadius(p: Params) {
  const auto = Math.max(1.1 * num(p, 'wall'), 0.045 * Math.min(num(p, 'W'), num(p, 'D')), num(p, 'Tl'), p.mode === 'pip' ? 0 : num(p, 'pin') / 2 + 1.5);
  const d = Number(p.dk) || 0;
  return d > 0 ? d / 2 : Math.min(6, Math.max(2.5, Math.round(auto * 4) / 4));
}

/** Odd knuckle count, so both ends belong to the box: 3 on small boxes, 5 or 7 on wider ones. */
export function boxHingeCount(p: Params) {
  const inner = num(p, 'W') - 2 * num(p, 'wall');
  const n = Math.round(Number(p.n) || 0) || (inner < 70 ? 3 : inner < 160 ? 5 : 7);
  return Math.max(3, n % 2 ? n : n + 1);
}

/**
 * Hinge hidden in the back wall of a box, in the box's own frame (centred in X/Y, bottom at z = 0).
 * The axis runs along X so the knuckles are flush with the back face and the lid's top. Box
 * knuckles sit at both ends (fused with the side walls) on a 45° gusset; the lid's knuckles hang
 * between them. Pieces: A box knuckles, B lid knuckles, a cuts in the box, b cuts in the lid.
 */
function boxHinge(p: Params): Manifold {
  const W = num(p, 'W'), D = num(p, 'D'), H = num(p, 'H'), t = num(p, 'wall'), rad = Number(p.rad) || 0;
  const Tl = num(p, 'Tl'), lift = num(p, 'lift'), g = num(p, 'luz');
  const r = boxHingeRadius(p), pip = p.mode === 'pip';
  const ya = D / 2 - r, za = H + lift + Tl - r, top = H + lift + Tl;
  const ks = knuckles(W - 2 * t, boxHingeCount(p), g);
  ks[0].x0 = -W / 2;
  ks[ks.length - 1].x1 = W / 2;
  const at = (m: Manifold) => m.translate([0, ya, za]);
  const knuckle = (x0: number, x1: number, rr: number) => cylX(x0, x1, rr, ya, za);
  const outline = () => rblock(W, D, top + 2, rad, 0, 0, -1);
  // Cones on the box knuckles' faces turning in recesses of the lid's (print-in-place only).
  const cones = (grow: number) => {
    const inner = ks.slice(1, -1);
    const kw = inner.length ? inner[0].x1 - inner[0].x0 : W / 3;
    const rc = Math.max(0.6, Math.min(r * 0.55, kw / 2 - 0.5 - g));
    const out: Manifold[] = [];
    for (let i = 0; i < ks.length - 1; i++) {
      const left = ks[i], right = ks[i + 1];
      const r0 = rc + grow;
      const c = cylX(0, r0 + 0.001, r0, 0, 0, 0.001);
      out.push(at(left.a ? c.translate([left.x1 - (grow ? 0 : 0.01), 0, 0]) : c.mirror([1, 0, 0]).translate([right.x0 + (grow ? 0 : 0.01), 0, 0])));
    }
    return union(out);
  };
  const pinHole = () => knuckle(-W / 2 - 1, W / 2 + 1, num(p, 'pin') / 2);
  const box_ = ks.filter((k) => k.a), lid = ks.filter((k) => !k.a);
  switch (p.piece) {
    case 'B':
      return union(lid.map((k) => knuckle(k.x0, k.x1, r))).intersect(outline());
    case 'a': {
      // Room for the lid's knuckles, open upwards so a lid printed apart drops in.
      let m = union(lid.map((k) => knuckle(k.x0 - g, k.x1 + g, r + g).add(box(k.x0 - g, ya - r - g, za, k.x1 + g, D / 2 + 1, top + 1))));
      if (pip) m = m.subtract(cones(0));
      else m = m.add(pinHole());
      return m;
    }
    case 'b': {
      // Room for the box knuckles, the lid's back edge rounded to the knuckles so it can swing.
      const room = box_.map((k) => knuckle(k === ks[0] ? -W / 2 - 1 : k.x0 - g, k === ks[ks.length - 1] ? W / 2 + 1 : k.x1 + g, r + g));
      const trim = box(-W / 2 - 1, ya, H + lift - 1, W / 2 + 1, D / 2 + 1, top + 1).subtract(knuckle(-W / 2 - 2, W / 2 + 2, r));
      let m = union([...room, trim]);
      m = pip ? m.add(cones(g * Math.SQRT2)) : m.add(pinHole());
      return m;
    }
    default: {
      // 45° gusset under each box knuckle down to the wall, so it prints without support.
      const drop = Math.min(2 * r - t, za);
      const gusset = (x0: number, x1: number) =>
        poly([
          [D / 2 - t, za - drop],
          [D / 2, za - drop],
          [D / 2, za],
          [D / 2 - 2 * r, za],
        ])
          .extrude(x1 - x0)
          .rotate([90, 0, 90])
          .translate([x0, 0, 0]);
      let m = union(box_.map((k) => knuckle(k.x0, k.x1, r).add(gusset(k.x0, k.x1))));
      if (pip) m = m.add(cones(0));
      return m.intersect(outline());
    }
  }
}

const synced = { show: () => false };

/** Cantilever hook: arm standing up from z = 0, hook lip facing +Y. */
function snapArm(p: Params): Manifold {
  const W = num(p, 'W'), L = num(p, 'L'), t = num(p, 'T'), d = num(p, 'hook');
  const hh = Math.min(L * 0.6, d * 2.5);
  const arm = box(-W / 2, 0, 0, W / 2, t, L);
  const hook = poly([
    [t - 0.01, L - hh],
    [t + d, L - hh],
    [t + d * 0.25, L],
    [t - 0.01, L],
  ])
    .extrude(W)
    .rotate([90, 0, 90])
    .translate([-W / 2, 0, 0]);
  return arm.add(hook);
}

function snapWindow(p: Params): Manifold {
  const W = num(p, 'W'), L = num(p, 'L'), t = num(p, 'T'), d = num(p, 'hook'), c = num(p, 'luz'), wall = num(p, 'wall');
  const hh = Math.min(L * 0.6, d * 2.5);
  return box(-W / 2 - c, t - 0.2, L - hh - c, W / 2 + c, t + Math.max(wall, d) + 0.4, L + c + 0.4);
}

function dovetailSection(p: Params, grow = 0) {
  const w1 = num(p, 'W1') + grow, w2 = num(p, 'W2') + grow, h = num(p, 'H') + grow / 2;
  return poly([
    [-w1 / 2, -0.01],
    [w1 / 2, -0.01],
    [w2 / 2, h],
    [-w2 / 2, h],
  ]);
}

export const JOINT_DEFS: PartDef[] = [
  {
    type: 'boxHinge',
    label: 'Zawias pudełka',
    category: 'hinges',
    hole: false,
    hidden: true,
    description: 'Zawias schowany w tylnej ściance pudełka: oczka równo z tylną ścianką i wierzchem pokrywki. Wielkość dobiera się sama do pudełka i śledzi jego zmiany.',
    pieces: [
      { value: 'A', label: 'oczka pudełka', hole: false, body: 'sel' },
      { value: 'B', label: 'oczka pokrywki', hole: false, body: 'above' },
      { value: 'a', label: 'miejsce w pudełku', hole: true, body: 'sel' },
      { value: 'b', label: 'miejsce w pokrywce', hole: true, body: 'above' },
    ],
    params: [
      select('mode', 'Druk', 'pin', [
        ['pin', 'Osobno, oś z filamentu 1,75'],
        ['pip', 'Razem, zamknięte (print-in-place)'],
      ]),
      { key: 'dk', label: 'Średnica oczek', type: 'number', def: 0, min: 0, max: 24, step: 0.5, unit: 'mm', hint: '0 = dobierz do pudełka (ok. 2–2,5 grubości ścianki, 5–12 mm).' },
      { key: 'n', label: 'Liczba oczek', type: 'number', def: 0, min: 0, max: 15, step: 1, hint: '0 = dobierz do szerokości (3, 5 albo 7). Zawsze nieparzysta: skrajne oczka należą do pudełka.' },
      { key: 'pin', label: 'Otwór na oś', type: 'number', def: 2, min: 1, max: 6, step: 0.1, unit: 'mm', show: (p) => p.mode !== 'pip', hint: '2 mm pasuje do filamentu 1,75 mm. Wsuń go z boku przez ściankę i utnij równo.' },
      clearance(0.4, 'Szczelina wokół oczek. Przy 0,3 mm print-in-place może się skleić.'),
      { key: 'W', label: 'W', type: 'number', def: 80, min: 5, max: 500, ...synced },
      { key: 'D', label: 'D', type: 'number', def: 60, min: 5, max: 500, ...synced },
      { key: 'H', label: 'H', type: 'number', def: 40, min: 3, max: 500, ...synced },
      { key: 'wall', label: 'wall', type: 'number', def: 2, min: 0.4, max: 20, ...synced },
      { key: 'rad', label: 'rad', type: 'number', def: 0, min: 0, max: 100, ...synced },
      { key: 'Tl', label: 'Tl', type: 'number', def: 2, min: 0.4, max: 20, ...synced },
      { key: 'lift', label: 'lift', type: 'number', def: BOX_HINGE_LIFT, min: 0, max: 2, ...synced },
    ],
    build: boxHinge,
  },
  {
    type: 'hinge',
    label: 'Zawias z bolcem',
    category: 'hinges',
    hole: false,
    description: 'Zawias na tylnej krawędzi: skrzydełko A zlewa się z bryłą zaznaczoną, B z bryłą leżącą na niej. Oś: bolec z filamentu 1,75 mm albo gwóźdź.',
    pieces: [pieceA, pieceB],
    params: [
      ...hingeParams,
      { key: 'pin', label: 'Otwór na bolec', type: 'number', def: 2, min: 1, max: 10, step: 0.1, unit: 'mm', hint: '2 mm pasuje do filamentu 1,75 mm.' },
      clearance(0.4, 'Szczelina między oczkami i bryłami.'),
    ],
    build: (p) => hinge(p, false),
    place: hingePlace,
  },
  {
    type: 'hingePip',
    label: 'Zawias print-in-place',
    category: 'hinges',
    hole: false,
    description: 'Zawias drukowany od razu złożony: stożkowe czopy w oczkach, bez bolca. Obie części drukuj razem na jednym stole.',
    pieces: [pieceA, pieceB],
    params: [...hingeParams, clearance(0.4, 'Szczelina wokół czopów i oczek. Przy 0,3 mm może się skleić.')],
    build: (p) => hinge(p, true),
    place: hingePlace,
  },
  {
    type: 'snapFit',
    label: 'Zatrzask',
    category: 'hinges',
    hole: false,
    description: 'Sprężysty haczyk na jednej bryle i okienko w ściance drugiej. Okienko wycina się samo w bryle, w której się znajdzie.',
    pieces: [
      { value: 'A', label: 'haczyk', hole: false, body: 'sel' },
      { value: 'B', label: 'okienko', hole: true, body: 'above' },
    ],
    params: [
      { key: 'W', label: 'Szerokość', type: 'number', def: 8, min: 2, max: 60, unit: 'mm' },
      { key: 'L', label: 'Długość ramienia', type: 'number', def: 12, min: 4, max: 80, unit: 'mm' },
      { key: 'T', label: 'Grubość ramienia', type: 'number', def: 1.6, min: 0.8, max: 6, step: 0.2, unit: 'mm' },
      { key: 'hook', label: 'Wysięg haczyka', type: 'number', def: 1.2, min: 0.4, max: 5, step: 0.1, unit: 'mm' },
      { key: 'wall', label: 'Ścianka z okienkiem', type: 'number', def: 2, min: 0.8, max: 10, step: 0.2, unit: 'mm' },
      clearance(0.3, 'Luz wokół haczyka w okienku.'),
    ],
    build: (p) => (p.piece === 'B' ? snapWindow(p) : snapArm(p)),
  },
  {
    type: 'dovetail',
    label: 'Jaskółczy ogon',
    category: 'hinges',
    hole: false,
    description: 'Wsuwane połączenie. „Dodaj pasujące gniazdo” wytnie rowek z luzem w drugiej bryle.',
    params: [
      { key: 'L', label: 'Długość', type: 'number', def: 30, min: 3, max: 500, unit: 'mm' },
      { key: 'W1', label: 'Szerokość u nasady', type: 'number', def: 6, min: 1, max: 100, step: 0.5, unit: 'mm' },
      { key: 'W2', label: 'Szerokość na końcu', type: 'number', def: 10, min: 1, max: 120, step: 0.5, unit: 'mm' },
      { key: 'H', label: 'Wysokość', type: 'number', def: 5, min: 1, max: 60, step: 0.5, unit: 'mm' },
    ],
    build: (p) => dovetailSection(p).extrude(num(p, 'L')).rotate([90, 0, 90]).translate([-num(p, 'L') / 2, 0, 0]),
  },
  {
    type: 'dovetailSlot',
    label: 'Gniazdo jaskółczego ogona',
    category: 'hinges',
    hole: true,
    hidden: true,
    description: 'Rowek na jaskółczy ogon z luzem.',
    params: [
      { key: 'L', label: 'Długość', type: 'number', def: 30, min: 3, max: 500, unit: 'mm' },
      { key: 'W1', label: 'Szerokość u nasady', type: 'number', def: 6, min: 1, max: 100, step: 0.5, unit: 'mm' },
      { key: 'W2', label: 'Szerokość na końcu', type: 'number', def: 10, min: 1, max: 120, step: 0.5, unit: 'mm' },
      { key: 'H', label: 'Wysokość', type: 'number', def: 5, min: 1, max: 60, step: 0.5, unit: 'mm' },
      clearance(0.3),
    ],
    build: (p) => {
      const L = num(p, 'L') + 0.4;
      return dovetailSection(p, num(p, 'luz')).extrude(L).rotate([90, 0, 90]).translate([-L / 2, 0, 0]);
    },
  },
];
