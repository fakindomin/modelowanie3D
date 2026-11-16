/**
 * Świąteczne dodatki w menu Figurki: etykieta „Dla” z imieniem, czubek choinkowy (żebrowany, wydrążona kula otwarta od dołu)
 * i foremki do piernika z kołnierzem.
 *
 * Geometria jest portem skryptów Pythona z repozytorium linia-3d (etykieta.py, czubek_choinkowy.py, foremki_piernik.py):
 * te same stałe i wzory, a zgodność objętości i wymiarów sprawdza `sh scripts/check/swieta.sh` (wartości wzorcowe w tools/swieta/ref.json).
 * Wymiary w mm, z = 0 to stół, bryła wyśrodkowana w X/Y. Wszystko drukuje się bez podpór w pozycji, w jakiej powstaje.
 */
import type { CrossSection, Manifold } from 'manifold-3d';
import { M } from '../geom/manifold';
import { textLine } from '../parts/text';
import outlinesJson from './swieta_outlines.json';

type P2 = [number, number];
export interface SwNote {
  level: 'ok' | 'warn' | 'error';
  text: string;
}
export interface SwResult {
  pieces: { name: string; manifold: Manifold }[];
  /** w = X, h = wysokość (Z), d = Y; tak jak w silniku figurek. */
  size: { w: number; h: number; d: number };
  notes: SwNote[];
}
export interface SwItem {
  k: string;
  l: string;
  hint?: string;
  type?: 'number' | 'text' | 'select';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  len?: number;
  options?: [string, string][];
}
export interface SwModel {
  n: string;
  desc: string;
  /** Suwak, który ustawia wysokość całości („Całość na … mm”). */
  tune?: string;
  /** Pokazuje „Dokładność siatki” (szkic liczy się szybciej). */
  quality?: boolean;
  g: string[];
  d: Record<string, number | string>;
}

const PETG = 1.27; // g/cm³
const pl = (x: number, n = 1) => x.toFixed(n).replace('.', ',');
const cs = (pts: P2[]): CrossSection => M().CrossSection.ofPolygons([pts]);

// ------------------------------------------------------------------------------------------------ etykieta (etykieta.py)
export const LB = { PT: 2.0, RAISE: 0.8, HOLE_D: 4.2, RING_W: 2.2, HOLE_X: 6.4, RIM_IN: 1.4, RIM_W: 1.0, CORNER: 5.0, TEXT_M: 1.4, H_MIN: 32.0, W_MIN: 60.0, CAP_DLA_MIN: 6.0, GAP: 3.0, TRACK: 0.06, CAP_DEFAULT: 11.0, CAP_MIN: 7.0, CAP_MAX: 15.0, CURVE_N: 6, ARC_N: 16 };
const FONT = 'poppins-bold';

function rrect(cx: number, cy: number, w: number, h: number, r: number): P2[] {
  r = Math.min(r, w / 2 - 1e-6, h / 2 - 1e-6);
  const pts: P2[] = [];
  for (const [sx, sy, a0] of [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]] as const) {
    const ccx = cx + sx * (w / 2 - r), ccy = cy + sy * (h / 2 - r);
    for (let i = 0; i <= LB.ARC_N; i++) {
      const a = ((a0 + (90 * i) / LB.ARC_N) * Math.PI) / 180;
      pts.push([ccx + r * Math.cos(a), ccy + r * Math.sin(a)]);
    }
  }
  return pts;
}

function line(text: string, cap: number, x0: number, y0: number): { cs: CrossSection | null; width: number } {
  const { polys, width } = textLine(text, FONT, cap, LB.TRACK * cap, LB.CURVE_N);
  if (!polys.length) return { cs: null, width };
  return { cs: M().CrossSection.ofPolygons(polys.map((p) => p.map(([x, y]): P2 => [x0 + x, y0 + y])), 'NonZero'), width };
}

export function labelLayout(name: string, capIn: number) {
  const cap = Math.min(Math.max(capIn, LB.CAP_MIN), LB.CAP_MAX);
  const capD = Math.max(LB.CAP_DLA_MIN, 0.5 * cap);
  const wn = line(name, cap, 0, 0).width, wd = line('Dla', capD, 0, 0).width;
  const wt = Math.max(wn, wd), m = LB.RIM_IN + LB.RIM_W + LB.TEXT_M;
  const H = Math.max(LB.H_MIN, 2 * m + capD + LB.GAP + 1.32 * cap);
  const zone0 = LB.HOLE_X + LB.HOLE_D / 2 + LB.RING_W + LB.TEXT_M;
  const W = Math.max(LB.W_MIN, zone0 + wt + m);
  return { cap, capD, wn, wd, wt, m, H, W, zone0 };
}

export function buildLabel(nameRaw: string, capIn: number): SwResult {
  const name = nameRaw.trim().replace(/\s+/g, ' ') || 'Imię';
  const L = labelLayout(name, capIn), W = L.W, H = L.H;
  const S = cs(rrect(0, 0, W, H, LB.CORNER));
  const hx = -W / 2 + LB.HOLE_X;
  const hole = M().CrossSection.circle(LB.HOLE_D / 2, 48).translate([hx, 0]);
  const ring = M().CrossSection.circle(LB.HOLE_D / 2 + LB.RING_W, 64).translate([hx, 0]);
  const rim = cs(rrect(0, 0, W - 2 * LB.RIM_IN, H - 2 * LB.RIM_IN, LB.CORNER - LB.RIM_IN)).subtract(
    cs(rrect(0, 0, W - 2 * (LB.RIM_IN + LB.RIM_W), H - 2 * (LB.RIM_IN + LB.RIM_W), LB.CORNER - LB.RIM_IN - LB.RIM_W)),
  );
  const xc = -W / 2 + L.zone0 + (W - L.zone0 - L.m) / 2, top = H / 2 - L.m;
  const yDla = top - L.capD, yName = yDla - LB.GAP - L.cap, xLeft = xc - L.wt / 2;
  const dla = line('Dla', L.capD, xLeft, yDla).cs, nm = line(name, L.cap, xLeft + (L.wt - L.wn) / 2, yName).cs;
  const parts = [rim, ring, dla, nm].filter((x): x is CrossSection => !!x);
  const raised = M().CrossSection.union(parts).subtract(hole);
  const plate = S.subtract(hole).extrude(LB.PT);
  const solid = M().Manifold.union([plate, raised.extrude(LB.RAISE).translate([0, 0, LB.PT])]);
  const notes: SwNote[] = [{ level: 'ok', text: `Etykieta ${pl(W)} × ${pl(H)} mm, grubość ${pl(LB.PT + LB.RAISE)} mm, ok. ${pl((solid.volume() / 1000) * PETG)} g PETG. Druk na płasko, napisem do góry.` }];
  if (W > 250) notes.push({ level: 'warn', text: `Za szeroka na stół P1S (maks. 250 mm): skróć imię albo zmniejsz litery.` });
  else notes.push({ level: 'ok', text: `Dwa kolory: zmiana filamentu na warstwie ${pl(LB.PT)} mm (napis i ramka wypukłe ${pl(LB.RAISE)} mm). Otwór Ø ${pl(LB.HOLE_D)} mm na sznurek.` });
  return { pieces: [{ name: `Dla ${name}`, manifold: solid }], size: { w: W, h: LB.PT + LB.RAISE, d: H }, notes };
}

// ------------------------------------------------------------------------------------------------ foremka (foremki_piernik.py)
export const CT = { WALL: 1.2, EDGE: 0.45, TAPER: 2.0, H_TOT: 16.0, FL_T: 2.0, FL_W: 5.0, STEPS: 8 };
const CUT_SEGMENTS = 48; // łuki offsetu (okrągłe narożniki ścianki i kołnierza)

interface Outline {
  name: string;
  size: number;
  ext: P2[];
  holes: P2[][];
}
const OUT = outlinesJson as unknown as Record<string, Outline>;
export const CUTTER_SHAPES: [string, string][] = Object.keys(OUT)
  .filter((k) => k !== '_params')
  .map((k) => [k, OUT[k].name.charAt(0).toUpperCase() + OUT[k].name.slice(1)]);

export function buildCutter(shape: string, scale: number, flw: number, flt: number): SwResult {
  const o = OUT[shape] ?? OUT.choinka;
  const k = scale;
  const dough = M().CrossSection.ofPolygons([o.ext, ...(o.holes ?? [])].map((r) => r.map(([x, y]): P2 => [x * k, y * k])), 'EvenOdd');
  const ring = (d: number) => dough.offset(d, 'Round', 2, CUT_SEGMENTS).subtract(dough);
  const slabs: Manifold[] = [];
  const slab = (z0: number, z1: number, region: CrossSection) => slabs.push(region.extrude(z1 - z0).translate([0, 0, z0]));
  slab(0, flt, ring(CT.WALL + flw));
  slab(flt, CT.H_TOT - CT.TAPER, ring(CT.WALL));
  const dz = CT.TAPER / CT.STEPS;
  for (let i = 0; i < CT.STEPS; i++) slab(CT.H_TOT - CT.TAPER + i * dz, CT.H_TOT - CT.TAPER + (i + 1) * dz, ring(CT.WALL - ((CT.WALL - CT.EDGE) * (i + 1)) / CT.STEPS));
  let solid = M().Manifold.union(slabs);
  const b = solid.boundingBox();
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  solid = solid.translate([-cx, -cy, 0]);
  const d = dough.bounds();
  const w = b.max[0] - b.min[0], dep = b.max[1] - b.min[1];
  const notes: SwNote[] = [
    { level: 'ok', text: `Ciasto ${pl((d.max[0] - d.min[0]) / 10)} × ${pl((d.max[1] - d.min[1]) / 10)} cm, foremka ${pl(w, 0)} × ${pl(dep, 0)} × ${pl(CT.H_TOT, 0)} mm, ok. ${pl((solid.volume() / 1000) * PETG, 0)} g PETG.` },
    { level: 'ok', text: `Druk kołnierzem do stołu, ostrzem do góry (ścianka ${pl(CT.WALL)} mm, ostrze zwężone do ${pl(CT.EDGE, 2)} mm). Kołnierz ${pl(flw)} × ${pl(flt)} mm biegnie dookoła od strony dociskania.` },
    { level: 'warn', text: 'Wydruk FDM nie jest trwale bezpieczny dla żywności: tylko krótki kontakt z ciastem i mycie ręczne.' },
  ];
  return { pieces: [{ name: `Foremka: ${OUT[shape]?.name ?? shape}`, manifold: solid }], size: { w, h: CT.H_TOT, d: dep }, notes };
}

// ------------------------------------------------------------------------------------------------ czubek (czubek_choinkowy.py)
export const TP = { CLEAR: 0.3, WALL_T: 2.7, SLEEVE: 62.0, CAP: 3.5, CONE: 1.3, CONE_OUT: 1.15, R_FLAT: 5.0, BULB_FLAT: 0.85, NECK: 0.21, SPIRE_BASE: 0.44, SPIRE_P: 2.2, R_TIP: 1.6, L_NECK: 2.0, K_NECK: 2.5, K_SHOULDER: 5.0, EPS: 0.01, SEG_MAX: 3.0, SEG_TRANS: 0.6, RIB_AMP: 0.8, RIB_PITCH: 3.4 };
const smax = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const sstep = (z: number, z0: number, z1: number) => {
  const t = Math.min(Math.max((z - z0) / (z1 - z0), 0), 1);
  return t * t * (3 - 2 * t);
};
const rib = (N: number, th: number) => {
  const c = Math.cos(N * th);
  return Math.sign(c) * Math.pow(Math.abs(c), 0.8);
};
const ribAmp = (r: number) => TP.RIB_AMP * Math.min(Math.max((r - 4) / 6, 0), 1);

interface Geo {
  top: number; H: number; a: number; b: number; r_h: number; r_s: number; Z0: number; phi_j: number; r_j: number; z_j: number; z_e: number; z_dome: number;
  k1: number; r_neck: number; z_ns: number; r_b: number; z_sb: number; z_t: number; trans: [number, number][]; Ns: number[]; ceil: number;
  taper: (z: number) => number; R: (z: number) => number; ribField: (th: number, z: number) => number;
}

function topperGeo(top: number, h: number, bulb: number, sleeve: number, check = true): Geo {
  const a = bulb / 2, b = TP.BULB_FLAT * a;
  const r_h = top / 2 + TP.CLEAR, r_s = r_h + TP.WALL_T, Z0 = sleeve;
  const fa = a / b, phi_j = Math.atan(fa / TP.CONE_OUT), r_j = a * Math.sin(phi_j);
  if (check && !(r_j - r_s > 1.0)) throw new Error('Kula za mała względem tulei');
  const z_j = Z0 + (r_j - r_s) / TP.CONE_OUT, z_e = z_j + b * Math.cos(phi_j), z_dome = z_e + b;
  const k1 = Math.min(6.0, 0.8 * (r_j - r_s));
  const r_neck = Math.max(TP.NECK * a, 4.5), z_ns = z_dome + TP.L_NECK;
  const r_b = Math.max(TP.SPIRE_BASE * a, r_neck + 3.0), z_sb = z_ns + (r_b - r_neck) / TP.CONE_OUT;
  if (check && !(h - z_sb > 40)) throw new Error('Za niski czubek względem kuli');
  const z_t = h - TP.R_TIP;
  const trans: [number, number][] = [[Z0 + 1.0, z_j], [z_e + 0.8 * b, z_e + 0.96 * b]];
  const Ns = [Math.round((2 * Math.PI * r_s) / TP.RIB_PITCH), Math.round((2 * Math.PI * a) / TP.RIB_PITCH), Math.round((2 * Math.PI * r_b) / TP.RIB_PITCH)];
  const taper = (z: number) => {
    const t = (z - z_sb) / (z_t - z_sb);
    return TP.R_TIP + (r_b - TP.R_TIP) * Math.pow(Math.max(1 - t, 0), TP.SPIRE_P);
  };
  const R = (z: number) => {
    const ell = a * Math.sqrt(Math.max(1 - ((z - z_e) / b) ** 2, 0));
    const lower = z <= z_j ? smax(r_s, r_s + TP.CONE_OUT * (z - Z0), k1) : ell;
    const N = smin(smax(r_neck, r_neck + TP.CONE_OUT * (z - z_ns), TP.K_NECK), taper(z), TP.K_SHOULDER);
    const core = z < z_dome + 2.0 ? smax(lower, N, TP.K_NECK) : N;
    const cap = z > z_t ? Math.sqrt(Math.max(TP.R_TIP ** 2 - (z - z_t) ** 2, 0)) : Infinity;
    return Math.min(core, cap);
  };
  const ribField = (th: number, z: number) => {
    const w: number[] = [];
    let wPrev = 1;
    for (const [za, zb] of trans) {
      const s = sstep(z, za, zb);
      w.push(wPrev * (1 - s));
      wPrev *= s;
    }
    w.push(wPrev);
    let out = 0;
    for (let i = 0; i < w.length; i++) if (w[i] > 0) out += w[i] * rib(Ns[i], th);
    return out;
  };
  return { top, H: h, a, b, r_h, r_s, Z0, phi_j, r_j, z_j, z_e, z_dome, k1, r_neck, z_ns, r_b, z_sb, z_t, trans, Ns, ceil: z_dome - TP.CAP, taper, R, ribField };
}

/** Douglas–Peucker po indeksach próbek (r(z) co 0,02 mm), potem podział długich odcinków (gęściej w strefach przejść żeber). */
function topperRings(g: Geo, segMax: number, segTrans: number): number[] {
  const n = Math.floor(g.H / 0.02) + 1, zz = new Float64Array(n), rr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    zz[i] = (g.H * i) / (n - 1);
    rr[i] = g.R(zz[i]);
  }
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const st: [number, number][] = [[0, n - 1]];
  while (st.length) {
    const [i, j] = st.pop()!;
    if (j <= i + 1) continue;
    const dx = rr[j] - rr[i], dy = zz[j] - zz[i], nn = Math.hypot(dx, dy);
    let best = -1, bd = -1;
    for (let q = i + 1; q < j; q++) {
      const px = rr[q] - rr[i], py = zz[q] - zz[i];
      const d = nn > 0 ? Math.abs(px * dy - py * dx) / nn : Math.hypot(px, py);
      if (d > bd) {
        bd = d;
        best = q;
      }
    }
    if (bd > TP.EPS) {
      keep[best] = 1;
      st.push([i, best], [best, j]);
    }
  }
  const zs: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) zs.push(zz[i]);
  const out = [zs[0]];
  for (let q = 1; q < zs.length; q++) {
    const z0 = out[out.length - 1], z1 = zs[q];
    const inTr = g.trans.some(([ta, tb]) => !(z1 < ta || z0 > tb));
    const m = Math.ceil((z1 - z0) / (inTr ? segTrans : segMax));
    for (let i = 0; i < m; i++) out.push(z0 + ((z1 - z0) * (i + 1)) / m);
  }
  return out;
}

/** Wnętrze pustej kuli: zewnętrzny profil przesunięty po normalnej o WALL_T do przecięcia ze stożkiem stropu (jak Geo.inner() w Pythonie). */
function topperInner(g: Geo, segMax: number): P2[] {
  const h = 0.02, n = Math.ceil(g.ceil / h);
  const R = new Float64Array(n), rho = new Float64Array(n), zeta = new Float64Array(n), f = new Float64Array(n);
  for (let i = 0; i < n; i++) R[i] = g.R(i * h);
  for (let i = 0; i < n; i++) {
    const d = i === 0 ? (R[1] - R[0]) / h : i === n - 1 ? (R[n - 1] - R[n - 2]) / h : (R[i + 1] - R[i - 1]) / (2 * h);
    const L = Math.sqrt(1 + d * d);
    rho[i] = R[i] - TP.WALL_T / L;
    zeta[i] = i * h + (TP.WALL_T * d) / L;
    f[i] = TP.R_FLAT + TP.CONE * (g.ceil - zeta[i]) - rho[i];
  }
  const ie = Math.ceil(g.z_e / h);
  if (!(f[ie] > 0)) throw new Error('Kula za mała na wnękę');
  let k = -1;
  for (let i = ie; i < n; i++)
    if (f[i] < 0) {
      k = i;
      break;
    }
  if (k < 0) throw new Error('Strop wnęki nie przecina ścianki kuli');
  const t = f[k - 1] / (f[k - 1] - f[k]);
  const P: P2[] = [];
  for (let i = 0; i < k; i++) P.push([rho[i], zeta[i]]);
  P.push([rho[k - 1] + t * (rho[k] - rho[k - 1]), zeta[k - 1] + t * (zeta[k] - zeta[k - 1])]);
  const m = P.length, keep = new Uint8Array(m);
  keep[0] = keep[m - 1] = 1;
  const st: [number, number][] = [[0, m - 1]];
  while (st.length) {
    const [i, j] = st.pop()!;
    if (j <= i + 1) continue;
    const dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1], nn = Math.hypot(dx, dy);
    let best = -1, bd = -1;
    for (let q = i + 1; q < j; q++) {
      const d = Math.abs((P[q][0] - P[i][0]) * dy - (P[q][1] - P[i][1]) * dx) / nn;
      if (d > bd) {
        bd = d;
        best = q;
      }
    }
    if (bd > TP.EPS) {
      keep[best] = 1;
      st.push([i, best], [best, j]);
    }
  }
  const K: P2[] = [];
  for (let i = 0; i < m; i++) if (keep[i]) K.push(P[i]);
  const out: P2[] = [K[0]];
  for (let q = 1; q < K.length; q++) {
    const a = K[q - 1], b = K[q], c = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / segMax);
    for (let i = 0; i < c; i++) out.push([a[0] + ((b[0] - a[0]) * (i + 1)) / c, a[1] + ((b[1] - a[1]) * (i + 1)) / c]);
  }
  out[0] = [g.r_h, 0];
  return out;
}

/** Najmniejsza średnica kuli dla danej tulei i najmniejsza wysokość czubka dla danej średnicy czubka choinki, kuli i tulei. */
export function topperMin(top: number, bulb: number, sleeve: number): { bulbMin: number; hMin: number } {
  const r_s = top / 2 + TP.CLEAR + TP.WALL_T, phi = Math.atan(1 / TP.BULB_FLAT / TP.CONE_OUT);
  const bulbMin = Math.ceil((2 * (r_s + 2)) / Math.sin(phi));
  const g = topperGeo(top, 1000, Math.max(bulb, bulbMin), sleeve, false);
  return { bulbMin, hMin: Math.ceil(g.z_sb + 41) };
}

/** Wymiary czubka, które da się zbudować: kula nie mniejsza niż tuleja pozwala, wysokość nie mniejsza niż szyjka i iglica. */
export function fixTopper(p: { top: number; sleeve: number; bulb: number; h: number }): { bulb: number; h: number; bulbMin: number; hMin: number } {
  let m = topperMin(p.top, p.bulb, p.sleeve);
  const bulb = Math.max(p.bulb, 40, m.bulbMin);
  m = topperMin(p.top, bulb, p.sleeve);
  return { bulb, h: Math.max(p.h, 120, m.hMin), bulbMin: Math.max(40, m.bulbMin), hMin: Math.max(120, m.hMin) };
}

export function buildTopper(top: number, hIn: number, bulbIn: number, sleeve: number, draft = false): SwResult {
  const fx = fixTopper({ top, sleeve, bulb: bulbIn, h: hIn }), bulb = fx.bulb, h = fx.h;
  const g = topperGeo(top, h, bulb, sleeve);
  const segMax = draft ? 6 : TP.SEG_MAX, segTrans = draft ? 1.2 : TP.SEG_TRANS;
  const zr = topperRings(g, segMax, segTrans), ip = topperInner(g, segMax);
  const Mseg = (draft ? 4 : 8) * g.Ns[1];
  const cosT = new Float64Array(Mseg), sinT = new Float64Array(Mseg);
  for (let j = 0; j < Mseg; j++) {
    const th = (j * 2 * Math.PI) / Mseg;
    cosT[j] = Math.cos(th);
    sinT[j] = Math.sin(th);
  }
  const V: number[] = [];
  let nv = 0;
  interface Ring {
    axis: boolean;
    n: number;
  }
  const ring = (r: number, z: number, ribs: boolean): Ring => {
    if (r < 1e-3) {
      V.push(0, 0, z);
      return { axis: true, n: nv++ };
    }
    const base = nv;
    for (let j = 0; j < Mseg; j++) {
      let rj = r;
      if (ribs) rj += ribAmp(r) * g.ribField((j * 2 * Math.PI) / Mseg, z);
      V.push(rj * cosT[j], rj * sinT[j], z);
    }
    nv += Mseg;
    return { axis: false, n: base };
  };
  const prof: Ring[] = [ring(g.r_h, 0, false)];
  for (const z of zr) prof.push(ring(g.R(z), z, true));
  prof.push(ring(0, g.ceil, false), ring(TP.R_FLAT, g.ceil, false));
  for (let i = ip.length - 1; i >= 1; i--) prof.push(ring(ip[i][0], ip[i][1], false));
  const F: number[] = [];
  for (let e = 0; e < prof.length; e++) {
    const A = prof[e], B = prof[(e + 1) % prof.length];
    if (A.axis && B.axis) continue;
    for (let j = 0; j < Mseg; j++) {
      const j1 = (j + 1) % Mseg;
      if (A.axis) F.push(A.n, B.n + j1, B.n + j);
      else if (B.axis) F.push(A.n + j, A.n + j1, B.n);
      else {
        F.push(A.n + j, A.n + j1, B.n + j);
        F.push(A.n + j1, B.n + j1, B.n + j);
      }
    }
  }
  const mesh = new (M().Mesh)({ numProp: 3, vertProperties: Float32Array.from(V), triVerts: Uint32Array.from(F) });
  mesh.merge();
  const solid = new (M().Manifold)(mesh);
  if (solid.status() !== 'NoError') throw new Error(`Czubek: siatka niepoprawna (${solid.status()})`);

  const bb = solid.boundingBox();
  const grams = (infill: number) => {
    const V0 = solid.volume(), shell = Math.min(V0, solid.surfaceArea() * 1.2);
    return ((shell + infill * Math.max(V0 - shell, 0)) / 1000) * PETG;
  };
  const rin = Math.max(...ip.map((q) => q[0]));
  const notes: SwNote[] = [
    { level: 'ok', text: `Wysokość ${pl(h, 0)} mm, kula Ø ${pl(2 * g.a, 0)} × ${pl(2 * g.b, 0)} mm, tuleja Ø ${pl(2 * g.r_s)} × ${pl(g.Z0, 0)} mm.` },
    { level: 'ok', text: `Otwór od dołu Ø ${pl(2 * g.r_h)} mm (luz ${pl(2 * TP.CLEAR)} mm). Czubek choinki wchodzi na ${pl(g.ceil, 0)} mm od dołu; wnętrze kuli puste, do Ø ${pl(2 * rin)} mm.` },
    { level: 'ok', text: `Masa ok. ${pl(grams(0.15), 0)} g PETG (15% wypełnienia). Druk stojąco, tuleją na stole, bez podpór (jedyny nawis to płaski sufit wnęki Ø ${pl(2 * TP.R_FLAT, 0)} mm). Brim w slicerze ok. 8 mm.` },
  ];
  if (bulb > bulbIn + 1e-9) notes.push({ level: 'warn', text: `Kula powiększona do Ø ${pl(bulb, 0)} mm: przy tej tulei mniejsza by się nie zmieściła.` });
  if (h > hIn + 1e-9) notes.push({ level: 'warn', text: `Wysokość podniesiona do ${pl(h, 0)} mm: tyle potrzeba na szyjkę i iglicę przy tej kuli.` });
  if (h > 250) notes.push({ level: 'warn', text: `Wysokość ${pl(h, 0)} mm nie mieści się na stole P1S (256 mm). Zmniejsz kulę albo tuleję.` });
  return { pieces: [{ name: 'Czubek', manifold: solid }], size: { w: bb.max[0] - bb.min[0], h: bb.max[2] - bb.min[2], d: bb.max[1] - bb.min[1] }, notes };
}

// ------------------------------------------------------------------------------------------------ taca (taca.py)
/**
 * Żebrowana taca prostokątna z zaokrąglonymi narożnikami na renifery kręgle i drobiazgi. Obrys to prostokąt L × W z narożnikami o promieniu R
 * (liczonym po grzbietach żeber; R = W/2 daje kształt „tabletki”); żebra biegną po linii środkowej, ścianka wnęki ma stałe 2,0 mm od tej linii
 * (w dolinie żebra 1,2 mm), dno 2,4 mm. Ścianki są pionowe, dolna krawędź ma fazkę w dwóch schodkach, więc nic nie wisi
 * i taca drukuje się dnem do stołu bez podpór. Wymiar zewnętrzny liczy się po grzbietach żeber (liczba żeber jest podzielna przez 4:
 * grzbiet wypada w środkach czterech boków).
 */
export const TC = {
  WALL: 2.0, FLOOR: 2.4, RAD: 15.0, K_PTS: 20, RIB_AMP: 0.8, RIB_PITCH: 3.4, SIMPLIFY: 0.01,
  FOOT: [[0.2, 0.3], [0.4, 0.15]] as [number, number][], // (wysokość schodka do [mm], cofnięcie obrysu [mm])
  PITCH: 58.0, COUNT: 4, BASE_R: 16.5, TOTAL_W: 54.6,
  BED: 256, BED_GAP: 8, BED_MARGIN: 4,
  // promień korpusu renifera kręgla (bez żeber) co 5 mm od jego podstawy: shapes.bunny_profile
  RDZ: [[0, 16.5], [5, 17.6], [10, 18.9], [15, 20.3], [20, 21.7], [25, 23.0], [30, 24.2], [35, 25.2], [40, 26.0], [45, 26.4]] as P2[],
};

const reindeerR = (z: number) => {
  const t = TC.RDZ;
  if (z <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (z <= t[i][0]) return t[i - 1][1] + ((z - t[i - 1][0]) / (t[i][0] - t[i - 1][0])) * (t[i][1] - t[i - 1][1]);
  return t[t.length - 1][1];
};

/** Promień łuku linii środkowej: R po grzbietach minus amplituda, nie więcej niż połowa mniejszej osi i nie mniej niż 1 mm. */
export function cornerRadius(length: number, width: number, rad: number): number {
  const amp = TC.RIB_AMP, a = length / 2 - amp, b = width / 2 - amp;
  return Math.min(Math.max(Math.min(rad, length / 2, width / 2) - amp, 1), a, b);
}

/** Obrys z żebrami, linia środkowa (prostokąt o półosiach L/2 − amp, W/2 − amp z łukami rc = R − amp) i liczba żeber N (podzielna przez 4). */
export function ribbedOutline(length: number, width: number, rad: number): { out: P2[]; mid: P2[]; N: number } {
  const amp = TC.RIB_AMP, a = length / 2 - amp, b = width / 2 - amp, rc = cornerRadius(length, width, rad);
  const w = a - rc, h = b - rc, q = (Math.PI / 2) * rc;
  // dziewięć odcinków od środka prawego boku, obieg przeciwny do ruchu wskazówek: bok, łuk, bok, łuk, bok, łuk, bok, łuk, bok
  type Seg = { arc: boolean; p: P2; d: P2 | number; len: number };
  const segs: Seg[] = [
    { arc: false, p: [a, 0], d: [0, 1], len: h }, { arc: true, p: [w, h], d: 0, len: q },
    { arc: false, p: [w, b], d: [-1, 0], len: 2 * w }, { arc: true, p: [-w, h], d: Math.PI / 2, len: q },
    { arc: false, p: [-a, h], d: [0, -1], len: 2 * h }, { arc: true, p: [-w, -h], d: Math.PI, len: q },
    { arc: false, p: [-w, -b], d: [1, 0], len: 2 * w }, { arc: true, p: [w, -h], d: 1.5 * Math.PI, len: q },
    { arc: false, p: [a, -h], d: [0, 1], len: h },
  ];
  const edges = [0];
  for (const sg of segs) edges.push(edges[edges.length - 1] + sg.len);
  const Ltot = edges[edges.length - 1];
  const N = 4 * Math.max(1, Math.round(Ltot / (4 * TC.RIB_PITCH)));
  const K = N * TC.K_PTS;
  const out: P2[] = new Array(K), mid: P2[] = new Array(K);
  let j = 0;
  for (let i = 0; i < K; i++) {
    const s = (Ltot * i) / K;
    while (j < segs.length - 1 && s >= edges[j + 1]) j++;
    const sg = segs[j], u = s - edges[j];
    let px: number, py: number, tx: number, ty: number;
    if (sg.arc) {
      const th = (sg.d as number) + u / rc;
      px = sg.p[0] + rc * Math.cos(th); py = sg.p[1] + rc * Math.sin(th); tx = -Math.sin(th); ty = Math.cos(th);
    } else {
      const d = sg.d as P2;
      px = sg.p[0] + d[0] * u; py = sg.p[1] + d[1] * u; tx = d[0]; ty = d[1];
    }
    const c = Math.cos((N * 2 * Math.PI * s) / Ltot);
    const off = amp * Math.sign(c) * Math.abs(c) ** 0.8;
    mid[i] = [px, py];
    out[i] = [px + ty * off, py - tx * off]; // normalna na zewnątrz (obieg przeciwny do ruchu wskazówek)
  }
  return { out, mid, N };
}

function ringDist(ring: P2[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const [ax, ay] = ring[k], [bx, by] = ring[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

function inRing(ring: P2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const [ax, ay] = ring[k], [bx, by] = ring[i];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) c = !c;
  }
  return c;
}

/** Luz (mm) renifera kręgla na rancie ścianki dla `count` sztuk w rzędzie co `pitch`; −1, gdy któryś nie mieści się we wnęce. */
export function reindeerFit(inner: P2[], floor: number, height: number, pitch: number, count: number): { clearance: number; rRim: number } {
  const rRim = reindeerR(height - floor) + TC.RIB_AMP;
  let cl = Infinity, ok = true;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * pitch;
    if (!inRing(inner, x, 0)) { ok = false; continue; }
    cl = Math.min(cl, ringDist(inner, x, 0) - rRim);
  }
  return { clearance: ok && Number.isFinite(cl) ? cl : -1, rRim };
}

export function buildTaca(length: number, width: number, height: number, rad: number = TC.RAD, floor: number = TC.FLOOR, wall: number = TC.WALL): SwResult {
  const { out, mid, N } = ribbedOutline(length, width, rad);
  // Pamięć WASM nie sprząta się sama: wszystko pośrednie zwalniamy na końcu.
  const tmp: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(x: T): T => (tmp.push(x), x);
  const S = keep(cs(out));
  const inner = keep(keep(cs(mid)).offset(-wall, 'Round', 2, 64).simplify(TC.SIMPLIFY));
  const slabs: Manifold[] = [];
  let z0 = 0;
  for (const [z1, inset] of TC.FOOT) {
    slabs.push(keep(keep(keep(S.offset(-inset, 'Round', 2, 32)).extrude(z1 - z0)).translate([0, 0, z0])));
    z0 = z1;
  }
  slabs.push(keep(keep(S.extrude(height - z0)).translate([0, 0, z0])));
  const body = keep(M().Manifold.union(slabs));
  const solid = body.subtract(keep(keep(inner.extrude(height + 1 - floor)).translate([0, 0, floor])));
  const bb = solid.boundingBox();
  const w = bb.max[0] - bb.min[0], dep = bb.max[1] - bb.min[1];

  const ring = inner.toPolygons().sort((a, b) => b.length - a.length)[0] as P2[];
  const ringS = ring ?? [];
  const outRing = out;
  let tw = Infinity;
  for (let i = 0; i < ringS.length; i += 3) tw = Math.min(tw, ringDist(outRing, ringS[i][0], ringS[i][1]));
  const maxN = (() => {
    let best = 0;
    for (let k = 1; k <= 6; k++) if (reindeerFit(ringS, floor, height, TC.TOTAL_W + 2.5, k).clearance >= 0.5) best = k;
    return best;
  })();
  const std = reindeerFit(ringS, floor, height, TC.PITCH, TC.COUNT);
  const cavMl = (inner.area() * (height - floor)) / 1000;
  const g = (solid.volume() / 1000) * PETG;
  const rows = Math.floor((TC.BED - 2 * TC.BED_MARGIN + TC.BED_GAP) / (width + TC.BED_GAP));
  const cols = Math.floor((TC.BED - 2 * TC.BED_MARGIN + TC.BED_GAP) / (length + TC.BED_GAP));
  const onBed = Math.max(0, rows) * Math.max(0, cols);
  const plural = (n: number) => (n === 1 ? 'taca' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'tace' : 'tac');

  const notes: SwNote[] = [
    { level: 'ok', text: `Taca ${pl(w, 0)} × ${pl(dep, 0)} × ${pl(height, 0)} mm po grzbietach żeber, narożniki R ${pl(Math.min(rad, length / 2, width / 2), 0)} mm, ${N} żeber, wnęka ok. ${pl(cavMl, 0)} ml, ok. ${pl(g, 0)} g PETG. Druk dnem do stołu, bez podpór.` },
  ];
  if (maxN >= 1) {
    notes.push({ level: 'ok', text: `Renifery kręgle (brzuch Ø ${pl(TC.TOTAL_W)} mm, na rancie Ø ${pl(2 * std.rRim)} mm) mieszczą się w rzędzie do ${maxN} szt. przy rozstawie ${pl(TC.TOTAL_W + 2.5, 0)} mm i luzie co najmniej 0,5 mm.` });
    if (std.clearance >= 0.5) notes.push({ level: 'ok', text: `${TC.COUNT} renifery co ${pl(TC.PITCH, 0)} mm: luz do ścianki ${pl(std.clearance)} mm.` });
  } else notes.push({ level: 'warn', text: `Renifer kręgiel (podstawa Ø ${pl(2 * TC.BASE_R, 0)} mm, na rancie Ø ${pl(2 * std.rRim)} mm) się tu nie zmieści: poszerz tacę albo ją obniż.` });
  if (onBed >= 1) notes.push({ level: 'ok', text: `Na stole P1S (${TC.BED} × ${TC.BED} mm) mieszczą się ${onBed} ${plural(onBed)} naraz (odstęp ${pl(TC.BED_GAP, 0)} mm).` });
  else notes.push({ level: 'warn', text: `Taca ${pl(length, 0)} × ${pl(width, 0)} mm nie mieści się na stole P1S (${TC.BED} × ${TC.BED} mm, margines ${pl(TC.BED_MARGIN, 0)} mm): skróć ją albo zwęź.` });
  if (tw < 0.8) notes.push({ level: 'warn', text: `Ścianka w dolinie żebra ma tylko ${pl(tw, 2)} mm (dysza 0,4 mm potrzebuje co najmniej 0,8 mm).` });
  for (const x of tmp) x.delete();
  return { pieces: [{ name: 'Taca', manifold: solid }], size: { w, h: height, d: dep }, notes };
}

// ------------------------------------------------------------------------------------------------ modele i suwaki dla menu Figurki
export const SW_ORDER = ['etykieta', 'czubek', 'foremka', 'taca'];

export const SW_MODELS: Record<string, SwModel> = {
  etykieta: {
    n: 'Etykieta „Dla”',
    desc: 'Płaska etykieta z napisem „Dla” i wpisanym imieniem, z otworem na sznurek. Szerokość dopasowuje się do imienia. Płytka 2 mm i wypukły napis 0,8 mm, druk bez podpór.',
    g: ['label'],
    d: { name: 'Ania', cap: LB.CAP_DEFAULT },
  },
  czubek: {
    n: 'Czubek choinkowy',
    desc: 'Żebrowany czubek na choinkę: tuleja z otworem od dołu, pusta kula, smukła iglica. Średnicę czubka choinki, długość tulei, wysokość i kulę ustawiasz suwakami. Druk stojąco, bez podpór.',
    tune: 'h',
    quality: true,
    g: ['topper'],
    d: { top: 18, sleeve: 62, h: 240, bulb: 62 },
  },
  foremka: {
    n: 'Foremka do piernika',
    desc: 'Foremka do wykrawania ciastek z kołnierzem (brim) na stałe od strony dociskania, który ją usztywnia. Pięć kształtów, rozmiar ciasta i wymiary kołnierza ustawiasz suwakami.',
    g: ['cutter'],
    d: { shape: 'choinka', scale: 1, flw: CT.FL_W, flt: CT.FL_T },
  },
  taca: {
    n: 'Taca żebrowana',
    desc: 'Żebrowana taca prostokątna z zaokrąglonymi narożnikami na renifery kręgle i drobiazgi: pionowe ścianki, dno 2,4 mm, druk dnem do stołu bez podpór. Długość, szerokość, wysokość i promień zaokrąglenia narożników ustawiasz suwakami.',
    g: ['tray'],
    d: { len: 240, wid: 75, h: 20, r: TC.RAD },
  },
};

export const SW_GR: Record<string, { t: string; items: SwItem[] }> = {
  label: {
    t: 'Etykieta',
    items: [
      { k: 'name', l: 'Imię (pod napisem „Dla”)', type: 'text', len: 26, hint: 'Na etykiecie będzie napis „Dla” i pod nim to, co wpiszesz. Polskie znaki działają, szerokość dopasowuje się sama.' },
      { k: 'cap', l: 'Wysokość liter imienia', min: LB.CAP_MIN, max: LB.CAP_MAX, step: 0.5, unit: 'mm' },
    ],
  },
  topper: {
    t: 'Czubek',
    items: [
      { k: 'top', l: 'Średnica czubka choinki', min: 8, max: 30, step: 0.5, unit: 'mm', hint: 'Zmierz suwmiarką miejsce, na które czubek ma wejść. Wnęka ma 0,6 mm luzu.' },
      { k: 'sleeve', l: 'Długość tulei (dolny element)', min: 30, max: 80, step: 1, unit: 'mm', hint: 'Tuleja trzyma czubek na choince. Wnętrze kuli nad nią jest puste, więc czubek choinki wchodzi głębiej, aż do sufitu wnęki.' },
      { k: 'h', l: 'Wysokość całkowita', min: 120, max: 250, step: 1, unit: 'mm' },
      { k: 'bulb', l: 'Średnica kuli', min: 40, max: 100, step: 1, unit: 'mm' },
    ],
  },
  cutter: {
    t: 'Foremka',
    items: [
      { k: 'shape', l: 'Kształt', type: 'select', options: CUTTER_SHAPES },
      { k: 'scale', l: 'Rozmiar ciasta (skala, 1 = 100%)', min: 0.7, max: 1.3, step: 0.05, hint: '1 = 100%. Wysokość kształtu to ok. 8–10 cm.' },
      { k: 'flw', l: 'Kołnierz (brim): szerokość', min: 3, max: 10, step: 0.5, unit: 'mm', hint: 'Kołnierz biegnie dookoła całej foremki, od strony dociskania, i jest częścią modelu na stałe. Szerszy i grubszy = sztywniejsza foremka.' },
      { k: 'flt', l: 'Kołnierz (brim): grubość', min: 1.6, max: 4, step: 0.2, unit: 'mm' },
    ],
  },
  tray: {
    t: 'Taca',
    items: [
      { k: 'len', l: 'Długość', min: 100, max: 250, step: 1, unit: 'mm', hint: 'Wymiar po grzbietach żeber. Stół P1S ma 256 mm, taca ma zostawić margines.' },
      { k: 'wid', l: 'Szerokość', min: 40, max: 150, step: 1, unit: 'mm', hint: 'Przy 75 mm trzy tace mieszczą się obok siebie na stole P1S. Renifer kręgiel ma brzuch Ø 54,6 mm.' },
      { k: 'h', l: 'Wysokość', min: 10, max: 40, step: 1, unit: 'mm', hint: 'Dno ma 2,4 mm. Ściana jest pionowa, więc wysokość nie dodaje podpór.' },
      { k: 'r', l: 'Zaokrąglenie narożników (promień)', min: 2, max: 60, step: 1, unit: 'mm', hint: 'Promień liczony po grzbietach żeber. Połowa szerokości daje całkiem okrągłe końce („tabletka”), wartość większa jest ograniczana do tej połowy.' },
    ],
  },
};

/** Nazwa pliku dla pojedynczego świątecznego elementu w scenie: „Dla Ania”, „Czubek choinkowy”, „Foremka choinka”. Inne sceny: null (zostaje „figurki”). */
export function swietaFileName(parts: { type: string; params: Record<string, number | string | boolean> }[]): string | null {
  if (parts.length !== 1 || parts[0].type !== 'figurine') return null;
  const p = parts[0].params;
  const id = String(p.model);
  if (!(id in SW_MODELS)) return null;
  const clean = (s: string) => s.replace(/[^\p{L}\p{N} _.-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (id === 'etykieta') return `Dla ${clean(String(p.name ?? '')) || 'etykieta'}`.trim();
  if (id === 'czubek') return 'Czubek choinkowy';
  if (id === 'taca') return `Taca ${Math.round(Number(p.len))}x${Math.round(Number(p.wid))}x${Math.round(Number(p.h))}`;
  const shape = CUTTER_SHAPES.find(([k]) => k === p.shape);
  return `Foremka ${(shape ? shape[1] : String(p.shape ?? '')).toLowerCase()}`.trim();
}

/** Budowa modelu świątecznego z wartości suwaków (liczby jako liczby, tekst jako tekst). */
export function buildSwieta(id: string, p: Record<string, number | string | boolean>, quality = 'normal'): SwResult {
  const d = SW_MODELS[id].d;
  const n = (k: string) => (Number.isFinite(Number(p[k])) ? Number(p[k]) : Number(d[k]));
  if (id === 'etykieta') return buildLabel(String(p.name ?? d.name), n('cap'));
  if (id === 'czubek') return buildTopper(n('top'), n('h'), n('bulb'), n('sleeve'), quality === 'draft');
  if (id === 'taca') return buildTaca(n('len'), n('wid'), n('h'), n('r'));
  return buildCutter(String(p.shape ?? d.shape), n('scale'), n('flw'), n('flt'));
}
