import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';
import { M } from '../geom/manifold';
import type { ParamDef, Params, PartDef } from './def';
import { FITS, THREADS, externalThread, internalThreadCut, threadGap, type ThreadSpec } from './threads';
import { box, cyl, hex, num, poly, select, union } from './util';

// ------------------------------------------------------------------------------------- sizes

/** Common pipes: outer diameter and wall, mm. Values are typical; measure yours. */
export const PIPE_SIZES: Record<string, { label: string; D: number; T: number }> = {
  pvc16: { label: 'PCV/PP 16 (instalacyjna)', D: 16, T: 1.5 },
  pvc20: { label: 'PCV/PP 20', D: 20, T: 1.9 },
  pvc25: { label: 'PCV/PP 25', D: 25, T: 2.3 },
  pvc32: { label: 'PCV/PP 32', D: 32, T: 2.9 },
  pvc40: { label: 'PCV/PP 40', D: 40, T: 3.7 },
  pvc50: { label: 'PCV/PP 50', D: 50, T: 4.6 },
  kan32: { label: 'Kanalizacyjna 32', D: 32, T: 1.8 },
  kan40: { label: 'Kanalizacyjna 40', D: 40, T: 1.8 },
  kan50: { label: 'Kanalizacyjna 50', D: 50, T: 1.8 },
  kan75: { label: 'Kanalizacyjna 75', D: 75, T: 1.9 },
  kan110: { label: 'Kanalizacyjna 110', D: 110, T: 2.2 },
  al10: { label: 'Aluminium/stal 10', D: 10, T: 1 },
  al12: { label: 'Aluminium/stal 12', D: 12, T: 1 },
  al16: { label: 'Aluminium/stal 16', D: 16, T: 1.5 },
  al20: { label: 'Aluminium/stal 20', D: 20, T: 1.5 },
  al22: { label: 'Aluminium/stal 22', D: 22, T: 1.5 },
  al25: { label: 'Aluminium/stal 25', D: 25, T: 2 },
  al30: { label: 'Aluminium/stal 30', D: 30, T: 2 },
  cu12: { label: 'Miedź 12', D: 12, T: 1 },
  cu15: { label: 'Miedź 15', D: 15, T: 1 },
  cu18: { label: 'Miedź 18', D: 18, T: 1 },
  cu22: { label: 'Miedź 22', D: 22, T: 1 },
  cu28: { label: 'Miedź 28', D: 28, T: 1.2 },
  g14: { label: 'Rura gwintowana G 1/4', D: 13.5, T: 2.3 },
  g38: { label: 'Rura gwintowana G 3/8', D: 17.2, T: 2.3 },
  g12: { label: 'Rura gwintowana G 1/2', D: 21.3, T: 2.65 },
  g34: { label: 'Rura gwintowana G 3/4', D: 26.9, T: 2.65 },
  g1: { label: 'Rura gwintowana G 1', D: 33.7, T: 3.25 },
};
/** The pipe thread that goes with a G pipe size. */
const G_THREAD: Record<string, string> = { g14: 'G1/4', g38: 'G3/8', g12: 'G1/2', g34: 'G3/4', g1: 'G1' };

/** Common square / rectangular profiles: width, height, wall (0 = solid aluminium extrusion). */
export const PROFILE_SIZES: Record<string, { label: string; W: number; H: number; T: number }> = {
  sq15: { label: 'Kwadratowy 15×15', W: 15, H: 15, T: 1.5 },
  sq20: { label: 'Kwadratowy 20×20', W: 20, H: 20, T: 1.5 },
  sq25: { label: 'Kwadratowy 25×25', W: 25, H: 25, T: 2 },
  sq30: { label: 'Kwadratowy 30×30', W: 30, H: 30, T: 2 },
  sq40: { label: 'Kwadratowy 40×40', W: 40, H: 40, T: 2 },
  re2040: { label: 'Prostokątny 20×40', W: 40, H: 20, T: 2 },
  re3060: { label: 'Prostokątny 30×60', W: 60, H: 30, T: 2 },
  v2020: { label: 'Aluminiowy V-slot 2020', W: 20, H: 20, T: 0 },
  v3030: { label: 'Aluminiowy V-slot 3030', W: 30, H: 30, T: 0 },
  v4040: { label: 'Aluminiowy V-slot 4040', W: 40, H: 40, T: 0 },
};

export const pipeStd = (key = 'std', label = 'Rura'): ParamDef => ({
  ...select(key, label, 'pvc20', [...Object.entries(PIPE_SIZES).map(([k, v]) => [k, v.label] as [string, string]), ['custom', 'Własna (wpisz wymiary)']]),
  hint: 'Typowe wymiary. Zmierz swoją rurę suwmiarką; inna średnica = „Własna”.',
});
export const profileStd = (): ParamDef => ({
  ...select('std', 'Profil', 'sq20', [...Object.entries(PROFILE_SIZES).map(([k, v]) => [k, v.label] as [string, string]), ['custom', 'Własny (wpisz wymiary)']]),
  hint: 'Typowe wymiary. Profil aluminiowy V-slot jest pełny: pasuje do niego tylko nasuwka.',
});

/** Picking a standard size fills in the dimensions; typing a dimension switches to "custom". */
export function stdNormalize(keys: { std: string; D: string; T: string; H?: string }, table: 'pipe' | 'profile') {
  return (prev: Params, next: Params): Params => {
    const s = String(next[keys.std]);
    if (s !== prev[keys.std] && s !== 'custom') {
      if (table === 'pipe' && PIPE_SIZES[s]) return { ...next, [keys.D]: PIPE_SIZES[s].D, [keys.T]: PIPE_SIZES[s].T };
      const q = PROFILE_SIZES[s];
      if (q) return { ...next, [keys.D]: q.W, ...(keys.H ? { [keys.H]: q.H } : {}), [keys.T]: q.T || next[keys.T] };
      return next;
    }
    const changed = [keys.D, keys.T, keys.H].some((k) => k && next[k] !== prev[k]);
    return changed && s === prev[keys.std] && s !== 'custom' ? { ...next, [keys.std]: 'custom' } : next;
  };
}

// ------------------------------------------------------------------------------------- fittings

export type FitKind = 'straight' | 'reducer' | 'elbow90' | 'elbow45' | 'tee' | 'wye' | 'cross' | 'corner3' | 'corner4' | 'five' | 'six';
export type EndKind = 'socket' | 'plug' | 'female' | 'male' | 'bayonet' | 'click' | 'pin';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const d45 = new THREE.Vector3(Math.SQRT1_2, Math.SQRT1_2, 0), d135 = new THREE.Vector3(-Math.SQRT1_2, Math.SQRT1_2, 0);
const ARMS: Record<FitKind, THREE.Vector3[]> = {
  straight: [X, X.clone().negate()],
  reducer: [X, X.clone().negate()],
  elbow90: [X, Y],
  elbow45: [X, d135],
  tee: [X, X.clone().negate(), Y],
  wye: [X, X.clone().negate(), d45],
  cross: [X, X.clone().negate(), Y, Y.clone().negate()],
  corner3: [X, Y, Z],
  corner4: [X, X.clone().negate(), Y, Z],
  five: [X, X.clone().negate(), Y, Y.clone().negate(), Z],
  six: [X, X.clone().negate(), Y, Y.clone().negate(), Z, Z.clone().negate()],
};

const KINDS: [FitKind, string][] = [
  ['straight', 'Dwujnik (prosta złączka)'],
  ['reducer', 'Redukcja (dwie średnice)'],
  ['elbow90', 'Kolano 90°'],
  ['elbow45', 'Kolano 45°'],
  ['tee', 'Trójnik T'],
  ['wye', 'Trójnik Y (45°)'],
  ['cross', 'Czwórnik (krzyż)'],
  ['corner3', 'Narożnik 3D (3 ramiona)'],
  ['corner4', 'Narożnik 3D (4 ramiona)'],
  ['five', 'Pięciodrożny'],
  ['six', 'Sześciodrożny'],
];
const ROUND_ENDS: [EndKind, string][] = [
  ['socket', 'Kielich (rura wchodzi do środka)'],
  ['plug', 'Czop (wchodzi w rurę)'],
  ['female', 'Gwint wewnętrzny (żeński)'],
  ['male', 'Gwint zewnętrzny (męski)'],
  ['bayonet', 'Bagnet (wsuń i przekręć)'],
  ['click', 'Na klik (zatrzaski)'],
  ['pin', 'Zatrzask sprężynowy U (bolce)'],
];
const SQUARE_ENDS: [EndKind, string][] = [
  ['plug', 'Czop (wchodzi w profil)'],
  ['socket', 'Nasuwka (profil wchodzi do środka)'],
  ['pin', 'Zatrzask sprężynowy U (bolce)'],
];

const SCREWS: Record<string, number> = { M3: 3, M4: 4, M5: 5, M6: 6, M8: 8 };

/** Everything the geometry, the matching pipes and their holes need, from a fitting's parameters. */
export function fittingGeo(p: Params, square: boolean) {
  const kind = (String(p.kind) as FitKind) in ARMS ? (String(p.kind) as FitKind) : 'tee';
  const end = String(p.end) as EndKind;
  const g = num(p, 'luz');
  const wall = num(p, 'wall');
  const size = (i: number) => {
    const two = kind === 'reducer' && i === 1 && !square;
    const D = num(p, two ? 'D2' : 'D'), T = num(p, two ? 'T2' : 'T');
    return { D, T, H: square ? num(p, 'H') || D : D };
  };
  const dirs = ARMS[kind].map((d) => d.clone());
  // Each arm may have its own end; „same” (or none) takes the fitting's main choice.
  const ends = dirs.map((_, i) => {
    const e = String(p[`e${i}`] ?? 'same');
    return (e === 'same' ? end : e) as EndKind;
  });
  const socketLike = (e: EndKind) => e === 'socket' || e === 'pin' || e === 'bayonet' || e === 'click' || e === 'female';
  // Arms start where the pipes no longer touch each other (pipes meeting at an angle need room).
  let stop = ends.includes('plug') ? 3 : 1.5;
  let minAngle = Math.PI;
  const Rp = Math.max(...dirs.map((_, i) => Math.max(size(i).D, size(i).H))) / 2 + (ends.some(socketLike) ? g : 0);
  for (let i = 0; i < dirs.length; i++)
    for (let j = i + 1; j < dirs.length; j++) {
      const a = dirs[i].angleTo(dirs[j]);
      minAngle = Math.min(minAngle, a);
      if (a < Math.PI - 0.01) stop = Math.max(stop, Rp / Math.tan(a / 2) + (square ? 0 : 1));
    }
  const depth = num(p, 'depth');
  const pitch = num(p, 'P') || 1.5;
  const thread = (i: number): ThreadSpec => {
    const t = G_THREAD[String(i === 1 && kind === 'reducer' ? p.std2 : p.std)];
    if (t && THREADS[t]) return THREADS[t];
    return { d: size(i).D, p: pitch, angle: 60, af: 0, label: 'rura' };
  };
  const pinD = num(p, 'pinD') || 5;
  const screw = SCREWS[String(p.screw)] ?? 0;
  return { kind, end, ends, g, wall, size, dirs, stop, minAngle, depth, thread, pinD, screw, square };
}
export type FitGeo = ReturnType<typeof fittingGeo>;

/** Rotation taking +Z (an arm built standing up) onto the arm's direction. */
export function armQuat(d: THREE.Vector3) {
  return new THREE.Quaternion().setFromUnitVectors(Z, d.clone().normalize());
}
const place = (m: Manifold, d: THREE.Vector3) => {
  const mat = new THREE.Matrix4().makeRotationFromQuaternion(armQuat(d));
  return m.transform(mat.elements as unknown as Parameters<Manifold['transform']>[0]);
};

/** Height of the arm's screw / pin along the arm, and the outward directions (arm frame) of each. */
export function screwSpots(geo: FitGeo, p: Params, i = 0) {
  const z = geo.stop + geo.depth * Math.min(0.85, Math.max(0.15, num(p, 'screwAt') || 0.5));
  // Bayonet pins rest at 0° and 180°: screws go between them.
  const a0 = (num(p, 'screwAngle') || 0) * (Math.PI / 180) + (geo.ends[i] === 'bayonet' ? Math.PI / 2 : 0);
  const n = Math.round(num(p, 'screwN')) === 2 && p.screwMode !== 'through' ? 2 : 1;
  const angles = Array.from({ length: n }, (_, k) => a0 + k * Math.PI);
  return { z, angles };
}
export function pinSpots(geo: FitGeo, p: Params) {
  return { z: geo.stop + geo.depth * 0.5, angles: String(p.pins) === '1' ? [0] : [0, Math.PI] };
}
/** Outer half-size of arm i's pipe in the direction a (round: the radius; square: half width or height). */
export function halfAt(geo: FitGeo, i: number, a: number) {
  const { D, H } = geo.size(i);
  return geo.square ? (Math.abs(Math.cos(a)) > 0.5 ? D / 2 : H / 2) : D / 2;
}

const ORING_ENDS = new Set(['socket', 'plug', 'bayonet', 'click', 'pin']);
/**
 * O-ring seal of arm i (round arms only): groove in the socket bore (sealing on the pipe's outside)
 * or on the plug (sealing on the pipe's inside), squeezed 20 %. Null when the arm has none.
 */
export function oringFor(geo: FitGeo, p: Params, i: number) {
  if (geo.square || p.oring !== 'yes' || !ORING_ENDS.has(geo.ends[i])) return null;
  const { D, T } = geo.size(i);
  const CS = num(p, 'orCS') || 2;
  const z = geo.stop + Math.max(CS * 1.5, geo.depth * 0.25);
  const w = CS * 1.4;
  if (geo.ends[i] === 'plug') {
    const bottom = D / 2 - T - 0.8 * CS;
    // Stretched about 2 % onto the groove bottom so it stays put while the pipe goes on.
    return { CS, z, w, r0: bottom, r1: D / 2 - T, ID: Math.round(2 * bottom * 0.98 * 10) / 10 };
  }
  const bottom = D / 2 + 0.8 * CS;
  return { CS, z, w, r0: D / 2 + geo.g - 0.01, r1: bottom, ID: Math.round((2 * bottom - 2 * CS) * 10) / 10 };
}

/** Pipe hole through one wall in the arm frame: start just outside, pointing inward. */
function radialCyl(r0: number, r1: number, rad: number, z: number, a: number) {
  // A cylinder along +X from r0 to r1, at height z, turned to angle a about the arm.
  return cyl(r1 - r0, rad).rotate([0, 90, 0]).translate([r0, 0, z]).rotate([0, 0, (a * 180) / Math.PI]);
}

const sq = (w: number, h: number, z0: number, z1: number) => box(-w / 2, -h / 2, z0, w / 2, h / 2, z1);

/** The outer shell of an arm and what is cut out of it (in the arm frame, arm along +Z from the centre). */
function arm(geo: FitGeo, p: Params, i: number): { add: Manifold; cut: Manifold; post?: Manifold } {
  const { D, T, H } = geo.size(i);
  const { g, wall, stop, depth, square } = geo;
  const end = geo.ends[i];
  const L = stop + depth;
  const adds: Manifold[] = [], cuts: Manifold[] = [];
  let post: Manifold | undefined;
  const idR = Math.max(0.8, D / 2 - T);
  if (square) {
    const inW = D - 2 * T, inH = H - 2 * T;
    if (end === 'plug') {
      // Hub as big as the profile; plug fits inside the profile with play and a lead-in.
      adds.push(sq(D, H, 0, stop));
      const pw = inW - 2 * g, ph = inH - 2 * g;
      adds.push(sq(pw, ph, stop - 0.01, L - 0.95).add(M().Manifold.hull([sq(pw, ph, L - 1, L - 0.99), sq(pw - 1.6, ph - 1.6, L - 0.01, L)])));
      // Ribs that bite into the profile a little: holds without glue.
      for (const s of [-1, 1]) adds.push(box(-0.6, s * (ph / 2) - 0.01 + (s < 0 ? -0.25 : 0), stop + 2, 0.6, s * (ph / 2) + 0.01 + (s > 0 ? 0.25 : 0), L - 3));
    } else {
      const ow = D + 2 * (g + wall), oh = H + 2 * (g + wall);
      adds.push(sq(ow, oh, 0, L));
      cuts.push(sq(D + 2 * g, H + 2 * g, stop, L + 1));
      if (end === 'pin') {
        const ps = pinSpots(geo, p);
        for (const a of ps.angles) cuts.push(radialCyl(halfAt(geo, i, a) + g - 0.1, halfAt(geo, i, a) + g + wall + 1, geo.pinD / 2 + g, ps.z, a));
      }
    }
  } else if (end === 'plug') {
    adds.push(cyl(stop, D / 2));
    const rp = idR - g;
    adds.push(cyl(depth - 1, rp).translate([0, 0, stop - 0.01]).add(cyl(1, rp, rp - 0.8).translate([0, 0, L - 1.1])));
    const ring = oringFor(geo, p, i);
    const rin = Math.min(rp - Math.max(wall, 1.6), ring ? ring.r0 - 1.2 : Infinity);
    if (rin > 1.5) cuts.push(cyl(L + 2, rin).translate([0, 0, -1]));
    // Room for the pipe pushed over the plug: other arms' collars must not reach into it.
    cuts.push(cyl(depth + 2, D / 2 + 2).subtract(cyl(depth + 4, idR - 0.01).translate([0, 0, -1])).translate([0, 0, stop]));
  } else if (end === 'male') {
    const spec = geo.thread(i);
    adds.push(cyl(stop, spec.d / 2 + 1));
    adds.push(externalThread(spec, depth, threadGap(p, 'out'), true, false).translate([0, 0, stop - 0.01]));
    const rin = Math.min(idR, spec.d / 2 - 0.62 * spec.p - 1.2);
    if (rin > 1) cuts.push(cyl(L + 2, rin).translate([0, 0, -1]));
  } else {
    const spec = geo.thread(i);
    const Ro = (end === 'female' ? spec.d / 2 + 0.5 : D / 2 + g) + wall;
    adds.push(cyl(L, Ro));
    if (end === 'female') cuts.push(internalThreadCut(spec, depth, threadGap(p, 'in'), true).translate([0, 0, stop]));
    else cuts.push(cyl(depth + 1, D / 2 + g).translate([0, 0, stop]), cyl(0.81, D / 2 + g, D / 2 + g + 0.8).translate([0, 0, L - 0.8]));
    cuts.push(cyl(stop + 0.02, idR).translate([0, 0, -0.01]));
    const r1 = D / 2 + g - geo.pinD, r2 = Ro + 1;
    if (end === 'bayonet') {
      // Two L-slots: in from the mouth at -30°, then a quarter-ish turn to 0° where the pin rests.
      const w = geo.pinD + 2 * g;
      const zp = L - Math.max(geo.pinD, 4) - 2;
      for (const s of [0, 180]) {
        const turn = -30;
        cuts.push(box(r1, -w / 2, zp - w / 2, r2, w / 2, L + 1).rotate([0, 0, s + turn]));
        const arc = M().Manifold.revolve(poly([[r1, zp - w / 2], [r2, zp - w / 2], [r2, zp + w / 2], [r1, zp + w / 2]]), 96, 30 + (w / (2 * Math.PI * r1)) * 360).rotate([0, 0, s + turn - (w / (2 * Math.PI * r1)) * 180]);
        cuts.push(arc);
      }
    } else if (end === 'click') {
      // Four fingers with an inward hook near the mouth; the pipe end has a matching groove.
      const zh = L - 3;
      // The hook goes on after the bore is cut (the bore would take it away), then the slots split it.
      const hook = M().Manifold.revolve(poly([[D / 2 - 0.8, zh], [D / 2 + g + 0.3, zh], [D / 2 + g + 0.3, zh + 1.6], [D / 2 + g, zh + 1.6]]), 96);
      const slots = union([0, 90, 180, 270].map((s) => box(-0.8, D / 2 - 2, L - depth * 0.7, 0.8, Ro + 1, L + 1).rotate([0, 0, s + 45])));
      cuts.push(slots);
      post = hook.subtract(slots);
    } else if (end === 'pin') {
      const ps = pinSpots(geo, p);
      for (const a of ps.angles) cuts.push(radialCyl(r1, r2, geo.pinD / 2 + g, ps.z, a));
    }
  }
  const ring = oringFor(geo, p, i);
  if (ring) {
    const groove = cyl(ring.w, end === 'plug' ? ring.r1 + 1 : ring.r1).subtract(cyl(ring.w + 2, ring.r0).translate([0, 0, -1])).translate([0, 0, ring.z - ring.w / 2]);
    cuts.push(groove);
  }
  // Screws: a clearance hole with a counterbore in the arm (a pilot hole in a plug).
  if (geo.screw && (end !== 'pin')) {
    const s = geo.screw, sp = screwSpots(geo, p, i);
    for (const a of sp.angles) {
      const h = halfAt(geo, i, a);
      if (end === 'plug') {
        const rIn = square ? h - T - g : idR - g;
        cuts.push(radialCyl(Math.max(0, rIn - Math.min(rIn, 10)), rIn + 1, (s * 0.8) / 2, sp.z, a));
      } else {
        const rIn = h + g;
        const rOut = end === 'female' ? geo.thread(i).d / 2 + 0.5 + wall : rIn + wall;
        cuts.push(radialCyl(rIn - s, rOut + 1, (s + 0.4) / 2, sp.z, a));
        if (p.screwMode === 'through') {
          // Nut trap on the opposite side, head recess on this one.
          cuts.push(hex(s * 1.8 + 0.4, wall).rotate([0, 90, 0]).translate([rOut - wall * 0.6, 0, sp.z]).rotate([0, 0, ((a + Math.PI) * 180) / Math.PI]));
          cuts.push(radialCyl(rIn - s, rOut + 1, (s + 0.4) / 2, sp.z, a + Math.PI));
        }
        cuts.push(radialCyl(rOut - Math.min(wall * 0.5, 1.5), rOut + 1, s, sp.z, a));
      }
    }
  }
  return { add: union(adds), cut: cuts.length ? union(cuts) : M().Manifold.cube([0, 0, 0]), post };
}

const lifts = new Map<string, number>();
/** How far a fitting is raised so it stands on the bed (its centre is that high above its base). */
export function fittingLift(p: Params, square: boolean): number {
  const k = (square ? 's' : 'r') + JSON.stringify(p);
  let v = lifts.get(k);
  if (v === undefined) {
    const m = rawFitting(p, square);
    v = -m.boundingBox().min[2];
    m.delete();
    if (lifts.size > 200) lifts.clear();
    lifts.set(k, v);
  }
  return v;
}

export function buildFitting(p: Params, square: boolean): Manifold {
  const m = rawFitting(p, square);
  const lift = -m.boundingBox().min[2];
  lifts.set((square ? 's' : 'r') + JSON.stringify(p), lift);
  return m.translate([0, 0, lift]);
}

function rawFitting(p: Params, square: boolean): Manifold {
  const geo = fittingGeo(p, square);
  const parts = geo.dirs.map((d, i) => {
    const a = arm(geo, p, i);
    return { add: place(a.add, d), cut: place(a.cut, d), post: a.post && place(a.post, d) };
  });
  // A centre piece joins the arms (round: a ball; square: a cube).
  const big = Math.max(...geo.dirs.map((_, i) => Math.max(geo.size(i).D, geo.size(i).H)));
  // A plug's hub must not reach into the pipe pushed over it (only up to the stop at the pipe's bore).
  const bore = Math.min(...geo.dirs.map((_, i) => geo.size(i).D / 2 - geo.size(i).T - geo.g));
  const hubR = geo.ends.includes('plug')
    ? Math.min(big / 2, square ? geo.stop : Math.hypot(geo.stop, bore))
    : geo.ends.every((e) => e === 'male')
      ? big / 2
      : big / 2 + geo.g + geo.wall;
  const hub = square ? sq(2 * hubR, 2 * hubR, -hubR, hubR) : M().Manifold.sphere(hubR, 64);
  let m = union([hub, ...parts.map((x) => x.add)]);
  m = m.subtract(union(parts.map((x) => x.cut)));
  const posts = parts.flatMap((x) => (x.post ? [x.post] : []));
  return posts.length ? m.add(union(posts)) : m;
}

// ------------------------------------------------------------------------------------- pipe end

/** A pipe (or a piece glued onto one) whose end at z = 0 matches a fitting's arm. */
export function buildPipeEnd(p: Params): Manifold {
  const D = num(p, 'D'), T = num(p, 'T'), L = num(p, 'L'), g = num(p, 'luz'), depth = num(p, 'depth');
  const end = String(p.end) as EndKind;
  const ri = Math.max(0.5, D / 2 - T);
  let m = cyl(L, D / 2);
  if (end === 'male') {
    const t = G_THREAD[String(p.std)];
    const spec: ThreadSpec = t && THREADS[t] ? THREADS[t] : { d: D, p: num(p, 'P') || 1.5, angle: 60, af: 0, label: 'rura' };
    m = cyl(L - depth, D / 2).translate([0, 0, depth - 0.01]).add(externalThread(spec, depth, threadGap(p, 'out'), false, true));
  }
  if (end === 'bayonet') {
    const pinD = num(p, 'pinD') || 5, wall = num(p, 'wall');
    const zp = depth - Math.max(pinD, 4) - 2;
    for (const s of [0, 180]) m = m.add(cyl(wall + 0.01, pinD / 2).rotate([0, 90, 0]).translate([D / 2 - 0.3, 0, zp]).rotate([0, 0, s]));
  }
  if (end === 'click') {
    const zh = depth - 3;
    m = m.subtract(M().Manifold.revolve(poly([[D / 2 - 1, zh - 0.2], [D / 2 + 1, zh - 0.2], [D / 2 + 1, zh + 1.8], [D / 2 - 1, zh + 1.8]]), 96));
  }
  m = m.subtract(cyl(L + 2, ri).translate([0, 0, -1]));
  if (p.bell === 'yes') {
    // Socket on the top end: the next pipe's plain end slides in down to the ledge (45° outside, prints standing).
    const bD = num(p, 'bellD'), bl = num(p, 'bellL') || 0.15, Ri = D / 2 + bl, Ro = Ri + (num(p, 'bellW') || 2.4);
    const z0 = L - bD;
    m = m
      .add(cyl(bD, Ro).translate([0, 0, z0]))
      .add(cyl(Ro - D / 2 + 0.01, D / 2, Ro).translate([0, 0, z0 - (Ro - D / 2)]))
      .subtract(cyl(bD + 1, Ri).translate([0, 0, z0]))
      .subtract(cyl(0.81, Ri, Ri + 0.8).translate([0, 0, L - 0.8]))
      .subtract(cyl(L + 2, ri).translate([0, 0, -1]));
  }
  // Two opposite holes for the pins of a U spring clip (fitting arm or the next pipe).
  const pins = String(p.pinHoles ?? 'none');
  if (pins !== 'none') {
    const pd = num(p, 'pinD') || 5, at = num(p, 'pinAt') || 15;
    const zs = [...(pins === 'bottom' || pins === 'both' ? [at] : []), ...(pins === 'top' || pins === 'both' ? [L - at] : [])];
    for (const z of zs) m = m.subtract(cyl(D + 2, pd / 2 + g).rotate([0, 90, 0]).translate([-D / 2 - 1, 0, z]));
  }
  return m;
}

/** Square pipe end: the profile itself, lying along +Z from its end at z = 0 (centred). */
export function buildProfileEnd(p: Params): Manifold {
  const W = num(p, 'D'), H = num(p, 'H') || W, T = num(p, 'T'), L = num(p, 'L');
  const m = sq(W, H, 0, L);
  return T > 0 ? m.subtract(sq(W - 2 * T, H - 2 * T, -1, L + 1)) : m;
}

// ------------------------------------------------------------------------------------- spring clip

/**
 * U spring clip (two pins) or V (one pin) inside a pipe. Lies flat for printing (layers along the
 * spring, so it bends instead of snapping): pins along ±X at y = 0, z = w/2, legs reaching to +Y.
 */
export function buildSpringClip(p: Params): Manifold {
  const D = num(p, 'D'), T = num(p, 'T'), pinD = num(p, 'pinD'), Lc = num(p, 'Lc'), outer = num(p, 'outer');
  const square = p.shape === 'square';
  const t = Math.max(1.2, Math.min(2.4, pinD * 0.35));
  const w = clipWidth(p);
  const ri = D / 2 - T;
  // The legs' outer corners stay clear of the wall (a round pipe is narrower off the axis).
  const half = square ? ri - 0.2 : Math.sqrt(Math.max(1, ri * ri - (w * w) / 4)) - 0.2;
  const legs: Manifold[] = [];
  for (const s of [-1, 1]) legs.push(box(s > 0 ? half - t : -half, -w / 2, -Lc, s > 0 ? half : -half + t, w / 2, w / 2));
  legs.push(box(-half, -w / 2, -Lc, half, w / 2, -Lc + t));
  const pinLen = D / 2 - half + outer + 0.6;
  for (const s of String(p.pins) === '1' ? [1] : [-1, 1]) {
    const pin = cyl(pinLen - pinD / 2 + 0.01, pinD / 2).add(cyl(pinD / 2, pinD / 2, 0.4).translate([0, 0, pinLen - pinD / 2]));
    legs.push(pin.rotate([0, 90, 0]).translate([half - 0.01, 0, 0]).rotate([0, 0, s > 0 ? 0 : 180]));
  }
  return union(legs).rotate([90, 0, 0]).translate([0, 0, w / 2]);
}
export const clipWidth = (p: Params) => num(p, 'pinD') + 3;

// ------------------------------------------------------------------------------------- defs

const n = (key: string, label: string, def: number, min: number, max: number, step = 0.5, extra: Partial<ParamDef> = {}): ParamDef =>
  ({ key, label, type: 'number', def, min, max, step, unit: 'mm', ...extra }) as ParamDef;

/** Ends in use: the main one and the arms' own (hidden arms may keep an old choice, which is harmless here). */
const endsOf = (p: Params) => [String(p.end), ...Array.from({ length: 6 }, (_, i) => String(p[`e${i}`] ?? 'same')).filter((e) => e !== 'same')];
const uses = (p: Params, ...es: string[]) => endsOf(p).some((e) => es.includes(e));
const notOnly = (p: Params, e: string) => endsOf(p).some((x) => x !== e);

const fitSel = { ...select('fit', 'Dopasowanie gwintu', 'normal', Object.entries(FITS).map(([k, v]) => [k, v.label] as [string, string])) };
const threaded = (p: Params) => uses(p, 'male', 'female');

const screwParams = (round: boolean): ParamDef[] => [
  { ...select('screw', 'Skręcanie śrubą', 'none', [['none', 'Bez śrub'], ['M3', 'M3'], ['M4', 'M4'], ['M5', 'M5'], ['M6', 'M6'], ['M8', 'M8']]), hint: 'Otwór w łączniku (z gniazdem na łeb) i pasujący otwór w rurze. Przy „Dodaj pasujące rury” otwory w rurach wstawiają się same.', show: (p) => notOnly(p, 'pin') },
  { ...select('screwMode', 'Rodzaj', 'pilot', [['pilot', 'Wkręt w rurę (otwór pod wkręt)'], ['through', 'Śruba na wylot z nakrętką']]), show: (p) => p.screw !== 'none' && notOnly(p, 'pin') && uses(p, 'socket', 'female', 'bayonet', 'click') },
  { key: 'screwN', label: 'Śrub na ramię', type: 'number', def: 1, min: 1, max: 2, step: 1, show: (p) => p.screw !== 'none' && notOnly(p, 'pin') && p.screwMode !== 'through' },
  { key: 'screwAt', label: 'Położenie śruby wzdłuż ramienia', type: 'number', def: 0.5, min: 0.15, max: 0.85, step: 0.05, show: (p) => p.screw !== 'none' && notOnly(p, 'pin'), hint: '0,5 = środek wsuniętej części.' },
  { key: 'screwAngle', label: 'Kąt śruby wokół ramienia', type: 'number', def: 0, min: -180, max: 180, step: round ? 15 : 90, unit: '°', show: (p) => p.screw !== 'none' && notOnly(p, 'pin') } as ParamDef,
];

/** One „Ramię N” select per arm of the chosen shape: its own end, or the same as the rest. */
const armEnds = (ends: [EndKind, string][]): ParamDef[] =>
  Array.from({ length: 6 }, (_, i) => ({
    ...select(`e${i}`, `Ramię ${i + 1}`, 'same', [['same', 'Jak „Zakończenie ramion”'], ...ends]),
    group: 'Inne zakończenie na ramieniu',
    show: (p: Params) => i < (ARMS[String(p.kind) as FitKind] ?? ARMS.tee).length,
    ...(i === 0 ? { hint: 'Ramiona numerowane jak przy „Dodaj pasujące rury” (Rura 1, Rura 2…). Np. trójnik z dwoma kielichami i gwintem na trzecim.' } : {}),
  }));

const pinParams: ParamDef[] = [
  n('pinD', 'Średnica bolców', 5, 3, 10, 0.5, { show: (p: Params) => uses(p, 'pin', 'bayonet') }),
  { ...select('pins', 'Bolce', '2', [['2', 'Dwa (U)'], ['1', 'Jeden (V)']]), show: (p) => uses(p, 'pin') },
];

export const COUPLING_DEFS: PartDef[] = [
  {
    type: 'pipeFitting',
    label: 'Łącznik rur',
    category: 'couplings',
    hole: false,
    description: 'Dwujnik, kolano, trójnik, czwórnik i narożniki do rur, z wyborem zakończenia (kielich, czop, gwint, bagnet, klik, zatrzask U) i otworami na śruby. „Dodaj pasujące rury” wstawia rury w ramiona.',
    params: [
      select('kind', 'Kształt', 'tee', KINDS),
      select('end', 'Zakończenie ramion', 'socket', ROUND_ENDS),
      ...armEnds(ROUND_ENDS),
      pipeStd(),
      n('D', 'Średnica zewn. rury', 20, 3, 300, 0.1),
      n('T', 'Ścianka rury', 1.9, 0.5, 30, 0.1),
      { ...pipeStd('std2', 'Druga rura (redukcja)'), show: (p) => p.kind === 'reducer' },
      n('D2', 'Średnica zewn. drugiej rury', 16, 3, 300, 0.1, { show: (p: Params) => p.kind === 'reducer' }),
      n('T2', 'Ścianka drugiej rury', 1.5, 0.5, 30, 0.1, { show: (p: Params) => p.kind === 'reducer' }),
      n('depth', 'Głębokość wsunięcia', 20, 6, 200, 1),
      n('wall', 'Ścianka łącznika', 2.5, 1.2, 10, 0.2),
      n('luz', 'Luz na promieniu', 0.25, 0, 1.5, 0.05, { hint: 'Dla kupnych rur 0,2–0,3 mm. Do klejenia może być więcej.' }),
      n('P', 'Skok gwintu', 1.5, 0.75, 4, 0.25, { show: (p: Params) => threaded(p) && !String(p.std).startsWith('g'), hint: 'Rury G mają gwint rurowy z normy, bez wyboru skoku.' }),
      { ...fitSel, show: threaded },
      ...pinParams,
      { ...select('oring', 'Uszczelka o-ring', 'none', [['none', 'Bez uszczelki'], ['yes', 'Rowek na o-ring']]), show: (p) => endsOf(p).some((e) => ORING_ENDS.has(e)), hint: 'Rowek w ramieniu i o-ring do druku z TPU (dodaje go „Dodaj pasujące rury” albo „Dodaj o-ringi”). Ściska się o 20 %.' },
      n('orCS', 'Przekrój o-ringu', 2, 1, 6, 0.1, { show: (p: Params) => p.oring === 'yes' && endsOf(p).some((e) => ORING_ENDS.has(e)), hint: 'Ścianka łącznika musi być grubsza niż 0,8 × przekrój + 1 mm.' }),
      ...screwParams(true),
    ],
    normalize: (prev, next) => stdNormalize({ std: 'std2', D: 'D2', T: 'T2' }, 'pipe')(prev, stdNormalize({ std: 'std', D: 'D', T: 'T' }, 'pipe')(prev, next)),
    build: (p) => buildFitting(p, false),
  },
  {
    type: 'profileFitting',
    label: 'Łącznik profili',
    category: 'couplings',
    hole: false,
    description: 'Łącznik do profili kwadratowych i prostokątnych: czop wciskany w profil albo nasuwka, kształty L, T, X i narożniki 3D, z otworami na śruby.',
    params: [
      select(
        'kind',
        'Kształt',
        'corner3',
        KINDS.filter(([k]) => k !== 'reducer' && k !== 'wye' && k !== 'elbow45').map(([k, l]) => [k, l.replace('Kolano 90°', 'Narożnik L').replace('Trójnik T', 'Trójnik T').replace('Czwórnik (krzyż)', 'Krzyżak X')] as [string, string]),
      ),
      select('end', 'Rodzaj', 'plug', SQUARE_ENDS),
      ...armEnds(SQUARE_ENDS),
      profileStd(),
      n('D', 'Szerokość profilu', 20, 5, 200, 0.1),
      n('H', 'Wysokość profilu', 20, 5, 200, 0.1),
      n('T', 'Ścianka profilu', 1.5, 0, 20, 0.1, { hint: '0 = pełny profil (np. aluminiowy V-slot): tylko nasuwka.' }),
      n('depth', 'Głębokość wsunięcia', 20, 6, 200, 1),
      n('wall', 'Ścianka nasuwki', 2.5, 1.2, 10, 0.2),
      n('luz', 'Luz na stronę', 0.2, 0, 1.5, 0.05),
      ...pinParams,
      ...screwParams(false),
    ],
    normalize: (prev, next) => {
      const q = stdNormalize({ std: 'std', D: 'D', T: 'T', H: 'H' }, 'profile')(prev, next);
      // A solid profile has no inside to plug into.
      return num(q, 'T') <= 0 && q.end !== 'socket' ? { ...q, end: 'socket' } : q;
    },
    build: (p) => buildFitting(p, true),
  },
  {
    type: 'pipeEnd',
    label: 'Rura z końcówką',
    category: 'couplings',
    hole: false,
    description: 'Odcinek rury do druku z końcówką do łącznika (gwint męski, bolce bagnetu, rowek zatrzasku), kielichem na górze do łączenia odcinków i otworami na zatrzask U. Stoi pionowo, końcówka na dole.',
    params: [
      select('end', 'Końcówka', 'male', [['socket', 'Gładka'], ['male', 'Gwint zewnętrzny'], ['bayonet', 'Bolce bagnetu'], ['click', 'Rowek na klik']]),
      pipeStd(),
      n('D', 'Średnica zewn.', 20, 3, 300, 0.1),
      n('T', 'Ścianka', 1.9, 0.5, 30, 0.1),
      n('L', 'Długość', 60, 5, 1000, 1),
      n('depth', 'Długość końcówki', 20, 6, 200, 1),
      n('P', 'Skok gwintu', 1.5, 0.75, 4, 0.25, { show: (p: Params) => p.end === 'male' && !String(p.std).startsWith('g') }),
      { ...fitSel, show: (p) => p.end === 'male' },
      { ...select('bell', 'Kielich na górze', 'none', [['none', 'Bez kielicha'], ['yes', 'Kielich (następna rura wchodzi do środka)']]), hint: 'Odcinki rury łączone bez osobnych złączek: gładki koniec następnego odcinka wchodzi w kielich do oporu.' },
      n('bellD', 'Głębokość kielicha', 30, 8, 100, 1, { show: (p: Params) => p.bell === 'yes' }),
      n('bellW', 'Ścianka kielicha', 2.4, 1.2, 8, 0.2, { show: (p: Params) => p.bell === 'yes' }),
      n('bellL', 'Luz kielicha', 0.15, 0, 1, 0.05, { show: (p: Params) => p.bell === 'yes', hint: '0,1–0,15 mm: ciasno, trzyma bez kleju. 0,3: luźno, do klejenia.' }),
      { ...select('pinHoles', 'Otwory na zatrzask U', 'none', [['none', 'Bez otworów'], ['bottom', 'Na dole'], ['top', 'Na górze'], ['both', 'Na obu końcach']]) },
      n('pinAt', 'Odległość otworów od końca', 15, 4, 100, 0.5, { show: (p: Params) => p.pinHoles !== 'none' && p.pinHoles !== undefined }),
      n('pinD', 'Średnica bolców', 5, 3, 10, 0.5, { show: (p: Params) => p.end === 'bayonet' || (p.pinHoles !== 'none' && p.pinHoles !== undefined) }),
      n('wall', 'Wysokość bolców', 2.3, 1, 10, 0.1, { show: (p: Params) => p.end === 'bayonet', hint: 'Tyle co ścianka łącznika.' }),
      n('luz', 'Luz', 0.25, 0, 1.5, 0.05, { show: () => false }),
    ],
    normalize: stdNormalize({ std: 'std', D: 'D', T: 'T' }, 'pipe'),
    build: buildPipeEnd,
  },
  {
    type: 'springClip',
    label: 'Zatrzask sprężynowy U',
    category: 'couplings',
    hole: false,
    description: 'Sprężynka z bolcami wkładana do rury lub profilu: bolce wyskakują w otwory rury i łącznika (jak w kijach teleskopowych). Wciśnij bolce, żeby rozłączyć. Drukuj z PETG albo nylonu, z PLA pęka.',
    params: [
      select('shape', 'Do', 'round', [['round', 'Rury'], ['square', 'Profilu']]),
      n('D', 'Średnica / szerokość rury', 20, 8, 200, 0.1),
      n('T', 'Ścianka rury', 1.9, 0.5, 20, 0.1),
      n('pinD', 'Średnica bolców', 5, 3, 10, 0.5),
      { ...select('pins', 'Bolce', '2', [['2', 'Dwa (U)'], ['1', 'Jeden (V)']]) },
      n('Lc', 'Długość ramion', 30, 10, 200, 1),
      n('outer', 'Ścianka elementu na zewnątrz', 2.5, 0, 10, 0.1, { hint: 'Grubość łącznika albo rury nasuniętej z zewnątrz: tyle bolec wystaje dalej.' }),
    ],
    build: buildSpringClip,
  },
];

/** World pose helpers for "Add matching pipes": arm i's start point and direction in the fitting frame. */
export function armFrame(geo: FitGeo, i: number) {
  const d = geo.dirs[i].clone().normalize();
  return { d, start: d.clone().multiplyScalar(geo.stop), q: armQuat(d) };
}
