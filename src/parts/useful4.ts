import type { CrossSection, Manifold } from 'manifold-3d';
import { M, settle } from '../geom/manifold';
import type { ParamDef, Params, PartDef } from './def';
import { box, cyl, cylX, num, select, union } from './util';
import { FONT, textOutline } from './text';
import { internalThreadCut, type ThreadSpec } from './threads';
import { type P2, adv, arc, ccw, count, csHole, csHoleX, hookPlate, n, nv, onSide, screwOf, screwParams, stroke } from './useful';

/**
 * Fourth batch of everyday things: the 3D printer, pets, bike and car, and more for the kitchen,
 * home, garden, workshop, electronics and kids. Same rules: each prints without supports as built.
 */

const C = () => M().CrossSection;
const ringCS = (ro: number, ri: number, seg = 64) => C().circle(ro, seg).subtract(C().circle(ri, seg));
/** Side-by-side layout of separate pieces along X, each on the bed. */
function row(ms: Manifold[], gap = 6): Manifold {
  let x = 0;
  const out: Manifold[] = [];
  for (const m of ms) {
    const s = settle(m), b = s.boundingBox();
    out.push(s.translate([x - b.min[0], 0, 0]));
    x += b.max[0] - b.min[0] + gap;
  }
  return settle(union(out));
}
/** Teardrop section: a circle with a 45° point towards +Y (a sideways hole that needs no support). */
const tear = (r: number) => C().hull([C().circle(r, 32), C().square([0.02, 0.02], true).translate([0, r * Math.SQRT2])]);
/** Sideways hole along X, point up. */
const tearX = (r: number, x0: number, x1: number, y: number, z: number) => tear(r).extrude(x1 - x0).rotate([90, 0, 90]).translate([x0, y, z]);
/** Sideways hole along Y, point up. */
const tearY = (r: number, y0: number, y1: number, x: number, z: number) => tear(r).extrude(y1 - y0).rotate([90, 0, 0]).translate([x, y1, z]);
/** A polygon drawn in (x, z), stretched along Y from y0 to y1. */
const xzPrism = (pts: P2[], y0: number, y1: number) => ccw(pts).extrude(y1 - y0).rotate([90, 0, 0]).translate([0, y1, 0]);
/** A polygon drawn in (y, z), stretched along X from x0 to x1. */
const yzPrism = (pts: P2[], x0: number, x1: number) => ccw(pts).extrude(x1 - x0).rotate([90, 0, 90]).translate([x0, 0, 0]);
const rev = (pts: P2[], seg = 96) => M().Manifold.revolve(ccw(pts), seg);
const bool = (key: string, label: string, def: boolean, hint?: string): ParamDef => ({ key, label, type: 'bool', def, hint });

/** Split ring round a bar with two ears for an M4 bolt and nut (side profile, bar along Z, `w` wide). */
function barClamp(bar: number, w: number, extra: CrossSection[] = []): Manifold {
  const ri = bar / 2 + 0.2, ro = ri + 4, slit = 3, ear = slit / 2 + 6;
  let cs = C().circle(ro, 96).add(C().square([2 * ear, 12]).translate([-ear, -ro - 9]));
  for (const e of extra) cs = cs.add(e);
  cs = cs.subtract(C().circle(ri, 96)).subtract(C().square([slit, ro + 12]).translate([-slit / 2, -ro - 11]));
  let m = cs.extrude(w);
  const y = -ro - 3.5;
  m = m.subtract(tearX(2.2, -ear - 1, ear + 1, y, w / 2));
  // Nut pocket (corner up and down, so it prints) and a seat for the bolt head.
  const rc = 7.3 / Math.sqrt(3);
  const nut = C().hull([C().circle(rc, 6).rotate(90), C().square([0.02, 0.02], true).translate([0, rc * 1.366])]);
  m = m.subtract(nut.extrude(3.6).rotate([90, 0, 90]).translate([ear - 3, y, w / 2]));
  m = m.subtract(tearX(3.8, -ear - 1, -ear + 3, y, w / 2));
  return m;
}

// ================================================================== 3D printer
/** Spool holder: an arm from the wall, or two uprights on a base with an axle and hub cones. */
function spoolHolder(p: Params) {
  const hub = num(p, 'hub'), SW = num(p, 'SW'), sd = screwOf(p);
  if (p.mode !== 'table') {
    const ra = Math.min(hub / 2 - 3, 18), Lp = Math.max(60, 2 * ra + 20), Hp = Math.max(90, 2 * ra + 50), T = nv(p, 'T', 5);
    let m = box(-Lp / 2, -Hp / 2, 0, Lp / 2, Hp / 2, T);
    const L = SW + 10;
    // Arm with a 45° foot at the plate and a lip at the end.
    let arm = rev([[0, T - 0.01], [ra + 8, T - 0.01], [ra, T + 8], [ra, T + L], [ra + 4, T + L + 4], [ra + 4, T + L + 7], [0, T + L + 7]]);
    // Hollow from the wall side (closed at the lip with a 45° cone).
    arm = arm.subtract(rev([[0, -1], [ra - 3, -1], [ra - 3, T + L - ra], [0, T + L]]));
    m = m.add(arm).subtract(cyl(T + 2, ra - 3, ra - 3, 64).translate([0, 0, -1]));
    if (sd) for (const y of [Hp / 2 - 10, -Hp / 2 + 10]) m = m.subtract(csHole(0, y, T, sd));
    return settle(m);
  }
  const ad = nv(p, 'axle', 20), R = num(p, 'R'), ut = 6, ha = R + 10;
  const span = SW + 12 + 2 * ut;
  // Base with two slots for the uprights.
  const BW = span + 40, BD = 90;
  let base = box(-BW / 2, -BD / 2, 0, BW / 2, BD / 2, 5);
  for (const s of [-1, 1]) base = base.subtract(box(s * (span / 2 - ut / 2) - (ut + 0.3) / 2, -25.15, -1, s * (span / 2 - ut / 2) + (ut + 0.3) / 2, 25.15, 6));
  // Upright, lying flat: trapezoid with a tab below and a U notch for the axle on top.
  let up = ccw([[-40, 0], [40, 0], [16, ha + 14], [-16, ha + 14]]).add(C().square([50, 5]).translate([-25, -5]));
  up = up.subtract(C().circle(ad / 2 + 0.4, 48).translate([0, ha])).subtract(C().square([ad + 0.8, 30]).translate([-(ad + 0.8) / 2, ha]));
  const upright = up.extrude(ut);
  // Axle tube and two hub cones that centre the spool on it.
  const AL = span + 16;
  const axle = cyl(AL, ad / 2, ad / 2, 64).subtract(cyl(AL + 2, ad / 2 - 3, ad / 2 - 3, 48).translate([0, 0, -1]));
  const cone = rev([[ad / 2 + 0.3, 0], [hub / 2 + 6, 0], [hub / 2 + 6, 2.5], [hub / 2 - 0.3, 2.5], [hub / 2 - 0.3, 12], [ad / 2 + 0.3, 12]]);
  return row([base, upright, upright, axle, cone, cone]);
}

/** Filament guide: a plate for the wall or frame and an arm with a ring for a PTFE tube or bare filament. */
function filamentGuide(p: Params) {
  const A = num(p, 'A'), w = nv(p, 'W', 10), t = nv(p, 'T', 4), P = 44, hole = p.kind === 'filament' ? 2.4 : 4.3;
  const ro = hole / 2 + 3, xr = t + A;
  let cs = C().square([t, P]).add(C().square([A, 8]).translate([t - 0.01, P / 2 - 4])).add(C().circle(ro, 40).translate([xr, P / 2]));
  cs = cs.subtract(C().circle(hole / 2, 32).translate([xr, P / 2]));
  let m = cs.extrude(w);
  if (p.kind === 'filament') m = m.subtract(cyl(1.4, hole / 2 + 1.2, hole / 2, 32).translate([xr, P / 2, -0.01])).subtract(cyl(1.4, hole / 2, hole / 2 + 1.2, 32).translate([xr, P / 2, w - 1.39]));
  const sd = screwOf(p);
  if (sd) for (const y of [7, P - 7]) m = m.subtract(csHoleX(y, w / 2, t, Math.min(sd, w - 4)).translate([t / 2, 0, 0]));
  return settle(m);
}

/** Spool clip: a U over the spool's rim with a hole for the filament end. */
function spoolClip(p: Params) {
  const ft = num(p, 'ft') + 0.2, Lc = nv(p, 'L', 14), t = 2.4, to = 4.4, w = nv(p, 'W', 10), fd = Number(p.fil ?? 1.75) + 0.45;
  let cs = C().square([t + ft + to, Lc + t]).translate([-t, -Lc]);
  cs = cs.subtract(C().square([ft, Lc + 1]).translate([0, -Lc - 1.01]));
  // Lead-in at the mouth and a small bump that pinches the rim.
  cs = cs.subtract(ccw([[-0.6, -Lc - 0.01], [ft + 0.6, -Lc - 0.01], [ft, -Lc + 1.2], [0, -Lc + 1.2]]));
  cs = cs.add(C().circle(0.5, 16).translate([ft, -Lc + 3]));
  cs = cs.subtract(C().circle(fd / 2, 24).translate([ft + to / 2, -Lc / 2]));
  return settle(cs.extrude(w));
}

/** Nozzle organizer: a block with threaded-nozzle holes and a row for needles and hex keys. */
function nozzleOrganizer(p: Params) {
  const N = Math.max(1, Math.round(num(p, 'N'))), cols = Math.max(1, Math.round(num(p, 'cols'))), d = num(p, 'd'), dep = nv(p, 'depth', 8);
  const tools = Math.max(0, Math.round(num(p, 'tools'))), td = nv(p, 'td', 4), pitch = Math.max(d + 4, 10);
  const rows = Math.ceil(N / cols), H = dep + 3;
  const W = cols * pitch + 6, D = rows * pitch + (tools ? pitch : 0) + 6;
  let m = box(0, 0, 0, Math.max(W, tools * (td + 4) + 8), D, H);
  const holes: Manifold[] = [];
  for (let i = 0; i < N; i++) {
    const x = 3 + pitch / 2 + (i % cols) * pitch, y = D - 3 - pitch / 2 - Math.floor(i / cols) * pitch;
    holes.push(cyl(dep + 1, d / 2, d / 2, 32).translate([x, y, H - dep]), cyl(1, d / 2, d / 2 + 1, 32).translate([x, y, H - 0.99]));
  }
  for (let i = 0; i < tools; i++) holes.push(cyl(H, td / 2, td / 2, 24).translate([6 + td / 2 + i * (td + 4), 3 + pitch / 2, 2]));
  m = m.subtract(union(holes));
  return settle(m);
}

/** Clearance test: a plate with five holes, each a little bigger, and pegs; notches say which gap is which. */
function clearanceTest(p: Params) {
  const d = num(p, 'd'), g0 = num(p, 'g0'), st = num(p, 'step'), k = 5, T = 5;
  const pitch = d + 8, W = k * pitch + 4, D = d + 16;
  let plate = box(0, 0, 0, W, D, T);
  for (let i = 0; i < k; i++) {
    const x = 2 + pitch / 2 + i * pitch, g = g0 + i * st;
    plate = plate.subtract(cyl(T + 2, d / 2 + g, d / 2 + g, 64).translate([x, D / 2, -1]));
    // i + 1 notches on the front edge under the hole.
    for (let j = 0; j <= i; j++) plate = plate.subtract(box(x - (i * 2.2) / 2 + j * 2.2 - 0.6, -1, T - 1.2, x - (i * 2.2) / 2 + j * 2.2 + 0.6, 3, T + 1));
  }
  const peg = rev([[0, 0], [d / 2, 0], [d / 2, 9.4], [d / 2 - 0.6, 10], [0, 10]], 64);
  return row([plate, ...Array.from({ length: k }, () => peg)], 4);
}

// ================================================================== pets
/** Pet bowl: sloped walls (30°) and an optional stand with a seat that the bowl drops into. */
function petBowl(p: Params) {
  const D = num(p, 'D'), H = num(p, 'H'), t = nv(p, 'wall', 2.4), fl = nv(p, 'floor', 3), Hs = num(p, 'Hs');
  const k = Math.tan((30 * Math.PI) / 180);
  const rt = D / 2 + t, rb = rt - H * k;
  const bowl = rev([[0, 0], [rb, 0], [rt, H], [rt - t, H], [rb - t + fl * k, fl], [0, fl]]);
  if (!(Hs > 0)) return settle(bowl);
  // Stand: legs ring up to Hs, then a cone parallel to the bowl that it sits in.
  const hs = H * 0.55, g = 0.4;
  const stand0 = rev([[rb - 6, 0], [rb + 6, 0], [rb + 6, Hs], [rb + g + 3 + hs * k, Hs + hs], [rb + g + hs * k, Hs + hs], [rb + g, Hs], [rb - 6, Hs]]);
  // Pointed windows between the legs.
  let stand = stand0;
  const wW = Math.min(40, (2 * Math.PI * rb) / 6 - 14), wH = Hs - 12;
  if (wH > wW / 2 + 6) {
    const win = ccw([[-wW / 2, 6], [wW / 2, 6], [wW / 2, 6 + wH - wW / 2], [0, 6 + wH], [-wW / 2, 6 + wH - wW / 2]]).extrude(40, 0, 0, [1, 1], true).rotate([90, 0, 90]);
    for (let i = 0; i < 6; i++) stand = stand.subtract(win.translate([rb, 0, 0]).rotate([0, 0, i * 60]));
  }
  return row([bowl, stand], 8);
}

/** Leash hanger: hooks on a plate with a raised name above them. */
function leashHook(p: Params) {
  const k = Math.max(1, Math.round(num(p, 'N'))), w = num(p, 'hookW'), gap = num(p, 'gap'), H = num(p, 'H'), T = nv(p, 'T', 5);
  const L = k * w + (k - 1) * gap + 30;
  const x0 = 15 + w / 2;
  let m = hookPlate({ ...p, L, T, screw: screwOf(p) }, Array.from({ length: k }, (_, i) => x0 + i * (w + gap)));
  const text = String(p.text ?? '').trim();
  if (text) {
    const font = String(p.font || 'sans-bold');
    const probe = textOutline(text, font, 10, 0.8);
    const len = probe ? probe.bounds().max[0] - probe.bounds().min[0] : 10;
    const size = Math.max(5, Math.min(H * 0.22, ((L - 60) / len) * 10));
    const cs = textOutline(text, font, size, size * 0.08);
    if (cs) {
      const b = cs.bounds();
      m = m.add(cs.translate([L / 2 - (b.min[0] + b.max[0]) / 2, H * 0.47 - (b.min[1] + b.max[1]) / 2]).extrude(1.2).translate([0, 0, T - 0.01]));
    }
  }
  return settle(m);
}

/** Treat ball: two halves that press together; treats fall out of the holes as it rolls. */
function treatBall(p: Params) {
  const R = num(p, 'D') / 2, t = nv(p, 'wall', 2.4), hd = num(p, 'hole'), nh = Math.max(1, Math.round(num(p, 'nh')));
  // Each half: a sphere whose bottom turns into a 45° cone, so the half prints open side up.
  const c = R * Math.SQRT2 - 4;
  const shell = (r: number, z0: number, r0: number) => M().Manifold.hull([M().Manifold.sphere(r, 96).translate([0, 0, c]), cyl(0.01, r0, r0, 32).translate([0, 0, z0])]);
  const cut = box(-R - 1, -R - 1, c, R + 1, R + 1, c + R + 1);
  const half = shell(R, 0, 4).subtract(cut).subtract(shell(R - t, t, Math.max(0.6, 4 - t * 0.4)));
  // Lip on half A that goes into half B.
  const rin = Math.sqrt((R - t) ** 2 - 25) - 0.2;
  const lip = cyl(5, rin, rin, 96).subtract(cyl(7, rin - 1.6, rin - 1.6, 96).translate([0, 0, -1])).translate([0, 0, c - 0.01]);
  // A 45° band inside the rim carries the lip.
  const wb = R - t + 0.3 - (rin - 1.6);
  const band = rev([[rin - 1.6, c], [R - t + 0.3, c - wb], [R - t + 0.3, c]]);
  let A = half.add(band).add(lip);
  const zh = c * 0.62, rh = Math.sqrt(R * R - (c - zh) ** 2);
  for (let i = 0; i < nh; i++) A = A.subtract(tearX(hd / 2, rh - t - 4, rh + 4, 0, zh).rotate([0, 0, (i * 360) / nh]));
  return row([A, half], 8);
}

/** Poop bag dispenser: a tube for the roll with a slot to pull bags through, a lid and an ear for the leash. */
function bagDispenser(p: Params) {
  const dr = num(p, 'dr'), Lr = num(p, 'Lr'), t = nv(p, 'wall', 2);
  const ri = dr / 2 + 1, ro = ri + t, L = Lr + 4;
  let tube = cyl(L, ro, ro, 96).subtract(cyl(L, ri, ri, 96).translate([0, 0, 2]));
  // Slot along the side, pointed at the top.
  const sw = nv(p, 'slot', 4);
  const z1 = L - 6, z0 = Math.min(10, L * 0.2);
  tube = tube.subtract(yzPrism([[-sw / 2, z0], [sw / 2, z0], [sw / 2, z1 - sw / 2], [0, z1], [-sw / 2, z1 - sw / 2]], 0, ro + 2));
  // Ear opposite the slot, its underside at 45°, with a teardrop hole for the leash clip.
  const ear = xzPrism([[-ro + 1, L - 24], [-ro - 14, L - 9], [-ro - 14, L], [-ro + 1, L]], -2.5, 2.5).subtract(tearY(3, -4, 4, -ro - 8, L - 5.5));
  tube = tube.add(ear);
  // Lid: a disc and a ring that plugs into the tube.
  const lid = cyl(2, ro, ro, 96).add(cyl(6, ri - 0.2, ri - 0.2, 96).subtract(cyl(8, ri - 1.8, ri - 1.8, 96)).translate([0, 0, 1.99]));
  return row([tube, lid], 8);
}

// ================================================================== bike and car
/** Dovetail with a pointed top (45°), so the groove printed into the bed face of the cradle needs no support. */
const dove = (a: number, b: number, h: number, g = 0): P2[] => [[-(a / 2 - g), 0], [a / 2 - g, 0], [b / 2 - g, h - g], [0, h + b / 2 - g * 2], [-(b / 2 - g), h - g]];

/** Phone holder on a handlebar: a clamp with a dovetail rail and a cradle that slides onto it. */
function barPhoneMount(p: Params) {
  const bar = num(p, 'bar'), PW = num(p, 'PW') + 1, PT = num(p, 'PT'), Hc = num(p, 'Hc'), w = 22;
  const ro = bar / 2 + 4.2, a = 9, b = 12, hd = 3.5;
  const yp = ro + 3;
  const rail = ccw(dove(a, b, hd, 0.25)).translate([0, yp]);
  const clamp = barClamp(bar, w, [C().square([24, 5]).translate([-12, yp - 5]), rail]);
  // Cradle: back plate with a raised band holding the groove, lips round the phone.
  const tb = 3, zb = hd + b / 2 + 2.5;
  let cr = box(-PW / 2 - 3.5, -Hc / 2, 0, PW / 2 + 3.5, Hc / 2, tb).add(box(-PW / 2 - 3.5, -b / 2 - 4, 0, PW / 2 + 3.5, b / 2 + 4, zb));
  const zt = zb + PT + 3.2;
  for (const s of [-1, 1]) {
    for (const y of [-Hc * 0.3, Hc * 0.3]) {
      const x0 = s * (PW / 2), x1 = s * (PW / 2 + 3.5);
      cr = cr.add(box(Math.min(x0, x1), y - 8, 0, Math.max(x0, x1), y + 8, zt));
      // 45° lip over the phone's edge.
      cr = cr.add(xzPrism(s > 0 ? [[x0, zt - 3], [x0, zt], [x0 - 3, zt]] : [[x0, zt - 3], [x0 + 3, zt], [x0, zt]], y - 8, y + 8));
    }
  }
  // Ledge the phone stands on.
  cr = cr.add(box(-20, -Hc / 2, 0, 20, -Hc / 2 + 3.5, zt)).add(yzPrism([[-Hc / 2 + 3.5, zt - 3], [-Hc / 2 + 3.5, zt], [-Hc / 2 + 6.5, zt]], -20, 20));
  // Groove along X from the bed face, closed at +X so the cradle stops on the rail.
  cr = cr.subtract(yzPrism(dove(a, b, hd).map(([x, y]) => [x, y - 0.01] as P2), -PW / 2 - 5, PW / 2 - 4));
  return row([clamp, cr], 8);
}

/** Bike light or camera mount: a clamp on the bar with a tab (M5 hole) or two action-camera fingers. */
function lightMount(p: Params) {
  const bar = num(p, 'bar'), w = nv(p, 'W', 15), ro = bar / 2 + 4.2;
  if (p.kind === 'gopro') {
    // Two fingers 3 mm thick with a 3.2 mm gap, the hole across them (sideways in print, teardrop).
    const fh = 16;
    const fingers = C().square([3, fh]).translate([-4.6, ro - 1]).add(C().square([3, fh]).translate([1.6, ro - 1])).add(C().square([12, 4]).translate([-6, ro - 1.5]));
    let m = barClamp(bar, w, [fingers]);
    m = m.subtract(tearX(2.65, -6, 6, ro + fh - 7, w / 2));
    return settle(m);
  }
  const L = nv(p, 'L', 18);
  const tab = C().hull([C().square([14, 1]).translate([-7, ro - 2]), C().circle(7, 40).translate([0, ro + L])]).subtract(C().circle(2.7, 32).translate([0, ro + L]));
  return settle(barClamp(bar, w, [tab]));
}

/** Car headrest hook: snaps onto the headrest post and hangs a bag below it. */
function headrestHook(p: Params) {
  const rp = num(p, 'post') / 2 + 0.2, t = 3.2, lc = nv(p, 'Lc', 20), drop = num(p, 'drop'), R = num(p, 'R'), tz = nv(p, 'T', 6);
  // Clip round the post (post along X, lying): flat bottom on the bed, opening on top narrower than the post.
  const zc = rp + t;
  let clip = C().hull([C().circle(rp + t, 64).translate([0, zc]), C().square([2 * (rp + t), 0.1]).translate([-(rp + t), 0])]);
  clip = clip.subtract(C().circle(rp, 64).translate([0, zc])).subtract(C().square([rp * 1.5, rp + t + 2]).translate([-rp * 0.75, zc]));
  let m = clip.extrude(lc).rotate([90, 0, 90]);
  // J hook beside the clip, lying flat.
  const Y0 = rp + t + 1.5;
  const pts: P2[] = [[lc, Y0], [-drop, Y0], ...arc(-drop, Y0 + R, R, 270, 90, 16), [-drop + 6, Y0 + 2 * R]];
  m = m.add(stroke(pts, 5).extrude(tz));
  return settle(m);
}
/** Cup holder for the air vent: a ring with a half-dovetail channel and a clip that hooks on a louver. */
function ventCupHolder(p: Params) {
  const dc = num(p, 'dc') + 1, Hr = num(p, 'Hr'), t = 2.4, lg = num(p, 'lg') + 0.3, dv = num(p, 'dv');
  const ri = dc / 2, ro = ri + t;
  // Ring with a ledge for the cup's bottom and a slot for a handle.
  let ring = cyl(Hr, ro, ro, 128).subtract(cyl(Hr + 1, ri, ri, 128).translate([0, 0, 2.4])).subtract(cyl(4, ri - 8, ri - 8, 96).translate([0, 0, -1]));
  if (p.handle !== false) ring = ring.subtract(box(-11, 0, 14, 11, ro + 1, Hr + 1));
  const sh = 14, sn = 9, dF = 6, g = 0.3, Ws = sh + 8, y0 = -ro - dF - 4;
  ring = ring.add(box(-Ws / 2, y0, 0, Ws / 2, -ri + 1, Hr));
  ring = ring.subtract(ccw([[-sh / 2 - g, y0 - 0.1], [-sh / 2 + sn + g, y0 - 0.1], [sh / 2 + g, y0 + dF + g], [-sh / 2 - g, y0 + dF + g]]).extrude(Hr).translate([0, 0, 4]));
  ring = ring.subtract(cyl(Hr + 1, ri, ri, 128).translate([0, 0, 2.4]));
  // Clip on its side: back bar, a fork for the louver at the top, the rail on the front face.
  const tb = 4;
  let prof = C().square([tb, Hr]).translate([-tb, 0]);
  prof = prof.add(C().square([dv + tb, 3]).translate([-dv - tb, Hr - 3])).add(C().square([3, 9]).translate([-dv - tb, Hr - 9]));
  prof = prof.add(C().square([dv * 0.7, 3]).translate([-dv * 0.7 - tb, Hr - 6 - lg]));
  let clip = prof.extrude(sh);
  clip = clip.add(xzPrism([[-0.01, 0], [-0.01, sn], [dF, sh], [dF, 0]], 4.2, Hr));
  return row([ring, clip], 8);
}

// ================================================================== kitchen
/** One end of the paper-towel rod: bracket profile for the wall or under a cabinet. */
function towelBracket(mode: string, A: number, rN: number, w: number, sd: number): Manifold {
  const t = 5;
  if (mode === 'under') {
    const hp = 50, xa = hp / 2;
    const xk = xa + rN + 3;
    let cs = C().square([hp, t]).translate([0, -t]).add(C().square([10, A]).translate([xa - 5, -A]));
    cs = cs.add(C().hull([C().square([10, 1]).translate([xa - 5, -A]), C().circle(rN + 4, 48).translate([xk, -A])]));
    cs = cs.subtract(C().circle(rN, 48).translate([xk, -A])).subtract(C().square([2 * rN, 3 * rN]).translate([-rN, 0]).rotate(-45).translate([xk, -A]));
    let m = cs.extrude(w);
    if (sd) for (const x of [8, hp - 8]) m = m.subtract(csHole(0, 0, t, sd).rotate([90, 0, 0]).translate([x, 0, w / 2]));
    return m;
  }
  const hp = 60;
  const xN = t + A, yN = hp / 2 + 4;
  let cs = C().square([t, hp]).add(C().square([A, 10]).translate([t - 0.01, hp / 2 - 5])).add(C().circle(rN + 4, 48).translate([xN, yN]));
  cs = cs.subtract(C().circle(rN, 48).translate([xN, yN])).subtract(C().square([2 * rN, 2 * rN]).translate([xN - rN, yN]));
  let m = cs.extrude(w);
  if (sd) for (const y of [8, hp - 8]) m = m.subtract(csHoleX(y, w / 2, t, sd).translate([t / 2, 0, 0]));
  return m;
}
/** A piece of the rod: a hollow tube with a pin, a socket or a spigot at the ends (45° shoulders and ceilings). */
function rodPiece(len: number, r: number, rp: number, pinL: number, bottom: 'pin' | 'socket', top: 'pin' | 'spigot'): Manifold {
  const ri = r - 2.4, sh = r - rp, zb = bottom === 'pin' ? pinL + sh : 0, zt = zb + len;
  const pts: P2[] = bottom === 'pin' ? [[0, 0], [rp, 0], [rp, pinL], [r, zb]] : [[0, 0], [r, 0]];
  if (top === 'pin') pts.push([r, zt], [rp, zt + sh], [rp, zt + sh + pinL], [0, zt + sh + pinL]);
  else pts.push([r, zt], [ri - 0.25, zt], [ri - 0.25, zt + 15], [0, zt + 15]);
  // Below: a thin bore through the pin opens the hollow (no closed void), widening at 45°.
  const low: P2[] = bottom === 'pin' ? [[0, -1], [1.5, -1], [1.5, zb - (ri - 1.5)], [ri, zb]] : [[0, -1], [ri, -1]];
  const cav: P2[] = top === 'pin' ? [...low, [ri, zt - ri], [0, zt]] : [...low, [ri, zt - 2.25], [ri - 2.25, zt], [ri - 2.25, zt + 16], [0, zt + 16]];
  return rev(pts, 64).subtract(rev(cav, 64));
}
/** Paper towel holder: two brackets and a rod (split in two when the roll is wider than the bed). */
function paperTowelHolder(p: Params) {
  const RW = num(p, 'RW'), rd = num(p, 'rd'), A = num(p, 'A'), w = 15, rN = 5.4, rp = 5, sd = screwOf(p);
  const br = towelBracket(String(p.mode ?? 'wall'), A, rN, w, sd);
  const len = RW + 6, pinL = w + 2;
  const pieces: Manifold[] = [br, br];
  if (len + 2 * pinL + 2 * (rd / 2 - rp) <= 245) pieces.push(rodPiece(len, rd / 2, rp, pinL, 'pin', 'pin'));
  else {
    const h = len / 2;
    pieces.push(rodPiece(h, rd / 2, rp, pinL, 'pin', 'spigot'), rodPiece(h, rd / 2, rp, pinL, 'socket', 'pin'));
  }
  return row(pieces, 8);
}

/** Trivet: a lattice of hexagons in a solid rim, feet on top (it is used the other way up). */
function trivet(p: Params) {
  const S = num(p, 'S'), T = nv(p, 'T', 6), cell = num(p, 'cell'), rib = nv(p, 'rib', 3), rim = nv(p, 'rim', 8);
  const round = p.shape !== 'square';
  const outer = round ? C().circle(S / 2, 128) : C().square([S, S], true).offset(8, 'Round', undefined, 24).offset(-8, 'Round', undefined, 24);
  const inner = round ? C().circle(S / 2 - rim, 128) : C().square([S - 2 * rim, S - 2 * rim], true);
  const holes: CrossSection[] = [];
  const r = cell / 2, dx = cell + rib, dy = dx * 0.866;
  for (let j = -Math.ceil(S / dy); j <= Math.ceil(S / dy); j++)
    for (let i = -Math.ceil(S / dx); i <= Math.ceil(S / dx); i++) holes.push(C().circle(r / 0.866, 6).rotate(30).translate([i * dx + (j % 2 ? dx / 2 : 0), j * dy]));
  const lattice = C().union(holes).intersect(inner);
  let m = outer.subtract(lattice).extrude(T);
  const rf = S / 2 - rim / 2;
  for (const a of round ? [90, 210, 330] : [45, 135, 225, 315]) {
    const rr = round ? rf : rf * Math.SQRT2 - 2;
    m = m.add(cyl(3, rim / 2 - 0.5, rim / 2 - 1.5, 32).translate([rr * Math.cos((a * Math.PI) / 180), rr * Math.sin((a * Math.PI) / 180), T - 0.01]));
  }
  return settle(m);
}

/** Capsule rack: a plate with seats for the capsules' rims and a frame that stands on the table. */
const CAPS: Record<string, { body: number; rim: number; h: number }> = {
  nespresso: { body: 30.5, rim: 37.5, h: 28 },
  dolce: { body: 46.5, rim: 53.5, h: 50 },
};
function capsuleRack(p: Params) {
  const c = CAPS[String(p.kind)] ?? CAPS.nespresso, cols = Math.max(1, Math.round(num(p, 'cols'))), rows = Math.max(1, Math.round(num(p, 'rows')));
  const T = 4, wall = 2.4, pitch = c.rim + 3;
  const W = cols * pitch + 2 * wall + 2, D = rows * pitch + 2 * wall + 2, Hf = c.h + 6;
  // The plate is printed on the bed, its top (where capsules go in) down: the seats are 45° cones.
  let m = box(0, 0, 0, W, D, T).add(box(0, 0, 0, W, D, Hf).subtract(box(wall, wall, -1, W - wall, D - wall, Hf + 1)));
  const holes: Manifold[] = [];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = wall + 1 + pitch / 2 + i * pitch, y = wall + 1 + pitch / 2 + j * pitch;
      const dz = (c.rim - c.body) / 2;
      holes.push(cyl(T + 2, c.body / 2 + 0.3, c.body / 2 + 0.3, 64).translate([x, y, -1]), cyl(dz, c.rim / 2 + 0.3, c.body / 2 + 0.3, 64).translate([x, y, -0.01]));
    }
  m = m.subtract(union(holes));
  return settle(m);
}

/** Plastic bag organizer: a tall box, stuffed from the top, bags pulled out of the round opening at the bottom. */
function bagOrganizer(p: Params) {
  const W = num(p, 'W'), D = num(p, 'D'), H = num(p, 'H'), t = nv(p, 'wall', 2), r = num(p, 'hole') / 2;
  const sq = C().square([W - 16, D - 16], true).offset(8, 'Round', undefined, 24);
  let m = sq.extrude(H).subtract(sq.offset(-t, 'Round', undefined, 24).extrude(H).translate([0, 0, t]));
  const zc = Math.max(r + t + 6, 40);
  m = m.subtract(tearY(r, -D / 2 - 1, -D / 2 + t + 1, 0, zc));
  const sd = screwOf(p);
  if (sd) for (const x of [-W / 4, W / 4]) m = m.subtract(csHole(0, 0, t, sd).rotate([90, 0, 0]).translate([x, D / 2, H - 20]));
  return settle(m);
}

// ================================================================== home
/** Key rack: hooks below and a shelf with a lip on top (for a wallet or phone). */
function keyShelf(p: Params) {
  const k = Math.max(1, Math.round(num(p, 'N'))), L = num(p, 'L'), H = num(p, 'H'), T = nv(p, 'T', 5), Ds = num(p, 'Ds'), st = nv(p, 'st', 3), lip = nv(p, 'lip', 8);
  const step = (L - 30) / Math.max(1, k - 1);
  const xs = k === 1 ? [L / 2] : Array.from({ length: k }, (_, i) => 15 + i * step);
  let m = hookPlate({ ...p, L, T, screw: screwOf(p) }, xs);
  m = m.add(box(0, H - st, T - 0.01, L, H, Ds)).add(yzPrism([[H, Ds - lip], [H + lip, Ds], [H - st, Ds]], 0, L));
  return settle(m);
}

/** Remote holder: a box with pockets for remotes, lower at the front; screw holes in the back if you want it on the wall. */
function remoteHolder(p: Params) {
  const k = Math.max(1, Math.round(num(p, 'N'))), pw = num(p, 'pw'), D = num(p, 'D'), H = num(p, 'H'), t = nv(p, 'wall', 2);
  const W = k * pw + (k + 1) * t;
  let m = box(0, 0, 0, W, D, H);
  for (let i = 0; i < k; i++) m = m.subtract(box(t + i * (pw + t), t, t, t + i * (pw + t) + pw, D - t, H + 1));
  // Front cut down (60 % by default), rising to the full height at the back.
  const hf = H * nv(p, 'front', 60) / 100;
  m = m.subtract(yzPrism([[-1, hf], [D * 0.35, hf], [D - t, H], [D - t, H + 1], [-1, H + 1]], -1, W + 1));
  const sd = screwOf(p);
  if (sd) for (const x of k > 1 ? [t + pw / 2, W - t - pw / 2] : [W / 2]) m = m.subtract(csHole(0, 0, t, sd).rotate([90, 0, 0]).translate([x, D, H * 0.7]));
  return settle(m);
}

/** Broom and mop holder: C rings that snap round the handles, on a strip for the wall (printed standing). */
function broomHolder(p: Params) {
  const k = Math.max(1, Math.round(num(p, 'N'))), d = num(p, 'd') + 0.6, h = nv(p, 'h', 20), t = 5, tw = 3.6;
  const pitch = d + 2 * tw + 14, L = k * pitch + 20;
  let cs = C().square([L, t]);
  const rr = d / 2;
  for (let i = 0; i < k; i++) {
    const x = 10 + pitch / 2 + i * pitch, yc = t + rr - 1;
    let ring = ringCS(rr + tw, rr, 96).translate([x, yc]);
    // Opening, a little narrower than the handle, with rounded flared lips.
    const op = d * 0.8;
    ring = ring.subtract(ccw([[x - op / 2, yc + rr * 0.4], [x + op / 2, yc + rr * 0.4], [x + op / 2 + 4, yc + rr + tw + 1], [x - op / 2 - 4, yc + rr + tw + 1]]));
    cs = cs.add(ring);
  }
  let m = cs.extrude(h);
  const sd = screwOf(p);
  if (sd) for (let i = 0; i <= k; i++) m = m.subtract(csHole(0, 0, t, Math.min(sd, h - 6)).rotate([-90, 0, 0]).translate([10 + i * pitch, 0, h / 2]));
  return settle(m);
}

/** Toilet paper holder: an arm with a tip, optionally with a shelf on top for the phone. */
function toiletPaperHolder(p: Params) {
  const w = num(p, 'hookW'), H = num(p, 'H'), T = nv(p, 'T', 5), shelf = p.shelf === true, Ds = num(p, 'Ds');
  const L = shelf ? Math.max(num(p, 'Ls'), w + 40) : w + 24;
  let m = hookPlate({ ...p, L, T, screw: screwOf(p) }, [shelf ? w / 2 + 12 : L / 2]);
  if (shelf) m = m.add(box(0, H - 3, T - 0.01, L, H, Ds)).add(yzPrism([[H, Ds - 6], [H + 6, Ds], [H - 3, Ds]], 0, L));
  return settle(m);
}

// ================================================================== garden
/** Plastic bottle neck thread (PCO 1881, most water and soda bottles). */
const PCO: ThreadSpec = { d: 28, p: 2.7, angle: 60, af: 0, label: 'PCO 1881' };
/** Bottle dripper: screws onto a plastic bottle, its spike goes into the soil; water drips through the bore. */
function bottleDripper(p: Params) {
  const Ls = num(p, 'Ls'), bore = num(p, 'bore'), ro = PCO.d / 2 + 3, ht = 12;
  const rs = 5;
  const top = ht + 2 + (ro - rs) + Ls, rmn = PCO.d / 2 - 1.2, rmj = PCO.d / 2 + 0.4;
  let m = rev([[0, 0], [ro, 0], [ro, ht + 2], [rs, ht + 2 + (ro - rs)], [1.6, top], [0, top]]);
  // Bore at the thread's crest, a 45° flare over the last turn, then a 45° cone down to the drip hole.
  m = m.subtract(rev([[0, -1], [rmn, -1], [rmn, ht - (rmj - rmn)], [rmj, ht], [bore / 2, ht + rmj - bore / 2], [bore / 2, top + 1], [0, top + 1]]));
  m = m.subtract(internalThreadCut(PCO, ht, 0.35, true));
  return settle(m);
}

/** Bird feeder: a tray with a seed tube and feeding windows, and a cone roof that slides up the string. */
function birdFeeder(p: Params) {
  const D = num(p, 'D'), Ht = num(p, 'Ht'), rt = num(p, 'dt') / 2, t = 2.4;
  const R = D / 2;
  let base = cyl(3, R, R, 128).add(cyl(12, R, R, 128).subtract(cyl(14, R - t, R - t, 128).translate([0, 0, -1])));
  for (let i = 0; i < 8; i++) base = base.subtract(cyl(5, 1.5, 1.5, 12).translate([(R - 8) * Math.cos((i * Math.PI) / 4), (R - 8) * Math.sin((i * Math.PI) / 4), -1]));
  let tube = cyl(Ht, rt + t, rt + t, 96).subtract(cyl(Ht + 2, rt, rt, 96).translate([0, 0, -1]));
  const win = ccw([[-9, 0], [9, 0], [9, 12], [0, 21], [-9, 12]]).extrude(rt * 3, 0, 0, [1, 1], true).rotate([90, 0, 90]);
  for (let i = 0; i < 3; i++) tube = tube.subtract(win.translate([0, 0, 3]).rotate([0, 0, i * 120]));
  // Two ears at the top for the string.
  for (const s of [-1, 1]) {
    const ear = xzPrism([[rt + t - 1, Ht - 22], [rt + t + 12, Ht - 9], [rt + t + 12, Ht], [rt + t - 1, Ht]], -2.5, 2.5).subtract(tearY(2.5, -4, 4, rt + t + 6, Ht - 5));
    tube = tube.add(s > 0 ? ear : ear.rotate([0, 0, 180]));
  }
  const feeder = base.add(tube.translate([0, 0, 2.99]));
  // Roof: a 45° cone shell with a collar that sits on the tube and a hole at the top for the string.
  const Rr = Math.max(R * 0.85, rt + 30), rc = rt + t + 0.4, hr = Rr - 4;
  let roof = rev([[0, 0], [Rr, 0], [4, hr], [0, hr]]).subtract(rev([[0, -1], [Rr - 3.4, -1], [0, Rr - 4.4]]));
  roof = roof.add(rev([[rc, 0], [rc + 2.4, 0], [rc + 2.4, Rr - 3.4 - rc - 1], [rc, Rr - 3.4 - rc + 1]]));
  roof = roof.subtract(cyl(hr + 2, 2.5, 2.5, 24).translate([0, 0, -1]));
  return row([feeder, roof], 8);
}

/** Mesh clip: one C snaps on the wire of a fence or net, the other on a stake or pipe. */
function meshClip(p: Params) {
  const d1 = num(p, 'd1') + 0.3, d2 = num(p, 'd2') + 0.4, w = nv(p, 'W', 10), t1 = 2, t2 = 3;
  const r1 = d1 / 2, r2 = d2 / 2;
  const y1 = r1 + t1, y2 = -(r2 + t2);
  let cs = ringCS(r1 + t1, r1, 48).translate([0, y1]).add(ringCS(r2 + t2, r2, 96).translate([0, y2 - 1])).add(C().square([Math.min(d1, d2) + 2, 3]).translate([-(Math.min(d1, d2) + 2) / 2, -1.5]));
  cs = cs.subtract(C().square([d1 * 0.8, r1 + t1 + 1]).translate([-d1 * 0.4, y1 + r1 * 0.3]));
  cs = cs.subtract(C().square([d2 * 0.8, r2 + t2 + 1]).translate([-d2 * 0.4, y2 - 1 - r2 * 0.3 - (r2 + t2 + 1)]));
  return settle(cs.extrude(w));
}

/** Seeder: a cup, a lid with one opening and a dial with holes 1–3 mm that turns on a snap pin. */
function seeder(p: Params) {
  const Dc = num(p, 'Dc'), H = num(p, 'H'), t = 2;
  const ri = Dc / 2, ro = ri + t, rh = ri * 0.55;
  const cup = cyl(H, ro, ro, 96).subtract(cyl(H, ri, ri, 96).translate([0, 0, 2]));
  // Lid: a solid plug (printed down), a 45° flare, then the disc; the pin stands on the outer face.
  const pl = 6, fl = ro - (ri - 0.2), dt = 2;
  let lid = rev([[0, 0], [ri - 0.2, 0], [ri - 0.2, pl], [ro, pl + fl], [ro, pl + fl + dt], [0, pl + fl + dt]]);
  const zt = pl + fl + dt, dialT = 2.4;
  lid = lid.subtract(cyl(zt + 2, 2.6, 2.6, 24).translate([rh, 0, -1]));
  let pin = rev([[0, zt - 0.01], [2.4, zt - 0.01], [2.4, zt + dialT + 0.3], [3.0, zt + dialT + 0.9], [1.8, zt + dialT + 2.6], [0, zt + dialT + 2.6]], 48);
  pin = pin.subtract(box(-0.6, -4, zt + 0.8, 0.6, 4, zt + 10));
  lid = lid.add(pin);
  // Dial: holes on the same circle as the lid's opening, and one closed position.
  let dial = cyl(dialT, rh + 6, rh + 6, 96).subtract(cyl(dialT + 2, 2.6, 2.6, 32).translate([0, 0, -1]));
  [1, 1.5, 2, 3].forEach((d, i) => (dial = dial.subtract(cyl(dialT + 2, d / 2 + 0.1, d / 2 + 0.1, 24).translate([rh * Math.cos(((i * 72 + 72) * Math.PI) / 180), rh * Math.sin(((i * 72 + 72) * Math.PI) / 180), -1]))));
  return row([cup, lid, dial], 8);
}

// ================================================================== workshop
/** Screw sorting tray: compartments with rounded bottoms, so screws slide out with a finger. */
function screwTray(p: Params) {
  const cols = Math.max(1, Math.round(num(p, 'cols'))), rows = Math.max(1, Math.round(num(p, 'rows'))), W = num(p, 'W'), D = num(p, 'D'), H = num(p, 'H'), t = nv(p, 'wall', 1.6), fl = nv(p, 'floor', 1.6);
  let m = box(0, 0, 0, W, D, H);
  const cw = (W - (cols + 1) * t) / cols, cd = (D - (rows + 1) * t) / rows, r = Math.min(cd / 2 - 0.5, H - fl - 1, 10);
  const cuts: Manifold[] = [];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x0 = t + i * (cw + t), y0 = t + j * (cd + t);
      cuts.push(M().Manifold.hull([box(x0, y0, H - 0.5, x0 + cw, y0 + cd, H + 1), cylX(x0, x0 + cw, r, y0 + r, fl + r), cylX(x0, x0 + cw, r, y0 + cd - r, fl + r)]));
    }
  return settle(m.subtract(union(cuts)));
}

/** Tape holder: arms for rolls of tape on a wall plate. */
function tapeHolder(p: Params) {
  const k = Math.max(1, Math.round(num(p, 'N'))), w = num(p, 'hookW'), gap = num(p, 'gap');
  const L = k * w + (k - 1) * gap + 24;
  return settle(hookPlate({ ...p, L, screw: screwOf(p) }, Array.from({ length: k }, (_, i) => 12 + w / 2 + i * (w + gap))));
}

/** Brush stand: holes from thin to thick in rows, a chamfer at each. */
function brushStand(p: Params) {
  const cols = Math.max(2, Math.round(num(p, 'cols'))), rows = Math.max(1, Math.round(num(p, 'rows'))), d0 = num(p, 'd0'), d1 = num(p, 'd1'), H = num(p, 'H');
  const ds = Array.from({ length: cols }, (_, i) => d0 + ((d1 - d0) * i) / (cols - 1));
  const pitchY = d1 + 6, W = ds.reduce((a, d) => a + d + 5, 5), D = rows * pitchY + 4;
  let m = box(0, 0, 0, W, D, H);
  let x = 5;
  const holes: Manifold[] = [];
  for (const d of ds) {
    for (let j = 0; j < rows; j++) holes.push(cyl(H, d / 2, d / 2, 32).translate([x + d / 2, 2 + pitchY / 2 + j * pitchY, 3]), cyl(1.2, d / 2, d / 2 + 1.2, 32).translate([x + d / 2, 2 + pitchY / 2 + j * pitchY, H - 1.19]));
    x += d + 5;
  }
  return settle(m.subtract(union(holes)));
}

// ================================================================== electronics
/** Power strip mount: U brackets screwed under the desk, the strip slides in from the end. */
function powerStripMount(p: Params) {
  const Ws = num(p, 'Ws') + 0.8, Hs = num(p, 'Hs') + 0.6, w = nv(p, 'W', 20), t = 3, lip = nv(p, 'lip', 10), k = Math.max(1, Math.round(num(p, 'N')));
  const fx = Ws / 2 + t + 12;
  let cs = C().square([2 * fx, t]).translate([-fx, -t]);
  cs = cs.add(C().square([t, Hs + 2 * t]).translate([-Ws / 2 - t, -Hs - 2 * t])).add(C().square([t, Hs + 2 * t]).translate([Ws / 2, -Hs - 2 * t]));
  const lw = Math.min(lip, Ws / 2 - 0.01);
  cs = cs.add(C().square([lw + t, t]).translate([-Ws / 2 - t, -Hs - 2 * t])).add(C().square([lw + t, t]).translate([Ws / 2 - lw, -Hs - 2 * t]));
  let m = cs.extrude(w);
  const sd = screwOf(p);
  if (sd) for (const s of [-1, 1]) m = m.subtract(csHole(0, 0, t, Math.min(sd, w - 6)).rotate([90, 0, 0]).translate([s * (Ws / 2 + t + 6), 0, w / 2]));
  return row(Array.from({ length: k }, () => m), 6);
}

/** Headphone stand: an upright with a curved saddle, its tab pressed into a base slot. */
function headphoneStand(p: Params) {
  const H = num(p, 'H'), D = num(p, 'D'), Tu = nv(p, 'Tu', 18), Rs = nv(p, 'Rs', 55), Tb = 10;
  const tabW = 30, tabL = Tb - 3;
  let up = ccw([[-25, 0], [25, 0], [15, H - 6], [-15, H - 6]]).add(C().square([tabW, tabL]).translate([-tabW / 2, -tabL]));
  up = up.add(stroke(arc(0, H - Rs - 2, Rs, 30, 150, 24), 12));
  const upright = up.extrude(Tu);
  const base = cyl(Tb, D / 2, D / 2, 128).subtract(box(-(tabW + 0.3) / 2, -(Tu + 0.3) / 2, 3, (tabW + 0.3) / 2, (Tu + 0.3) / 2, Tb + 1));
  return row([base, upright], 8);
}

/** VESA plate for the back of a monitor with standoffs for a Raspberry Pi, an Arduino or any board. */
const BOARDS: Record<string, { w: number; h: number; holes: P2[]; d: number }> = {
  rpi: { w: 85, h: 56, holes: [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]], d: 2.3 },
  uno: { w: 68.6, h: 53.3, holes: [[14, 2.5], [15.3, 50.7], [66.1, 7.6], [66.1, 35.5]], d: 2.8 },
};
function vesaMount(p: Params) {
  const V = Number(p.vesa ?? 100), T = nv(p, 'T', 5), hs = nv(p, 'hs', 6);
  const b = p.board === 'custom' ? { w: num(p, 'bw'), h: num(p, 'bh'), holes: [[3.5, 3.5], [num(p, 'bw') - 3.5, 3.5], [3.5, num(p, 'bh') - 3.5], [num(p, 'bw') - 3.5, num(p, 'bh') - 3.5]] as P2[], d: 2.8 } : BOARDS[String(p.board)] ?? BOARDS.rpi;
  const S = Math.max(V + 16, b.w + 12, b.h + 12);
  let m = C().square([S, S], true).offset(-5).offset(5, 'Round', undefined, 24).extrude(T);
  for (const x of [-V / 2, V / 2]) for (const y of [-V / 2, V / 2]) m = m.subtract(csHole(x, y, T, 4));
  const cx = -b.w / 2, cy = -b.h / 2;
  for (const [x, y] of b.holes) m = m.add(cyl(hs, 3.2, 3.2, 32).subtract(cyl(hs + 1, b.d / 2, b.d / 2, 16).translate([0, 0, 1])).translate([cx + x, cy + y, T - 0.01]));
  // Slots for cable ties at the sides.
  for (const s of [-1, 1]) m = m.subtract(box(s * (S / 2 - 8) - 2, -6, -1, s * (S / 2 - 8) + 2, 6, T + 1));
  return settle(m);
}

// ================================================================== kids
/** One print-in-place joint between two segments: A holds the knuckle, B the hourglass pin. */
const PIP = { Rk: 6.5, h: 6, rm: 2.2, swing: 35 };
function flexi(p: Params) {
  const k = Math.max(2, Math.round(num(p, 'N'))), Ls = nv(p, 'Ls', 16), g = nv(p, 'gap', 0.4), chain = p.mode === 'chain';
  const { Rk, h, rm, swing } = PIP;
  const gr = g * Math.SQRT2;
  const hourglass = (r0: number, z0: number, z1: number) => rev([[0, z0], [r0 + h / 2, z0], [r0, h / 2], [r0 + h / 2, z1], [0, z1]], 48);
  const hole = hourglass(rm, -0.01, h + 0.01);
  const pin = hourglass(rm - gr, 0, h);
  // Room for the web to swing: the web strip turned through ±swing, widened by the gap.
  const sw: CrossSection[] = [];
  for (let a = -swing; a <= swing; a += 5) sw.push(C().square([Rk + 3, 2.4 + 2 * g]).translate([0, -1.2 - g]).rotate(a));
  const sweep = C().union(sw).extrude(h + 2).translate([0, 0, -1]);
  const knuckleCut = hole.add(sweep);
  const J = (j: number) => j * Ls;
  const segs: Manifold[] = [];
  for (let i = 0; i < k; i++) {
    const front = i > 0, rear = i < k - 1;
    // Outline in plan.
    let cs: CrossSection;
    if (chain) cs = C().hull([C().circle(Rk, 48).translate([J(i), 0]), C().circle(Rk, 48).translate([J(i + 1), 0])]);
    else if (i === 0) cs = C().hull([C().circle(Rk + 3, 48).translate([J(1) - Rk - 6, 0]), C().circle(Rk + 2, 48).translate([J(1) - Rk - 14, 0])]).add(C().square([Rk + 7, 2 * Rk]).translate([J(1) - Rk - 7, -Rk])).add(C().circle(Rk, 48).translate([J(1), 0]));
    else if (!rear) cs = ccw([[J(i), -Rk], [J(i) + Ls * 1.6, 0], [J(i), Rk]]);
    else cs = C().square([Ls, 2 * Rk]).translate([J(i), -Rk]).add(C().circle(Rk, 48).translate([J(i + 1), 0]));
    if (chain && i === 0) cs = cs.subtract(C().square([1, 1]).translate([-1e4, 0]));
    let m = cs.extrude(h);
    if (front) m = m.subtract(cyl(h + 2, Rk + 0.6, Rk + 0.6, 64).translate([J(i), 0, -1]));
    if (rear) m = m.subtract(knuckleCut.translate([J(i + 1), 0, 0]));
    if (front) m = m.add(pin.translate([J(i), 0, 0])).add(box(J(i), -1.2, 0, J(i) + Rk + 2, 1.2, h));
    if (i === 0 && !chain) for (const s of [-1, 1]) m = m.subtract(M().Manifold.sphere(1.4, 16).translate([J(1) - Rk - 16, s * 4, h]));
    segs.push(m);
  }
  return settle(union(segs));
}

/** Marble maze: walls on a board from a seeded random maze; the ball (steel, 6–8 mm) is bought. */
function marbleMaze(p: Params) {
  const N = Math.max(3, Math.round(num(p, 'N'))), bd = num(p, 'ball'), seed = Math.round(num(p, 'seed'));
  const wt = 2, cell = bd + 2.5 + wt, base = 2, wh = bd * 0.75;
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // Depth-first maze: right[x][y] and up[x][y] tell whether that wall stands.
  const right = Array.from({ length: N }, () => Array(N).fill(true)), up = Array.from({ length: N }, () => Array(N).fill(true));
  const seen = Array.from({ length: N }, () => Array(N).fill(false));
  const stack: [number, number][] = [[0, 0]];
  seen[0][0] = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const nb = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]).filter(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < N && y + dy < N && !seen[x + dx][y + dy]);
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = nb[Math.floor(rnd() * nb.length)];
    if (dx === 1) right[x][y] = false;
    if (dx === -1) right[x - 1][y] = false;
    if (dy === 1) up[x][y] = false;
    if (dy === -1) up[x][y - 1] = false;
    seen[x + dx][y + dy] = true;
    stack.push([x + dx, y + dy]);
  }
  const S = N * cell + wt;
  const walls: Manifold[] = [box(0, 0, 0, S, S, base)];
  const top = base + wh;
  walls.push(box(0, 0, 0, S, wt, top), box(0, S - wt, 0, S, S, top), box(0, 0, 0, wt, S, top), box(S - wt, 0, 0, S, S, top));
  for (let x = 0; x < N; x++)
    for (let y = 0; y < N; y++) {
      if (right[x][y] && x < N - 1) walls.push(box((x + 1) * cell, y * cell, 0, (x + 1) * cell + wt, (y + 1) * cell + wt, top));
      if (up[x][y] && y < N - 1) walls.push(box(x * cell, (y + 1) * cell, 0, (x + 1) * cell + wt, (y + 1) * cell + wt, top));
    }
  let m = union(walls);
  // Start mark and a pocket at the goal for the ball to drop into.
  const c = (i: number) => wt + i * cell + (cell - wt) / 2;
  m = m.add(cyl(0.8, 2, 2, 24).translate([c(0), c(0), base - 0.01]));
  m = m.subtract(M().Manifold.sphere(bd / 2 + 0.3, 32).translate([c(N - 1), c(N - 1), base + bd / 2 - 1.2]));
  return settle(m);
}

/** Name stamp: mirrored raised letters on a plate, a handle that widens at 45° (printed handle down). */
function stamp(p: Params) {
  const text = String(p.text ?? '').trim() || 'ZOSIA', font = String(p.font || 'sans-bold'), size = num(p, 'size'), dep = nv(p, 'depth', 1.5), hh = nv(p, 'hh', 25);
  const cs0 = textOutline(text, font, size, size * 0.08);
  if (!cs0) return settle(box(0, 0, 0, 20, 20, 5));
  const b = cs0.bounds(), tw = b.max[0] - b.min[0], th = b.max[1] - b.min[1];
  const cs = cs0.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]).mirror([1, 0]);
  const W = tw + 8, D = th + 8, pt = 3;
  const bw = Math.max(14, W - 2 * hh), bdp = Math.max(14, D - 2 * hh);
  let m = M().Manifold.hull([box(-bw / 2, -bdp / 2, 0, bw / 2, bdp / 2, 0.1), box(-W / 2, -D / 2, hh - 0.1, W / 2, D / 2, hh)]);
  m = m.add(box(-W / 2, -D / 2, hh - 0.01, W / 2, D / 2, hh + pt)).add(cs.extrude(dep).translate([0, 0, hh + pt - 0.01]));
  return settle(m);
}

/** Sand molds: cups shaped like a star, heart, circle or fish; the walls taper so the sand comes out. */
function moldShape(kind: string, S: number): CrossSection {
  const r = S / 2;
  if (kind === 'star') return ccw(Array.from({ length: 10 }, (_, i) => [(i % 2 ? r * 0.48 : r) * Math.cos(Math.PI / 2 + (i * Math.PI) / 5), (i % 2 ? r * 0.48 : r) * Math.sin(Math.PI / 2 + (i * Math.PI) / 5)] as P2)).offset(-1.5, 'Round', undefined, 12).offset(1.5, 'Round', undefined, 12);
  if (kind === 'heart') {
    const pts = Array.from({ length: 72 }, (_, i) => {
      const t = (i / 72) * 2 * Math.PI;
      return [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)] as P2;
    });
    return ccw(pts.map(([x, y]) => [(x * r) / 17, (y * r) / 17 + r * 0.15] as P2));
  }
  if (kind === 'fish') {
    const body = C().circle(1, 64).scale([r * 0.7, r * 0.45]).translate([r * 0.22, 0]);
    const tail = ccw([[-r * 0.35, 0], [-r, r * 0.42], [-r, -r * 0.42]]).offset(-1.5, 'Round', undefined, 12).offset(1.5, 'Round', undefined, 12);
    return body.add(tail);
  }
  return C().circle(r, 96);
}
function sandMolds(p: Params) {
  const S = num(p, 'S'), H = num(p, 'H'), t = nv(p, 'wall', 2), fl = nv(p, 'floor', 2), draft = nv(p, 'draft', 8);
  const one = (kind: string) => {
    const sh = moldShape(kind, S);
    const k = 1 + (2 * H * Math.tan((draft * Math.PI) / 180)) / S;
    const outer = sh.offset(t, 'Round', undefined, 16).extrude(H, 0, 0, [k, k]);
    const s0 = 1 + ((k - 1) * fl) / H, s1 = 1 + ((k - 1) * (H + 1)) / H;
    const inner = sh.scale([s0, s0]).extrude(H + 1 - fl, 0, 0, [s1 / s0, s1 / s0]).translate([0, 0, fl]);
    return outer.subtract(inner);
  };
  const kind = String(p.shape ?? 'star');
  return kind === 'set' ? row(['star', 'heart', 'circle', 'fish'].map(one), 6) : settle(one(kind));
}

// ================================================================== definitions
const fontP = FONT;
export const USEFUL4_DEFS: PartDef[] = [
  // ---- 3D printer
  {
    type: 'spoolHolder', label: 'Uchwyt na szpulę filamentu', category: 'useful', hole: false,
    description: 'Na ścianę: ramię z kołnierzem, na które wsuwasz szpulę. Na stół: podstawa, dwa stojaki, oś i dwa stożki, które centrują szpulę w otworze.',
    params: [
      select('mode', 'Rodzaj', 'wall', [['wall', 'Ramię na ścianę'], ['table', 'Stojak na stół (oś i stożki)']]),
      n('hub', 'Średnica otworu szpuli', 53, 25, 80, 0.5, 'Bambu i większość szpul: 52–55 mm, małe szpule: 38 mm.'),
      n('SW', 'Szerokość szpuli', 70, 30, 120),
      n('R', 'Promień szpuli', 100, 50, 150, 1, undefined, (p) => p.mode === 'table'),
      ...screwParams.map((q) => ({ ...q, show: (p: Params) => p.mode !== 'table' && (q.show ? q.show(p) : true) })),
      adv('axle', 'Średnica osi', 20, 12, 30, 1),
      adv('T', 'Grubość płytki', 5, 3, 10, 0.5),
    ],
    build: spoolHolder,
  },
  {
    type: 'filamentGuide', label: 'Prowadnik filamentu', category: 'useful', hole: false,
    description: 'Płytka na ścianę albo ramę drukarki i ramię z oczkiem: na rurkę PTFE (4 mm) albo na sam filament z fazkami po obu stronach.',
    params: [select('kind', 'Oczko na', 'ptfe', [['ptfe', 'Rurkę PTFE 4 mm'], ['filament', 'Sam filament']]), n('A', 'Wysięg ramienia', 30, 10, 120), ...screwParams, adv('W', 'Szerokość', 10, 6, 20, 1), adv('T', 'Grubość płytki', 4, 3, 8, 0.5)],
    build: filamentGuide,
  },
  {
    type: 'spoolClip', label: 'Klips na koniec filamentu', category: 'useful', hole: false,
    description: 'Wsuwany na rant szpuli, z otworem na koniec filamentu, żeby się nie rozwijał. Podaj grubość rantu.',
    params: [n('ft', 'Grubość rantu szpuli', 3, 1.5, 8, 0.1), select('fil', 'Filament', '1.75', [['1.75', '1,75 mm'], ['2.85', '2,85 mm']]), adv('L', 'Głębokość klipsa', 14, 8, 30, 1), adv('W', 'Szerokość', 10, 6, 20, 1)],
    build: spoolClip,
  },
  {
    type: 'nozzleOrganizer', label: 'Organizer na dysze i narzędzia', category: 'useful', hole: false,
    description: 'Klocek z otworami na dysze z gwintem M6 i rząd otworów na igły do czyszczenia, klucze imbusowe albo pęsetę.',
    params: [count('N', 'Liczba dysz', 8, 1, 30), count('cols', 'Dysz w rzędzie', 4, 1, 10), n('d', 'Otwór na dyszę', 6.3, 4, 20, 0.1, 'M6 (V6, MK8): 6,3. Dysze z radiatorem: zmierz.'), count('tools', 'Otwory na narzędzia', 5, 0, 12), adv('td', 'Otwór na narzędzie', 4, 2, 10, 0.5), adv('depth', 'Głębokość otworów', 8, 4, 20, 0.5)],
    build: nozzleOrganizer,
  },
  {
    type: 'clearanceTest', label: 'Próbka luzu (pasowanie)', category: 'useful', hole: false,
    description: 'Płytka z pięcioma otworami, każdy o krok większy, i pięć kołków. Sprawdź, który otwór pasuje na wcisk, a który luźno; nacięcia mówią, który to luz.',
    params: [n('d', 'Średnica kołka', 10, 5, 20, 0.5), n('g0', 'Najmniejszy luz', 0.1, 0, 0.5, 0.05), n('step', 'Krok luzu', 0.1, 0.05, 0.3, 0.05)],
    build: clearanceTest,
  },
  // ---- pets
  {
    type: 'petBowl', label: 'Miska dla zwierzaka', category: 'useful', hole: false,
    description: 'Miska ze ściankami pochylonymi o 30° (drukuje się bez podpór). Opcjonalny stojak z oknami podnosi ją dla dużego psa; miska wpada w stożkowe gniazdo.',
    params: [n('D', 'Średnica u góry', 150, 60, 230), n('H', 'Głębokość', 50, 20, 90), n('Hs', 'Wysokość stojaka', 0, 0, 150, 5, '0 = bez stojaka.'), adv('wall', 'Grubość ścianki', 2.4, 1.6, 5, 0.2), adv('floor', 'Grubość dna', 3, 1.6, 6, 0.2)],
    build: petBowl,
  },
  {
    type: 'leashHook', label: 'Wieszak na smycze', category: 'useful', hole: false,
    description: 'Haczyki na smycze i szelki, nad nimi wypukły napis (imię psa). Na wkręty albo taśmę.',
    params: [{ key: 'text', label: 'Napis', type: 'text', def: 'BUREK', max: 20 }, fontP, count('N', 'Liczba haczyków', 3, 1, 8), n('H', 'Wysokość płytki', 60, 40, 120), n('D', 'Wysięg haczyka', 30, 15, 60), n('hookW', 'Szerokość haczyka', 14, 8, 30), n('gap', 'Odstęp haczyków', 40, 20, 80), n('tip', 'Końcówka w górę', 8, 3, 20), ...screwParams, adv('T', 'Grubość płytki', 5, 3, 8, 0.5)],
    build: leashHook,
  },
  {
    type: 'treatBall', label: 'Kula na smakołyki', category: 'useful', hole: false,
    description: 'Dwie połówki wciskane jedna w drugą; smakołyki wypadają przez otwory, kiedy zwierzak toczy kulę. Spody są stożkowe, więc obie drukują się bez podpór.',
    params: [n('D', 'Średnica', 70, 40, 120), n('hole', 'Otwory', 14, 6, 25, 0.5), count('nh', 'Liczba otworów', 2, 1, 4), adv('wall', 'Grubość ścianki', 2.4, 1.6, 4, 0.2)],
    build: treatBall,
  },
  {
    type: 'bagDispenser', label: 'Pojemnik na woreczki', category: 'useful', hole: false,
    description: 'Rurka na rolkę woreczków z bocznym wycięciem do wyciągania, pokrywka i uszko na karabińczyk smyczy.',
    params: [n('dr', 'Średnica rolki', 30, 20, 50, 0.5), n('Lr', 'Długość rolki', 60, 30, 90), adv('wall', 'Grubość ścianki', 2, 1.6, 4, 0.2), adv('slot', 'Szerokość wycięcia', 4, 2, 8, 0.5)],
    build: bagDispenser,
  },
  // ---- bike and car
  {
    type: 'barPhoneMount', label: 'Uchwyt na telefon na kierownicę', category: 'useful', hole: false,
    description: 'Obejma na kierownicę (śruba M4 z nakrętką) z prowadnicą na jaskółczy ogon i kołyska na telefon, która się na nią wsuwa. Podaj średnicę kierownicy i wymiary telefonu z etui.',
    params: [n('bar', 'Średnica kierownicy', 25.4, 15, 40, 0.1, 'Przy chwytach 22,2, przy mostku 25,4 albo 31,8.'), n('PW', 'Szerokość telefonu', 75, 55, 95, 0.5), n('PT', 'Grubość telefonu', 9, 6, 16, 0.5), n('Hc', 'Wysokość kołyski', 90, 60, 160)],
    build: barPhoneMount,
  },
  {
    type: 'lightMount', label: 'Uchwyt lampki na rurę', category: 'useful', hole: false,
    description: 'Obejma na rurę (kierownicę, sztycę, rurę wózka) skręcana śrubą M4 i ucho z otworem M5 na lampkę albo dwa palce mocowania kamerki sportowej.',
    params: [select('kind', 'Mocowanie', 'hole', [['hole', 'Ucho z otworem M5'], ['gopro', 'Palce kamerki sportowej']]), n('bar', 'Średnica rury', 25.4, 12, 45, 0.1), adv('W', 'Szerokość', 15, 10, 30, 1), adv('L', 'Wysięg ucha', 18, 10, 40, 1)],
    build: lightMount,
  },
  {
    type: 'headrestHook', label: 'Haczyk na zagłówek', category: 'useful', hole: false,
    description: 'Zatrzaskuje się na pręcie zagłówka w aucie; na haczyku torba z zakupami albo plecak. Pasuje też na pręt w bagażniku.',
    params: [n('post', 'Średnica pręta', 14, 8, 20, 0.5), n('drop', 'Długość ramienia', 40, 15, 100), n('R', 'Promień haczyka', 14, 8, 30), adv('Lc', 'Długość zatrzasku', 20, 12, 40, 1), adv('T', 'Grubość', 6, 4, 10, 0.5)],
    build: headrestHook,
  },
  {
    type: 'ventCupHolder', label: 'Uchwyt na kubek do kratki', category: 'useful', hole: false,
    description: 'Pierścień na kubek albo puszkę i klips na lamelkę kratki nawiewu, połączone wsuwaną prowadnicą. Podaj średnicę kubka i grubość lamelki.',
    params: [n('dc', 'Średnica kubka', 70, 50, 100, 0.5, 'Puszka 0,33 l: 66, kubek termiczny: 70–80.'), n('Hr', 'Wysokość pierścienia', 45, 30, 80), n('lg', 'Grubość lamelki', 2, 1, 5, 0.1), n('dv', 'Głębokość klipsa', 18, 10, 30), bool('handle', 'Wycięcie na ucho', true)],
    build: ventCupHolder,
  },
  // ---- kitchen
  {
    type: 'paperTowelHolder', label: 'Uchwyt na ręcznik papierowy', category: 'useful', hole: false,
    description: 'Dwa wsporniki (na ścianę albo pod szafkę) i drążek z czopami. Szerszy drążek drukuje się z dwóch połówek wsuwanych jedna w drugą.',
    params: [select('mode', 'Montaż', 'wall', [['wall', 'Na ścianę'], ['under', 'Pod szafkę']]), n('RW', 'Szerokość rolki', 230, 100, 300), n('rd', 'Średnica drążka', 30, 20, 38, 1, 'Mniejsza niż otwór tulejki (zwykle 40 mm).'), n('A', 'Odstęp od ściany', 70, 50, 120, 1, 'Połowa średnicy pełnej rolki i trochę zapasu.'), ...screwParams],
    build: paperTowelHolder,
  },
  {
    type: 'trivet', label: 'Podkładka pod garnek', category: 'useful', hole: false,
    description: 'Ażurowa podkładka z sześciokątów, pełny rant i nóżki. Na gorące garnki drukuj z PETG albo ASA (PLA mięknie od 60 °C).',
    params: [select('shape', 'Kształt', 'round', [['round', 'Okrągła'], ['square', 'Kwadratowa']]), n('S', 'Średnica / bok', 180, 100, 240), n('cell', 'Wielkość oczek', 14, 6, 30), adv('T', 'Grubość', 6, 3, 12, 0.5), adv('rib', 'Szerokość żeberek', 3, 1.6, 6, 0.2), adv('rim', 'Szerokość rantu', 8, 4, 20, 1)],
    build: trivet,
  },
  {
    type: 'capsuleRack', label: 'Stojak na kapsułki', category: 'useful', hole: false,
    description: 'Płyta z gniazdami na kapsułki (wiszą za rant) na ramce, która stoi na blacie albo w szufladzie.',
    params: [select('kind', 'Kapsułki', 'nespresso', [['nespresso', 'Nespresso (Original)'], ['dolce', 'Dolce Gusto']]), count('cols', 'Kolumny', 5, 1, 10), count('rows', 'Rzędy', 4, 1, 10)],
    build: capsuleRack,
  },
  {
    type: 'bagOrganizer', label: 'Pojemnik na reklamówki', category: 'useful', hole: false,
    description: 'Wysokie pudełko na drzwi szafki albo ścianę: reklamówki wkładasz od góry, wyciągasz przez otwór na dole.',
    params: [n('W', 'Szerokość', 120, 80, 200), n('D', 'Głębokość', 100, 60, 160), n('H', 'Wysokość', 220, 120, 250), n('hole', 'Otwór na dole', 60, 30, 100), ...screwParams, adv('wall', 'Grubość ścianki', 2, 1.2, 4, 0.2)],
    build: bagOrganizer,
  },
  // ---- home
  {
    type: 'keyShelf', label: 'Wieszak na klucze z półką', category: 'useful', hole: false,
    description: 'Haczyki na klucze, nad nimi półeczka z rantem na portfel, telefon albo listy.',
    params: [count('N', 'Liczba haczyków', 4, 1, 10), n('L', 'Szerokość', 160, 60, 250), n('H', 'Wysokość płytki', 70, 40, 140), n('Ds', 'Głębokość półki', 40, 15, 90), n('D', 'Wysięg haczyka', 20, 10, 40), n('hookW', 'Szerokość haczyka', 8, 5, 20), n('tip', 'Końcówka w górę', 6, 3, 15), ...screwParams, adv('T', 'Grubość płytki', 5, 3, 8, 0.5), adv('st', 'Grubość półki', 3, 2, 6, 0.5), adv('lip', 'Wysokość rantu', 8, 3, 20, 1)],
    build: keyShelf,
  },
  {
    type: 'remoteHolder', label: 'Uchwyt na piloty', category: 'useful', hole: false,
    description: 'Pudełko z przegródkami na piloty, z przodu niższe. Stoi na stoliku albo wisi na ścianie (otwory w tylnej ściance).',
    params: [count('N', 'Liczba przegródek', 3, 1, 6), n('pw', 'Szerokość przegródki', 55, 30, 90), n('D', 'Głębokość', 35, 20, 60), n('H', 'Wysokość', 90, 50, 150), ...screwParams, adv('wall', 'Grubość ścianek', 2, 1.2, 4, 0.2), adv('front', 'Wysokość przodu (% całości)', 60, 30, 100, 5)],
    build: remoteHolder,
  },
  {
    type: 'broomHolder', label: 'Uchwyt na miotłę i mop', category: 'useful', hole: false,
    description: 'Listwa na ścianę z zatrzaskami na kije: wciskasz kij, trzyma się sam. Podaj średnicę kija.',
    params: [count('N', 'Liczba zatrzasków', 3, 1, 6), n('d', 'Średnica kija', 24, 15, 40, 0.5), ...screwParams, adv('h', 'Wysokość listwy', 20, 12, 40, 1)],
    build: broomHolder,
  },
  {
    type: 'toiletPaperHolder', label: 'Uchwyt na papier toaletowy', category: 'useful', hole: false,
    description: 'Ramię z końcówką w górę, na wkręty albo taśmę. Opcjonalnie z półeczką na telefon nad rolką.',
    params: [n('D', 'Długość ramienia', 115, 90, 150, 1, 'Szerokość rolki (ok. 100 mm) i trochę zapasu.'), n('hookW', 'Szerokość ramienia', 22, 15, 40), n('H', 'Wysokość płytki', 70, 50, 120), n('tip', 'Końcówka w górę', 10, 5, 20), { key: 'shelf', label: 'Półeczka na telefon', type: 'bool', def: false }, n('Ds', 'Głębokość półeczki', 70, 40, 100, 1, undefined, (p) => p.shelf === true), ...screwParams, adv('Ls', 'Szerokość z półeczką', 150, 100, 220, 1), adv('T', 'Grubość płytki', 5, 3, 8, 0.5)],
    build: toiletPaperHolder,
  },
  // ---- garden
  {
    type: 'bottleDripper', label: 'Kroplownik na butelkę PET', category: 'useful', hole: false,
    description: 'Nakręcasz na zwykłą butelkę (gwint PCO 1881), odcinasz jej dno, wbijasz kolec w ziemię i dolewasz wodę od góry. Mniejszy otworek = wolniejsze kapanie.',
    params: [n('Ls', 'Długość kolca', 60, 30, 120), n('bore', 'Otworek', 1.4, 0.8, 3, 0.1)],
    build: bottleDripper,
  },
  {
    type: 'birdFeeder', label: 'Karmnik dla ptaków', category: 'useful', hole: false,
    description: 'Tacka z rurą na ziarno i trzema okienkami, daszek-stożek. Sznurek przewlecz przez uszka rury i otwór w daszku; daszek podnosisz po sznurku, żeby dosypać.',
    params: [n('D', 'Średnica tacki', 140, 90, 220), n('dt', 'Średnica rury', 60, 35, 100), n('Ht', 'Wysokość rury', 120, 60, 200)],
    build: birdFeeder,
  },
  {
    type: 'meshClip', label: 'Klips do siatki', category: 'useful', hole: false,
    description: 'Jeden zatrzask na drut siatki albo sznurek, drugi na palik, rurkę lub tyczkę. Do siatki na ogrodzeniu, pod pnącza albo przeciw ptakom.',
    params: [n('d1', 'Średnica drutu siatki', 3, 1, 8, 0.1), n('d2', 'Średnica palika', 16, 6, 40, 0.5), adv('W', 'Szerokość', 10, 6, 20, 1)],
    build: meshClip,
  },
  {
    type: 'seeder', label: 'Siewnik do nasion', category: 'useful', hole: false,
    description: 'Kubek, pokrywka z otworem i obrotowa tarcza z otworkami 1, 1,5, 2 i 3 mm na zatrzaskowym trzpieniu. Kręcisz tarczą do otworka pod swoje nasiona i potrząsasz.',
    params: [n('Dc', 'Średnica kubka', 50, 35, 80), n('H', 'Wysokość kubka', 70, 40, 120)],
    build: seeder,
  },
  // ---- workshop
  {
    type: 'screwTray', label: 'Kuweta na śruby z przegródkami', category: 'useful', hole: false,
    description: 'Przegródki z zaokrąglonym dnem: drobne śruby i nakrętki wygarniasz palcem. Do warsztatu albo szuflady.',
    params: [count('cols', 'Kolumny', 4, 1, 10), count('rows', 'Rzędy', 2, 1, 6), n('W', 'Szerokość', 160, 50, 250), n('D', 'Głębokość', 100, 40, 250), n('H', 'Wysokość', 30, 15, 60), adv('wall', 'Grubość ścianek', 1.6, 1, 3, 0.2), adv('floor', 'Grubość dna', 1.6, 1, 3, 0.2)],
    build: screwTray,
  },
  {
    type: 'tapeHolder', label: 'Uchwyt na taśmy', category: 'useful', hole: false,
    description: 'Ramiona na rolki taśmy (izolacyjna, malarska, pakowa) na płytce do ściany. Długość ramienia = łączna szerokość rolek.',
    params: [count('N', 'Liczba ramion', 2, 1, 6), n('D', 'Długość ramienia', 60, 20, 150), n('hookW', 'Szerokość ramienia', 20, 10, 40), n('gap', 'Odstęp ramion', 70, 30, 120, 1, 'Większy niż średnica rolki (zwykle 60–110).'), n('H', 'Wysokość płytki', 50, 30, 100), n('tip', 'Końcówka w górę', 6, 3, 15), ...screwParams, adv('T', 'Grubość płytki', 5, 3, 8, 0.5)],
    build: tapeHolder,
  },
  {
    type: 'brushStand', label: 'Stojak na pędzle', category: 'useful', hole: false,
    description: 'Klocek z otworami od cienkich do grubych w kolumnach, na pędzle, pisaki albo wiertła.',
    params: [count('cols', 'Kolumny (rozmiary)', 6, 2, 12), count('rows', 'Rzędy', 2, 1, 5), n('d0', 'Najmniejszy otwór', 4, 2, 15, 0.5), n('d1', 'Największy otwór', 14, 5, 30, 0.5), n('H', 'Wysokość', 30, 15, 60)],
    build: brushStand,
  },
  // ---- electronics
  {
    type: 'powerStripMount', label: 'Uchwyt listwy pod blat', category: 'useful', hole: false,
    description: 'Wsporniki w kształcie U przykręcane pod biurkiem; listwa wsuwa się z boku, gniazda zostają dostępne między rantami.',
    params: [n('Ws', 'Szerokość listwy', 55, 30, 90, 0.5), n('Hs', 'Wysokość listwy', 40, 25, 60, 0.5), count('N', 'Liczba wsporników', 2, 1, 4), ...screwParams, adv('W', 'Szerokość wspornika', 20, 12, 40, 1), adv('lip', 'Szerokość rantów', 10, 3, 30, 1)],
    build: powerStripMount,
  },
  {
    type: 'headphoneStand', label: 'Stojak na słuchawki', category: 'useful', hole: false,
    description: 'Okrągła podstawa i słupek z łukiem pod pałąk. Słupek drukuje się na płasko i wciska w gniazdo w podstawie.',
    params: [n('H', 'Wysokość', 230, 150, 250), n('D', 'Średnica podstawy', 110, 80, 160), adv('Tu', 'Grubość słupka', 18, 10, 30, 1), adv('Rs', 'Promień łuku', 55, 30, 80, 1)],
    build: headphoneStand,
  },
  {
    type: 'vesaMount', label: 'Płytka VESA na płytkę elektroniki', category: 'useful', hole: false,
    description: 'Przykręcana z tyłu monitora (rozstaw VESA 75 albo 100, śruby M4), z kołkami pod Raspberry Pi, Arduino Uno albo własną płytkę i szczelinami na opaski.',
    params: [
      select('vesa', 'Rozstaw VESA', '100', [['75', '75 × 75'], ['100', '100 × 100']]),
      select('board', 'Płytka', 'rpi', [['rpi', 'Raspberry Pi (58 × 49, M2,5)'], ['uno', 'Arduino Uno'], ['custom', 'Własna (otwory w rogach)']]),
      n('bw', 'Szerokość płytki', 80, 30, 150, 0.5, undefined, (p) => p.board === 'custom'),
      n('bh', 'Wysokość płytki', 60, 30, 150, 0.5, undefined, (p) => p.board === 'custom'),
      adv('T', 'Grubość płyty', 5, 3, 8, 0.5),
      adv('hs', 'Wysokość kołków', 6, 3, 15, 0.5),
    ],
    build: vesaMount,
  },
  // ---- kids
  {
    type: 'flexiSnake', label: 'Wąż i łańcuch (drukowany w całości)', category: 'useful', hole: false,
    description: 'Segmenty połączone przegubami drukowanymi od razu na miejscu: po wydruku wystarczy je delikatnie poruszać. Wąż albo łańcuch z okrągłych ogniw.',
    params: [select('mode', 'Rodzaj', 'snake', [['snake', 'Wąż'], ['chain', 'Łańcuch']]), count('N', 'Liczba segmentów', 12, 2, 30), adv('Ls', 'Długość segmentu', 16, 14, 30, 0.5), adv('gap', 'Luz przegubu', 0.4, 0.3, 0.6, 0.05)],
    build: flexi,
  },
  {
    type: 'marbleMaze', label: 'Labirynt na kulkę', category: 'useful', hole: false,
    description: 'Losowy labirynt ze ściankami na płytce; kulkę (stalową 6–8 mm) prowadzisz od znaczka startu do dołka na mecie. Inny numer = inny labirynt.',
    params: [count('N', 'Liczba pól w rzędzie', 8, 4, 20), n('ball', 'Średnica kulki', 8, 5, 16, 0.5), count('seed', 'Numer labiryntu', 1, 1, 999)],
    build: marbleMaze,
  },
  {
    type: 'stamp', label: 'Stempel z imieniem', category: 'useful', hole: false,
    description: 'Lustrzany napis na płytce i rączka. Odbija się prosto: na tuszu, w plastelinie albo w piasku.',
    params: [{ key: 'text', label: 'Napis', type: 'text', def: 'ZOSIA', max: 16 }, fontP, n('size', 'Wysokość liter', 12, 5, 40, 0.5), adv('depth', 'Wysokość liter nad płytką', 1.5, 0.8, 4, 0.1), adv('hh', 'Wysokość rączki', 25, 15, 50, 1)],
    build: stamp,
  },
  {
    type: 'sandMolds', label: 'Foremki do piasku', category: 'useful', hole: false,
    description: 'Gwiazdka, serce, kółko, rybka albo komplet czterech. Ścianki rozchylają się ku górze, więc piasek łatwo wychodzi.',
    params: [select('shape', 'Kształt', 'set', [['set', 'Komplet 4 foremek'], ['star', 'Gwiazdka'], ['heart', 'Serce'], ['circle', 'Kółko'], ['fish', 'Rybka']]), n('S', 'Wielkość', 70, 40, 120), n('H', 'Wysokość', 35, 15, 60), adv('wall', 'Grubość ścianki', 2, 1.2, 4, 0.2), adv('floor', 'Grubość dna', 2, 1, 4, 0.2), adv('draft', 'Pochylenie ścianek (°)', 8, 3, 20, 1)],
    build: sandMolds,
  },
];
