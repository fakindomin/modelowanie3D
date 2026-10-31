import type { Manifold } from 'manifold-3d';
import { M } from '../geom/manifold';
import type { Params, PartDef, PieceDef } from './def';
import { box, cyl, cylX, knurled, num, union } from './util';
import { compressionSpring, flatSpring, ring, sector, stroke, torsionSpring } from './springs';

type Pt = [number, number];

const piece = (value: string, label: string): PieceDef => ({ value, label, hole: false, body: 'new' });
const luz = (p: Params) => num(p, 'luz');

// ------------------------------------------------------------------ push button

/** Sizes of the push button, shared by its pieces. */
function buttonLayout(p: Params) {
  const D = num(p, 'D'), s = num(p, 's'), t = num(p, 't'), g = luz(p);
  const df = D + 3, di = df + 2 * g, Ro = di / 2 + t, tb = 1.6;
  const sw = 1.2, n = 4;
  const sD = di - 0.6, sL = sw + n * sw + s + 0.6 * n;
  const fh = 1.6, zf = tb + sL, zr = zf + fh, rt = 1.6;
  return { D, s, t, g, df, di, Ro, tb, sw, n, sD, sL, fh, zf, zr, rt, top: zr + rt + num(p, 'hc'), boss: (sD - 2 * sw) / 2 - 0.4 };
}

function buttonPiece(p: Params): Manifold {
  const L = buttonLayout(p);
  switch (p.piece) {
    case 'key': {
      let m = union([cyl(L.fh, L.df / 2).translate([0, 0, L.zf]), cyl(L.top - L.zf, L.D / 2).translate([0, 0, L.zf]), cyl(1.5, L.boss, L.boss - 0.3).rotate([180, 0, 0]).translate([0, 0, L.zf + 0.01])]);
      // A stem down to the microswitch, which it reaches 0,5 mm before the end of the travel.
      if (p.tact) m = m.add(cyl(L.zf - (L.tb - 0.5 + L.s) + 0.01, 1.5).translate([0, 0, L.tb - 0.5 + L.s]));
      return m;
    }
    case 'spring':
      return compressionSpring(L.sD, L.sw, L.sw, L.n, L.sL, true).translate([0, 0, L.tb]);
    case 'ring':
      // Top ring holding the key in, with a skirt over the housing so it centres itself.
      return union([ring(L.D / 2 + L.g, L.Ro + L.g + 1.2, L.rt, L.zr), ring(L.Ro + L.g, L.Ro + L.g + 1.2, 2.5, L.zr - 2.5)]);
    default: {
      let m = cyl(L.zr, L.Ro).subtract(cyl(L.zr, L.di / 2).translate([0, 0, L.tb]));
      m = m.add(ring(Math.max(0.5, L.boss - 1.6), L.boss, 1.5, L.tb - 0.01));
      if (p.tact) m = m.subtract(box(-3.1, -3.1, -1, 3.1, 3.1, L.tb + 1));
      return m;
    }
  }
}

// ------------------------------------------------------------------ clicker

function clicker(p: Params): Manifold {
  const L = num(p, 'L'), W = num(p, 'W'), H = num(p, 'H'), t = num(p, 't'), sag = num(p, 'sag');
  const post = 3, beam = 2.5;
  const C = M().CrossSection;
  const frame = C.union([
    C.square([L, beam]).translate([-L / 2, -W / 2]),
    C.square([post, W]).translate([-L / 2, -W / 2]),
    C.square([post, W]).translate([L / 2 - post, -W / 2]),
  ]);
  // Clamped arch in the shape of its first buckling mode: it snaps through to the mirror shape and back.
  const xa = -L / 2 + post - 0.4, xb = L / 2 - post + 0.4, span = xb - xa;
  const y0 = W / 2 - 1.5 - sag - 1.5;
  const pts: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = xa + (span * i) / 40;
    pts.push([x, y0 + (sag * (1 - Math.cos((2 * Math.PI * (x - xa)) / span))) / 2]);
  }
  const pad = C.square([4, 1.5]).translate([-2, y0 + sag + t / 2 - 0.2]);
  return C.union([frame, stroke(pts, t / 2), pad]).extrude(H);
}

// ------------------------------------------------------------------ push-push latch

/**
 * Track of the pin in the slider's frame (v towards the back, where the slider is pushed).
 * At rest the pin is at P0; a push takes it up the right side, letting go drops it into the
 * notch C (latched), the next push sends it left over the wedge and it comes back down to P0.
 */
const PP_TRACK: Pt[] = [
  [0, 0],
  [2.4, 3.2],
  [2.6, 9.6],
  [-0.6, 6.8],
  [-2.8, 9.6],
  [-2.8, 4.2],
  [0, 0],
];
const PP_PIN = 1.6;

function pushPushLayout(p: Params) {
  const ws = num(p, 'W'), hs = num(p, 'hs'), g = luz(p);
  const Ls = 34, Lsp = 22, wall = 2.5, back = 3, floor = 2;
  const Lb = back + Lsp + Ls - 5;
  const y0 = -Lb / 2;
  const ysb = y0 + back + Lsp; // slider's back end at rest
  const vP0 = 6; // track start from the slider's back end
  return { ws, hs, g, Ls, Lsp, wall, back, floor, Lb, y0, ysb, vP0, zt: floor + hs };
}

function pushPushPiece(p: Params): Manifold {
  const L = pushPushLayout(p);
  const xw = L.ws / 2 + L.g;
  switch (p.piece) {
    case 'slider': {
      // Pushing moves the slider back (−Y), so the fixed pin runs forward (+Y) along the track.
      const tr = PP_TRACK.map(([u, v]) => [u, L.ysb + L.vP0 + v] as Pt);
      const groove = stroke(tr, PP_PIN / 2 + 0.3).extrude(1.6).translate([0, 0, L.zt - 1.3]);
      const bar = box(-L.ws / 2, L.ysb, L.floor + 0.2, L.ws / 2, L.ysb + L.Ls, L.zt);
      return bar.subtract(groove);
    }
    case 'spring':
      return flatSpring(L.Lsp, L.ws - 1, 6, 1.2, L.hs - 0.4, false, true)
        .rotate([0, 0, 90])
        .translate([0, L.y0 + L.back + L.Lsp / 2, L.floor + 0.2]);
    default: {
      const W = 2 * (xw + L.wall);
      const parts = [
        box(-W / 2, L.y0, 0, W / 2, -L.y0, L.floor),
        box(-W / 2, L.y0, L.floor, -xw, -L.y0, L.zt + L.g + 1.2),
        box(xw, L.y0, L.floor, W / 2, -L.y0, L.zt + L.g + 1.2),
        box(-W / 2, L.y0, L.floor, W / 2, L.y0 + L.back, L.zt + L.g + 4),
        // Lips over the slider's edges, near the front where the arm doesn't pass.
        box(-W / 2, -L.y0 - 8, L.zt + L.g, -L.ws / 2 + 1.5, -L.y0, L.zt + L.g + 1.2),
        box(L.ws / 2 - 1.5, -L.y0 - 8, L.zt + L.g, W / 2, -L.y0, L.zt + L.g + 1.2),
      ];
      // Springy arm from the back wall to the pin, which rides in the slider's track at rest point P0.
      const yPin = L.ysb + L.vP0;
      const za = L.zt + L.g + 0.3;
      parts.push(box(-0.5, L.y0 + 1, za, 0.5, yPin + 1, za + 2.5));
      parts.push(box(-2, L.y0 + 1, za, 2, L.y0 + L.back, za + 2.5));
      parts.push(cyl(za - (L.zt - 1.0) + 0.5, PP_PIN / 2, PP_PIN / 2, 16).translate([0, yPin, L.zt - 1.0]));
      return union(parts);
    }
  }
}

// ------------------------------------------------------------------ detent knob

function detentLayout(p: Params) {
  const D = num(p, 'D'), H = num(p, 'H'), g = luz(p);
  const N = Math.max(4, Math.round(360 / num(p, 'step')));
  const Rr = D / 2 - 1, Rb = D / 2 + 3, tb = 3, hr = 5;
  return { D, H, g, N, Rr, Rb, tb, hr, rk: Rr - g, z0: tb + 0.3, top: tb + 0.3 + H };
}

function detentPiece(p: Params): Manifold {
  const L = detentLayout(p);
  const C = M().CrossSection;
  if (p.piece === 'knob') {
    const { rk } = L;
    // Lower disc with two springy arms round its rim, each with a bump at its free end.
    let low = C.circle(rk, 96);
    // Bumps stand on notches, so the assembled knob sits in a click.
    const st = 360 / L.N;
    const tip = Math.round(100 / st) * st;
    const arms: number[] = [0, Math.round(180 / st) * st];
    for (const a of arms) {
      low = low.subtract(sector(rk - 2.8, rk - 1.3, a, a + tip + 8));
      low = low.subtract(sector(rk - 2.8, rk + 1, a + tip + 6, a + tip + 6 + (1.2 / rk) * (180 / Math.PI)));
    }
    const bumps = arms.map((a) => {
      const r = (a + tip) * (Math.PI / 180);
      return C.circle(0.9, 16).translate([rk * Math.cos(r), rk * Math.sin(r)]);
    });
    low = C.union([low, ...bumps]);
    const grip = knurled(L.D, L.H - L.hr).translate([0, 0, L.z0 + L.hr]);
    let m = union([low.extrude(L.hr).translate([0, 0, L.z0]), grip]);
    // Pointer on top, bore round the axle, recess for a screw and washer.
    m = m.subtract(box(-0.6, L.D / 2 - 5, L.top - 0.8, 0.6, L.D / 2 + 1, L.top + 1));
    m = m.subtract(cyl(L.H + 2, 3.25).translate([0, 0, L.z0 - 1]));
    m = m.subtract(cyl(4, 5).translate([0, 0, L.top - 3]));
    return m;
  }
  // Base: plate, ring with V notches on its inside and a hollow axle for an M3 screw.
  let r = C.circle(L.Rb, 96).subtract(C.circle(L.Rr, 96));
  const notch = C.ofPolygons([[[L.Rr - 0.2, -1.2], [L.Rr + 1.0, 0], [L.Rr - 0.2, 1.2]]]);
  r = r.subtract(C.union(Array.from({ length: L.N }, (_, i) => notch.rotate((360 * i) / L.N))));
  const axleTop = L.top - 3 + 0.3;
  return union([cyl(L.tb, L.Rb, L.Rb, 96), r.extrude(L.hr).translate([0, 0, L.tb - 0.01]), ring(1.3, 3, axleTop - L.tb + 0.01, L.tb - 0.01)]).subtract(cyl(L.tb + 2, 1.3).translate([0, 0, -1]));
}

// ------------------------------------------------------------------ spring latch

function latchLayout(p: Params) {
  const bw = num(p, 'bw'), bh = num(p, 'bh'), bl = num(p, 'bl'), s = num(p, 's'), g = luz(p);
  const Lsp = 2 * s + 8, back = 3, floor = 2, wall = 2.5, pd = 5;
  const Lh = back + Lsp + bl - s;
  const x0 = -Lh / 2;
  const xb = x0 + back + Lsp;
  const slot = s + pd + 0.6;
  const sx1 = Lh / 2 - 3, sx0 = sx1 - slot;
  const xp = sx1 - pd / 2 - 0.3;
  return { bw, bh, bl, s, g, Lsp, back, floor, wall, pd, Lh, x0, xb, slot, sx0, sx1, xp, zt: floor + bh + g };
}

function latchPiece(p: Params): Manifold {
  const L = latchLayout(p);
  const yw = L.bw / 2 + L.g, W = 2 * (yw + L.wall);
  switch (p.piece) {
    case 'bolt': {
      let b = box(L.xb, -L.bw / 2, L.floor + 0.2, L.xb + L.bl, L.bw / 2, L.floor + 0.2 + L.bh - 0.2);
      // Slanted front: a closing door pushes the bolt in by itself.
      const ch = Math.min(L.bw * 0.8, L.s);
      const C = M().CrossSection;
      const cut = C.ofPolygons([[[L.xb + L.bl - ch, -L.bw / 2 - 1], [L.xb + L.bl + 1, -L.bw / 2 - 1], [L.xb + L.bl + 1, L.bw / 2 - L.bw * 0.15]]]).extrude(L.bh + 2).translate([0, 0, L.floor - 1]);
      b = b.subtract(cut);
      return b.add(cyl(L.zt + 2 + 5 - (L.floor + L.bh - 0.5), L.pd / 2, L.pd / 2, 24).translate([L.xp, 0, L.floor + L.bh - 0.5]));
    }
    case 'spring':
      return flatSpring(L.Lsp, L.bw - 1, 5, 1.2, L.bh - 0.6, false, true).translate([L.x0 + L.back + L.Lsp / 2, 0, L.floor + 0.2]);
    default: {
      const parts = [
        box(L.x0, -W / 2 - 6, 0, -L.x0, W / 2 + 6, L.floor),
        box(L.x0, -W / 2, L.floor, -L.x0, -yw, L.zt),
        box(L.x0, yw, L.floor, -L.x0, W / 2, L.zt),
        box(L.x0, -W / 2, L.floor, L.x0 + L.back, W / 2, L.zt),
        // Strap over the bolt with a slot for the handle.
        box(L.sx0 - 2, -W / 2, L.zt, L.sx1 + 2, W / 2, L.zt + 2).subtract(box(L.sx0, -(L.pd / 2 + 0.3), L.zt - 1, L.sx1, L.pd / 2 + 0.3, L.zt + 3)),
      ];
      let m = union(parts);
      // Screw holes in the flanges.
      for (const x of [L.x0 + 5, -L.x0 - 5]) for (const y of [-W / 2 - 3, W / 2 + 3]) m = m.subtract(cyl(L.floor + 2, 1.7).translate([x, y, -1]));
      return m;
    }
  }
}

// ------------------------------------------------------------------ spring clip

function clampClip(p: Params): Manifold {
  const L = num(p, 'L'), H = num(p, 'H'), t = num(p, 't'), lt = num(p, 'lt'), R = num(p, 'R'), gap = num(p, 'gap');
  const xc = -L / 2 + R;
  const tipY = gap / 2 + t / 2;
  const arc: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 24;
    arc.push([xc + R * Math.cos(a), R * Math.sin(a)]);
  }
  // From the upper jaw's tip round the loop to the lower tip; flared ends lead the edge in.
  const upper: Pt[] = [[L / 2 + 3, tipY + 2], [L / 2, tipY], [xc + R * 0.4, R - t / 2 + lt / 2]];
  const lower: Pt[] = upper.map(([x, y]) => [x, -y] as Pt).reverse();
  const C = M().CrossSection;
  const cs = C.union([stroke(upper, t / 2), stroke([[xc + R * 0.4, R - t / 2 + lt / 2], [xc, R]], t / 2, lt / 2), stroke(arc, lt / 2), stroke([[xc, -R], [xc + R * 0.4, -(R - t / 2 + lt / 2)]], lt / 2, t / 2), stroke(lower, t / 2)]);
  return cs.extrude(H);
}

// ------------------------------------------------------------------ self-closing hinge

function shLayout(p: Params) {
  const L = num(p, 'L'), R = num(p, 'D') / 2, T = num(p, 'T'), g = luz(p), pin = num(p, 'pin');
  const hw = 1.2, n = 3, sGap = 0.6;
  const ls = n * (hw + sGap) + hw;
  const gs = ls + 0.8;
  const k = (L - gs - 4 * g) / 4;
  const xs = [-L / 2, -L / 2 + k, -L / 2 + k + g, -gs / 2 - g, gs / 2 + g, L / 2 - k - g, L / 2 - k, L / 2];
  return { L, R, T, g, pin, hw, n, sGap, ls, gs, k, xs, theta: 180 - num(p, 'ang') };
}

/** Turns a piece drawn as if the hinge were open flat (180°) into B's pose about the axis. */
const poseB = (m: Manifold, R: number, theta: number) => m.translate([0, 0, -R]).rotate([theta, 0, 0]).translate([0, 0, R]);

function shPiece(p: Params): Manifold {
  const S = shLayout(p);
  const { R, T, g, xs } = S;
  const knuckle = (x0: number, x1: number, r = R) => cylX(x0, x1, r, 0, R);
  const aRanges: [number, number][] = [[xs[0], xs[1]], [xs[6], xs[7]]];
  const bRanges: [number, number][] = [[xs[2], xs[3]], [xs[4], xs[5]]];
  const gapR: [number, number] = [xs[3] + g, xs[4] - g];
  const hole = () => cylX(-S.L / 2 - 1, S.L / 2 + 1, S.pin / 2 + 0.15, 0, R);
  const legY = (h: number) => Math.max(R + 2, h * 0.6);
  const clear = (rs: [number, number][]) => union(rs.map(([a, b]) => knuckle(a - g, b + g, R + g + 0.01)));
  if (p.piece === 'spring') {
    // Coil on the pin in the middle gap, legs lying on the inner faces of the leaves with pegs in their holes.
    const ri = S.pin / 2 + 0.5, w = Math.max(0.8, R - ri);
    const coilM = torsionSpring(2 * R, w, S.hw, S.n, S.sGap, 0, 0.1);
    let m = coilM.translate([0, 0, -S.ls / 2]).rotate([0, 90, 0]).translate([0, 0, R]);
    m = m.add(ring(ri, R, S.hw).rotate([0, 90, 0]).translate([-S.ls / 2, 0, R]));
    m = m.add(ring(ri, R, S.hw).rotate([0, 90, 0]).translate([S.ls / 2 - S.hw, 0, R]));
    const leg = (x0: number, h: number) =>
      union([box(x0, -legY(h) - 1.2, T, x0 + S.hw + 0.6, -(R - 0.6), T + 1.6), cyl(T + 0.01, 0.9, 0.9, 16).translate([x0 + (S.hw + 0.6) / 2, -legY(h), 0.3])]);
    const legA = leg(-S.ls / 2, num(p, 'hA'));
    // Leg B is leg A's mirror on leaf B (lying flat on the other side), then turned with B.
    const legB = poseB(leg(S.ls / 2 - S.hw - 0.6, num(p, 'hB')).mirror([0, 1, 0]), R, S.theta);
    return union([m, legA, legB]);
  }
  const isA = p.piece !== 'B';
  const h = num(p, isA ? 'hA' : 'hB');
  const mine = isA ? aRanges : bRanges, theirs = isA ? bRanges : aRanges;
  let m = union([box(-S.L / 2, -h, 0, S.L / 2, 0, T), ...mine.map(([a, b]) => knuckle(a, b))]);
  m = m.subtract(clear(theirs)).subtract(knuckle(gapR[0] - g, gapR[1] + g, R + g + 0.01)).subtract(hole());
  const x = isA ? -S.ls / 2 + (S.hw + 0.6) / 2 : S.ls / 2 - (S.hw + 0.6) / 2;
  m = m.subtract(cyl(T + 2, 1.15, 1.15, 16).translate([x, -legY(h), -1]));
  return isA ? m : poseB(m.mirror([0, 1, 0]), R, S.theta);
}

// ------------------------------------------------------------------ definitions

const luzParam = (def = 0.3) => ({ key: 'luz', label: 'Luz', type: 'number' as const, def, min: 0.1, max: 1, step: 0.05, unit: 'mm', hint: 'Odstęp między częściami, które się przesuwają albo obracają.' });

export const SPRING_MECH_DEFS: PartDef[] = [
  {
    type: 'pushButton',
    label: 'Przycisk ze sprężyną',
    category: 'ready',
    hole: false,
    description: 'Klawisz, sprężyna, obudowa i pierścień, który trzyma klawisz w środku. Z opcją otworu na mikrostyk 6 × 6 mm od spodu (Arduino, Raspberry Pi).',
    pieces: [piece('housing', 'obudowa'), piece('key', 'klawisz'), piece('spring', 'sprężyna'), piece('ring', 'pierścień')],
    params: [
      { key: 'D', label: 'Średnica klawisza', type: 'number', def: 12, min: 5, max: 60, step: 0.5, unit: 'mm' },
      { key: 's', label: 'Skok', type: 'number', def: 3, min: 0.5, max: 20, step: 0.5, unit: 'mm' },
      { key: 'hc', label: 'Klawisz wystaje o', type: 'number', def: 4, min: 1, max: 30, step: 0.5, unit: 'mm' },
      { key: 't', label: 'Ścianka obudowy', type: 'number', def: 1.6, min: 0.8, max: 6, step: 0.2, unit: 'mm' },
      { key: 'tact', label: 'Otwór na mikrostyk 6 × 6', type: 'bool', def: false },
      luzParam(),
    ],
    build: (p) => buttonPiece(p),
  },
  {
    type: 'clicker',
    label: 'Clicker (klikająca blaszka)',
    category: 'ready',
    hole: false,
    description: 'Cienka wygięta blaszka w ramce: naciśnięta przeskakuje z kliknięciem na drugą stronę, naciśnięta od tyłu wraca. Drukuj na płasko, najlepiej z PETG.',
    params: [
      { key: 'L', label: 'Długość', type: 'number', def: 30, min: 15, max: 100, step: 0.5, unit: 'mm' },
      { key: 'W', label: 'Szerokość', type: 'number', def: 12, min: 8, max: 50, step: 0.5, unit: 'mm' },
      { key: 'H', label: 'Wysokość', type: 'number', def: 5, min: 1, max: 30, step: 0.5, unit: 'mm' },
      { key: 't', label: 'Grubość blaszki', type: 'number', def: 0.6, min: 0.4, max: 2, step: 0.05, unit: 'mm', hint: 'Klika, gdy ugięcie jest co najmniej 2,5 × większe od grubości.' },
      { key: 'sag', label: 'Ugięcie blaszki', type: 'number', def: 1.5, min: 0.5, max: 8, step: 0.1, unit: 'mm' },
    ],
    build: (p) => clicker(p),
  },
  {
    type: 'pushPush',
    label: 'Mechanizm długopisowy (naciśnij-naciśnij)',
    category: 'ready',
    hole: false,
    description: 'Naciśnij raz: suwak zostaje wciśnięty. Naciśnij drugi raz: sprężyna go wypycha. Kołek na sprężystym ramieniu jedzie po torze w kształcie serca. Do szuflad i klapek otwieranych naciśnięciem. Próbny: wydrukuj go najpierw osobno.',
    pieces: [piece('base', 'podstawa z ramieniem'), piece('slider', 'suwak'), piece('spring', 'sprężyna')],
    params: [
      { key: 'W', label: 'Szerokość suwaka', type: 'number', def: 12, min: 10, max: 30, step: 0.5, unit: 'mm' },
      { key: 'hs', label: 'Grubość suwaka', type: 'number', def: 4, min: 3, max: 15, step: 0.5, unit: 'mm' },
      luzParam(),
    ],
    build: (p) => pushPushPiece(p),
  },
  {
    type: 'detentKnob',
    label: 'Pokrętło z zapadkami',
    category: 'ready',
    hole: false,
    description: 'Pokrętło klika co wybrany kąt: dwa sprężyste ramiona z ząbkami wskakują w wycięcia podstawy. Trzyma je śruba M3 z podkładką.',
    pieces: [piece('base', 'podstawa'), piece('knob', 'pokrętło')],
    params: [
      { key: 'D', label: 'Średnica pokrętła', type: 'number', def: 30, min: 16, max: 100, step: 0.5, unit: 'mm' },
      { key: 'H', label: 'Wysokość pokrętła', type: 'number', def: 14, min: 9, max: 60, step: 0.5, unit: 'mm' },
      { key: 'step', label: 'Klik co', type: 'number', def: 15, min: 5, max: 90, step: 1, unit: '°' },
      luzParam(0.3),
    ],
    build: (p) => detentPiece(p),
  },
  {
    type: 'springLatch',
    label: 'Zasuwka sprężynowa',
    category: 'ready',
    hole: false,
    description: 'Rygiel ze ściętym czołem: zamykane drzwiczki same go wciskają, a sprężyna wypycha z powrotem. Odciągasz go za trzpień. Obudowa przykręcana 4 wkrętami.',
    pieces: [piece('housing', 'obudowa'), piece('bolt', 'rygiel'), piece('spring', 'sprężyna')],
    params: [
      { key: 'bw', label: 'Szerokość rygla', type: 'number', def: 8, min: 4, max: 30, step: 0.5, unit: 'mm' },
      { key: 'bh', label: 'Wysokość rygla', type: 'number', def: 5, min: 3, max: 20, step: 0.5, unit: 'mm' },
      { key: 'bl', label: 'Długość rygla', type: 'number', def: 30, min: 15, max: 100, step: 0.5, unit: 'mm' },
      { key: 's', label: 'Wysuw', type: 'number', def: 8, min: 2, max: 30, step: 0.5, unit: 'mm' },
      luzParam(),
    ],
    build: (p) => latchPiece(p),
  },
  {
    type: 'clampClip',
    label: 'Klamerka (zacisk sprężysty)',
    category: 'ready',
    hole: false,
    description: 'Jednoczęściowa klamerka: dwie szczęki i pętla, która działa jak sprężyna. Wsuwasz krawędź między rozchylone końce i szczęki ją ściskają. Z PETG trzyma długo, z PLA słabnie.',
    params: [
      { key: 'L', label: 'Długość', type: 'number', def: 40, min: 15, max: 200, step: 0.5, unit: 'mm' },
      { key: 'H', label: 'Szerokość', type: 'number', def: 8, min: 2, max: 50, step: 0.5, unit: 'mm' },
      { key: 'R', label: 'Promień pętli', type: 'number', def: 6, min: 3, max: 30, step: 0.5, unit: 'mm' },
      { key: 't', label: 'Grubość szczęk', type: 'number', def: 2.4, min: 1, max: 8, step: 0.1, unit: 'mm' },
      { key: 'lt', label: 'Grubość pętli', type: 'number', def: 1.4, min: 0.6, max: 5, step: 0.1, unit: 'mm', hint: 'Cieńsza pętla = słabszy docisk.' },
      { key: 'gap', label: 'Szczelina między szczękami', type: 'number', def: 0.4, min: 0.2, max: 20, step: 0.1, unit: 'mm' },
    ],
    build: (p) => clampClip(p),
  },
  {
    type: 'springHinge',
    label: 'Klapka samozamykająca',
    category: 'ready',
    hole: false,
    description: 'Zawias na bolcu (Ø 3 mm, np. kawałek filamentu albo śruba M3) ze sprężyną skrętną w środku. Ramiona sprężyny wchodzą kołkami w otwory skrzydełek. Otwarta klapka wraca do kąta, w którym sprężyna jest luźna.',
    pieces: [piece('A', 'skrzydełko A'), piece('B', 'skrzydełko B'), piece('spring', 'sprężyna')],
    params: [
      { key: 'L', label: 'Długość zawiasu', type: 'number', def: 44, min: 25, max: 300, step: 0.5, unit: 'mm' },
      { key: 'D', label: 'Średnica oczek', type: 'number', def: 9, min: 6, max: 30, step: 0.5, unit: 'mm' },
      { key: 'T', label: 'Grubość skrzydełek', type: 'number', def: 2.5, min: 1.5, max: 10, step: 0.1, unit: 'mm' },
      { key: 'hA', label: 'Szerokość skrzydełka A', type: 'number', def: 20, min: 8, max: 200, step: 0.5, unit: 'mm' },
      { key: 'hB', label: 'Szerokość skrzydełka B', type: 'number', def: 20, min: 8, max: 200, step: 0.5, unit: 'mm' },
      { key: 'ang', label: 'Kąt spoczynku', type: 'number', def: 20, min: 0, max: 170, step: 5, unit: '°', hint: '0° = klapka zamknięta. Małe kąty mocniej domykają.' },
      { key: 'pin', label: 'Średnica bolca', type: 'number', def: 3, min: 1.5, max: 10, step: 0.1, unit: 'mm' },
      luzParam(0.35),
    ],
    build: (p) => shPiece(p),
  },
];
