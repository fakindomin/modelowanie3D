import type { CrossSection, Manifold } from 'manifold-3d';
import { M, settle } from '../geom/manifold';
import type { ParamDef, Params, PartDef } from './def';
import { box, cyl, hex, knurled, num, select, union } from './util';
import { type P2, adv, arc, ccw, count, csHole, hookPlate, n, nv, onSide, screwOf, screwParams, stroke } from './useful';

/**
 * Second batch of everyday things: cables and desk, furniture and DIY, workshop.
 * Same rules as useful.ts: sized from what the user measures, printed without supports as built.
 */

const C = () => M().CrossSection;
const ring = (ro: number, ri: number, seg = 48) => C().circle(ro, seg).subtract(C().circle(ri, seg));
/** Side-by-side layout of separate pieces along X, each on the bed. */
function row(ms: Manifold[], gap = 5): Manifold {
  let x = 0;
  const out: Manifold[] = [];
  for (const m of ms) {
    const b = settle(m).boundingBox();
    out.push(settle(m).translate([x - b.min[0], 0, 0]));
    x += b.max[0] - b.min[0] + gap;
  }
  return settle(union(out));
}
/** Metric nut across flats and height, and screw clearance. */
const NUT: Record<string, { af: number; h: number; head: number; headH: number }> = {
  '3': { af: 5.5, h: 2.4, head: 5.5, headH: 3 },
  '4': { af: 7, h: 3.2, head: 7, headH: 4 },
  '5': { af: 8, h: 4, head: 8.5, headH: 5 },
  '6': { af: 10, h: 5, head: 10, headH: 6 },
  '8': { af: 13, h: 6.5, head: 13, headH: 8 },
  '10': { af: 17, h: 8, head: 16, headH: 10 },
};
const msel = (def = '4', keys = ['3', '4', '5', '6', '8']) => select('M', 'Śruba', def, keys.map((k) => [k, `M${k}`] as [string, string]));

// ================================================================== cables and desk
/** Comb holder: a row of slots for a wire bundle, each narrowed at the top so the wire snaps in. */
function cableComb(p: Params) {
  const k = Math.max(1, Math.round(num(p, 'N'))), d = num(p, 'd') + 0.3, W = num(p, 'W'), t = nv(p, 'wall', 2.2), base = nv(p, 'base', 3);
  const pitch = d + t, L = k * pitch + t, flange = 9, H = base + d + d * 0.35 + 1.5;
  let prof = C().square([L, H]);
  const e = d * 0.72;
  for (let i = 0; i < k; i++) {
    const x = t + d / 2 + i * pitch, b = base, top = b + d;
    // Wider pocket, then 45° narrowing to the entry: the teeth snap round the wire.
    prof = prof.subtract(ccw([[x - d / 2, b], [x + d / 2, b], [x + d / 2, top], [x + e / 2, top + (d - e) / 2], [x + e / 2, H + 1], [x - e / 2, H + 1], [x - e / 2, top + (d - e) / 2], [x - d / 2, top]]));
  }
  // Comb standing up (profile in X/Z), flanges with screw holes at both ends on the bed.
  let m = prof.extrude(W).rotate([90, 0, 0]).translate([flange, W, 0]);
  m = m.add(box(0, 0, 0, L + 2 * flange, W, base));
  const sd = screwOf(p);
  if (sd) for (const x of [flange / 2, L + flange * 1.5]) m = m.subtract(csHole(x, W / 2, base, sd));
  return settle(m);
}

/** Adhesive clip with a latch: a flexible arm over the cable whose tip snaps behind a bead on a post. */
function cableLatch(p: Params) {
  const d = num(p, 'd') + 0.4, W = num(p, 'W'), t = nv(p, 'arm', 1.3), base = nv(p, 'base', 2.4);
  const R = d / 2 + t / 2, cx = R + t / 2 + 3, cy = base + d / 2;
  const tipY = cy - d * 0.2;
  const arm = stroke([[cx - R, base - 0.2], [cx - R, cy], ...arc(cx, cy, R, 180, 0, 18).slice(1), [cx + R, tipY]], t);
  // The tip turns out into a small foot; a lip on the post closes over it (0.45 mm gap): it clicks in.
  const foot = stroke([[cx + R, tipY], [cx + R + 1.6, tipY]], t);
  const xp = cx + R + 1.6 + t / 2 + 0.45;
  const lipY = tipY + t / 2 + 0.45;
  const post = C().square([2, lipY + 1.2]).translate([xp, 0]);
  const lip = C().square([xp + 2 - (cx + R + t / 2 + 0.45), 1.2]).translate([cx + R + t / 2 + 0.45, lipY]);
  const L = xp + 2 + 3;
  const cs = C().union([C().square([L, base]), arm, foot, post, lip]);
  return settle(onSide(cs, W));
}

/** Desk-edge clip: a C on the desk top's edge and cable rings under it (printed on its side). */
function deskEdgeClip(p: Params) {
  const T = num(p, 'T') - nv(p, 'press', 0.3), A = num(p, 'A'), t = nv(p, 't', 3), w = num(p, 'W'), k = Math.max(1, Math.round(num(p, 'N'))), d = num(p, 'd') + 0.3;
  const drop = A * Math.tan((nv(p, 'grip', 2) * Math.PI) / 180);
  // The upper arm leans 2° down: it grips the desk top.
  const c = stroke([[A, T + t / 2 - drop], [0, T + t / 2], [0, -t / 2], [A, -t / 2]], t);
  const parts: CrossSection[] = [c];
  const pitch = d + 2 * 1.6 + 1;
  for (let i = 0; i < k; i++) {
    const x = 2 + d / 2 + i * pitch, y = -t - d / 2 + 0.4;
    parts.push(ring(d / 2 + 1.6, d / 2).subtract(C().square([d * 0.7, d], true).translate([0, -d / 2 - 0.8])).translate([x, y]));
  }
  return settle(onSide(C().union(parts), w));
}

/** 90° corner of a cable duct lying on the desk or wall, with a snap-on lid. */
function cableCorner(p: Params) {
  const Wi = num(p, 'W'), Hi = num(p, 'H'), A = num(p, 'A'), t = nv(p, 'wall', 1.6);
  const Wo = Wi + 2 * t;
  const L = (w: number, o: number) => C().union([C().square([A - o, w]).translate([o, o]), C().square([w, A - o]).translate([o, o])]);
  let body = L(Wo, 0).extrude(Hi + t).subtract(L(Wi, t).extrude(Hi + 1).translate([0, 0, t]));
  const parts = [body];
  if (p.lid !== false) {
    const plate = L(Wo, 0).extrude(1.2);
    const g = 0.15;
    const lipOut = L(Wi - 2 * g, t + g), lipIn = L(Wi - 2 * g - 2, t + g + 1);
    const lip = lipOut.subtract(lipIn).extrude(3).translate([0, 0, 1.2]);
    parts.push(plate.add(lip).translate([A + 5, 0, 0]));
  }
  return settle(union(parts));
}

/** Clip for a skirting board: a thin tongue behind the board and a cable ring on top. */
function baseboardClip(p: Params) {
  const s = num(p, 'gap'), D = num(p, 'D'), B = num(p, 'B'), d = num(p, 'd') + 0.3, w = num(p, 'W');
  const tongue = C().square([s, D]).translate([0, -D]);
  const cap = stroke([[s / 2, 0.6], [s + B + 1.2, 0.6], [s + B + 1.2, -4]], 1.2);
  const r = ring(d / 2 + 1.4, d / 2).subtract(C().square([d * 0.7, d], true).translate([d / 2 + 0.7, d / 2 + 0.7])).translate([s + d / 2 + 1.9, 1.2 + d / 2 + 0.6]);
  return settle(onSide(C().union([tongue, cap, r]), w));
}

/** Desk grommet: a sleeve with a flange and a lid with a cable notch, two pieces. */
function deskGrommet(p: Params) {
  const D = num(p, 'D'), T = num(p, 'T'), slot = num(p, 'slot'), wall = nv(p, 'wall', 2);
  const Ro = D / 2 - 0.3, Ri = Ro - wall, Rf = D / 2 + nv(p, 'rim', 6), f = nv(p, 'f', 2.4);
  const L = Math.min(T, 30);
  // Flange on the bed, sleeve up; a 2 mm seat inside the flange for the lid.
  let sleeve = cyl(f, Rf, Rf, 96).add(cyl(L, Ro, Ro, 96)).subtract(cyl(L + 2, Ri, Ri, 96).translate([0, 0, -1])).subtract(cyl(1.5, Ri + 1.5, Ri - 0.01, 96).translate([0, 0, -0.01]));
  // Lid: a 45° cone that sits in the sleeve's seat, a ring plug inside the sleeve.
  let lid = cyl(1.5, Ri + 1.3, Ri - 0.2, 96).add(cyl(5, Ri - 0.25, Ri - 0.25, 96).subtract(cyl(7, Ri - 1.65, Ri - 1.65, 96).translate([0, 0, -1])).translate([0, 0, 1.49]));
  lid = lid.subtract(box(Ri - slot - 1, -slot / 2, -1, Ri + 3, slot / 2, 10)).subtract(cyl(3, slot / 2, slot / 2, 32).translate([Ri - slot - 1, 0, -1]));
  // Sleeve is used flange up; printed flange down. Lid printed top down.
  return row([sleeve, lid], 6);
}

/** Print-in-place cable tie: a toothed strap and a head with a flexible pawl, flat on the bed. */
function zipTie(p: Params) {
  const w = num(p, 'W'), L = Math.max(60, Math.PI * num(p, 'D') + 40), th = nv(p, 'T', 1.4), tp = 1.2, tH = 0.6;
  const hw = w + 3.2;
  let m = box(0, -w / 2, 0, L, w / 2, th);
  // Teeth: vertical face towards the head, slope away from it.
  const teeth: Manifold[] = [];
  for (let x = 14; x < L - 12; x += tp) teeth.push(ccw([[x, 0], [x, tH], [x + tp, 0]]).extrude(w - 1).rotate([90, 0, 0]).translate([0, (w - 1) / 2, th - 0.01]));
  m = m.add(union(teeth));
  // Pointed tail for threading.
  m = m.subtract(ccw([[L - 10, w / 2 + 1], [L + 1, w / 2 + 1], [L + 1, -0.6]]).extrude(th + 2).translate([0, 0, -1])).subtract(ccw([[L - 10, -w / 2 - 1], [L + 1, -0.6], [L + 1, -w / 2 - 1]]).extrude(th + 2).translate([0, 0, -1]));
  // Head: hole along Z for the strap, pawl leaning down from its strap-side wall.
  const hx0 = -9, hx1 = 0, hz = 6;
  let head = box(hx0, -hw / 2, 0, hx1, hw / 2, hz);
  const h0 = -6.6, h1 = h0 + th + tH + 0.8;
  head = head.subtract(box(h0, -(w + 0.5) / 2, -1, h1, (w + 0.5) / 2, hz + 1));
  const pawl = ccw([[h1 + 0.01, 2.6], [h1 + 0.01, 3.8], [h1 - 1.35, 2.45], [h1 - 1.35, 1.25]]).extrude(w - 0.4).rotate([90, 0, 0]).translate([0, (w - 0.4) / 2, 0]);
  head = head.add(pawl);
  return settle(m.add(head));
}

/** Modular cable sleeve: C-shaped segments that snap over cables and plug into each other. */
function cableSleeve(p: Params) {
  const d = num(p, 'd'), Ls = num(p, 'L'), k = Math.max(1, Math.round(num(p, 'N'))), t = nv(p, 'wall', 1.6), spig = nv(p, 'spig', 6);
  const Ri = d / 2, Ro = Ri + t;
  // Segment upright: body, a 45° step inside, then a thinner spigot that goes into the next one.
  const sp = Ri - 0.15;
  const prof = ccw([[Ri, 0], [Ro, 0], [Ro, Ls], [sp, Ls], [sp, Ls + spig], [sp - t, Ls + spig], [sp - t, Ls], [Ri, Ls - t - 0.15]]);
  const seg = M().Manifold.revolve(prof, 64).subtract(box(-d * 0.275, 0, -1, d * 0.275, Ro + 2, Ls + 8));
  const segs: Manifold[] = [];
  const cols = Math.ceil(Math.sqrt(k));
  for (let i = 0; i < k; i++) segs.push(seg.translate([(i % cols) * (2 * Ro + 4), Math.floor(i / cols) * (2 * Ro + 4), 0]));
  return settle(union(segs));
}

// ================================================================== furniture and DIY
/** Furniture knob, built upside down (its top on the bed) with a nut pocket in the stem's end. */
function furnitureKnob(p: Params) {
  const D = num(p, 'D'), H = num(p, 'H'), s = NUT[String(p.M)] ?? NUT['4'], shape = String(p.shape || 'mushroom');
  const R = D / 2, rs = nv(p, 'stem', 0) > 0 ? nv(p, 'stem', 0) / 2 : Math.max(s.af * 0.75 + 2, D * 0.28);
  let prof: P2[];
  if (shape === 'cylinder') prof = [[0, 0], [R - 1, 0], [R, 1], [R, H - 1], [R - 1, H], [0, H]];
  else if (shape === 'cone') prof = [[0, 0], [R - 1, 0], [R, 1], [R, H * 0.3], [rs, H], [0, H]];
  else {
    // Mushroom: domed cap (printed top down), 45° underside into the stem.
    const capH = Math.max(6, H * 0.4), under = R - rs;
    prof = [[0, 0], [R * 0.7, 0], [R, capH * 0.5], [R, capH], [rs, capH + under], [rs, Math.max(H, capH + under + 4)], [0, Math.max(H, capH + under + 4)]];
  }
  let m = M().Manifold.revolve(ccw(prof), 96);
  const top = m.boundingBox().max[2];
  // Nut pocket and screw hole from the stem's end (towards the drawer front).
  m = m.subtract(hex(s.af + 0.3, s.h + 0.4).translate([0, 0, top - s.h - 0.39])).subtract(cyl(top, Number(p.M) / 2 + 0.25).translate([0, 0, top - Math.min(top - 2, 15)]));
  return settle(m);
}

/** Furniture handle: a bar on two legs, side profile printed on its side, pilot holes for M screws in the legs. */
function furnitureHandle(p: Params) {
  const c = num(p, 'c'), h = num(p, 'h'), w = num(p, 'W'), t = num(p, 'T'), Md = Number(p.M) || 4;
  const ext = num(p, 'ext');
  const r = Math.min(h * 0.5, 10);
  const Ra = (c * c / 4 + h * h) / (2 * h), cyA = h - Ra, deg = (a: number) => (a * 180) / Math.PI;
  const pts: P2[] = p.shape === 'arc'
    ? arc(c / 2, cyA, Ra, deg(Math.atan2(-cyA, -c / 2)), deg(Math.atan2(-cyA, c / 2)), 32)
    : [[0, 0], [0, h - r], ...arc(r, h - r, r, 180, 90, 6), [c - r, h], ...arc(c - r, h - r, r, 90, 0, 6), [c, 0]];
  let prof = stroke(pts, t);
  if (ext > 0) prof = prof.add(stroke([[-ext, h], [0, h]], t)).add(stroke([[c, h], [c + ext, h]], t));
  // Feet flat on the drawer front.
  prof = prof.add(C().square([t + 2, 3]).translate([-t / 2 - 1, -t / 2])).add(C().square([t + 2, 3]).translate([c - t / 2 - 1, -t / 2])).subtract(C().square([c + 2 * ext + 4 * t, t]).translate([-ext - 2 * t, -t / 2 - t]));
  let m = onSide(prof, w);
  for (const x of [0, c]) m = m.subtract(cyl(12, (Md - 0.6) / 2, (Md - 0.6) / 2, 24).rotate([-90, 0, 0]).translate([x, -t / 2 - 0.1, w / 2]));
  return settle(m);
}

/** Thumb knob: knurled, star or wing, with a pocket for a hex nut or a bolt head. */
function thumbKnob(p: Params) {
  const D = num(p, 'D'), H = num(p, 'H'), Mk = String(p.M), s = NUT[Mk] ?? NUT['6'], style = String(p.style || 'knurl');
  const M_ = Number(Mk);
  let m: Manifold;
  if (style === 'star') {
    const lobes = 6, r = D / 2, lr = r * 0.28;
    const cs = C().union([C().circle(r - lr * 0.9, 64), ...Array.from({ length: lobes }, (_, i) => C().circle(lr, 32).translate([(r - lr) * Math.cos((i * 2 * Math.PI) / lobes), (r - lr) * Math.sin((i * 2 * Math.PI) / lobes)]))]);
    m = cs.extrude(H);
  } else if (style === 'wing') {
    const hub = Math.max(s.af + 5, D * 0.35);
    m = cyl(H, hub / 2, hub / 2, 48);
    const wingH = Math.max(H * 2, D * 0.55);
    const wing = ccw([[hub / 2 - 1, 0], [D / 2, 0], [D / 2, wingH], [D / 2 - 4, wingH], [hub / 2 - 1, H + 2]]).extrude(3).rotate([90, 0, 0]).translate([0, 1.5, 0]);
    m = m.add(wing).add(wing.rotate([0, 0, 180]));
  } else m = knurled(D, H);
  // Pocket from the top (nut or bolt head), clearance hole through.
  const head = p.seat === 'head' ? cyl(s.headH + 0.4, s.head / 2 + 0.3, s.head / 2 + 0.3, 6) : hex(s.af + 0.3, s.h + 0.6);
  const ph = p.seat === 'head' ? s.headH + 0.4 : s.h + 0.6;
  m = m.subtract(head.translate([0, 0, H - ph + 0.01])).subtract(cyl(H + 2, M_ / 2 + 0.25).translate([0, 0, -1]));
  return settle(m);
}

/** Furniture foot: round or square, tapered, a recess for felt or rubber and a countersunk screw hole. */
function furnitureFoot(p: Params) {
  const D = num(p, 'D'), H = num(p, 'H'), taper = num(p, 'taper') / 100, pad = num(p, 'pad'), sd = num(p, 'screwD');
  const top = D * (1 - taper);
  // Built with the furniture side on the bed, the floor side (with the pad recess) on top.
  let m = p.shape === 'square' ? M().Manifold.hull([box(-D / 2, -D / 2, 0, D / 2, D / 2, 0.01), box(-top / 2, -top / 2, H - 0.01, top / 2, top / 2, H)]) : cyl(H, D / 2, top / 2, 96);
  if (pad > 0) m = m.subtract(p.shape === 'square' ? box(-top / 2 + 2, -top / 2 + 2, H - pad, top / 2 - 2, top / 2 - 2, H + 1) : cyl(pad + 1, top / 2 - 2, top / 2 - 2, 96).translate([0, 0, H - pad]));
  if (sd > 0) m = m.subtract(csHole(0, 0, H - pad, sd));
  return settle(m);
}

/** Corner reinforcement: an outer cap over a box corner (three walls) or an inner bracket with a gusset. */
function cornerGuard(p: Params) {
  const S = num(p, 'S'), t = num(p, 'T'), sd = screwOf(p);
  if (p.kind === 'inner') {
    const w = num(p, 'W');
    let m = box(0, 0, 0, S, w, t).add(box(0, 0, 0, t, w, S));
    // Gusset in the middle.
    m = m.add(ccw([[t - 0.01, t - 0.01], [S * 0.75, t - 0.01], [t - 0.01, S * 0.75]]).extrude(3).rotate([90, 0, 0]).translate([0, w / 2 + 1.5, 0]));
    if (sd) for (const y of [w * 0.22, w * 0.78]) {
      m = m.subtract(csHole(S * 0.62, y, t, sd));
      m = m.subtract(csHole(0, 0, t, sd).rotate([0, 90, 0]).translate([0, y, S * 0.62]));
    }
    return settle(m);
  }
  let m = box(0, 0, 0, S, S, S).subtract(box(t, t, t, S + 1, S + 1, S + 1));
  // Rounded outer corner edge.
  if (sd) {
    m = m.subtract(csHole(S * 0.6, S * 0.6, t, sd));
    m = m.subtract(csHole(0, 0, t, sd).rotate([0, -90, 0]).translate([t, S * 0.6, S * 0.6]));
    m = m.subtract(csHole(0, 0, t, sd).rotate([90, 0, 0]).translate([S * 0.6, t, S * 0.6]));
  }
  return settle(m);
}

/** Cap for a bought tube or profile: a plate and a hollow plug with crush ribs. */
function profileCap(p: Params) {
  const shape = String(p.shape || 'round'), s = num(p, 'wall'), P = num(p, 'P'), f = nv(p, 'f', 2.4);
  const A = num(p, 'A'), B = shape === 'rect' ? num(p, 'B') : A;
  const rib = nv(p, 'rib', 0.35), pw = nv(p, 'pw', 1.6);
  const outer = (w: number, h: number) => (shape === 'round' ? C().circle(w / 2, 96) : C().square([w, h], true));
  const iw = A - 2 * s - 0.3, ih = B - 2 * s - 0.3;
  // Plate with a small chamfer on its visible (bed) side.
  const m = M().Manifold.hull([outer(A + 0.4 - 1.2, B + 0.4 - 1.2).extrude(0.01), outer(A + 0.4, B + 0.4).extrude(f - 0.6).translate([0, 0, 0.6])]);
  let plug = outer(iw, ih).subtract(outer(iw - 2 * pw, ih - 2 * pw)).extrude(P);
  // Pointed ribs standing proud of the plug, tapered in at the tip so it starts easily.
  const ribs: Manifold[] = [];
  const pts: [number, number, number][] = shape === 'round'
    ? Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return [Math.cos(a) * iw / 2, Math.sin(a) * iw / 2, (a * 180) / Math.PI] as [number, number, number]; })
    : [[iw / 2, 0, 0], [-iw / 2, 0, 180], [0, ih / 2, 90], [0, -ih / 2, 270], [iw / 2, ih / 4, 0], [iw / 2, -ih / 4, 0], [-iw / 2, ih / 4, 180], [-iw / 2, -ih / 4, 180]];
  for (const [x, y, a] of pts) ribs.push(M().Manifold.hull([cyl(0.01, 0.6).translate([-0.6, 0, 0]), cyl(P - 3, 0.01).translate([rib, 0, 0]), cyl(0.01, 0.6).translate([-0.6, 0, P - 0.01])]).rotate([0, 0, a]).translate([x, y, 0]));
  plug = plug.add(union(ribs));
  return settle(m.add(plug.translate([0, 0, f - 0.01])));
}

/** Standoff / spacer: round or hex sleeve for an M screw. */
function standoff(p: Params) {
  const L = num(p, 'L'), Md = Number(p.M) || 3, D = Math.max(num(p, 'D'), Md + 2.4), k = Math.max(1, Math.round(num(p, 'N')));
  const body = p.shape === 'hex' ? hex(D, L) : cyl(L, D / 2, D / 2, 48);
  const hole = p.thread === true ? Md * 0.85 : Md + 0.3;
  const one = body.subtract(cyl(L + 2, hole / 2, hole / 2, 32).translate([0, 0, -1]));
  const ms: Manifold[] = [];
  const cols = Math.ceil(Math.sqrt(k));
  for (let i = 0; i < k; i++) ms.push(one.translate([(i % cols) * (D + 3), Math.floor(i / cols) * (D + 3), 0]));
  return settle(union(ms));
}

// ================================================================== workshop
/** Drilling jig: a block with guide holes and a fence against the board's edge or face. */
function drillGuide(p: Params) {
  const mode = String(p.mode || 'dowel'), t = nv(p, 'plate', 10), fence = nv(p, 'fence', 12), fw = nv(p, 'fw4', 4);
  let holes: { x: number; y: number; d: number }[] = [];
  let L = 0, W = 0;
  if (mode === 'dowel') {
    const T = num(p, 'T'), d = num(p, 'd') + 0.2, k = Math.max(1, Math.round(num(p, 'N'))), pitch = num(p, 'pitch');
    L = (k - 1) * pitch + 30;
    W = T + 0.4;
    // Fences on both sides of the board: the holes land in the middle of its edge.
    holes = Array.from({ length: k }, (_, i) => ({ x: 15 + i * pitch, y: W / 2, d }));
  } else if (mode === 'hinge') {
    const e = num(p, 'e');
    L = 70;
    W = e + 35 / 2 + 12;
    holes = [{ x: L / 2, y: e, d: 35.4 }, { x: L / 2 - 24, y: e + 9.5, d: 2.6 }, { x: L / 2 + 24, y: e + 9.5, d: 2.6 }];
  } else {
    const c = num(p, 'c'), e = num(p, 'e'), d = num(p, 'd') + 0.2;
    L = c + 30;
    W = e + 15;
    holes = [{ x: 15, y: e, d }, { x: 15 + c, y: e, d }];
  }
  let m = box(0, 0, 0, L, W, t);
  // Fence below the jig (towards the bed when printed, that is: printed jig upside down = fence up).
  m = m.add(box(0, -fw, 0, L, 0, t + fence));
  if (mode === 'dowel') m = m.add(box(0, W, 0, L, W + fw, t + fence));
  for (const h of holes) m = m.subtract(cyl(t + 2, h.d / 2, h.d / 2, 48).translate([h.x, h.y, -1]));
  return settle(m);
}

/** Spanner or socket made to a nut's size. */
function wrench(p: Params) {
  const af = num(p, 'af'), kind = String(p.kind || 'open'), t = num(p, 'T');
  const hexCs = (s: number) => C().circle(s / Math.sqrt(3), 6);
  if (kind === 'socket' || kind === 'bit') {
    const D = af / Math.cos(Math.PI / 6) + 5, H = Math.max(af * 1.2, 18);
    let m = cyl(H, D / 2, D / 2, 64).subtract(hexCs(af + 0.25).rotate(30).extrude(H * 0.55).translate([0, 0, H * 0.45 + 0.01]));
    // Bottom: 1/4" square drive or 1/4" hex bit shank.
    m = m.subtract(kind === 'socket' ? box(-3.25, -3.25, -1, 3.25, 3.25, H * 0.4) : hexCs(6.35 + 0.2).extrude(H * 0.4 + 1).translate([0, 0, -1]));
    return settle(m);
  }
  const L = num(p, 'L'), Rh = af * 0.95 + 4;
  let cs = stroke([[0, 0], [L, 0]], Math.max(af * 0.7, 10));
  cs = cs.add(C().circle(Rh, 64));
  if (kind === 'ring') cs = cs.subtract(C().circle(af / Math.sqrt(3) + 0.15, 12).rotate(15));
  else cs = cs.subtract(C().square([af + 0.3, Rh * 2 + 2]).translate([-(af + 0.3) / 2, 0]).add(hexCs(af + 0.3).rotate(30)).rotate(105));
  // Other end: ring of the same size.
  cs = cs.add(C().circle(Rh, 64).translate([L, 0])).subtract(C().circle(af / Math.sqrt(3) + 0.15, 12).rotate(15).translate([L, 0]));
  return settle(cs.extrude(t));
}

/** Rest for a soldering iron, heat gun or drill. */
function toolStand(p: Params) {
  const kind = String(p.kind || 'iron');
  if (kind === 'drill') {
    const gap = num(p, 'd'), hw = 14;
    const L = gap + 2 * hw + 24;
    return settle(hookPlate({ L, H: 60, T: 5, D: num(p, 'reach'), hookW: hw, tip: 12, screw: screwOf(p) }, [12 + hw / 2, L - 12 - hw / 2]));
  }
  const d = num(p, 'd'), W = num(p, 'W'), Lb = num(p, 'Lb');
  const base = nv(p, 'base', 6), hF = nv(p, 'hF', 15), hB = nv(p, 'hB', 0);
  let m = box(0, 0, 0, Lb, W, base);
  // Two forks with a 90° V notch, the back one higher: the tool lies tilted.
  const fork = (x: number, h: number) => {
    const fw = Math.max(d * 1.8, 30);
    const cs = ccw([[0, 0], [fw, 0], [fw, h + d * 0.6], [fw / 2 + d * 0.45, h + d * 0.6], [fw / 2, h], [fw / 2 - d * 0.45, h + d * 0.6], [0, h + d * 0.6]]);
    return cs.extrude(6).rotate([90, 0, 90]).translate([x, W / 2 - fw / 2, 0]);
  };
  m = m.add(fork(10, base + hF)).add(fork(Lb - 16, hB > 0 ? base + hB : base + hF + Lb * 0.35));
  if (kind === 'iron') {
    // Tray for the cleaning sponge or brass wool.
    m = m.subtract(box(22, 6, 2.5, Math.min(Lb - 26, 80), W - 6, base + 1));
  }
  return settle(m);
}

/** Funnel: walls at most 45° from vertical, a spout and a hanging tab. */
function funnel(p: Params) {
  const D1 = num(p, 'D1'), D2 = num(p, 'D2'), Ls = num(p, 'Ls'), t = nv(p, 'wall', 1.6);
  const h = Math.max(num(p, 'H'), (D1 - D2) / 2 + 2);
  // Built mouth up: spout on the bed, the cone opens upwards.
  const prof = ccw([[D2 / 2 - t, 0], [D2 / 2, 0], [D2 / 2, Ls], [D1 / 2, Ls + h], [D1 / 2, Ls + h + 3], [D1 / 2 - t, Ls + h + 3], [D1 / 2 - t, Ls + h], [D2 / 2 - t, Ls + t * 0.6]]);
  let m = M().Manifold.revolve(prof, 96);
  // Air groove along the spout so it does not seal the bottle neck.
  m = m.subtract(box(D2 / 2 - 0.8, -1, -1, D2 / 2 + 1, 1, Ls * 0.8));
  return settle(m);
}

/** Measuring cup for a given volume (to the brim), with a tab handle. */
function measureCup(p: Params) {
  const V = num(p, 'V') * 1000, D = num(p, 'D'), t = nv(p, 'wall', 1.8), floor = nv(p, 'floor', 2);
  const r = D / 2 - t, h = V / (Math.PI * r * r);
  const H = h + floor;
  let m = cyl(H, D / 2, D / 2, 96).subtract(cyl(h + 1, r, r, 96).translate([0, 0, floor]));
  // Handle: a flat tab from the rim with a 45° underside.
  const tab = ccw([[D / 2 - 1, H], [D / 2 + 30, H], [D / 2 + 30, H - 4], [D / 2 + 26, H - 8], [D / 2 - 1, H - 8 - 27]]).extrude(6).rotate([90, 0, 0]).translate([0, 3, 0]);
  m = m.add(tab.intersect(box(D / 2 - 1.5, -10, 0, D / 2 + 40, 10, H)).subtract(cyl(H + 2, r, r, 96).translate([0, 0, floor])));
  return settle(m);
}

/** 90° gluing square: a triangle with clamp slots, relief at the corner. */
function clampSquare(p: Params) {
  const A = num(p, 'A'), H = num(p, 'H');
  let cs = ccw([[0, 0], [A, 0], [0, A]]);
  // Corner relief (glue squeeze-out) and windows for the clamp jaws next to each face.
  cs = cs.subtract(C().circle(4, 24));
  cs = cs.subtract(C().square([A * 0.2, 12]).translate([A * 0.32, 7])).subtract(C().square([12, A * 0.2]).translate([7, A * 0.32]));
  return settle(cs.extrude(H));
}

// ================================================================== the rest
/** Magnetic catch: two blocks with magnet pockets (open on top), screw or tape. */
function magnetCatch(p: Params) {
  const d = num(p, 'd') + 0.2, h = num(p, 'h') + 0.2, sd = screwOf(p);
  const H = h + nv(p, 'floor', 1.2), W = d + 2 * nv(p, 'side', 3), L = sd ? d + 6 + 2 * (sd * 2 + 3) : d + 6;
  const one = () => {
    let m = box(-L / 2, -W / 2, 0, L / 2, W / 2, H).subtract(cyl(h + 1, d / 2, d / 2, 48).translate([0, 0, H - h]));
    if (sd) for (const x of [-L / 2 + sd + 2.5, L / 2 - sd - 2.5]) m = m.subtract(csHole(x, 0, H, sd));
    return m;
  };
  return row([one(), one()], 6);
}

/** Vent grille: round (with a spigot for the duct) or rectangular, slots or holes. */
function ventGrille(p: Params) {
  const round = p.shape !== 'rect', pat = String(p.pattern || 'slots'), t = nv(p, 'T', 2), spig = nv(p, 'spig', 15), rim = nv(p, 'rim', 8);
  const D = num(p, 'D'), W = num(p, 'W'), H = num(p, 'H'), open = num(p, 'open');
  const face = round ? C().circle(D / 2 + rim, 128) : C().square([W, H], true);
  const area = round ? C().circle(D / 2 - 2.8, 128) : C().square([W - 2 * rim, H - 2 * rim], true);
  const b = area.bounds();
  const cuts: CrossSection[] = [];
  if (pat === 'holes' || pat === 'mesh') {
    const hd = pat === 'mesh' ? 2 : open, pitch = hd + (pat === 'mesh' ? 1 : 2);
    for (let y = b.min[1]; y <= b.max[1]; y += pitch * 0.866)
      for (let x = b.min[0] + ((Math.round((y - b.min[1]) / (pitch * 0.866)) % 2) * pitch) / 2; x <= b.max[0]; x += pitch) cuts.push(C().circle(hd / 2, pat === 'mesh' ? 6 : 16).translate([x, y]));
  } else for (let y = b.min[1] + open / 2 + 1; y <= b.max[1] - open / 2; y += open + 2.4) cuts.push(C().square([b.max[0] - b.min[0] + 2, open], true).translate([(b.min[0] + b.max[0]) / 2, y]));
  let plate = face.subtract(C().union(cuts).intersect(area)).extrude(t);
  if (round) plate = plate.add(ring(D / 2 - 0.4, D / 2 - 2.2, 128).extrude(spig).translate([0, 0, t - 0.01]));
  else for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) plate = plate.subtract(csHole(x * (W / 2 - 4.5), y * (H / 2 - 4.5), t, 3.5));
  return settle(plate);
}

/** Reducing sleeve: from a shaft or tube of one diameter to a hole of another, optional D-flat and flange. */
function reducer(p: Params) {
  const di = num(p, 'd1') + 0.2, Do = num(p, 'd2') - 0.15, L = num(p, 'L');
  let bore = C().circle(di / 2, 64);
  if (p.flat === true) bore = bore.subtract(C().square([di, di], true).translate([0, di / 2 + di / 2 - di * 0.1]));
  let m = C().circle(Do / 2, 64).subtract(bore).extrude(L);
  if (num(p, 'flange') > 0) m = m.add(ring(Do / 2 + num(p, 'flange'), Do / 2 - 0.5, 64).subtract(bore).extrude(2));
  if (p.slit === true) m = m.subtract(box(-0.6, 0, -1, 0.6, Do, L + 2));
  return settle(m);
}

/** Mounting wedge (set angle) or a set of levelling shims with a screw slot. */
function wedgeShim(p: Params) {
  const W = num(p, 'W'), L = num(p, 'L');
  if (p.mode === 'shims') {
    const t0 = num(p, 't0'), st = num(p, 'step'), k = Math.max(1, Math.round(num(p, 'N')));
    const ms: Manifold[] = [];
    for (let i = 0; i < k; i++) {
      const t = t0 + i * st;
      let s = box(0, 0, 0, L, W, t).subtract(box(L * 0.35, W / 2 - 3, -1, L + 1, W / 2 + 3, t + 1)).subtract(cyl(t + 2, 3).translate([L * 0.35, W / 2, -1]));
      // Notches on the end show the thickness: one notch per step.
      for (let j = 0; j <= i && j < 8; j++) s = s.subtract(box(2 + j * 3, -1, -1, 3 + j * 3, 1.2, t + 1));
      ms.push(s.translate([0, i * (W + 4), 0]));
    }
    return settle(union(ms));
  }
  const a = (num(p, 'angle') * Math.PI) / 180, h0 = num(p, 'h0');
  const h1 = h0 + L * Math.tan(a);
  let m = ccw([[0, 0], [L, 0], [L, h0], [0, h1]]).extrude(W).rotate([90, 0, 0]).translate([0, W, 0]);
  if (p.ribbed !== false) for (let x = 4; x < L - 3; x += 4) m = m.subtract(ccw([[x, h1 - (x / L) * (h1 - h0) - 0.6], [x + 1.2, h1 - ((x + 1.2) / L) * (h1 - h0) - 0.6], [x + 1.2, h1 + 1], [x, h1 + 1]]).extrude(W + 2).rotate([90, 0, 0]).translate([0, W + 1, 0]));
  return settle(m);
}

/** Bin that links to its neighbours: vertical dovetail rails on two walls, slots on the other two. */
function linkBin(p: Params) {
  const W = num(p, 'W'), D = num(p, 'D'), H = num(p, 'H'), t = nv(p, 'wall', 1.8), r = nv(p, 'r', 3);
  const tail = (g: number) => ccw([[-3 - g, 0], [3 + g, 0], [4.5 + g, 2.5 + g * 0.5], [-4.5 - g, 2.5 + g * 0.5]]);
  const rr = (w: number, d: number, rad: number) => C().square([w - 2 * rad, d - 2 * rad], true).offset(rad, 'Round', undefined, 16);
  // Walls thick enough to carry the slots; rails stand out on +X and +Y.
  const outer = rr(W, D, r), inner = rr(W - 2 * t - 6, D - 2 * t - 6, r);
  let cs = outer.subtract(inner);
  const g = 0.25;
  const rails = C().union([tail(0).rotate(-90).translate([W / 2 - 0.01, 0]), tail(0).translate([0, D / 2 - 0.01])]);
  const slots = C().union([tail(g).rotate(-90).translate([-W / 2 - 0.01, 0]), tail(g).translate([0, -D / 2 - 0.01])]);
  cs = cs.add(rails).subtract(slots);
  const m = cs.extrude(H).add(inner.extrude(t));
  return settle(m);
}

/** Linear slide, print-in-place: a rail with a 45° diamond and a carriage around it, end stops on the rail. */
function linearSlide(p: Params) {
  const L = num(p, 'L'), Lc = num(p, 'Lc'), s = num(p, 's'), g = num(p, 'gap'), W = s * 2 + 12;
  const bt = 3, neck = s * 0.5;
  const zc = bt + 2.5 + s / 2;
  // Section in Y/Z, bars along X.
  const diamond = (r: number) => ccw([[0, zc - r], [r, zc], [0, zc + r], [-r, zc]]);
  const rail = C().union([C().square([W, bt]).translate([-W / 2, 0]), C().square([neck, zc]).translate([-neck / 2, 0.01]), diamond(s / 2)]);
  const cw = s + 10;
  // Carriage: V-shaped underside (45°) so nothing is printed in the air, diamond hole with the gap.
  const car = ccw([[-neck / 2 - g - 0.01, bt + g], [neck / 2 + g + 0.01, bt + g], [cw / 2, bt + g + cw / 2 - neck / 2 - g], [cw / 2, zc + s / 2 + 5], [-cw / 2, zc + s / 2 + 5], [-cw / 2, bt + g + cw / 2 - neck / 2 - g]])
    .subtract(diamond(s / 2 + g * Math.SQRT2))
    .subtract(C().square([neck + 2 * g, zc]).translate([-neck / 2 - g, 0]));
  const bar = (cs: CrossSection, len: number) => cs.extrude(len).rotate([90, 0, 90]);
  let m = bar(rail, L);
  // End stops: blocks across the rail's ends, taller than the diamond.
  for (const x of [0, L - 4]) m = m.add(box(x, -W / 2, 0, x + 4, W / 2, zc + s / 2 + 3));
  for (const x of [8, L - 8]) m = m.subtract(csHole(x, -W / 2 + 3.5, bt, 3.2)).subtract(csHole(x, W / 2 - 3.5, bt, 3.2));
  let carriage = bar(car, Lc).translate([(L - Lc) / 2, 0, 0]);
  for (const x of [(L - Lc) / 2 + Lc * 0.25, (L - Lc) / 2 + Lc * 0.75]) carriage = carriage.subtract(cyl(4, 1.6, 1.6, 24).translate([x, cw / 2 - 2.5, zc + s / 2 + 1.01])).subtract(cyl(4, 1.6, 1.6, 24).translate([x, -cw / 2 + 2.5, zc + s / 2 + 1.01]));
  return settle(union([m, carriage]));
}

/** Tee or elbow for small hoses, barbs on every arm, lying with a flat underside. */
function hoseTee(p: Params) {
  const d = num(p, 'd'), bore = Math.max(1.5, d - 2.4), La = num(p, 'La');
  const arms = p.kind === 'elbow' ? [0, 90] : p.kind === 'cross' ? [0, 90, 180, 270] : p.kind === 'straight' ? [0, 180] : [0, 90, 180];
  const hub = d + 3, r0 = d / 2 - 0.2;
  // One arm along +X: a plain tube and barbs, each a cone wide towards the hub (the hose slides on, does not pull off).
  const along = (m: Manifold, x: number) => m.rotate([0, 90, 0]).translate([x, 0, 0]);
  const seg = Math.max(4, d * 0.9), k = Math.max(1, Math.floor((La - hub / 2) / seg));
  const parts: Manifold[] = [along(cyl(La, r0, r0, 48), 0)];
  for (let i = 0; i < k; i++) parts.push(along(cyl(seg, d / 2 + 0.6, r0, 48), hub / 2 + i * seg));
  const arm = union(parts);
  let m = M().Manifold.sphere(hub / 2, 48);
  for (const a of arms) m = m.add(arm.rotate([0, 0, a]));
  for (const a of arms) m = m.subtract(along(cyl(La + 1, bore / 2, bore / 2, 32), 0).rotate([0, 0, a]));
  // Flat underside where the rounds would overhang.
  const cut = r0 * 0.78;
  m = m.subtract(box(-La - hub, -La - hub, -hub, La + hub, La + hub, -cut));
  return settle(m);
}

/** Round wall bumper with a pocket for felt or rubber and a countersunk screw hole. */
function wallBumper(p: Params) {
  const D = num(p, 'D'), H = num(p, 'H'), sd = num(p, 'screwD'), pad = nv(p, 'pad', 2);
  let m = cyl(H - 1.5, D / 2, D / 2, 96).add(cyl(1.5, D / 2, D / 2 - 1.5, 96).translate([0, 0, H - 1.51]));
  m = m.subtract(cyl(pad + 1, D / 2 - 3, D / 2 - 3, 96).translate([0, 0, H - pad]));
  if (sd > 0) m = m.subtract(csHole(0, 0, H - pad, sd));
  return settle(m);
}

/** Snap clip holding greenhouse film on a pipe: a C round the pipe with flared lips. */
function filmClip(p: Params) {
  const D = num(p, 'D'), w = num(p, 'W'), t = num(p, 'T');
  const Ri = D / 2 + 0.3, R = Ri + t / 2;
  // 260° of the pipe, then the lips turn outwards to push it on.
  const pts = arc(0, 0, R, 140, 400, 40);
  const a0 = (140 * Math.PI) / 180, a1 = (400 * Math.PI) / 180;
  const e0: P2 = [Math.cos(a0) * (R + 5), Math.sin(a0) * (R + 5)], e1: P2 = [Math.cos(a1) * (R + 5), Math.sin(a1) * (R + 5)];
  const cs = stroke([e0, ...pts, e1], t);
  return settle(onSide(cs, w));
}

// ================================================================== definitions
const scr = screwParams;
export const USEFUL2_DEFS: PartDef[] = [
  // cables and desk
  {
    type: 'cableComb', label: 'Uchwyt grzebieniowy na wiązkę', category: 'useful', hole: false,
    description: 'Rząd szczelin na przewody, każda zwężona u góry: przewód wciska się i zostaje. Przykręcany albo na taśmę.',
    params: [count('N', 'Liczba kanałów', 6, 1, 30), n('d', 'Średnica przewodu', 5, 1.5, 20, 0.5), n('W', 'Grubość grzebienia', 10, 4, 30), ...scr],
    build: cableComb,
  },
  {
    type: 'cableLatch', label: 'Klips samoprzylepny z zapinką', category: 'useful', hole: false,
    description: 'Płaska podkładka pod taśmę i sprężyste ramię nad kablem; koniec ramienia zapina się za ząbek na słupku. Drukuje się na boku.',
    params: [n('d', 'Średnica kabla (wiązki)', 6, 2, 25, 0.5), n('W', 'Szerokość', 10, 6, 30)],
    build: cableLatch,
  },
  {
    type: 'deskEdgeClip', label: 'Klips na krawędź blatu', category: 'useful', hole: false,
    description: 'Wsuwana na krawędź blatu litera C z kółkami na kable pod spodem. Bez wkrętów; górne ramię lekko pochylone, żeby trzymało.',
    params: [n('T', 'Grubość blatu', 18, 8, 50, 0.5, 'Zmierz suwmiarką. Klips ma 0,3 mm wcisku.'), n('A', 'Głębokość wsunięcia', 25, 10, 60), count('N', 'Liczba kabli', 2, 1, 6), n('d', 'Średnica kabla', 6, 2, 15, 0.5), n('W', 'Szerokość', 12, 6, 30)],
    build: deskEdgeClip,
  },
  {
    type: 'cableCorner', label: 'Narożnik kanału kablowego 90°', category: 'useful', hole: false,
    description: 'Kanał w kształcie L do poprowadzenia kabli za róg biurka lub ściany, z zatrzaskową pokrywką. Wnętrze jak w kupnych listwach.',
    params: [n('W', 'Szerokość kanału (wnętrze)', 16, 6, 60), n('H', 'Wysokość kanału (wnętrze)', 10, 5, 40), n('A', 'Długość ramion', 60, 30, 200), { key: 'lid', label: 'Pokrywka', type: 'bool', def: true }],
    build: cableCorner,
  },
  {
    type: 'baseboardClip', label: 'Klips do listwy przypodłogowej', category: 'useful', hole: false,
    description: 'Cienki język wsuwany między listwę a ścianę i kółko na kabel na górze listwy. Bez wiercenia.',
    params: [n('gap', 'Grubość języka', 1.2, 0.6, 3, 0.1, 'Ile wejdzie między listwę a ścianę.'), n('D', 'Głębokość wsunięcia', 20, 8, 50), n('B', 'Grubość listwy', 12, 5, 30, 0.5), n('d', 'Średnica kabla', 5, 2, 15, 0.5), n('W', 'Szerokość', 10, 6, 25)],
    build: baseboardClip,
  },
  {
    type: 'deskGrommet', label: 'Przelotka w blacie', category: 'useful', hole: false,
    description: 'Tuleja z kołnierzem do otworu w blacie i pokrywka z wycięciem na kable. Dwie części.',
    params: [n('D', 'Średnica otworu w blacie', 60, 25, 120, 1, 'Typowo 60 lub 80 mm (otwornica).'), n('T', 'Grubość blatu', 25, 10, 50), n('slot', 'Szerokość wycięcia na kable', 14, 6, 40)],
    build: deskGrommet,
  },
  {
    type: 'zipTie', label: 'Opaska zaciskowa (print-in-place)', category: 'useful', hole: false,
    description: 'Pasek z ząbkami i zamek z języczkiem drukowane razem, na płasko. Drukuj z PETG albo nylonu: z PLA pęka przy zginaniu.',
    params: [n('D', 'Największa średnica wiązki', 30, 5, 120), n('W', 'Szerokość paska', 5, 3.5, 10, 0.5)],
    build: zipTie,
  },
  {
    type: 'cableSleeve', label: 'Osłona kabli modułowa', category: 'useful', hole: false,
    description: 'Segmenty w kształcie C zatrzaskiwane na wiązce i wkładane jeden w drugi: dowolna długość. Najlepiej z PETG lub TPU.',
    params: [n('d', 'Średnica wiązki', 12, 4, 40, 0.5), n('L', 'Długość segmentu', 40, 15, 150), count('N', 'Liczba segmentów', 4, 1, 30)],
    build: cableSleeve,
  },
  // furniture and DIY
  {
    type: 'furnitureKnob', label: 'Gałka meblowa', category: 'useful', hole: false,
    description: 'Gałka do szuflady lub drzwiczek z kieszenią na nakrętkę: śruba wchodzi od środka szuflady. Drukuje się górą do stołu.',
    params: [{ ...select('shape', 'Kształt', 'mushroom', [['mushroom', 'Grzybek'], ['cylinder', 'Walec'], ['cone', 'Stożek']]) }, n('D', 'Średnica', 30, 12, 80), n('H', 'Wysokość', 25, 12, 60), { ...msel('4', ['3', '4', '5']) }],
    build: furnitureKnob,
  },
  {
    type: 'furnitureHandle', label: 'Uchwyt meblowy', category: 'useful', hole: false,
    description: 'Uchwyt na dwóch nóżkach, rozstaw jak w kupnych (64, 96, 128, 160 mm), otwory pilotowe pod śruby M. Drukuje się na boku.',
    params: [
      { ...select('cS', 'Rozstaw otworów', '96', [['64', '64 mm'], ['96', '96 mm'], ['128', '128 mm'], ['160', '160 mm'], ['192', '192 mm']]) },
      n('c', 'Rozstaw (dokładnie)', 96, 20, 400),
      { ...select('shape', 'Kształt', 'bar', [['bar', 'Prosty na nóżkach'], ['arc', 'Łuk']]) },
      n('h', 'Odstęp od frontu', 30, 15, 60), n('ext', 'Wystawanie poza nóżki', 0, 0, 60), n('T', 'Grubość', 9, 6, 16), n('W', 'Szerokość', 12, 8, 25), { ...msel('4', ['3', '4', '5']) },
    ],
    normalize: (prev, next) => (prev.cS !== next.cS ? { ...next, c: Number(next.cS) } : next),
    build: furnitureHandle,
  },
  {
    type: 'thumbKnob', label: 'Pokrętło (radełko, gwiazdka, motylek)', category: 'useful', hole: false,
    description: 'Pokrętło na śrubę: wciskasz nakrętkę albo łeb śruby w kieszeń i kręcisz palcami. Do zacisków, przyrządów, pokryw.',
    params: [{ ...select('style', 'Kształt', 'knurl', [['knurl', 'Radełkowane'], ['star', 'Gwiazdka'], ['wing', 'Motylek']]) }, { ...select('seat', 'Kieszeń na', 'nut', [['nut', 'Nakrętkę'], ['head', 'Łeb śruby (imbus)']]) }, { ...msel('6', ['3', '4', '5', '6', '8', '10']) }, n('D', 'Średnica', 32, 15, 80), n('H', 'Wysokość', 12, 6, 30)],
    build: thumbKnob,
  },
  {
    type: 'furnitureFoot', label: 'Nóżka meblowa', category: 'useful', hole: false,
    description: 'Okrągła albo kwadratowa, zwężana, z wnęką na filc lub gumę i otworem na wkręt w środku wnęki.',
    params: [{ ...select('shape', 'Kształt', 'round', [['round', 'Okrągła'], ['square', 'Kwadratowa']]) }, n('D', 'Średnica / bok', 40, 15, 120), n('H', 'Wysokość', 30, 5, 200), n('taper', 'Zwężenie ku dołowi', 15, 0, 50, 1, '% zwężenia od góry do podłogi.'), n('pad', 'Wnęka na filc', 1.5, 0, 5, 0.5, '0 = bez wnęki.'), n('screwD', 'Średnica wkrętu', 4, 0, 6, 0.5, '0 = bez otworu (do przyklejenia).')],
    build: furnitureFoot,
  },
  {
    type: 'cornerGuard', label: 'Narożnik wzmacniający', category: 'useful', hole: false,
    description: 'Zewnętrzny: nakładka na róg skrzyni (trzy ścianki). Wewnętrzny: kątownik z żebrem do środka ramy. Z otworami na wkręty albo bez.',
    params: [{ ...select('kind', 'Rodzaj', 'outer', [['outer', 'Zewnętrzny (na róg)'], ['inner', 'Wewnętrzny (kątownik z żebrem)']]) }, n('S', 'Długość ramion', 35, 15, 120), n('W', 'Szerokość', 20, 10, 80, 1, undefined, (p) => p.kind === 'inner'), n('T', 'Grubość', 3, 2, 8, 0.5), ...scr],
    build: cornerGuard,
  },
  {
    type: 'profileCap', label: 'Zaślepka do rury lub profilu', category: 'useful', hole: false,
    description: 'Zaślepka do kupnej rury lub profilu (stal, aluminium): płaski kołnierz i wciskany korek z żeberkami. Podaj wymiar zewnętrzny i grubość ścianki.',
    params: [{ ...select('shape', 'Kształt', 'square', [['round', 'Okrągła'], ['square', 'Kwadratowa'], ['rect', 'Prostokątna']]) }, n('A', 'Wymiar zewnętrzny (średnica / bok)', 25, 8, 120, 0.5), n('B', 'Drugi bok', 40, 8, 120, 0.5, undefined, (p) => p.shape === 'rect'), n('wall', 'Grubość ścianki rury', 1.5, 0.5, 6, 0.1), n('P', 'Głębokość korka', 12, 5, 30)],
    build: profileCap,
  },
  {
    type: 'standoff', label: 'Dystans / tuleja montażowa', category: 'useful', hole: false,
    description: 'Tulejka pod śrubę M2,5–M8, okrągła albo sześciokątna, kilka sztuk naraz. Opcjonalnie otwór pod wkręcenie śruby.',
    params: [{ ...select('M', 'Śruba', '3', [['2.5', 'M2,5'], ['3', 'M3'], ['4', 'M4'], ['5', 'M5'], ['6', 'M6'], ['8', 'M8']]) }, n('L', 'Długość', 10, 1, 100, 0.5), n('D', 'Średnica zewnętrzna', 6, 4, 30, 0.5), { ...select('shape', 'Kształt', 'round', [['round', 'Okrągła'], ['hex', 'Sześciokątna']]) }, { key: 'thread', label: 'Otwór pod wkręcenie (śruba tnie gwint)', type: 'bool', def: false }, count('N', 'Ile sztuk', 4, 1, 20)],
    build: standoff,
  },
  {
    type: 'magnetCatch', label: 'Zatrzask magnetyczny', category: 'useful', hole: false,
    description: 'Para klocków z gniazdami na magnesy walcowe: jeden na korpus, drugi na drzwiczki. Magnes wklej na kropli kleju.',
    params: [n('d', 'Średnica magnesu', 8, 3, 25, 0.5), n('h', 'Grubość magnesu', 3, 1, 10, 0.5), ...scr],
    build: magnetCatch,
  },
  {
    type: 'wallBumper', label: 'Odbój ścienny', category: 'useful', hole: false,
    description: 'Okrągły odbój na ścianę za klamkę albo na drzwi, z wnęką na filc lub gumę przyklejaną na czoło.',
    params: [n('D', 'Średnica', 35, 15, 80), n('H', 'Wysokość', 20, 6, 60), n('screwD', 'Średnica wkrętu', 4, 0, 6, 0.5, '0 = bez otworu (na taśmę).')],
    build: wallBumper,
  },
  {
    type: 'mountWedge', label: 'Klin montażowy i podkładki', category: 'useful', hole: false,
    description: 'Klin o zadanym kącie (z ryflowaniem) albo zestaw podkładek poziomujących z wycięciem na wkręt; nacięcia na końcu mówią, która jest która.',
    params: [
      { ...select('mode', 'Rodzaj', 'wedge', [['wedge', 'Klin'], ['shims', 'Podkładki poziomujące']]) },
      n('L', 'Długość', 60, 15, 200), n('W', 'Szerokość', 25, 8, 100),
      { key: 'angle', label: 'Kąt', type: 'number', def: 10, min: 1, max: 40, step: 0.5, unit: '°', show: (p) => p.mode !== 'shims' },
      n('h0', 'Grubość cieńszego końca', 1, 0.4, 20, 0.2, undefined, (p) => p.mode !== 'shims'),
      { key: 'ribbed', label: 'Ryflowanie', type: 'bool', def: true, show: (p) => p.mode !== 'shims' },
      n('t0', 'Najcieńsza podkładka', 1, 0.4, 10, 0.2, undefined, (p) => p.mode === 'shims'),
      n('step', 'Co ile grubsza', 1, 0.2, 5, 0.2, undefined, (p) => p.mode === 'shims'),
      count('N', 'Ile podkładek', 5, 1, 12),
    ],
    build: wedgeShim,
  },
  {
    type: 'ventGrille', label: 'Kratka wentylacyjna', category: 'useful', hole: false,
    description: 'Okrągła z kołnierzem do rury (Ø100/125/150) albo prostokątna na wkręty; szczeliny, otwory albo drobna siatka przeciw owadom.',
    params: [{ ...select('shape', 'Kształt', 'round', [['round', 'Okrągła na rurę'], ['rect', 'Prostokątna']]) }, n('D', 'Średnica rury', 100, 40, 200, 1, undefined, (p) => p.shape !== 'rect'), n('W', 'Szerokość', 120, 40, 250, 1, undefined, (p) => p.shape === 'rect'), n('H', 'Wysokość', 80, 40, 250, 1, undefined, (p) => p.shape === 'rect'), { ...select('pattern', 'Otwory', 'slots', [['slots', 'Szczeliny'], ['holes', 'Okrągłe otwory'], ['mesh', 'Siatka przeciw owadom']]) }, n('open', 'Szerokość szczeliny / otworu', 5, 2, 15, 0.5)],
    build: ventGrille,
  },
  {
    type: 'reducer', label: 'Tuleja redukcyjna', category: 'useful', hole: false,
    description: 'Z wałka lub rury jednej średnicy na otwór drugiej: koło na inny wałek, rura w większe gniazdo. Opcjonalnie spłaszczenie D, kołnierz, rozcięcie.',
    params: [n('d1', 'Średnica wałka (w środku)', 8, 1, 100, 0.1), n('d2', 'Średnica otworu (na zewnątrz)', 12, 2, 120, 0.1), n('L', 'Długość', 15, 2, 100), { key: 'flat', label: 'Spłaszczenie D na wałek', type: 'bool', def: false }, n('flange', 'Kołnierz', 0, 0, 15, 0.5, '0 = bez kołnierza.'), { key: 'slit', label: 'Rozcięcie wzdłuż (zaciska się)', type: 'bool', def: false }],
    build: reducer,
  },
  {
    type: 'linkBin', label: 'Pojemnik łączony (jaskółczy ogon)', category: 'useful', hole: false,
    description: 'Pojemnik z pionowymi wpustami na dwóch ściankach i rowkami na dwóch pozostałych: wsuwasz jeden w drugi i budujesz organizer z kilku.',
    params: [n('W', 'Szerokość', 60, 30, 200), n('D', 'Głębokość', 60, 30, 200), n('H', 'Wysokość', 40, 10, 150)],
    build: linkBin,
  },
  {
    type: 'linearSlide', label: 'Prowadnica liniowa (print-in-place)', category: 'useful', hole: false,
    description: 'Szyna z rombowym profilem i wózek drukowane razem, z luzem; wszystkie ścianki pod 45°, bez podpór. Ograniczniki na końcach szyny.',
    params: [n('L', 'Długość szyny', 120, 40, 250), n('Lc', 'Długość wózka', 30, 15, 100), n('s', 'Wielkość rombu', 8, 5, 20, 0.5), n('gap', 'Luz', 0.35, 0.2, 0.6, 0.05, 'Dla P1S i PLA 0,3–0,35 mm.')],
    build: linearSlide,
  },
  {
    type: 'hoseTee', label: 'Trójnik / kolanko na wężyk', category: 'useful', hole: false,
    description: 'Złączka do wężyków silikonowych i akwarystycznych: każde ramię z karbami. Leży płasko, spód ścięty, drukuje się bez podpór.',
    params: [{ ...select('kind', 'Kształt', 'tee', [['tee', 'Trójnik T'], ['elbow', 'Kolanko 90°'], ['cross', 'Czwórnik'], ['straight', 'Prosta złączka']]) }, n('d', 'Średnica wewnętrzna wężyka', 6, 3, 16, 0.5), n('La', 'Długość ramienia', 16, 8, 40)],
    build: hoseTee,
  },
  {
    type: 'filmClip', label: 'Klips na rurę do folii', category: 'useful', hole: false,
    description: 'Zatrzaskowy klips trzymający folię na rurze (tunel foliowy, osłona): obejmuje rurę, rozchylone wargi ułatwiają wciśnięcie.',
    params: [n('D', 'Średnica rury', 20, 8, 60, 0.5), n('W', 'Szerokość', 25, 8, 60), n('T', 'Grubość', 2.4, 1.6, 5, 0.2)],
    build: filmClip,
  },
  // workshop
  {
    type: 'drillGuide', label: 'Szablon wiercenia', category: 'useful', hole: false,
    description: 'Przyrząd do wiercenia: kołki w krawędzi deski (środek wypada sam), zawias puszkowy 35 mm albo uchwyty meblowe z rozstawem.',
    params: [
      { ...select('mode', 'Do czego', 'dowel', [['dowel', 'Kołki w krawędzi'], ['hinge', 'Zawias puszkowy 35 mm'], ['handle', 'Uchwyty meblowe']]) },
      n('T', 'Grubość deski', 18, 8, 40, 0.5, undefined, (p) => p.mode === 'dowel'),
      { ...select('d', 'Wiertło', '8', [['5', '5 mm'], ['6', '6 mm'], ['8', '8 mm'], ['10', '10 mm']]), show: (p: Params) => p.mode !== 'hinge' },
      count('N', 'Liczba kołków', 2, 1, 6),
      n('pitch', 'Rozstaw kołków', 32, 16, 128, 1, 'System 32 mm.', (p) => p.mode === 'dowel'),
      n('e', 'Odległość od krawędzi', 22, 3, 60, 0.5, 'Zawias: środek puszki ok. 21,5–22,5 mm.', (p) => p.mode !== 'dowel'),
      n('c', 'Rozstaw uchwytu', 96, 32, 320, 1, undefined, (p) => p.mode === 'handle'),
    ],
    build: drillGuide,
  },
  {
    type: 'wrench', label: 'Klucz lub nasadka na wymiar', category: 'useful', hole: false,
    description: 'Klucz płaski, oczkowy albo nasadka (kwadrat 1/4" lub trzpień bitu 1/4") na nietypowy rozmiar nakrętki. Do lekkich prac, nie na duży moment.',
    params: [{ ...select('kind', 'Rodzaj', 'open', [['open', 'Płaski + oczkowy'], ['ring', 'Oczkowy z obu stron'], ['socket', 'Nasadka 1/4" (kwadrat)'], ['bit', 'Nasadka na trzpień bitu 1/4"']]) }, n('af', 'Rozmiar (pod klucz)', 10, 3, 32, 0.1), n('L', 'Długość', 100, 40, 200, 1, undefined, (p) => p.kind === 'open' || p.kind === 'ring' || !p.kind), n('T', 'Grubość', 5, 3, 12, 0.5, undefined, (p) => p.kind === 'open' || p.kind === 'ring' || !p.kind)],
    build: wrench,
  },
  {
    type: 'toolStand', label: 'Stojak na lutownicę, opalarkę, wkrętarkę', category: 'useful', hole: false,
    description: 'Lutownica i opalarka: podstawa z dwoma widełkami (narzędzie leży pochylone), przy lutownicy wnęka na gąbkę. Wkrętarka: wieszak ścienny.',
    params: [
      { ...select('kind', 'Na co', 'iron', [['iron', 'Lutownica'], ['gun', 'Opalarka'], ['drill', 'Wkrętarka (wieszak)']]) },
      n('d', 'Średnica rączki / szerokość korpusu', 22, 8, 80, 0.5, 'Wkrętarka: szerokość korpusu nad akumulatorem.'),
      n('W', 'Szerokość podstawy', 80, 40, 200, 1, undefined, (p) => p.kind !== 'drill'),
      n('Lb', 'Długość podstawy', 140, 60, 250, 1, undefined, (p) => p.kind !== 'drill'),
      n('reach', 'Wysięg ramion', 70, 30, 150, 1, undefined, (p) => p.kind === 'drill'),
      ...scr.map((q) => ({ ...q, show: (p: Params) => p.kind === 'drill' && (q.show ? q.show(p) : true) })),
    ],
    normalize: (prev, next) => (prev.kind !== next.kind ? { ...next, d: next.kind === 'gun' ? 45 : next.kind === 'drill' ? 50 : 22 } : next),
    build: toolStand,
  },
  {
    type: 'funnel', label: 'Lejek', category: 'useful', hole: false,
    description: 'Lejek z rowkiem powietrznym na wylewce. Ścianki nie bardziej płaskie niż 45°, więc wysokość rośnie sama przy szerokim wlocie.',
    params: [n('D1', 'Średnica wlotu', 80, 20, 200), n('D2', 'Średnica wylewki', 10, 3, 40, 0.5), n('Ls', 'Długość wylewki', 25, 5, 80), n('H', 'Wysokość stożka', 40, 10, 150)],
    build: funnel,
  },
  {
    type: 'measureCup', label: 'Miarka', category: 'useful', hole: false,
    description: 'Miarka o zadanej pojemności (do pełna): wysokość liczy się sama ze średnicy. Na przyprawy, karmę, nawozy.',
    params: [n('V', 'Pojemność', 50, 1, 500, 1, 'ml (= cm³).'), n('D', 'Średnica', 45, 15, 120)],
    build: measureCup,
  },
  {
    type: 'clampSquare', label: 'Kątownik do klejenia 90°', category: 'useful', hole: false,
    description: 'Trójkąt do ustawienia dwóch desek pod kątem prostym przy klejeniu: okienka na ściski, wycięcie w narożniku na klej.',
    params: [n('A', 'Długość ramion', 100, 50, 200), n('H', 'Wysokość', 20, 10, 50)],
    build: clampSquare,
  },
];

/** Fixed sizes chosen for printing, adjustable under „Więcej wymiarów”. */
const ADV: Record<string, ParamDef[]> = {
  cableComb: [adv('wall', 'Grubość ząbków', 2.2, 1.2, 5, 0.1), adv('base', 'Grubość podstawy', 3, 1.6, 6, 0.2)],
  cableLatch: [adv('arm', 'Grubość ramienia', 1.3, 0.8, 2.5, 0.1, 'Cieńsze = łatwiej zapiąć.'), adv('base', 'Grubość podkładki', 2.4, 1.2, 5, 0.2)],
  deskEdgeClip: [adv('t', 'Grubość klipsa', 3, 2, 6, 0.2), adv('press', 'Wcisk na blat', 0.3, 0, 1, 0.05), adv('grip', 'Pochylenie górnego ramienia', 2, 0, 6, 0.5, 'Stopnie. Większe = mocniej ściska.')],
  cableCorner: [adv('wall', 'Grubość ścianki', 1.6, 1, 4, 0.2)],
  deskGrommet: [adv('wall', 'Ścianka tulei', 2, 1.2, 5, 0.2), adv('rim', 'Szerokość kołnierza', 6, 2, 20, 0.5), adv('f', 'Grubość kołnierza', 2.4, 1.2, 5, 0.2)],
  zipTie: [adv('T', 'Grubość paska', 1.4, 1, 2.5, 0.1)],
  cableSleeve: [adv('wall', 'Grubość ścianki', 1.6, 0.8, 4, 0.1), adv('spig', 'Długość wpustu', 6, 3, 20, 0.5)],
  furnitureKnob: [adv('stem', 'Średnica trzonka', 0, 0, 40, 0.5, '0 = dobiera się sama.')],
  profileCap: [adv('f', 'Grubość kołnierza', 2.4, 1, 6, 0.2), adv('pw', 'Ścianka korka', 1.6, 1, 4, 0.1), adv('rib', 'Wysokość żeberek', 0.35, 0, 1, 0.05, 'Wcisk korka w rurę.')],
  drillGuide: [adv('plate', 'Grubość płyty z tulejami', 10, 5, 30, 0.5, 'Grubsza = wiertło prowadzi się prościej.'), adv('fence', 'Wysokość oporu', 12, 5, 40, 0.5), adv('fw4', 'Grubość oporu', 4, 2, 10, 0.5)],
  toolStand: [adv('base', 'Grubość podstawy', 6, 3, 20, 0.5), adv('hF', 'Wysokość przednich widełek', 15, 5, 80, 1), adv('hB', 'Wysokość tylnych widełek', 0, 0, 150, 1, '0 = dobiera się z długości podstawy.')],
  funnel: [adv('wall', 'Grubość ścianki', 1.6, 0.8, 4, 0.1)],
  measureCup: [adv('wall', 'Grubość ścianki', 1.8, 1, 4, 0.1), adv('floor', 'Grubość dna', 2, 1, 5, 0.2)],
  magnetCatch: [adv('floor', 'Grubość pod magnesem', 1.2, 0.4, 4, 0.2, 'Cieńsza = mocniej trzyma.'), adv('side', 'Ścianka wokół magnesu', 3, 1.2, 8, 0.2)],
  ventGrille: [adv('T', 'Grubość kratki', 2, 1.2, 5, 0.2), adv('spig', 'Długość kołnierza na rurę', 15, 5, 40, 1), adv('rim', 'Szerokość ramki', 8, 3, 25, 0.5)],
  linkBin: [adv('wall', 'Grubość ścianki', 1.8, 1.2, 4, 0.2), adv('r', 'Zaokrąglenie narożników', 3, 0.5, 15, 0.5)],
  wallBumper: [adv('pad', 'Głębokość wnęki na filc', 2, 0, 5, 0.2)],
};
for (const d of USEFUL2_DEFS) if (ADV[d.type]) d.params.push(...ADV[d.type]);
