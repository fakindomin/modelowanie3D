import type { CrossSection, Manifold } from 'manifold-3d';
import { M } from '../geom/manifold';
import type { ParamDef, Params, PartDef } from './def';
import { num, select } from './util';

/**
 * Pudełko na akcesoria: korpus + wsuwana pokrywa-tacka (jaskółczy ogon) + napis jako wkładka w innym kolorze.
 * Wzorzec geometrii: tools/pudelko/pudelko.py (v11). Opis decyzji: docs/pudelko.md.
 * Punkt 1: korpus i pokrywa; wnętrze i szuflady jak w v11 (parametry i szuflady w kolejnych punktach).
 * Części (pieces) mają wspólny układ współrzędnych, więc napis pasuje do wybrań w pokrywie.
 */

const C = () => M().CrossSection;
const Mf = () => M().Manifold;
type P2 = [number, number];

// ---------- stałe v11 (mm) ----------
const SEAT = 5.0;   // materiał pod gniazdem młynka (v11: strefa 38 = młynek 33 + 5)
const TAMP_PIN_D = 5.0, TAMP_PIN_L = 35.0, TAMP_SQ = 7.0, TAMP_HANDLE_L = 10.0;
const TAMPER_L = TAMP_PIN_L + TAMP_HANDLE_L;
const CL = 0.8, WALL_X = 3.0, WALL_Y = 4.0, SEP = 1.6, FLOOR = 2.0;
const LID_CLEAR = 0.25, DOVE = 2.0, GAP_PROUD = 6.0, GRIP_GAP = 11.0, RING_H = 14.0;
const MAG_D = 5.0, MAG_T = 2.0, MAG_CLR = 0.25;
const WALL_L = 12.0, BASE_H = 11.8, DR_Z0 = 3.0, DR_REAR = 3.0, GRINDER_GAP = 0.3;
const RIB_R = 1.0, RIB_PITCH = 4.0, CORNER_R = 3.0;
const TEXT = 'FKNDMN', TEXT_H_LID = 7.0, TEXT_H_BOT = 10.0, TEXT_DEPTH_BOT = 0.6;
const EPS = 0.01;
const MAG_R = (MAG_D + MAG_CLR) / 2;

// ---------- parametry wnętrza (domyślne = v11) ----------
export const DEF = { lidT: 3.8, gD: 40, gH: 33, bookL: 120, bookT: 13, bookH: 30, bookIn: 0.5, lL: 82, lW: 26, lT: 15, rampLen: 25, rampDepth: 2.0, trayDepth: 2.0, traySlope: 18, textDepth: 0.8 } as const;
const val = (p: Params, k: keyof typeof DEF) => (p[k] === undefined || Number.isNaN(Number(p[k])) ? DEF[k] : Number(p[k]));

// ---------- układ ----------
export function layout(p: Params) {
  const lidT = val(p, 'lidT');
  const gD = val(p, 'gD'), gH = val(p, 'gH');
  const bookL = val(p, 'bookL'), bookT = val(p, 'bookT'), bookH = val(p, 'bookH'), bookIn = val(p, 'bookIn');
  const lL = val(p, 'lL'), lW = val(p, 'lW'), lT = val(p, 'lT');
  const A_Y = bookT + CL + 2 * 4.6;
  const B_Y = gD + CL;
  const lighterLen = lL + CL;
  const IN_X = Math.max(bookL + CL + SEP, GRIP_GAP + gD + CL + GRIP_GAP + SEP + lighterLen);
  const X = WALL_L + IN_X + WALL_X;
  const Y = WALL_Y + A_Y + SEP + B_Y + WALL_Y;
  // Nad kanałem jest pokrywa (lidT) + 0,2 luzu; Z_CH0 zostaje tam gdzie było przy pokrywie 2,8.
  const lidTop = lidT + 0.2;
  const H = Math.round((BASE_H + FLOOR + 1.0 + (gH + SEAT) + GRINDER_GAP + lidTop) * 10) / 10;
  const Z_CH0 = H - lidTop;
  const Z_LID0 = Z_CH0;
  const Z_TOP_ITEMS = Z_CH0 - 1.2;
  const Z_BAY0 = Z_TOP_ITEMS - GAP_PROUD;
  const BOOK_FLOOR = Z_TOP_ITEMS - bookH;
  const BOOK_SHELF = Z_TOP_ITEMS - bookH * (1 - bookIn);
  const yB0 = WALL_Y + A_Y + SEP;
  const x0 = WALL_L;
  return { lidT, gD, gH, bookL, bookT, bookH, bookIn, lL, lW, lT, A_Y, B_Y, lighterLen, X, Y, H, IN_X, Z_CH0, Z_LID0, Z_TOP_ITEMS, Z_BAY0, BOOK_FLOOR, BOOK_SHELF, yB0, x0, yc: Y / 2 };
}
type Lay = ReturnType<typeof layout>;

// ---------- pomocnicze bryły ----------
/** Prostopadłościan wg kolejności z pudelko.py: (xa, xb, ya, yb, za, zb). */
const bb = (xa: number, xb: number, ya: number, yb: number, za: number, zb: number) =>
  Mf().cube([xb - xa, yb - ya, zb - za]).translate([xa, ya, za]);
const cylZ = (cx: number, cy: number, r: number, z0: number, z1: number, seg = 64) =>
  Mf().cylinder(z1 - z0, r, r, seg).translate([cx, cy, z0]);
const cylXa = (y: number, z: number, r: number, x0: number, x1: number) =>
  Mf().cylinder(x1 - x0, r, r, 64).rotate([0, 90, 0]).translate([x0, y, z]);
const cylYa = (x: number, z: number, r: number, y0: number, y1: number) =>
  Mf().cylinder(y1 - y0, r, r, 48).rotate([-90, 0, 0]).translate([x, y0, z]);
const area = (pts: P2[]) => pts.reduce((s, q, i) => s + (pts[(i + 1) % pts.length][0] - q[0]) * (pts[(i + 1) % pts.length][1] + q[1]), 0);
const ccw = (pts: P2[]): P2[] => (area(pts) > 0 ? [...pts].reverse() : pts);
/** Wielokąt w płaszczyźnie YZ wyciągnięty wzdłuż X od xa do xb. */
const prismX = (pts: P2[], xa: number, xb: number) =>
  C().ofPolygons([ccw(pts)]).extrude(xb - xa).rotate([90, 0, 90]).translate([xa, 0, 0]);
/** Wielokąt w płaszczyźnie XZ wyciągnięty wzdłuż Y od ya do yb. */
const prismY = (pts: P2[], ya: number, yb: number) =>
  C().ofPolygons([ccw(pts)]).extrude(yb - ya).rotate([90, 0, 0]).translate([0, yb, 0]);
const ext = (cs: CrossSection, z0: number, z1: number) => cs.extrude(z1 - z0).translate([0, 0, z0]);
const U = (ms: Manifold[]) => Mf().union(ms);

/** Obrys pudełka z żebrami japandi (wspólny dla korpusu i frontów szuflad). */
export function outline(X: number, Y: number): CrossSection {
  const base = C().square([X, Y]).offset(-CORNER_R, 'Round', 2, 24).offset(CORNER_R, 'Round', 2, 24);
  const ribs: CrossSection[] = [];
  const m0 = CORNER_R + RIB_PITCH / 2;
  for (let xx = m0; xx <= X - m0 + 1e-6; xx += RIB_PITCH) ribs.push(C().circle(RIB_R, 24).translate([xx, 0]), C().circle(RIB_R, 24).translate([xx, Y]));
  for (let yy = m0; yy <= Y - m0 + 1e-6; yy += RIB_PITCH) ribs.push(C().circle(RIB_R, 24).translate([0, yy]), C().circle(RIB_R, 24).translate([X, yy]));
  return C().union([base, ...ribs]);
}

// ---------- napis (kwadratowa czcionka z prostych pasków, jak w pudelko.py) ----------
function barCS(p0: P2, p1: P2, t: number): CrossSection {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy);
  const nx = (-dy / l) * (t / 2), ny = (dx / l) * (t / 2);
  return C().ofPolygons([ccw([[p0[0] + nx, p0[1] + ny], [p1[0] + nx, p1[1] + ny], [p1[0] - nx, p1[1] - ny], [p0[0] - nx, p0[1] - ny]])]);
}

function glyph(ch: string, h = 10.0, t = 2.0): [CrossSection, number] {
  let w: number;
  let g: CrossSection;
  switch (ch) {
    case 'F':
      w = 6.0;
      g = C().union([barCS([t / 2, -1], [t / 2, h + 1], t), barCS([-1, h - t / 2], [w + 1, h - t / 2], t), barCS([-1, h / 2], [w - 1.2, h / 2], t)]);
      break;
    case 'K':
      w = 7.0;
      g = C().union([barCS([t / 2, -1], [t / 2, h + 1], t), barCS([1.5, 4.5], [w + 2, 4.5 + 1.2 * (w + 0.5)], t), barCS([1.5, 5.5], [w + 2, 5.5 - 1.2 * (w + 0.5)], t)]);
      break;
    case 'N':
      w = 7.0;
      g = C().union([barCS([t / 2, -1], [t / 2, h + 1], t), barCS([w - t / 2, -1], [w - t / 2, h + 1], t), barCS([t / 2, h + 0.5], [w - t / 2, -0.5], t)]);
      break;
    case 'D': {
      w = 7.0;
      const outer = C().ofPolygons([[[0, 0], [w - 2.4, 0], [w, 2.4], [w, h - 2.4], [w - 2.4, h], [0, h]]]);
      return [outer.subtract(outer.offset(-t, 'Miter', 5)), w];
    }
    case 'M': {
      w = 9.0;
      // Środkowe „V”: dwa paski o szerokości 1,8 + sfazowany łącznik od zewnątrz (jak join mitre z limitem 1.5).
      const A: P2 = [t / 2, h + 0.5], B: P2 = [w / 2, 3.0], Cc: P2 = [w - t / 2, h + 0.5];
      const hw = 0.9;
      const norm = (a: P2, b: P2): P2 => {
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
        const n: P2 = [-dy / l, dx / l];
        return n[1] > 0 ? [-n[0], -n[1]] : n; // normalna skierowana w dół (zewnętrzna strona V)
      };
      const n1 = norm(A, B), n2 = norm(B, Cc);
      const bevel = C().ofPolygons([ccw([B, [B[0] + n1[0] * hw, B[1] + n1[1] * hw], [B[0] + n2[0] * hw, B[1] + n2[1] * hw]])]);
      g = C().union([barCS([t / 2, -1], [t / 2, h + 1], t), barCS([w - t / 2, -1], [w - t / 2, h + 1], t), barCS(A, B, 2 * hw), barCS(B, Cc, 2 * hw), bevel]);
      break;
    }
    default:
      throw new Error(ch);
  }
  return [g.intersect(C().square([w, h]).translate([0, 0])), w];
}

function textShape(s: string, height: number, spacing = 2.0): CrossSection {
  const parts: CrossSection[] = [];
  let x = 0;
  for (const ch of s) {
    const [g, w] = glyph(ch);
    parts.push(g.translate([x, 0]));
    x += w + spacing;
  }
  const k = height / 10;
  return C().union(parts).scale([k, k]);
}

/** Kształt przesunięty tak, by jego środek (bbox) był w (cx, cy). */
function centered(cs: CrossSection, cx: number, cy: number): CrossSection {
  const b = cs.bounds();
  return cs.translate([cx - (b.min[0] + b.max[0]) / 2, cy - (b.min[1] + b.max[1]) / 2]);
}

// ---------- miska (płynne wgłębienie tacki) ----------
const smooth = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/**
 * Bryła do odjęcia od spodu pokrywy: od z0 - 0,5 do z0 + głębokość profilu smoothstep (siatka wysokości).
 * Brzeg ma głębokość 0, więc wgłębienie wyłania się płynnie, bez pionowych ścianek.
 */
export function bowlCutter(x0: number, x1: number, y0: number, y1: number, z0: number, depth: number, slope: number, step = 1.0): Manifold {
  const nx = Math.max(2, Math.ceil((x1 - x0) / step)), ny = Math.max(2, Math.ceil((y1 - y0) / step));
  const N = (nx + 1) * (ny + 1);
  const vp = new Float32Array(N * 2 * 3);
  const ti = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx, y = y0 + ((y1 - y0) * j) / ny;
      const h = depth * smooth(Math.min(x - x0, x1 - x) / slope) * smooth(Math.min(y - y0, y1 - y) / slope);
      const k = ti(i, j);
      vp.set([x, y, z0 + h], k * 3);
      vp.set([x, y, z0 - 0.5], (k + N) * 3);
    }
  const tri: number[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = ti(i, j), b = ti(i + 1, j), c = ti(i + 1, j + 1), d = ti(i, j + 1);
      tri.push(a, b, c, a, c, d, a + N, c + N, b + N, a + N, d + N, c + N);
    }
  // Ścianki boczne: krawędzie obrysu przeciwnie do ruchu wskazówek zegara (patrząc z góry).
  const edge = (p: number, q: number) => tri.push(p + N, q + N, q, p + N, q, p);
  for (let i = 0; i < nx; i++) edge(ti(i, 0), ti(i + 1, 0));
  for (let j = 0; j < ny; j++) edge(ti(nx, j), ti(nx, j + 1));
  for (let i = nx; i > 0; i--) edge(ti(i, ny), ti(i - 1, ny));
  for (let j = ny; j > 0; j--) edge(ti(0, j), ti(0, j - 1));
  const mesh = new (M().Mesh)({ numProp: 3, vertProperties: vp, triVerts: new Uint32Array(tri) });
  mesh.merge();
  return new (Mf())(mesh);
}

/** Odstęp magnesów pokrywy od osi Y (15, a w wąskim pudełku bliżej środka, żeby gniazdo nie wyszło poza ściankę). */
const magDy = (Y: number) => Math.min(15.0, (Y - 2 * WALL_Y) / 2 - MAG_R - 2.0);

/** Skos dna zapalniczki: opada liniowo na długości `len` ku końcowi `side`, na głębokość `depth`. */
export function ramp(p: Params, L: Lay) {
  const side = String(p.rampSide ?? 'right');
  const depth = val(p, 'rampDepth');
  if (side === 'off' || depth <= 0) return null;
  const lx0 = L.x0 + GRIP_GAP + L.gD + CL + GRIP_GAP + SEP;
  const len = Math.min(val(p, 'rampLen'), L.lighterLen - 10);
  return { side, depth, len, lx0, xe: side === 'right' ? lx0 + L.lighterLen : lx0 };
}

// ---------- korpus ----------
export function korpus(p: Params): Manifold {
  const L = layout(p);
  const { X, Y, H, Z_CH0, Z_TOP_ITEMS, Z_BAY0, BOOK_FLOOR, BOOK_SHELF, yB0, x0, yc, gD, gH, bookL, bookT, lW, lT } = L;
  const outl = outline(X, Y);
  const body = ext(outl, 0, H);
  const cut: Manifold[] = [];
  // zatoka pod pokrywą + kanał jaskółczy
  cut.push(bb(WALL_L, X - WALL_X, WALL_Y, Y - WALL_Y, Z_BAY0, Z_CH0 + EPS));
  const wt = Y - 2 * WALL_Y, wb = wt + 2 * DOVE;
  cut.push(prismX([[yc - wb / 2, Z_CH0], [yc + wb / 2, Z_CH0], [yc + wt / 2, H], [yc + wt / 2, H + 1], [yc - wt / 2, H + 1], [yc - wt / 2, H]], -1, X - WALL_X));
  // młynek
  const gx = x0 + GRIP_GAP + (gD + CL) / 2, gy = yB0 + (gD + CL) / 2;
  const gFloor = Z_CH0 - gH - GRINDER_GAP;
  const gX1 = x0 + GRIP_GAP + gD + CL + GRIP_GAP;
  cut.push(bb(x0, gX1, yB0, yB0 + L.B_Y, gFloor + RING_H, Z_CH0 + EPS));
  cut.push(cylZ(gx, gy, (gD + CL) / 2, gFloor, gFloor + RING_H + EPS, 96));
  // zapalniczka
  const lx0 = gX1 + SEP;
  cut.push(bb(lx0, lx0 + L.lighterLen, yB0, yB0 + lW + CL, Z_TOP_ITEMS - lT - 0.4, Z_CH0 + EPS));
  // ubijak (lewy przód)
  const TZ_AX = Z_CH0 - 14.0, TX_AX = 4.2, T_Y0 = 0.2;
  const seatH = TAMP_SQ + 0.4;
  cut.push(bb(-1.5, TX_AX + TAMP_SQ / 2 + 0.2, -1.5, T_Y0 + TAMP_HANDLE_L + 0.2, TZ_AX - seatH / 2, TZ_AX + seatH / 2));
  const PIN_Z = TZ_AX - 1.0;
  cut.push(cylYa(TX_AX, PIN_Z, (TAMP_PIN_D + CL + 0.2) / 2, T_Y0 + TAMP_HANDLE_L, T_Y0 + TAMPER_L + 0.5));
  cut.push(cylXa(T_Y0 + TAMP_HANDLE_L / 2, TZ_AX, MAG_R, TX_AX + TAMP_SQ / 2 + 0.2 - EPS, TX_AX + TAMP_SQ / 2 + 0.2 + MAG_T + 0.2));
  // szuflady (v11: dwie kieszenie od frontu; zastąpione w punkcie 3)
  const DR_Z1 = BASE_H + FLOOR + 1.0 - 1.6;
  const DR_MAG_Y = 7.0, DR_WIN_W = 26.0, DR_FRONT_GAP = 3.3, DR_NOTCH_L = 10.0;
  const DR_YE = Y - DR_REAR;
  const DR_XA = x0, DR_XB = X - WALL_X;
  const DR_W = (DR_XB - DR_XA - SEP) / 2;
  const DR_MAG_DX = Math.min(19.0, DR_W / 2 - MAG_R - 2.0);   // tymczasowo: magnesy nie wystają przy małej szufladzie (pełna logika w punkcie 3)
  const pockets: [number, number][] = [[DR_XA, DR_XA + DR_W], [DR_XA + DR_W + SEP, DR_XB]];
  const DR_Z1_TALL = BOOK_FLOOR - 1.6;
  const ceil = [DR_Z1, DR_Z1_TALL];
  pockets.forEach(([xa, xb], i) => {
    cut.push(bb(xa, xb, -2.0, DR_YE, DR_Z0, ceil[i]));
    for (const dx of [-DR_MAG_DX, DR_MAG_DX]) cut.push(cylZ((xa + xb) / 2 + dx, DR_MAG_Y, MAG_R, DR_Z0 - MAG_T - 0.2, DR_Z0 + EPS));
    cut.push(bb(xa, xb, -2.0, DR_FRONT_GAP, -1.0, DR_Z0 + EPS));
    cut.push(bb((xa + xb) / 2 - DR_WIN_W / 2, (xa + xb) / 2 + DR_WIN_W / 2, -2.0, DR_NOTCH_L, -1.0, DR_Z0 + EPS));
  });
  // zapalniczka: ściana od strony bibułek obniżona do połowy
  const lFloor = Z_TOP_ITEMS - lT - 0.4;
  if (x0 + bookL + CL - lx0 > 1) cut.push(bb(lx0, x0 + bookL + CL, yB0 - SEP - EPS, yB0 + EPS, lFloor + lT / 2, Z_CH0 + EPS));
  // skos dna zapalniczki: dno opada liniowo ku wybranemu końcowi – wciśnięty koniec unosi drugi
  const rs = ramp(p, L);
  if (rs) cut.push(prismY(rs.side === 'right'
    ? [[rs.xe - rs.len, lFloor], [rs.xe, lFloor - rs.depth], [rs.xe, lFloor + 0.5], [rs.xe - rs.len, lFloor + 0.5]]
    : [[rs.xe + rs.len, lFloor], [rs.xe, lFloor - rs.depth], [rs.xe, lFloor + 0.5], [rs.xe + rs.len, lFloor + 0.5]], yB0, yB0 + lW + CL));
  // magnesy w lewej ściance (pod lewym końcem pokrywy)
  for (const dy of [-magDy(Y), magDy(Y)]) cut.push(cylZ(WALL_L / 2, Y / 2 + dy, MAG_R, Z_CH0 - MAG_T - 0.2, Z_CH0 + EPS));
  // książeczka
  const by0 = WALL_Y + (L.A_Y - (bookT + CL)) / 2;
  cut.push(bb(x0, x0 + bookL + CL, by0, by0 + bookT + CL, BOOK_FLOOR, Z_CH0 + EPS));
  cut.push(bb(x0, x0 + bookL + CL, WALL_Y, WALL_Y + L.A_Y, BOOK_SHELF, Z_CH0 + EPS));
  cut.push(bb(x0, gX1, by0 + bookT + CL + SEP, yB0 + EPS, gFloor + RING_H, Z_CH0 + EPS));
  let m = body.subtract(U(cut));
  // napis na spodzie (grawer, odbity: czytelny po odwróceniu pudełka)
  const bot = centered(textShape(TEXT, TEXT_H_BOT), 0, 0).scale([-1, 1]).translate([X / 2, Y / 2]);
  m = m.subtract(ext(bot, -0.1, TEXT_DEPTH_BOT));
  return m;
}

// ---------- pokrywa (we współrzędnych pudełka; w eksporcie odwrócona górą do stołu) ----------
export interface LidParts { lid: Manifold; text: Manifold | null; }

export function lidInBox(p: Params): LidParts {
  const L = layout(p);
  const { X, Y, H, Z_CH0, Z_LID0, yc, lidT } = L;
  const wt = Y - 2 * WALL_Y, wb = wt + 2 * DOVE;
  const wAt = (z: number) => wb - ((z - Z_CH0) / (H - Z_CH0)) * (wb - wt);
  const z0l = Z_LID0, z1l = Z_LID0 + lidT;
  const wl0 = wAt(z0l) - 2 * LID_CLEAR, wl1 = wAt(z1l) - 2 * LID_CLEAR;
  const pts: P2[] = [[yc - wl0 / 2, z0l], [yc + wl0 / 2, z0l], [yc + wl1 / 2, z1l], [yc - wl1 / 2, z1l]];
  const lxa = 0.3, lxb = X - WALL_X - 0.3;
  let lid = prismX(pts, lxa, lxb);
  const parts: Manifold[] = [lid];
  if (p.garby) for (let xx = 14.0; xx < 14.0 + 6 * 4.0 - 1e-6; xx += 4.0) parts.push(cylYa(xx, z1l, 0.8, yc - wl1 / 2 + 3, yc + wl1 / 2 - 3));
  // żebra na lewym czole pokrywy – ten sam rytm co na ściance korpusu
  const m0 = CORNER_R + RIB_PITCH / 2;
  const endRibs: Manifold[] = [];
  for (let yy = m0; yy <= Y - m0 + 1e-6; yy += RIB_PITCH) endRibs.push(cylZ(0.0, yy, RIB_R, z0l, z1l, 24));
  parts.push(U(endRibs).intersect(prismX(pts, -2.0, 2.0)));
  lid = U(parts);
  // gniazda magnesów: lewy i prawy koniec (prawe trafiają nad magnesy ściany przy zsunięciu pokrywy)
  const LID_MAG_RX = lxb - (WALL_L / 2 - lxa);
  const cuts: Manifold[] = [];
  for (const rx of [WALL_L / 2, LID_MAG_RX]) for (const dy of [-magDy(Y), magDy(Y)]) cuts.push(cylZ(rx, Y / 2 + dy, MAG_R, z0l - EPS, z0l + MAG_T + 0.2));
  // tacka: płynna miska na dolnej ściance (po odwróceniu pokrywy – na górze)
  const depth = val(p, 'trayDepth'), slope = val(p, 'traySlope');
  if (depth > 0) {
    const clear = 3.0;
    const bx0 = WALL_L / 2 + MAG_R + clear, bx1 = LID_MAG_RX - MAG_R - clear;
    const by = wl0 / 2 - 4.0;
    cuts.push(bowlCutter(bx0, bx1, yc - by, yc + by, z0l, depth, slope));
  }
  lid = lid.subtract(U(cuts));
  // napis na górnej ściance: wkładka (równo) albo grawer
  const mode = String(p.textMode);
  if (mode === 'none') return { lid, text: null };
  const td = mode === 'engrave' ? TEXT_DEPTH_BOT : val(p, 'textDepth');
  const letters = centered(textShape(TEXT, TEXT_H_LID), (lxa + lxb) / 2, yc);
  lid = lid.subtract(ext(letters, z1l - td, z1l + 0.3));
  return { lid, text: mode === 'inlay' ? ext(letters, z1l - td, z1l) : null };
}

/** Pokrywa/napis do druku: górą do stołu (obrót o 180° wokół X, dół na z = 0), wspólny układ XY. */
function flip(m: Manifold, L: Lay): Manifold {
  return m.rotate([180, 0, 0]).translate([0, 2 * L.yc, L.Z_LID0 + L.lidT]);
}

export function buildPudelko(p: Params): Manifold {
  switch (p.piece) {
    case 'pokrywa': return flip(lidInBox(p).lid, layout(p));
    case 'napis': {
      const t = lidInBox(p).text;
      return t ? flip(t, layout(p)) : Mf().cube([0.01, 0.01, 0.01]);
    }
    default: return korpus(p);
  }
}

// ---------- kontrole (OK / uwaga / błąd) ----------
type Note = { level: 'ok' | 'warn' | 'error'; text: string };
const E = 1e-6;   // tolerancja liczbowa progów
const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

export function pudelkoNotes(p: Params): Note[] {
  const L = layout(p);
  const out: Note[] = [];
  const bookSide = L.bookL + CL + SEP, grSide = GRIP_GAP + L.gD + CL + GRIP_GAP + SEP + L.lighterLen;
  out.push({ level: 'ok', text: `Wymiary zewnętrzne ${fmt(L.X)} × ${fmt(L.Y)} × ${fmt(L.H)} mm (bez żeber +2,0). Szerokość wyznaczają ${bookSide >= grSide ? 'bibułki' : 'młynek + zapalniczka'}.` });
  // szuflady (v11): niska ma stały strop, wysoka kończy się pod dnem szczeliny na bibułki
  const DR_Z1 = BASE_H + FLOOR + 1.0 - 1.6, DR_Z1_TALL = L.BOOK_FLOOR - 1.6;
  const lowH = DR_Z1 - DR_Z0, tallH = DR_Z1_TALL - DR_Z0, MIN_DR = (MAG_D + MAG_CLR) + 2 * 1.2 + 0.4;
  if (tallH < MIN_DR - E) out.push({ level: 'error', text: `Wysoka szuflada ma tylko ${fmt(tallH)} mm wysokości (min. ${fmt(MIN_DR)} mm na magnes). Zmniejsz wysokość bibułek albo zwiększ młynek.` });
  else out.push({ level: tallH < 10 - E ? 'warn' : 'ok', text: `Szuflady: niska ${fmt(lowH)} mm, wysoka ${fmt(tallH)} mm (zależy od wysokości bibułek i młynka).` });
  // zapalniczka: ile materiału pod dnem (z uwzględnieniem skosu) nad sufitami szuflad
  const lFloor = L.Z_TOP_ITEMS - L.lT - 0.4;
  const DR_XA = L.x0, DR_XB = L.X - WALL_X, DR_W = (DR_XB - DR_XA - SEP) / 2;
  const pockets: [number, number, number][] = [[DR_XA, DR_XA + DR_W, DR_Z1], [DR_XA + DR_W + SEP, DR_XB, DR_Z1_TALL]];
  const lx0 = L.x0 + GRIP_GAP + L.gD + CL + GRIP_GAP + SEP, lx1 = lx0 + L.lighterLen;
  const under = (a: number, b: number) => Math.max(...pockets.filter(([xa, xb]) => xb > a && xa < b).map((q) => q[2]));
  const rs = ramp(p, L);
  const mat0 = lFloor - under(lx0, lx1);
  if (mat0 < 1.2 - E) out.push({ level: 'error', text: `Pod dnem zapalniczki zostaje ${fmt(mat0)} mm materiału nad szufladą (min. 1,2). Zmniejsz grubość zapalniczki albo wysokość szuflady.` });
  if (rs) {
    const xs = rs.side === 'right' ? rs.xe - rs.len : rs.xe, xe2 = rs.side === 'right' ? rs.xe : rs.xe + rs.len;
    const mat = lFloor - rs.depth - under(xs, xe2);
    const lift = (rs.depth * (L.lL - rs.len)) / rs.len, slope = (Math.atan(rs.depth / rs.len) * 180) / Math.PI;
    if (mat < 1.2 - E) out.push({ level: 'error', text: `Skos zapalniczki zostawia ${fmt(mat)} mm materiału nad szufladą (min. 1,2). Zmniejsz głębokość skosu.` });
    else if (mat < 2 - E) out.push({ level: 'warn', text: `Pod skosem zapalniczki zostaje ${fmt(mat)} mm materiału (zalecane ≥ 2).` });
    if (slope > 10 + E) out.push({ level: 'warn', text: `Skos zapalniczki jest stromy (${fmt(slope)}°, zalecane 3–10°).` });
    else if (slope < 3 - E) out.push({ level: 'warn', text: `Skos zapalniczki jest bardzo łagodny (${fmt(slope)}°, zalecane 3–10°).` });
    if (lift < 3 - E) out.push({ level: 'warn', text: `Wciśnięty koniec podnosi drugi tylko o ${fmt(lift)} mm (zalecane ≥ 3). Zwiększ głębokość albo skróć skos.` });
    else if (slope >= 3 - E && slope <= 10 + E && mat >= 2 - E) out.push({ level: 'ok', text: `Skos zapalniczki (${rs.side === 'right' ? 'prawy' : 'lewy'}): ${fmt(slope)}°, drugi koniec unosi się o ${fmt(lift)} mm.` });
  }
  // pokrywa: tacka i napis
  const lidT = val(p, 'lidT'), tray = val(p, 'trayDepth'), slopeW = val(p, 'traySlope');
  if (tray > 0) {
    const under = lidT - tray, td = p.textMode === 'none' ? 0 : p.textMode === 'engrave' ? TEXT_DEPTH_BOT : val(p, 'textDepth');
    if (under < 1.2 - E) out.push({ level: 'warn', text: `Pod tacką zostaje ${fmt(under)} mm pokrywy (min. 1,2).` });
    else if (td > 0 && under - td < 0.8 - E) out.push({ level: 'warn', text: `Między tacką a napisem zostaje ${fmt(under - td)} mm (min. 0,8).` });
    const tilt = (Math.atan((1.5 * tray) / slopeW) * 180) / Math.PI;
    if (tilt > 10 + E) out.push({ level: 'warn', text: `Tacka jest zbyt stroma (${fmt(tilt)}°, zalecane do 10°). Poszerz skos albo zmniejsz głębokość.` });
    if (2 * slopeW > Math.min(L.X - 26.25, L.Y - 12.5) + E) out.push({ level: 'warn', text: 'Skos tacki jest za szeroki: tacka nie osiągnie pełnej głębokości.' });
  }
  // ubijak: tuleja i trzonek mają stałe położenie w Y
  const needY = 0.2 + TAMPER_L + 0.5 + WALL_X;
  if (L.Y < needY - E) out.push({ level: 'error', text: `Pudełko jest za płytkie (${fmt(L.Y)} mm) na gniazdo ubijaka (min. ${fmt(needY)} mm). Zwiększ młynek albo grubość bibułek.` });
  return out;
}

const PARAMS: ParamDef[] = [
  { key: 'gD', label: 'Młynek: średnica', type: 'number', def: DEF.gD, min: 20, max: 80, step: 0.5, unit: 'mm', group: 'Młynek', hint: 'Wyznacza szerokość gniazda i głębokość (Y) pudełka.' },
  { key: 'gH', label: 'Młynek: wysokość', type: 'number', def: DEF.gH, min: 15, max: 80, step: 0.5, unit: 'mm', hint: 'Wyznacza wysokość pudełka (H = warstwa szuflad + wysokość + 5 + luz + pokrywa).' },
  { key: 'bookL', label: 'Bibułki: długość', type: 'number', def: DEF.bookL, min: 60, max: 200, step: 0.5, unit: 'mm', group: 'Bibułki', hint: 'Największe opakowanie, stoi na krawędzi.' },
  { key: 'bookT', label: 'Bibułki: grubość', type: 'number', def: DEF.bookT, min: 5, max: 40, step: 0.5, unit: 'mm', hint: 'Wyznacza głębokość (Y) pudełka.' },
  { key: 'bookH', label: 'Bibułki: wysokość', type: 'number', def: DEF.bookH, min: 15, max: 80, step: 0.5, unit: 'mm', hint: 'Wyższe opakowanie = niższa wysoka szuflada.' },
  { key: 'bookIn', label: 'Bibułki: część w szczelinie', type: 'number', def: DEF.bookIn, min: 0.2, max: 0.8, step: 0.05, more: true, hint: 'Jaka część wysokości opakowania siedzi w szczelinie (reszta wystaje do chwytu).' },
  { key: 'lL', label: 'Zapalniczka: długość', type: 'number', def: DEF.lL, min: 50, max: 130, step: 0.5, unit: 'mm', group: 'Zapalniczka', hint: 'Wyznacza szerokość (X) pudełka.' },
  { key: 'lW', label: 'Zapalniczka: szerokość', type: 'number', def: DEF.lW, min: 15, max: 50, step: 0.5, unit: 'mm' },
  { key: 'lT', label: 'Zapalniczka: grubość', type: 'number', def: DEF.lT, min: 8, max: 30, step: 0.5, unit: 'mm', hint: 'Leży płasko; grubsza = niższe dno gniazda.' },
  select('rampSide', 'Skos dna zapalniczki', 'right', [['right', 'prawy'], ['left', 'lewy'], ['off', 'wyłączony']]),
  { key: 'rampLen', label: 'Skos: długość', type: 'number', def: DEF.rampLen, min: 10, max: 60, step: 1, unit: 'mm', show: (p) => p.rampSide !== 'off', hint: 'Dno opada liniowo na tej długości ku wybranemu końcowi. Wciśnięty koniec unosi drugi.' },
  { key: 'rampDepth', label: 'Skos: głębokość', type: 'number', def: DEF.rampDepth, min: 0.5, max: 5, step: 0.1, unit: 'mm', show: (p) => p.rampSide !== 'off' },
  { key: 'lidT', label: 'Grubość pokrywy', type: 'number', def: DEF.lidT, min: 2.8, max: 6, step: 0.1, unit: 'mm', group: 'Pokrywa', hint: 'Podnosi też wysokość pudełka (H = … + grubość + 0,2). Kąt jaskółczego ogona maleje przy grubszej pokrywie.' },
  { key: 'trayDepth', label: 'Głębokość tacki', type: 'number', def: DEF.trayDepth, min: 0, max: 3, step: 0.1, unit: 'mm', hint: '0 = bez wgłębienia. Wgłębienie jest płynne (bez ścianek), na dolnej stronie pokrywy.' },
  { key: 'traySlope', label: 'Szerokość skosu tacki', type: 'number', def: DEF.traySlope, min: 8, max: 30, step: 1, unit: 'mm', more: true, hint: 'Im szerszy skos, tym łagodniejsze nachylenie (maks. nachylenie ≈ 1,5·głębokość / szerokość).' },
  select('textMode', 'Napis FKNDMN', 'inlay', [['inlay', 'wkładka (inny kolor)'], ['engrave', 'wgłębiony'], ['none', 'bez napisu']]),
  { key: 'textDepth', label: 'Głębokość wkładki napisu', type: 'number', def: DEF.textDepth, min: 0.4, max: 1.6, step: 0.2, unit: 'mm', show: (p) => p.textMode === 'inlay' },
  { key: 'garby', label: 'Garby (v11, tylko do testów)', type: 'bool', def: false, show: () => false },
];

// ---------- zakresy suwaków liczone na żywo ----------
/** Stan jest dozwolony, gdy żadna reguła (szuflady, skos, materiał, ubijak, pokrywa) nie zgłasza uwagi ani błędu. */
const allowed = (p: Params) => pudelkoNotes(p).every((n) => n.level === 'ok');
const full = (p: Params): Params => ({ ...Object.fromEntries(PARAMS.map((d) => [d.key, d.def])), ...p });

/** Każdy suwak liczbowy dostaje zakres, w którym wszystkie reguły nadal są spełnione (przy pozostałych wartościach bez zmian). */
function dynamicParams(p0: Params): ParamDef[] {
  const p = full(p0);
  const base = allowed(p);
  return PARAMS.map((d) => {
    if (d.type !== 'number' || !base) return d;
    const step = d.step ?? 1, c = Number(p[d.key]);
    const walk = (dir: 1 | -1) => {
      let v = c;
      for (let k = 1; k < 2000; k++) {
        const t = Math.round((c + dir * k * step) * 1000) / 1000;
        if (t < d.min - 1e-9 || t > d.max + 1e-9 || !allowed({ ...p, [d.key]: t })) break;
        v = t;
      }
      return v;
    };
    const lo = walk(-1), hi = walk(1);
    if (lo <= d.min + 1e-9 && hi >= d.max - 1e-9) return d;
    return { ...d, min: lo, max: hi, hint: `${d.hint ?? ''} Zakres zawężony przez pozostałe wymiary, żeby szuflady, skos i pokrywa się mieściły.`.trim() };
  });
}

/** Po edycji: jeśli wynik byłby niedozwolony (np. wartość wklejona z JSON albo włączony skos), koryguje go do najbliższego dozwolonego stanu. */
function repairParams(prev: Params, next: Params): Params {
  const n = full(next);
  if (allowed(n)) return next;
  const pv = full(prev);
  const changed = PARAMS.filter((d) => String(next[d.key] ?? d.def) !== String(prev[d.key] ?? d.def)).map((d) => d.key);
  const nums = changed.filter((k) => PARAMS.find((d) => d.key === k)!.type === 'number');
  if (nums.length)
    for (let t = 0.98; t >= 0; t -= 0.02) {
      const cand = { ...n };
      for (const k of nums) cand[k] = Math.round((Number(pv[k]) + (Number(n[k]) - Number(pv[k])) * t) * 100) / 100;
      if (allowed(cand)) return { ...next, ...Object.fromEntries(nums.map((k) => [k, cand[k]])) };
    }
  // włączenie skosu: dobierz długość i głębokość, które się mieszczą
  if (changed.includes('rampSide') && n.rampSide !== 'off')
    for (const len of [25, 20, 30, 15, 35, 12, 40])
      for (const depth of [2, 1.5, 1, 2.5, 3, 0.8])
        if (allowed({ ...n, rampLen: len, rampDepth: depth })) return { ...next, rampLen: len, rampDepth: depth };
  return { ...next, ...Object.fromEntries(changed.map((k) => [k, pv[k]])) };
}

export const PUDELKO_DEFS: PartDef[] = [
  {
    type: 'pudelko',
    label: 'Pudełko na akcesoria',
    category: 'useful',
    hole: false,
    description: 'Pudełko na młynek, bibułki, zapalniczkę i ubijak z wsuwaną pokrywą-tacką (jaskółczy ogon) i napisem jako wkładką w innym kolorze. Wymiary wnętrza dobiera się do Twoich przedmiotów. Pokrywę drukuj górą do stołu.',
    pieces: [
      { value: 'korpus', label: 'korpus', hole: false, body: 'new' },
      { value: 'pokrywa', label: 'pokrywa-tacka', hole: false, body: 'new' },
      { value: 'napis', label: 'napis (inny kolor)', hole: false, body: 'new' },
    ],
    notes: pudelkoNotes,
    params: PARAMS,
    paramsFor: dynamicParams,
    normalize: repairParams,
    build: buildPudelko,
  },
];
