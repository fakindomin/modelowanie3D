import * as THREE from 'three';
import { DEFS, type Params } from '../catalog';
import { fittingGeo, fittingLift } from '../parts/couplings';
import type { Vec3, WizValues } from '../types';
import type { Field, Plan, PlanItem, Placement, Wizard } from './types';

/** Printers the wizards know: bed size X × Y × Z, mm. */
export const PRINTERS: Record<string, { label: string; bed: Vec3 }> = {
  p1s: { label: 'Bambu P1S / X1C', bed: [256, 256, 256] },
  a1m: { label: 'Bambu A1 mini', bed: [180, 180, 180] },
  a1: { label: 'Bambu A1', bed: [256, 256, 256] },
  mk4: { label: 'Prusa MK4', bed: [250, 210, 220] },
  mini: { label: 'Prusa MINI', bed: [180, 180, 180] },
  ender: { label: 'Ender 3', bed: [220, 220, 250] },
};

const TEMPLATES: Record<string, { label: string; desc: string; v: WizValues }> = {
  tent: { label: 'Namiot / growbox', desc: 'Wysoka rama pod tkaninę', v: { W: 60, D: 60, H: 140, rings: 1, lamp: true, shelves: false, bottom: false, top: false } },
  shelf: { label: 'Regał', desc: 'Półki na poziomach', v: { W: 80, D: 30, H: 120, rings: 3, lamp: false, shelves: true, bottom: true, top: true } },
  table: { label: 'Stolik', desc: 'Niska rama z blatem', v: { W: 60, D: 40, H: 45, rings: 0, lamp: false, shelves: false, bottom: false, top: true } },
  own: { label: 'Własna rama', desc: 'Prostopadłościan od zera', v: { W: 50, D: 50, H: 50, rings: 0, lamp: false, shelves: false, bottom: false, top: false } },
};

/** Little frame drawing for a template tile (100 × 48). */
function frameIcon(v: WizValues) {
  const w = Number(v.W), d = Number(v.D), h = Number(v.H), rings = Number(v.rings);
  const s = 40 / Math.max(w, h), x0 = 50 - (w * s) / 2, y1 = 44, y0 = y1 - h * s, dx = d * s * 0.45, dy = -d * s * 0.3;
  const f = (n: number) => n.toFixed(1);
  let p = `M${f(x0)} ${y1}H${f(x0 + w * s)}V${f(y0)}H${f(x0)}Z M${f(x0 + dx)} ${f(y1 + dy)}H${f(x0 + w * s + dx)}V${f(y0 + dy)}H${f(x0 + dx)}Z`;
  for (const [x, y] of [[x0, y1], [x0 + w * s, y1], [x0, y0], [x0 + w * s, y0]]) p += ` M${f(x)} ${f(y)}l${f(dx)} ${f(dy)}`;
  for (let r = 1; r <= rings; r++) {
    const y = y1 - (h * s * r) / (rings + 1);
    p += ` M${f(x0)} ${f(y)}H${f(x0 + w * s)}l${f(dx)} ${f(dy)}`;
  }
  if (v.lamp) p += ` M${f(x0 + (w * s) / 2)} ${f(y0)}l${f(dx)} ${f(dy)}`;
  return p;
}

const defaults = (type: string): Params => Object.fromEntries(DEFS[type].params.map((q) => [q.key, q.def]));
const r1 = (v: number) => Math.round(v * 10) / 10;
const DEG = Math.PI / 180;
/** A lamp bar belongs to a grow tent (or a frame of one's own), not to a shelf or a table. */
const lampFits = (v: WizValues) => v.tpl === 'tent' || v.tpl === 'own';
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

/** Euler angles (XYZ, degrees, multiples of 90) that turn every `from` direction onto the matching set of `to`. */
function eulerFor(from: THREE.Vector3[], to: THREE.Vector3[]): Vec3 {
  const steps = [0, 90, 180, -90];
  for (const a of steps)
    for (const b of steps)
      for (const c of steps) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(a * DEG, b * DEG, c * DEG));
        if (from.length === to.length && from.every((f) => to.some((t) => f.clone().applyQuaternion(q).dot(t) > 0.999))) return [a, b, c];
      }
  return [0, 0, 0];
}

/** Where a part's local origin goes so that its local point `local` lands on `world`. */
function originFor(rot: Vec3, local: THREE.Vector3, world: THREE.Vector3): Vec3 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG));
  const p = world.clone().sub(local.clone().applyQuaternion(q));
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return [r3(p.x), r3(p.y), r3(p.z)];
}

/** How a pipe holds in a fitting: the fitting's arm and the pipe's end that go together (as in the editor's „Końce”). */
const ARM_END: Record<string, string> = { clip: 'pin', screw: 'socket', bolt: 'bolt', click: 'click', glue: 'socket' };
const PIPE_END: Record<string, string> = { clip: 'pin', screw: 'screw', bolt: 'screw', click: 'click', glue: 'socket' };

const pl = (n: number, one: string, few: string, many: string) => {
  const f = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return `${n} ${n === 1 ? one : f ? few : many}`;
};
const mm = (v: number) => String(Math.round(v));

/** Pipe frame: corners, optional levels and a lamp bar, every pipe cut into pieces that fit the printer. */
function plan(v: WizValues): Plan {
  const W = Number(v.W) * 10, Dp = Number(v.D) * 10, H = Number(v.H) * 10;
  const levels = Number(v.rings) + 1;
  const D = Number(v.pipe);
  const T = Math.max(1.6, r1(D * 0.1));
  const wall = Math.max(2, r1(D * 0.1));
  const depth = Math.round(D * 1.2);
  const joint = String(v.joint) as 'clip' | 'screw' | 'bolt' | 'click' | 'glue';
  const luz = joint === 'glue' ? 0.3 : 0.25;
  const pinD = D <= 20 ? 4 : D <= 25 ? 5 : 6;
  const mat = String(v.mat) === 'PLA' ? 'PLA' : 'PETG';
  const printer = PRINTERS[String(v.printer)] ?? PRINTERS.p1s;
  const bed = printer.bed;
  const Lmax = bed[2] - 16;
  const bellMode = v.seg !== 'coupler';
  const bell = Math.max(20, Math.round(D * 1.2));
  const lamp = !!v.lamp && lampFits(v);
  const holes = joint === 'clip' || joint === 'screw' || joint === 'bolt';
  // The pipe's end that goes into an arm (A at the bottom, B at the top).
  const pipeEnd = PIPE_END[joint] ?? 'socket';

  const fitParams = (kind: string): Params => ({
    ...defaults('pipeFitting'),
    kind,
    end: ARM_END[joint] ?? 'socket',
    std: 'custom',
    D,
    T,
    depth,
    wall,
    luz,
    pinD,
    pins: '2',
    oring: 'none',
    screw: joint === 'screw' ? 'M4' : 'none',
    screwMode: 'pilot',
    screwN: 1,
    screwAt: 0.5,
  });
  const Ro = D / 2 + luz + wall;

  const items: PlanItem[] = [];
  const placements: Placement[] = [];
  const itemBy = new Map<string, PlanItem>();
  const use = (key: string, make: () => PlanItem) => {
    let it = itemBy.get(key);
    if (!it) {
      it = make();
      itemBy.set(key, it);
      items.push(it);
    }
    it.qty++;
    return it;
  };

  // ------------------------------------------------------------------ fittings
  type Node = { c: THREE.Vector3; dirs: THREE.Vector3[]; kind: 'corner3' | 'corner4' | 'tee' | 'straight' };
  const xs = [Ro, W - Ro], ys = [Ro, Dp - Ro];
  const zs = Array.from({ length: levels + 1 }, (_, i) => Ro + (i * (H - 2 * Ro)) / levels);
  const zTop = zs[levels];
  const nodes: Node[] = [];
  const inward = (val: number, lo: number, axis: THREE.Vector3) => axis.clone().multiplyScalar(val === lo ? 1 : -1);
  for (const x of xs)
    for (const y of ys)
      zs.forEach((z, i) => {
        const dirs = [inward(x, xs[0], X), inward(y, ys[0], new THREE.Vector3(0, 1, 0))];
        if (i === 0) dirs.push(Z.clone());
        else if (i === levels) dirs.push(Z.clone().negate());
        else dirs.push(Z.clone(), Z.clone().negate());
        nodes.push({ c: new THREE.Vector3(x, y, z), dirs, kind: dirs.length === 3 ? 'corner3' : 'corner4' });
      });
  if (lamp) for (const y of ys) nodes.push({ c: new THREE.Vector3(W / 2, y, zTop), dirs: [X.clone(), X.clone().negate(), inward(y, ys[0], new THREE.Vector3(0, 1, 0))], kind: 'tee' });

  const FIT: Record<string, { name: string; where: string; color: string }> = {
    corner3: { name: 'Narożnik 3D (3 ramiona)', where: 'Narożniki na dole i na górze ramy', color: '#e8873a' },
    corner4: { name: 'Łącznik 4-ramienny', where: 'Słupki na wysokości poziomów usztywniających', color: '#d4692b' },
    tee: { name: 'Trójnik T', where: 'Środek dwóch górnych krawędzi, trzyma drążek pod lampę', color: '#c9772f' },
  };
  const fitRole: Record<string, string> = {};
  let fitN = 0;
  const stopOf: Record<string, number> = {};
  for (const n of nodes) {
    const p = fitParams(n.kind);
    const geo = fittingGeo(p, false);
    stopOf[n.kind] = geo.stop;
    const role = (fitRole[n.kind] ??= `N${++fitN}`);
    use(n.kind, () => ({
      role,
      name: FIT[n.kind].name,
      type: 'pipeFitting',
      params: p,
      qty: 0,
      group: 'fit',
      color: FIT[n.kind].color,
      material: mat,
      where: FIT[n.kind].where,
      how: 'Stoi na jednym ramieniu, podpory drzewkowe pod ramionami poziomymi.',
    }));
    const rot = eulerFor(geo.dirs, n.dirs);
    placements.push({ role, rotation: rot, position: originFor(rot, new THREE.Vector3(0, 0, fittingLift(p, false)), n.c) });
  }

  // ------------------------------------------------------------------ pipes
  const coupler = fitParams('straight');
  const cStop = fittingGeo(coupler, false).stop;
  const spanLetter = new Map<string, { letter: string; label: string; n: number }>();
  let pipeEnds = 0, couplers = 0, longest = 0, pipeRuns = 0;
  const pipeColors = ['#5b9be8', '#a78bfa', '#8d99a8', '#6cc4c4', '#c8a2c8'];
  const pinAt = r1(depth * 0.5);
  const pipeP = (L: number, bellTop: boolean, at: 'none' | 'bottom' | 'top' | 'both'): Params => ({
    ...defaults('pipeEnd'),
    end: at === 'bottom' || at === 'both' ? pipeEnd : 'socket',
    std: 'custom',
    D,
    T,
    L: r1(L),
    luz,
    bell: bellTop ? 'yes' : at === 'top' || at === 'both' ? (pipeEnd === 'socket' ? 'none' : pipeEnd) : 'none',
    bellD: bell,
    bellW: 2.4,
    bellL: 0.15,
    pinHoles: 'none',
    pinAt,
    pinD,
    depth,
    wall,
    // Screws: a pilot hole for an M4 plastic screw; bolts: a through hole for M5.
    screwD: joint === 'bolt' ? 5.4 : 2.9,
  });

  const run = (a: THREE.Vector3, b: THREE.Vector3, stopA: number, stopB: number, label: string) => {
    pipeRuns++;
    pipeEnds += 2;
    const d = b.clone().sub(a).normalize();
    // Rounded down to tenths, so mirrored spans give the very same pieces and none presses into its fitting.
    const R = Math.floor((a.distanceTo(b) - stopA - stopB) * 10 + 1e-6) / 10;
    const key = R.toFixed(1);
    let sp = spanLetter.get(key);
    const rot = eulerFor([Z], [d]);
    const s0 = a.clone().addScaledVector(d, stopA);
    let n = 1;
    if (bellMode) while (R / n + bell > Lmax && n < 40) n++;
    else while ((R - (n - 1) * 2 * cStop) / n > Lmax && n < 40) n++;
    if (!sp) {
      sp = { letter: String.fromCharCode(65 + spanLetter.size), label, n };
      spanLetter.set(key, sp);
    }
    const letter = sp.letter;
    const local = new Map<string, string>();
    const segs: { L: number; base: number; params: Params }[] = [];
    if (bellMode) {
      // Whole tenths of a millimetre, so every piece meets the ledge of the bell below it exactly; the last one takes the rest.
      const e = r1(R / n);
      for (let k = 0; k < n; k++) {
        const last = k === n - 1;
        const at = n === 1 ? 'both' : k === 0 ? 'bottom' : last ? 'top' : 'none';
        const L = last ? r1(R - (n - 1) * e) : e + bell;
        segs.push({ L, base: k * e, params: pipeP(L, !last, at) });
      }
    } else {
      // Rounded down: a hair of play at the far end instead of a piece pressing into the fitting.
      const e = Math.floor(((R - (n - 1) * 2 * cStop) / n) * 10) / 10;
      for (let k = 0; k < n; k++) segs.push({ L: e, base: k * (e + 2 * cStop), params: pipeP(e, false, 'both') });
      for (let k = 1; k < n; k++) {
        couplers++;
        const c = s0.clone().addScaledVector(d, k * (e + 2 * cStop) - cStop);
        use('coupler', () => ({
          role: 'Ł',
          name: 'Dwujnik (złączka odcinków)',
          type: 'pipeFitting',
          params: coupler,
          qty: 0,
          group: 'seg',
          color: '#b48cf0',
          material: mat,
          where: 'Między odcinkami tej samej rury',
          how: 'Stoi pionowo na jednym ramieniu, bez podpór.',
        }));
        const r = eulerFor(fittingGeo(coupler, false).dirs, [d, d.clone().negate()]);
        placements.push({ role: 'Ł', rotation: r, position: originFor(r, new THREE.Vector3(0, 0, fittingLift(coupler, false)), c) });
      }
    }
    // Same pieces in the same span get one role: A1 (first), A2 (middle), A3 (last); a single kind is just "A".
    const kinds = [...new Set(segs.map((s) => JSON.stringify(s.params)))];
    segs.forEach((s, k) => {
      longest = Math.max(longest, s.L);
      const pk = JSON.stringify(s.params);
      const idx = kinds.indexOf(pk);
      const role = kinds.length === 1 ? letter : `${letter}${idx + 1}`;
      local.set(pk, role);
      const first = k === 0, last = k === segs.length - 1;
      const what = kinds.length === 1 ? 'Odcinek' : first ? 'Odcinek początkowy' : last ? 'Odcinek końcowy' : 'Odcinek środkowy';
      const it = use(`pipe:${pk}`, () => ({
        role,
        name: `${what} (${sp!.label})`,
        type: 'pipeEnd',
        params: s.params,
        qty: 0,
        group: 'pipe',
        color: pipeColors[(letter.charCodeAt(0) - 65) % pipeColors.length],
        material: mat,
        where:
          kinds.length === 1
            ? `Cała rura (${sp!.label}) z jednego kawałka`
            : first
              ? `Pierwszy kawałek rury (${sp!.label})${holes ? ': otwory na dole' : ''}, kielich na górze`
              : last
                ? `Ostatni kawałek: gładki dół wchodzi w kielich${holes ? ', otwory na górze' : ''}`
                : 'Środkowe kawałki rury, kielich na górze',
        how: s.params.bell === 'yes' ? 'Stoi pionowo, kielichem do góry, brim 5 mm, bez podpór.' : 'Stoi pionowo, brim 5 mm, bez podpór.',
      }));
      placements.push({ role: it.role, rotation: rot, position: originFor(rot, new THREE.Vector3(), s0.clone().addScaledVector(d, s.base)) });
    });
  };

  const st = (k: string) => stopOf[k] ?? stopOf.corner3;
  const nodeKind = (x: number, y: number, z: number) => nodes.find((n) => Math.abs(n.c.x - x) < 0.01 && Math.abs(n.c.y - y) < 0.01 && Math.abs(n.c.z - z) < 0.01)?.kind ?? 'corner3';
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const edge = (a: THREE.Vector3, b: THREE.Vector3, label: string) => run(a, b, st(nodeKind(a.x, a.y, a.z)), st(nodeKind(b.x, b.y, b.z)), label);
  const cm = (v: number) => `${String(r1(v / 10)).replace('.', ',')} cm`;
  // posts
  for (const x of xs) for (const y of ys) for (let i = 0; i < levels; i++) edge(V(x, y, zs[i]), V(x, y, zs[i + 1]), levels > 1 ? `słupek ${cm(H / levels)}` : `słupek ${cm(H)}`);
  // horizontal edges on every level
  zs.forEach((z, i) => {
    const top = i === levels;
    for (const y of ys) {
      if (top && lamp) {
        edge(V(xs[0], y, z), V(W / 2, y, z), `pół krawędzi ${cm(W)}`);
        edge(V(W / 2, y, z), V(xs[1], y, z), `pół krawędzi ${cm(W)}`);
      } else edge(V(xs[0], y, z), V(xs[1], y, z), `krawędź ${cm(W)}`);
    }
    for (const x of xs) edge(V(x, ys[0], z), V(x, ys[1], z), `krawędź ${cm(Dp)}`);
    if (top && lamp) edge(V(W / 2, ys[0], z), V(W / 2, ys[1], z), 'drążek pod lampę');
  });

  // ------------------------------------------------------------------ clips (beside the frame, flat)
  const clipsN = joint === 'clip' ? pipeEnds + (bellMode ? 0 : couplers * 2) : 0;
  if (clipsN) {
    const cp: Params = { ...defaults('springClip'), shape: 'round', D, T, pinD, pins: '2', Lc: Math.round(D * 1.2), outer: wall };
    const cols = 8, sx = D + 16, sy = Math.round(D * 1.2) + D / 2 + 16;
    for (let k = 0; k < clipsN; k++) {
      use('clip', () => ({
        role: 'Z',
        name: 'Zatrzask sprężynowy U',
        type: 'springClip',
        params: cp,
        qty: 0,
        group: 'clip',
        color: '#5bb974',
        material: 'PETG',
        where: 'W każdym końcu rury przy łączniku (warto dodrukować 4 zapasowe)',
        how: 'Leży płasko, bez podpór. Tylko PETG albo nylon, z PLA pęka.',
      }));
      placements.push({ role: 'Z', rotation: [0, 0, 0], position: [r1(W + 60 + (k % cols) * sx), r1(sy / 2 + Math.floor(k / cols) * sy), 0] });
    }
  }

  // ------------------------------------------------------------------ buy, steps, notes
  const buy: Plan['buy'] = [];
  if (joint === 'screw') buy.push({ name: 'Wkręt do tworzyw M4 × 12 (np. typu PT)', qty: `${pipeEnds + (bellMode ? 0 : couplers * 2)} szt.`, note: 'Jeden w każdym ramieniu łącznika, przez otwór w ramieniu w otwór pilotowy rury.' });
  if (joint === 'bolt') {
    const len = Math.ceil((D + 2 * (luz + wall) + 6) / 5) * 5;
    buy.push({ name: `Śruba M5 × ${len} z nakrętką M5`, qty: `${pipeEnds + (bellMode ? 0 : couplers * 2)} kpl.`, note: 'Na wylot przez ramię łącznika i rurę, nakrętka wchodzi w sześciokątne gniazdo.' });
  }
  if (joint === 'glue') buy.push({ name: 'Klej do tworzyw (cyjanoakryl żelowy albo epoksyd 2K)', qty: '1 opakowanie', note: 'Połączenia na stałe, ramy nie rozbierzesz.' });
  const board = (what: string) => `${what} ${mm(W - 2 * Ro + D)} × ${mm(Dp - 2 * Ro + D)} mm`;
  const shelfZ = [...(v.bottom ? [zs[0]] : []), ...(v.shelves ? zs.slice(1, -1) : [])];
  if (shelfZ.length)
    buy.push({
      name: board('Płyta półki (sklejka 6–10 mm)'),
      qty: `${shelfZ.length} szt.`,
      note: `Wytnij w rogach wcięcia ${mm(2 * Ro + 4)} × ${mm(2 * Ro + 4)} mm na łączniki. Leży na rurach ${v.bottom && v.shelves && levels > 1 ? 'dolnej ramy i poziomów' : v.bottom ? 'dolnej ramy' : 'poziomów'}.`,
    });
  // Bought boards, drawn in the preview only.
  const boards: Plan['boards'] = [...shelfZ.map((z) => ({ z: z + D / 2 + 4, t: 8 })), ...(v.top ? [{ z: zTop + D / 2 + 6, t: 12 }] : [])].map(({ z, t }) => ({
    size: [W - 2 * Ro + D, Dp - 2 * Ro + D, t] as Vec3,
    position: [W / 2, Dp / 2, z] as Vec3,
  }));
  if (v.top) buy.push({ name: board('Blat (sklejka lub płyta 10–18 mm)'), qty: '1 szt.', note: 'Leży na górnej ramie, wcięcia w rogach jak w półkach.' });

  const segRoles = items.filter((i) => i.group === 'pipe');
  const steps = [
    `Wydrukuj wszystkie części z listy. Odcinki rur drukują się pionowo${bellMode ? ', kielichem do góry' : ''}, z brimem.`,
    bellMode
      ? `Złóż rury z odcinków: gładki koniec następnego odcinka wsuń w kielich poprzedniego do oporu (${segRoles.map((i) => i.role).join(', ')}). Ciasno, bez kleju.`
      : 'Złóż rury z odcinków, łącząc je dwujnikami Ł.',
    joint === 'clip'
      ? 'W każdy koniec rury przy łączniku włóż zatrzask Z: ściśnij bolce, wsuń rurę w ramię łącznika i obracaj, aż bolce wskoczą w otwory.'
      : joint === 'screw'
        ? 'Rurę wsuń w ramię łącznika do oporu i wkręć wkręt M4 przez otwór w ramieniu w otwór pilotowy rury.'
        : joint === 'bolt'
          ? 'Rurę wsuń w ramię łącznika do oporu, przełóż śrubę M5 na wylot przez ramię i rurę i dokręć nakrętkę w gnieździe.'
          : joint === 'click'
            ? 'Wciśnij rurę w ramię łącznika do kliknięcia: zaczepy wskakują w rowek na końcu rury. Rozłączasz, rozchylając zaczepy śrubokrętem.'
        : 'Posmaruj klejem koniec rury i wsuń ją w ramię łącznika do oporu. Złóż całość od razu, zanim klej zwiąże.',
    'Złóż dolny prostokąt: 4 narożniki N1 i rury krawędzi.',
    levels > 1 ? `Wstaw słupki, łączniki 4-ramienne ${fitRole.corner4} i rury poziomów (${pl(levels - 1, 'poziom', 'poziomy', 'poziomów')}).` : 'Wstaw 4 słupki.',
    lamp ? `Złóż górny prostokąt z trójnikami ${fitRole.tee} na środku dłuższych krawędzi i drążkiem pod lampę między nimi.` : 'Złóż górny prostokąt i nałóż go na słupki.',
    ...(shelfZ.length ? [v.bottom && !(v.shelves && levels > 1) ? 'Połóż półkę na rurach dolnej ramy.' : v.bottom ? 'Połóż półki na rurach dolnej ramy i poziomów.' : 'Połóż półki na rurach poziomów.'] : []),
    ...(v.top ? ['Połóż blat na górnej ramie.'] : []),
  ];

  const notes: Plan['notes'] = [];
  const pieces = segRoles.reduce((a, i) => a + i.qty, 0);
  notes.push({ text: `${pl(pipeRuns, 'rura', 'rury', 'rur')} podzielone na ${pl(pieces, 'odcinek', 'odcinki', 'odcinków')}, najdłuższy ${mm(longest)} mm przy wysokości druku ${bed[2]} mm.` });
  if (longest > bed[2]) notes.push({ warn: true, text: 'Najdłuższy odcinek nie mieści się na drukarce. Zmniejsz średnicę rury albo wybierz inną drukarkę.' });
  if (Number(v.H) / Math.min(Number(v.W), Number(v.D)) > 3 && levels === 1) notes.push({ warn: true, text: 'Wysoka i wąska rama bez poziomu usztywniającego będzie się chwiać. Dodaj poziom w kroku Wymiary.' });
  if (mat === 'PLA' && Number(v.H) > 100) notes.push({ warn: true, text: 'PLA ugina się z czasem pod obciążeniem. Dla dużej ramy wybierz PETG.' });
  if (mat === 'PLA' && joint === 'clip') notes.push({ text: 'Zatrzaski Z i tak drukuj z PETG albo nylonu: z PLA pękają.' });
  if (D <= 16 && Number(v.H) > 80) notes.push({ warn: true, text: 'Rura Ø16 przy tej wysokości będzie się mocno uginać. Wybierz Ø20 albo Ø25.' });
  if (lamp) notes.push({ text: 'Drążek pod lampę uniesie około 3 kg.' });

  return { items, placements, buy, steps, notes, bed, longest, size: [W, Dp, H], boards };
}

const tiles = (key: string, options: Extract<Field, { kind: 'tiles' }>['options'], label?: string, cols?: 2 | 3 | 4): Field => ({ kind: 'tiles', key, label, options, cols });

export const FRAME_WIZARD: Wizard = {
  id: 'frame',
  label: 'Rama z rur',
  desc: 'Prostopadłościenna rama z drukowanych rur i łączników: namiot, regał, stolik.',
  defaults: { tpl: 'tent', ...TEMPLATES.tent.v, pipe: 25, mat: 'PETG', joint: 'clip', seg: 'bell', printer: 'p1s' },
  set(v, key, value) {
    if (key === 'tpl') return { ...v, tpl: value, ...TEMPLATES[String(value)].v };
    return { ...v, [key]: value };
  },
  plan,
  steps: [
    {
      title: 'Szablon',
      desc: 'Od czego zaczynamy? Każdy szablon ustawia wymiary i dodatki, wszystko zmienisz w kolejnych krokach.',
      focus: [],
      focusLabel: 'cała rama',
      fields: () => [tiles('tpl', Object.entries(TEMPLATES).map(([k, t]) => ({ value: k, label: t.label, desc: t.desc, icon: frameIcon(t.v) })))],
    },
    {
      title: 'Wymiary',
      desc: 'Wymiary zewnętrzne ramy i liczba poziomów usztywniających.',
      focus: [],
      focusLabel: 'wymiary',
      fields: () => [
        { kind: 'slider', key: 'W', label: 'Szerokość', min: 20, max: 200, step: 5, unit: 'cm' },
        { kind: 'slider', key: 'D', label: 'Głębokość', min: 20, max: 200, step: 5, unit: 'cm' },
        { kind: 'slider', key: 'H', label: 'Wysokość', min: 20, max: 220, step: 5, unit: 'cm' },
        tiles('rings', [{ value: 0, label: 'Brak' }, { value: 1, label: '1', desc: 'w połowie' }, { value: 2, label: '2', desc: 'co 1/3' }, { value: 3, label: '3', desc: 'co 1/4' }], 'Poziomy usztywniające', 4),
        { kind: 'hint', text: 'Przy wysokości ponad 3× szerokość daj co najmniej jeden poziom: drukowane rury uginają się bardziej niż stalowe.' },
      ],
    },
    {
      title: 'Rura',
      desc: 'Średnica rury i materiał. Grubsza rura jest sztywniejsza, ale bierze więcej filamentu.',
      focus: ['pipe'],
      focusLabel: 'rury',
      fields: () => [
        tiles('pipe', [{ value: 16, label: 'Ø16', desc: 'lekka, do 60 cm' }, { value: 20, label: 'Ø20', desc: 'do 1 m' }, { value: 25, label: 'Ø25', desc: 'do 1,5 m' }, { value: 32, label: 'Ø32', desc: 'duże ramy' }], 'Średnica rury'),
        tiles('mat', [{ value: 'PETG', label: 'PETG', desc: 'zalecany, nie pęka' }, { value: 'PLA', label: 'PLA', desc: 'małe ramy w domu' }], 'Materiał'),
      ],
    },
    {
      title: 'Łączenie',
      desc: 'Jak rury trzymają się w łącznikach i jak łączą się odcinki rur.',
      focus: ['fit', 'clip', 'seg'],
      focusLabel: 'łączniki',
      fields: () => [
        tiles(
          'joint',
          [
            { value: 'clip', label: 'Zatrzask U', desc: 'bez narzędzi, rozbieralne' },
            { value: 'click', label: 'Na klik', desc: 'wciskana, bez dodatkowych części' },
            { value: 'screw', label: 'Wkręt M4', desc: 'sztywniej, rozbieralne' },
            { value: 'bolt', label: 'Śruba M5 z nakrętką', desc: 'najmocniej z rozbieralnych' },
            { value: 'glue', label: 'Klej', desc: 'najsztywniej, na stałe' },
          ],
          'Rura w łączniku (koniec rury i ramię łącznika)',
          3,
        ),
        { kind: 'hint', text: 'Gwintu i bagnetu tu nie ma: w zamkniętej ramie ostatnich rur nie da się wkręcić ani przekręcić. Są w edytorze, w sekcji „Końce” łącznika i rury.' },
        tiles('seg', [{ value: 'bell', label: 'Kielich', desc: 'odcinek wchodzi w odcinek, mniej części' }, { value: 'coupler', label: 'Dwujnik', desc: 'osobna złączka, odcinki równe' }], 'Odcinki rury między sobą'),
      ],
    },
    {
      title: 'Dodatki',
      desc: 'Elementy dodatkowe ramy.',
      focus: [],
      focusLabel: 'dodatki',
      fields: (v) => [
        ...(lampFits(v) ? [{ kind: 'toggle' as const, key: 'lamp', label: 'Drążek pod lampę', desc: 'Trójniki na górnych krawędziach i drążek przez środek.' }] : []),
        { kind: 'toggle', key: 'bottom', label: 'Półka na dolnej ramie', desc: 'Płyta ze sklejki na rurach dolnego prostokąta, tuż nad podłogą (do kupienia).' },
        ...(Number(v.rings) > 0 ? [{ kind: 'toggle' as const, key: 'shelves', label: 'Półki na poziomach', desc: 'Płyty ze sklejki na rurach poziomów usztywniających (do kupienia, wymiary w instrukcji).' }] : []),
        { kind: 'toggle', key: 'top', label: 'Blat na górze', desc: 'Płyta na górnej ramie (do kupienia).' },
      ],
    },
    {
      title: 'Drukarka',
      desc: 'Wielkość stołu decyduje, na ile odcinków dzielę każdą rurę.',
      focus: ['pipe'],
      focusLabel: 'podział na odcinki',
      fields: (_v, p) => [
        tiles('printer', Object.entries(PRINTERS).map(([k, pr]) => ({ value: k, label: pr.label, desc: `${pr.bed.join(' × ')} mm` }))),
        ...(p ? [{ kind: 'hint' as const, text: `Najdłuższy odcinek: ${mm(p.longest)} mm przy wysokości druku ${p.bed[2]} mm. Odcinki drukują się pionowo, bez podpór.` }] : []),
      ],
    },
    {
      title: 'Podsumowanie',
      desc: '„Utwórz projekt” wstawia ramę do edytora jako zwykłe elementy. Kopie tej samej części są połączone: zmień jedną, zmienią się wszystkie.',
      focus: [],
      focusLabel: 'cała rama',
      fields: () => [],
    },
  ],
};
