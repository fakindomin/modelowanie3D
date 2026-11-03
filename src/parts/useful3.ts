import type { CrossSection, Manifold } from 'manifold-3d';
import { M, settle } from '../geom/manifold';
import type { Params, PartDef } from './def';
import { box, cyl, num, union } from './util';
import { FONT, textOutline } from './text';
import { type P2, arc, ccw, count, csHole, n, onSide, screwOf, screwParams, stroke } from './useful';

/** Bathroom and kids: third batch of everyday things, same rules as useful.ts (no supports as built). */

const C = () => M().CrossSection;

// ================================================================== bathroom
/** Hook over a glass shower door: an upside-down U on the glass and a J hook outside (printed on its side). */
function showerHook(p: Params) {
  const g = num(p, 'glass') + 0.6, t = num(p, 'T'), w = num(p, 'W'), A1 = num(p, 'inner'), drop = num(p, 'drop'), R = num(p, 'R');
  const x2 = g + t / 2;
  const pts: P2[] = [[-t / 2, -A1], [-t / 2, t / 2], [x2, t / 2], [x2, -drop], ...arc(x2 + R, -drop, R, 180, 360, 14), [x2 + 2 * R, -drop + R * 0.7]];
  return settle(onSide(stroke(pts, t), w));
}

/** Corner shelf: a quarter disc with a lip and drain slots, two upright backs for the walls. */
function cornerShelf(p: Params) {
  const R = num(p, 'R'), t = 4, Hb = num(p, 'Hb'), lip = num(p, 'lip');
  const quarter = C().circle(R, 96).intersect(C().square([R, R]));
  let m = quarter.extrude(t);
  // Lip round the front with gaps for water.
  const rim = C().circle(R, 96).subtract(C().circle(R - 2.4, 96)).intersect(C().square([R, R]));
  let lipM = rim.extrude(lip).translate([0, 0, t - 0.01]);
  for (const a of [22.5, 45, 67.5]) lipM = lipM.subtract(box(R - 4, -3, t - 1, R + 2, 3, t + lip + 1).rotate([0, 0, a]));
  m = m.add(lipM);
  // Backs standing on the two straight edges.
  m = m.add(box(0, 0, 0, R, 3, Hb)).add(box(0, 0, 0, 3, R, Hb));
  // Drain holes.
  for (let r = R * 0.35; r < R - 8; r += 12) for (let a = 15; a < 90; a += 20 * (R / r) * 0.3) m = m.subtract(cyl(t + 2, 2.5, 2.5, 16).translate([r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180), -1]));
  const sd = screwOf(p);
  if (sd) {
    // Countersunk from the shelf side, through each back.
    m = m.subtract(csHole(0, 0, 3, sd).rotate([-90, 0, 0]).translate([R * 0.6, 0, Hb * 0.7]));
    m = m.subtract(csHole(0, 0, 3, sd).rotate([0, 90, 0]).translate([0, R * 0.6, Hb * 0.7]));
  }
  return settle(m);
}

/** Cosmetics organizer: round pockets for tubes and brushes at the back, a bin at the front. */
function cosmeticOrganizer(p: Params) {
  const k = Math.max(1, Math.round(num(p, 'N'))), d = num(p, 'd'), H = num(p, 'H'), binD = num(p, 'binD'), wall = 2;
  const W = Math.max(k * (d + wall) + wall, 60);
  const D = d + 2 * wall + binD + wall;
  let m = box(0, 0, 0, W, D, H);
  const x0 = (W - k * (d + wall) + wall) / 2;
  for (let i = 0; i < k; i++) m = m.subtract(cyl(H, d / 2, d / 2, 48).translate([x0 + d / 2 + i * (d + wall), D - wall - d / 2, 2]));
  // Front bin, lower than the back.
  const bh = H * 0.55;
  m = m.subtract(box(wall, wall, 2, W - wall, wall + binD, H + 1)).subtract(box(-1, -1, bh, W + 1, wall + binD + wall * 0.5, H + 1));
  return settle(m);
}

/** Drain strainer: a perforated disc, a skirt that goes into the drain, a tab to lift it out. */
function drainStrainer(p: Params) {
  const D = num(p, 'D'), Ds = num(p, 'Ds'), hd = num(p, 'hole'), t = 1.8;
  let disc = C().circle(D / 2, 96).add(C().circle(6, 32).translate([D / 2 + 3, 0]).add(C().square([8, 8], true).translate([D / 2, 0])));
  disc = disc.subtract(C().circle(3, 24).translate([D / 2 + 3, 0]));
  const holes: CrossSection[] = [];
  const pitch = hd + 1.6, rIn = Ds / 2 - 1.6;
  for (let y = -rIn; y <= rIn; y += pitch * 0.866)
    for (let x = -rIn + ((Math.round((y + rIn) / (pitch * 0.866)) % 2) * pitch) / 2; x <= rIn; x += pitch) if (Math.hypot(x, y) < rIn - hd / 2) holes.push(C().circle(hd / 2, 12).translate([x, y]));
  // Disc on the bed, skirt up (in use the disc lies on top, the skirt in the drain).
  let m = disc.subtract(C().union(holes)).extrude(t);
  m = m.add(C().circle(Ds / 2 - 0.3, 96).subtract(C().circle(Ds / 2 - 1.8, 96)).extrude(num(p, 'skirt')).translate([0, 0, t - 0.01]));
  return settle(m);
}

// ================================================================== kids
/** Bookmark with a name standing on it (change filament at the letters for two colours). */
function bookmark(p: Params) {
  const L = num(p, 'L'), W = num(p, 'W'), t = 1.2, font = String(p.font || 'sans-bold');
  const strip = C().square([W - 6, L - 6], true).offset(3, 'Round', undefined, 24);
  let m = strip.subtract(C().circle(2.5, 24).translate([0, L / 2 - 7])).extrude(t);
  const text = String(p.text ?? '').trim() || '?';
  let size = num(p, 'size');
  const probe = textOutline(text, font, 10, 0.8);
  const len = probe ? probe.bounds().max[0] - probe.bounds().min[0] : 10;
  if (!(size > 0)) size = Math.max(4, Math.min(W - 6, ((L - 22) / len) * 10));
  const cs = textOutline(text, font, size, size * 0.08);
  if (cs) m = m.add(cs.rotate(90).translate([0, -4]).extrude(num(p, 'depth') || 0.8).translate([0, 0, t - 0.01]));
  return settle(m);
}

/** Name puzzle: a tray with letter-shaped holes and the letters to put in them, side by side. */
function namePuzzle(p: Params) {
  const text = (String(p.text ?? '').trim() || 'ALA').toUpperCase(), size = num(p, 'size'), g = 0.25, T = 6, base = 2, m0 = 8;
  const font = String(p.font || 'sans-bold');
  const letters: { cs: CrossSection; x: number }[] = [];
  let x = 0;
  for (const ch of text) {
    if (ch === ' ') {
      x += size * 0.5;
      continue;
    }
    const raw = textOutline(ch, font, size, 0);
    if (!raw) continue;
    // A little bolder, so thin strokes of the letters are strong enough to handle.
    const cs = raw.offset(0.6, 'Round');
    const b = cs.bounds();
    letters.push({ cs: cs.translate([-b.min[0], -b.min[1]]), x });
    x += b.max[0] - b.min[0] + size * 0.25;
  }
  if (!letters.length) return settle(box(0, 0, 0, 10, 10, 2));
  const W = x - size * 0.25 + 2 * m0, H = size * 1.4 + 2 * m0;
  const r = 4;
  const trayCs = C().square([W - 2 * r, H - 2 * r], true).offset(r, 'Round', undefined, 24).translate([W / 2, H / 2]);
  const holes = C().union(letters.map((l) => l.cs.offset(g, 'Round').translate([m0 + l.x, m0])));
  const tray = trayCs.extrude(base).add(trayCs.subtract(holes).extrude(T).translate([0, 0, base - 0.01]));
  // Letters below the tray, as tall as the holes plus a little, to grip.
  const pieces = union(letters.map((l) => l.cs.extrude(T + 1).translate([m0 + l.x, -size * 1.4 - 6, 0])));
  return settle(union([tray, pieces]));
}

/** Whistle: a round chamber, a flat windway along its side and a sharp edge at the window. */
function whistle(p: Params) {
  const Rc = num(p, 'D') / 2, h = 10, wall = 1.6, L = 28;
  const R = Rc + wall;
  const wy0 = Rc - 1.2, wy1 = Rc;
  // Body: the chamber and a mouthpiece around the windway, a ring for a lanyard.
  let m = cyl(h, R, R, 64).add(box(-L, wy0 - 2.5, 0, 0, R, h)).add(cyl(h, R, R, 64).intersect(box(-R, -R, 0, 0, R, h)));
  m = m.add(cyl(3, 5, 5, 32).translate([R + 3, 0, 0]).subtract(cyl(5, 2.5, 2.5, 24).translate([R + 3, 0, -1])));
  m = m.subtract(cyl(h - 2 * 1.2, Rc, Rc, 64).translate([0, 0, 1.2]));
  // Windway: thin slot from the mouth to the chamber, tangent to its wall.
  m = m.subtract(box(-L - 1, wy0, 2, 0.01, wy1, h - 2));
  // Window: open from the end of the windway to where the chamber wall is half way into the jet (the edge).
  const xe = Math.sqrt(Rc * Rc - (Rc - 0.6) * (Rc - 0.6));
  m = m.subtract(box(0, wy0 + 0.6, 2, xe, R + 1, h - 2));
  // Sharpen the edge from outside (45°).
  m = m.subtract(ccw([[xe, wy0 + 0.6], [xe + 3, R + 0.5], [xe, R + 0.5]]).extrude(h - 4).translate([0, 0, 2]));
  return settle(m);
}

/** Tic-tac-toe: a board with raised lines, five crosses and five rings. */
function ticTacToe(p: Params) {
  const S = num(p, 'S'), cell = S / 3, t = 3;
  let board = box(0, 0, 0, S, S, t);
  for (const i of [1, 2]) board = board.add(box(i * cell - 1, 4, t - 0.01, i * cell + 1, S - 4, t + 2)).add(box(4, i * cell - 1, t - 0.01, S - 4, i * cell + 1, t + 2));
  const pd = cell - 8, ph = 4;
  const ring = C().circle(pd / 2, 48).subtract(C().circle(pd / 2 - 3.5, 48)).extrude(ph);
  const bar = C().square([pd, 3.5], true);
  const cross = C().union([bar.rotate(45), bar.rotate(-45)]).extrude(ph);
  const ps: Manifold[] = [];
  for (let i = 0; i < 5; i++) {
    ps.push(cross.translate([pd / 2 + i * (pd + 4), -pd / 2 - 6, 0]));
    ps.push(ring.translate([pd / 2 + i * (pd + 4), -pd * 1.5 - 10, 0]));
  }
  return settle(union([board, ...ps]));
}

/** Die: rounded cube with spherical pips; one pip on the bed face. */
function die(p: Params) {
  const S = num(p, 'S'), r = S * 0.085, h = S / 2;
  let m = box(-h, -h, -h, h, h, h).intersect(M().Manifold.sphere(h * 1.38, 96));
  const o = S * 0.25;
  const faces: [number[], [number, number][]][] = [
    [[0, 0, -1], [[0, 0]]],
    [[0, 0, 1], [[-o, -o], [-o, 0], [-o, o], [o, -o], [o, 0], [o, o]]],
    [[1, 0, 0], [[-o, -o], [o, o]]],
    [[-1, 0, 0], [[-o, -o], [-o, o], [o, -o], [o, o], [0, 0]]],
    [[0, 1, 0], [[-o, -o], [0, 0], [o, o]]],
    [[0, -1, 0], [[-o, -o], [-o, o], [o, -o], [o, o]]],
  ];
  const pips: Manifold[] = [];
  for (const [nrm, spots] of faces)
    for (const [u, v] of spots) {
      const c: [number, number, number] = nrm[0] ? [nrm[0] * h, u, v] : nrm[1] ? [u, nrm[1] * h, v] : [u, v, nrm[2] * h];
      pips.push(M().Manifold.sphere(r, 24).translate(c));
    }
  m = m.subtract(union(pips));
  return settle(m);
}

export const USEFUL3_DEFS: PartDef[] = [
  {
    type: 'showerHook', label: 'Wieszak na drzwi kabiny', category: 'useful', hole: false,
    description: 'Zakładany na górną krawędź szklanych drzwi kabiny albo parawanu: ręcznik, gąbka, szlafrok. Podaj grubość szkła.',
    params: [n('glass', 'Grubość szkła', 6, 3, 12, 0.5), n('inner', 'Ramię od środka', 20, 8, 60), n('drop', 'Opuszczenie haczyka', 30, 5, 120), n('R', 'Promień haczyka', 12, 5, 30), n('T', 'Grubość', 4, 3, 8, 0.5), n('W', 'Szerokość', 18, 8, 40)],
    build: showerHook,
  },
  {
    type: 'cornerShelf', label: 'Półka narożna', category: 'useful', hole: false,
    description: 'Ćwierć koła do narożnika prysznica: rant z przerwami na wodę, otwory odpływowe, dwie ścianki do kafelków (wkręty albo taśma).',
    params: [n('R', 'Promień półki', 150, 60, 250), n('lip', 'Wysokość rantu', 10, 0, 30), n('Hb', 'Wysokość ścianek', 40, 15, 100), ...screwParams],
    build: cornerShelf,
  },
  {
    type: 'cosmeticOrganizer', label: 'Organizer na kosmetyki', category: 'useful', hole: false,
    description: 'Z tyłu okrągłe gniazda na pędzle, tusze i tubki, z przodu niższa przegroda na drobiazgi.',
    params: [count('N', 'Liczba gniazd', 5, 1, 12), n('d', 'Średnica gniazda', 22, 8, 60, 0.5), n('binD', 'Głębokość przegrody z przodu', 40, 15, 120), n('H', 'Wysokość', 70, 30, 150)],
    build: cosmeticOrganizer,
  },
  {
    type: 'drainStrainer', label: 'Sitko do odpływu', category: 'useful', hole: false,
    description: 'Zatrzymuje włosy w brodziku, wannie albo zlewie: dziurkowany krążek, kołnierz wchodzący w odpływ i uszko do wyjmowania.',
    params: [n('D', 'Średnica krążka', 70, 30, 150), n('Ds', 'Średnica odpływu', 40, 20, 120, 0.5), n('skirt', 'Głębokość kołnierza', 6, 0, 20), n('hole', 'Otworki', 2.5, 1.2, 5, 0.1)],
    build: drainStrainer,
  },
  {
    type: 'bookmark', label: 'Zakładka z imieniem', category: 'useful', hole: false,
    description: 'Płaska zakładka z wypukłym imieniem wzdłuż i otworem na chwost. Dla dwóch kolorów: zmiana filamentu na wysokości liter.',
    params: [{ key: 'text', label: 'Napis', type: 'text', def: 'Zosia', max: 20 }, FONT, n('size', 'Wysokość liter', 0, 0, 40, 0.5, '0 = sama się dobiera.'), n('depth', 'Wypukłość liter', 0.8, 0.4, 2, 0.2), n('L', 'Długość', 150, 80, 220), n('W', 'Szerokość', 30, 15, 60)],
    build: bookmark,
  },
  {
    type: 'namePuzzle', label: 'Puzzle z imieniem', category: 'useful', hole: false,
    description: 'Tacka z otworami w kształcie liter i litery do włożenia, drukowane obok siebie. Litery lekko pogrubione, żeby się nie łamały.',
    params: [{ key: 'text', label: 'Imię', type: 'text', def: 'ZOSIA', max: 12 }, FONT, n('size', 'Wysokość liter', 30, 15, 80)],
    build: namePuzzle,
  },
  {
    type: 'whistle', label: 'Gwizdek', category: 'useful', hole: false,
    description: 'Gwizdek z okrągłą komorą, płaskim kanałem i ostrą krawędzią; uszko na smycz. Krótkie mostki nad kanałem drukują się bez podpór. Mniejsza komora = wyższy dźwięk.',
    params: [n('D', 'Średnica komory', 14, 10, 24, 0.5)],
    build: whistle,
  },
  {
    type: 'ticTacToe', label: 'Kółko i krzyżyk', category: 'useful', hole: false,
    description: 'Plansza z wypukłymi liniami i po pięć krzyżyków i kółek. Pionki w dwóch kolorach drukuj osobno albo zmień filament.',
    params: [n('S', 'Bok planszy', 120, 60, 220)],
    build: ticTacToe,
  },
  {
    type: 'die', label: 'Kostka do gry', category: 'useful', hole: false,
    description: 'Klasyczna kostka z zaokrąglonymi krawędziami i oczkami (1 naprzeciw 6, 2 naprzeciw 5, 3 naprzeciw 4).',
    params: [n('S', 'Bok', 16, 8, 40)],
    build: die,
  },
];
