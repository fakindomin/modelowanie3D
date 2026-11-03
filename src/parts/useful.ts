import type { CrossSection, Manifold } from 'manifold-3d';
import { M, settle } from '../geom/manifold';
import type { ParamDef, Params, PartDef } from './def';
import { box, cyl, hex, num, poly, select, union } from './util';
import { FONT, textOutline } from './text';

/**
 * Everyday things for the „Projekty” tab: each one is sized from what the user can measure
 * (a shelf, a jar, a hose, a screwdriver) and the rest follows. All print without supports
 * in the position they are built in.
 */

const n = (key: string, label: string, def: number, min: number, max: number, step = 1, hint?: string, show?: (p: Params) => boolean): ParamDef => ({ key, label, type: 'number', def, min, max, step, unit: 'mm', hint, show });
const count = (key: string, label: string, def: number, min: number, max: number, hint?: string): ParamDef => ({ key, label, type: 'number', def, min, max, step: 1, hint });

type P2 = [number, number];
/** A thick line through the points (round ends and joints), as a 2D section. */
function stroke(pts: P2[], t: number): CrossSection {
  const C = M().CrossSection;
  const dot = (p: P2) => C.circle(t / 2, 24).translate(p);
  const segs = pts.slice(1).map((p, i) => C.hull([dot(pts[i]), dot(p)]));
  return C.union(segs);
}
/** Points on an arc (degrees, counter-clockwise from +X). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps = 16): P2[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}
/** A side profile drawn in X/Y, stood up as `w` thick (printed lying on that side). */
const onSide = (cs: CrossSection, w: number) => cs.extrude(w);

/** Countersunk screw hole going down through a plate whose top is at z = top. */
function csHole(x: number, y: number, top: number, d: number): Manifold {
  const head = d * 2;
  return cyl(top + 2, d / 2 + 0.2).translate([x, y, -1]).add(cyl(head / 2 - d / 2 + 0.01, d / 2 + 0.2, head / 2 + 0.01).translate([x, y, top - (head / 2 - d / 2)]));
}
/** Countersunk hole along X through a wall t thick centred on x = 0 (head on the +X side). */
function csHoleX(y: number, z: number, t: number, d: number): Manifold {
  return csHole(0, 0, t, d).rotate([0, 90, 0]).translate([-t / 2, y, z]);
}
/** Polygon with its points turned counter-clockwise (a clockwise one would come out empty). */
function ccw(pts: P2[]): CrossSection {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return poly(a < 0 ? [...pts].reverse() : pts);
}

/**
 * Wall plate lying on the bed (its wall side down) with hooks rising from it. A hook goes out from the wall,
 * then its tip turns up along the wall: the tip is a 45° wedge, so nothing hangs in the air.
 */
function hookPlate(p: Params, hooks: number[]): Manifold {
  const L = num(p, 'L'), H = num(p, 'H'), T = num(p, 'T'), D = num(p, 'D'), w = num(p, 'hookW'), tip = num(p, 'tip');
  const t = Math.max(T, 4);
  let m = box(0, 0, 0, L, H, T);
  // Side view (Y up the wall, Z out of the wall): arm out of the plate, wedge tip pointing up the wall.
  const y0 = H * 0.15;
  const arm = ccw([
    [y0, 0],
    [y0 + t, 0],
    [y0 + t, D - tip],
    [y0 + t + tip, D],
    [y0 + t + tip, D + 2],
    [y0, D + 2],
  ]).extrude(w);
  for (const x of hooks) m = m.add(arm.rotate([90, 0, 90]).translate([x - w / 2, 0, 0]));
  const sd = num(p, 'screw');
  if (sd > 0) {
    const holes = hooks.length > 1 ? [L * 0.06 + 3, L - L * 0.06 - 3] : [L / 2];
    for (const x of holes) m = m.subtract(csHole(x, H * 0.75, T, sd));
  }
  return m;
}
const screwSel: ParamDef = { ...select('screwS', 'Mocowanie', 'screw', [['screw', 'Na wkręty'], ['tape', 'Na taśmę dwustronną (bez otworów)']]) };
const screwOf = (p: Params) => (p.screwS === 'tape' ? 0 : num(p, 'screwD') || 4);
const screwParams: ParamDef[] = [screwSel, n('screwD', 'Średnica wkrętu', 4, 2.5, 6, 0.5, undefined, (p) => p.screwS !== 'tape')];

// ------------------------------------------------------------------ hooks
function wallHook(p: Params) {
  return settle(hookPlate({ ...p, L: num(p, 'hookW') + 10, screw: screwOf(p) }, [(num(p, 'hookW') + 10) / 2]));
}
function hookRail(p: Params) {
  const k = Math.max(1, Math.round(num(p, 'N'))), gap = num(p, 'gap'), w = num(p, 'hookW');
  const L = k * w + (k - 1) * gap + 2 * Math.max(12, gap / 2);
  const x0 = (L - (k * w + (k - 1) * gap)) / 2 + w / 2;
  return settle(hookPlate({ ...p, L, screw: screwOf(p) }, Array.from({ length: k }, (_, i) => x0 + i * (w + gap))));
}

/** Under-shelf hook: a C clamp slid over the shelf edge and J hooks under it (side profile, printed on its side). */
function shelfHook(p: Params) {
  const s = num(p, 'shelf') + 0.4, A = num(p, 'A'), t = num(p, 'T'), drop = num(p, 'drop'), r = num(p, 'R'), w = num(p, 'W');
  const top = s + t / 2, bot = -t / 2;
  const pts: P2[] = [[A, top], [0, top], [0, bot], [A, bot], [A, bot - drop], ...arc(A + r, bot - drop, r, 180, 360, 12), [A + 2 * r, bot - drop + r * 0.6]];
  // Slight grip: the upper arm leans 1° towards the lower one.
  return settle(onSide(stroke(pts, t), w));
}

/** Pegboard hook: two pegs (holes `pitch` apart) and an arm with an upturned tip, printed on its side. */
function pegHook(p: Params) {
  const pitch = num(p, 'pitch'), d = num(p, 'pegD') - 0.4, L = num(p, 'L'), tipH = num(p, 'tipH'), board = num(p, 'board') + 0.5, w = d;
  const back = stroke([[0, 0], [0, pitch + d]], d);
  const peg = (y: number, down: boolean) => stroke(down ? [[0, y], [-board, y], [-board, y - d * 1.2]] : [[0, y], [-board - d, y]], d);
  const arm = stroke([[0, 0], [L, 0], [L + tipH * 0.4, tipH]], Math.max(d, 4));
  return settle(onSide(M().CrossSection.union([back, peg(pitch + d, true), peg(0, false), arm]), w));
}

// ------------------------------------------------------------------ kitchen
/** Tiered spice rack: steps for jars, each with a front lip (side profile, extruded to the width). */
function spiceRack(p: Params) {
  const jar = num(p, 'jar'), k = Math.max(1, Math.round(num(p, 'steps'))), rise = num(p, 'rise'), per = Math.max(1, Math.round(num(p, 'per'))), t = 3;
  const dep = jar + 4, W = per * (jar + 3) + 2 * t;
  const pts: P2[] = [[0, 0]];
  for (let i = 0; i < k; i++) {
    const y = (i + 1) * rise, x = i * dep;
    pts.push([x, y], [x + 2, y], [x + 2, y + 5], [x + 3.5, y + 5], [x + 3.5, y], [x + dep, y]);
  }
  pts.push([k * dep, 0]);
  const prof = ccw(pts);
  // Hollow under the steps: tunnels open at the bottom with a 45° roof, so the steps print without supports.
  const tw = 2.4;
  let core = prof;
  for (let i = 0; i < k; i++) {
    const x0 = i * dep + tw, x1 = (i + 1) * dep - tw, yc = (i + 1) * rise - tw, half = (x1 - x0) / 2;
    if (yc - half > 3) core = core.subtract(ccw([[x0, -1], [x1, -1], [x1, yc - half], [x0 + half, yc], [x0, yc - half]]));
  }
  // Side walls keep jars from sliding off the ends.
  const body = core.extrude(W - 2 * t).translate([0, 0, t]);
  const side = prof.offset(1.5, 'Miter').intersect(poly([[0, 0], [k * dep, 0], [k * dep, k * rise + 12], [0, k * rise + 12]]));
  return settle(union([body, side.extrude(t), side.extrude(t).translate([0, 0, W - t])]).rotate([90, 0, 0]));
}
/** Rack for lids, boards or plates: a base with upright fins. */
function slotRack(p: Params) {
  const k = Math.max(1, Math.round(num(p, 'N'))), gap = num(p, 'gap'), H = num(p, 'H'), D = num(p, 'D'), t = num(p, 'T');
  const L = k * gap + (k + 1) * t;
  const fins = Array.from({ length: k + 1 }, (_, i) => {
    const x = i * (gap + t);
    // Fins slope down towards the front: wide at the back, 45° at the top.
    return M()
      .CrossSection.ofPolygons([[[0, 0], [D, 0], [D, H * 0.35], [D * 0.35, H], [0, H]] as P2[]])
      .extrude(t)
      .rotate([90, 0, 90])
      .translate([x, 0, 0]);
  });
  return settle(union([box(0, 0, 0, L, D, 3), ...fins]));
}
/** Bag clip: a C-shaped sleeve and a rod pressed into it over the folded bag. Two pieces side by side. */
function bagClip(p: Params) {
  const L = num(p, 'L'), d = num(p, 'd'), bag = num(p, 'bag'), t = 1.8;
  const C = M().CrossSection;
  // Flat bottom where the round would start to overhang more than 45°.
  const flat = (cs: CrossSection, r: number) => cs.subtract(C.square([4 * r, r], true).translate([0, -r * 1.2]));
  const rod = flat(C.circle(d / 2, 48), d / 2);
  const Ri = d / 2 + bag, Ro = Ri + t;
  let sleeve = C.circle(Ro, 64).subtract(C.circle(Ri, 64)).subtract(C.square([d * 0.78, Ro], false).translate([-d * 0.39, Ri * 0.2]));
  sleeve = flat(sleeve, Ro);
  // Section in Y/Z (its flat on the bed), length along X.
  const bar = (cs: CrossSection) => cs.extrude(L).rotate([90, 0, 90]);
  // Each piece on the bed by its own flat.
  return settle(union([settle(bar(rod)), settle(bar(sleeve)).translate([0, d / 2 + Ro + 4, 0])]));
}

// ------------------------------------------------------------------ bathroom
function brushHolder(p: Params) {
  const k = Math.max(1, Math.round(num(p, 'N'))), d = num(p, 'd'), H = num(p, 'H'), wall = 3;
  const pitch = d + wall, L = k * pitch + wall, Dd = d + 2 * wall;
  let m = M().Manifold.hull([box(0, 0, 0, L, Dd + 6, 3), box(0, 3, 0, L, Dd + 3, H)]);
  for (let i = 0; i < k; i++) m = m.subtract(cyl(H + 2, d / 2).translate([wall + d / 2 + i * pitch, (Dd + 6) / 2, -1]));
  return settle(m);
}
function soapDish(p: Params) {
  const W = num(p, 'W'), D = num(p, 'D'), h = 10, t = 2.4, r = 6;
  const C = M().CrossSection;
  const rr = (w: number, d: number, rad: number) => C.square([w - 2 * rad, d], true).add(C.square([w, d - 2 * rad], true)).add(C.union([-1, 1].flatMap((sx) => [-1, 1].map((sy) => C.circle(rad, 24).translate([sx * (w / 2 - rad), sy * (d / 2 - rad)])))));
  let m = rr(W, D, r).extrude(h).subtract(rr(W - 2 * t, D - 2 * t, r - t).extrude(h).translate([0, 0, 2]));
  // Ribs the soap rests on, with drain slots between them.
  const k = Math.max(2, Math.floor((W - 2 * t) / 8));
  const step = (W - 2 * t) / k;
  for (let i = 0; i < k; i++) {
    const x = -W / 2 + t + step * (i + 0.5);
    m = m.add(box(x - 1, -D / 2 + t, 1.9, x + 1, D / 2 - t, 6));
    if (i < k - 1) m = m.subtract(box(x + 2, -D / 2 + t + 4, -1, x + step - 2, D / 2 - t - 4, 2.1));
  }
  return settle(m);
}

// ------------------------------------------------------------------ garden
function plantLabel(p: Params) {
  const stake = num(p, 'stake'), T = 2, font = String(p.font || 'sans-bold'), margin = 3;
  const lines = [String(p.text ?? ''), String(p.text2 ?? '')].map((t) => t.trim()).filter(Boolean);
  if (!lines.length) lines.push('?');
  let W = num(p, 'W'), H = num(p, 'H');
  const gapK = 1.45; // line pitch as a multiple of the letter height
  // Letter height: chosen, or the largest that fits the plate.
  let size = num(p, 'size');
  if (!(size > 0)) {
    const widest = Math.max(...lines.map((t) => textOutline(t, font, 10, 0.8)?.bounds() ?? null).map((b) => (b ? b.max[0] - b.min[0] : 10)));
    size = Math.max(3, Math.min((H - 2 * margin) / (1 + gapK * (lines.length - 1)) / 1.15, ((W - 2 * margin) / widest) * 10));
  }
  const css = lines.map((t) => textOutline(t, font, size, size * 0.08));
  // The plate grows to hold the text when the letters are set bigger than it.
  const textW = Math.max(...css.map((c) => (c ? c.bounds().max[0] - c.bounds().min[0] : 0)));
  W = Math.max(W, textW + 2 * margin);
  H = Math.max(H, size * 1.15 * (1 + gapK * (lines.length - 1)) + 2 * margin);
  const outline = ccw([[-W / 2, 0], [W / 2, 0], [W / 2, H], [-W / 2, H]]).add(ccw([[-5, 0.5], [5, 0.5], [0, -stake]]));
  let m = outline.extrude(T);
  css.forEach((cs, i) => {
    const y = H / 2 + ((lines.length - 1) / 2 - i) * size * gapK;
    if (cs) m = m.add(cs.translate([0, y]).extrude(num(p, 'depth') || 0.8).translate([0, 0, T - 0.01]));
  });
  return settle(m);
}
/** Hose hanger: wall plate with a wide saddle the coiled hose hangs on (printed on its side). */
function hoseHanger(p: Params) {
  const hose = num(p, 'hose'), coils = Math.max(1, Math.round(num(p, 'coils'))), w = num(p, 'W'), t = 6;
  const reach = coils * (hose + 2) + 10;
  const C = M().CrossSection;
  const back = stroke([[0, -reach * 0.45], [0, 60]], t);
  // The arm rises a little towards a rounded lip, so the coil slides back to the wall; a brace underneath.
  const rise = reach * Math.tan((5 * Math.PI) / 180);
  const arm = stroke([[0, 0], [reach, rise], ...arc(reach, rise + 10, 10, -90, 30, 8)], t);
  const brace = stroke([[0, -reach * 0.45], [reach * 0.55, rise * 0.55]], t);
  let m = onSide(C.union([back, arm, brace]), w);
  const sd = screwOf(p);
  if (sd) for (const y of [-reach * 0.3, 45]) m = m.subtract(csHoleX(y, w / 2, t, sd));
  return settle(m);
}
/** Plant clip: a ring on the support stick and an open ring round the stem, flat. */
function plantClip(p: Params) {
  const d1 = num(p, 'stick') + 0.4, d2 = num(p, 'stem') + 2, t = 1.8, h = num(p, 'H');
  const C = M().CrossSection;
  const ring = (d: number, open: number) =>
    C.circle(d / 2 + t, 48)
      .subtract(C.circle(d / 2, 48))
      .subtract(C.square([d * open, d], false).translate([-(d * open) / 2, 0]));
  const a = ring(d1, 0.7).rotate(90), b = ring(d2, 0.55).rotate(-90).translate([d1 / 2 + d2 / 2 + 2 * t, 0]);
  const link = C.square([2 * t + 0.6, t * 2], true).translate([d1 / 2 + t + 0.3, 0]);
  return settle(C.union([a, b, link]).extrude(h));
}

// ------------------------------------------------------------------ workshop
/** Screwdriver rail: a shelf with holes (flat on the bed) and a back plate for the wall. */
function toolRail(p: Params) {
  const k = Math.max(1, Math.round(num(p, 'N'))), d = num(p, 'd'), gap = num(p, 'gap'), D = num(p, 'D'), t = 4, back = 35;
  const pitch = d + gap, L = k * pitch + gap;
  let m = box(0, 0, 0, L, D, t).add(box(0, D - t, 0, L, D, back));
  for (const x of [0, L - t]) m = m.add(M().Manifold.hull([box(x, D - t, 0, x + t, D, back - 1), box(x, 0, 0, x + t, 1, t)]));
  for (let i = 0; i < k; i++) {
    const x = gap + d / 2 + i * pitch;
    m = m.subtract(cyl(t + 2, d / 2).translate([x, (D - t) / 2, -1]));
    // A slot to the front edge so the blade drops in from the side as well.
    if (p.slot === true) m = m.subtract(box(x - d * 0.35, -1, -1, x + d * 0.35, (D - t) / 2, t + 1));
  }
  const sd = screwOf(p);
  // Through the back plate, the head towards the tools (+Z of the hole turned to −Y).
  if (sd) for (const x of [L * 0.15, L * 0.85]) m = m.subtract(csHole(0, 0, t, sd).rotate([90, 0, 0]).translate([x, D, back * 0.65]));
  return settle(m);
}
/** Bit or drill holder: a block with hex 1/4" pockets or a row of drill holes from small to large. */
function bitHolder(p: Params) {
  const H = num(p, 'H');
  if (p.mode === 'drill') {
    const d0 = num(p, 'dMin'), d1 = Math.max(d0, num(p, 'dMax')), st = Math.max(0.5, num(p, 'dStep'));
    const ds: number[] = [];
    for (let d = d0; d <= d1 + 1e-6; d += st) ds.push(Math.round(d * 10) / 10);
    let x = 4;
    const xs = ds.map((d) => {
      const c = x + d / 2;
      x += d + 3;
      return c;
    });
    const D = d1 + 8;
    let m = M().Manifold.hull([box(0, 0, 0, x + 1, D + 6, 3), box(0, 0, 0, x + 1, D, H)]);
    ds.forEach((d, i) => (m = m.subtract(cyl(H, (d + 0.3) / 2).translate([xs[i], D / 2, 3]))));
    return settle(m);
  }
  const rows = Math.max(1, Math.round(num(p, 'rows'))), cols = Math.max(1, Math.round(num(p, 'cols'))), pitch = 10.5;
  let m = box(0, 0, 0, cols * pitch + 4, rows * pitch + 4, H);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) m = m.subtract(hex(6.35 + 0.35, H).rotate([0, 0, 30]).translate([2 + pitch / 2 + c * pitch, 2 + pitch / 2 + r * pitch, Math.min(3, H / 3)]));
  return settle(m);
}
const CELLS: Record<string, { d: number; h: number; label: string }> = {
  AA: { d: 14.5, h: 50.5, label: 'AA' },
  AAA: { d: 10.5, h: 44.5, label: 'AAA' },
  C: { d: 26.2, h: 50, label: 'C (R14)' },
  D: { d: 34.2, h: 61.5, label: 'D (R20)' },
  '18650': { d: 18.6, h: 65.2, label: '18650' },
  '9V': { d: 0, h: 48.5, label: '9V' },
};
function batteryTray(p: Params) {
  const cell = CELLS[String(p.cell)] ?? CELLS.AA, rows = Math.max(1, Math.round(num(p, 'rows'))), cols = Math.max(1, Math.round(num(p, 'cols'))), w = 2;
  const nine = String(p.cell) === '9V';
  const cw = nine ? 26.5 + 0.8 : cell.d + 0.8, cd = nine ? 17.5 + 0.8 : cell.d + 0.8;
  const depth = Math.round(cell.h * 0.55), H = depth + 2;
  let m = box(0, 0, 0, cols * (cw + w) + w, rows * (cd + w) + w, H);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = w + c * (cw + w), y = w + r * (cd + w);
      m = m.subtract(nine ? box(x, y, 2, x + cw, y + cd, H + 1) : cyl(depth + 1, cw / 2).translate([x + cw / 2, y + cd / 2, 2]));
    }
  return settle(m);
}

// ------------------------------------------------------------------ desk and electronics
/** Cable clip: a plate on the wall or desk and snap rings for the cables (side profile, printed on its side). */
function cableClip(p: Params) {
  const k = Math.max(1, Math.round(num(p, 'N'))), d = num(p, 'd') + 0.3, t = 1.6, w = num(p, 'W');
  const C = M().CrossSection;
  const pitch = d + 2 * t + 1.5;
  const L = k * pitch + 14;
  let cs = C.square([L, 3]);
  for (let i = 0; i < k; i++) {
    const cx = 7 + pitch / 2 + i * pitch;
    const ring = C.circle(d / 2 + t, 48).subtract(C.circle(d / 2, 48));
    // Open at the top by 70 % of the cable: it snaps in.
    const open = C.square([d * 0.7, d], true).translate([0, d / 2 + t]);
    cs = cs.add(ring.subtract(open).translate([cx, 3 + d / 2 - 0.4]));
  }
  let m = onSide(cs, w);
  const sd = screwOf(p);
  if (sd) for (const x of [3.5, L - 3.5]) m = m.subtract(cyl(4, sd / 2 + 0.2).rotate([-90, 0, 0]).translate([x, -0.5, w / 2]));
  return settle(m);
}
function penCup(p: Params) {
  const D = num(p, 'D'), H = num(p, 'H'), t = 2.2, k = Math.max(0, Math.round(num(p, 'parts')));
  const round = p.shape !== 'hex';
  const outer = round ? cyl(H, D / 2, D / 2, 96) : hex(D, H);
  const inner = round ? cyl(H, D / 2 - t, D / 2 - t, 96) : hex(D - 2 * t, H);
  let m = outer.subtract(inner.translate([0, 0, 2.4]));
  for (let i = 0; i < k; i++) m = m.add(box(-t / 2, 0, 0, t / 2, D / 2 - t / 2, H * 0.75).rotate([0, 0, (360 / k) * i]));
  return settle(m);
}

// ------------------------------------------------------------------ home and kids
function doorStop(p: Params) {
  const h = num(p, 'gap') + 4, L = Math.max(h * 5, num(p, 'L')), W = num(p, 'W');
  let m = ccw([[0, 0], [L, 0], [L, h], [L - 6, h]]).extrude(W).rotate([90, 0, 0]).translate([0, W, 0]);
  // Grip grooves across the slope and a hole to hang it.
  for (let x = 8; x < L - 12; x += 6) m = m.subtract(box(x, -1, (x / (L - 6)) * h - 0.6, x + 2, W + 1, h + 1));
  m = m.subtract(cyl(h + 2, 2.5).translate([L - 10, W / 2, -1]));
  return settle(m);
}
/** Spinning top, built upside down as it prints: stem on the bed, 45° cones, the tip at the top. */
function spinningTop(p: Params) {
  const D = num(p, 'D'), stem = num(p, 'stem'), sd = Math.max(5, D * 0.18);
  const R = D / 2, rim = 2;
  const prof = ccw([
    [0, 0],
    [sd / 2, 0],
    [sd / 2, stem],
    [R, stem + R - sd / 2],
    [R, stem + R - sd / 2 + rim],
    [0.6, stem + R - sd / 2 + rim + R - 0.6],
    [0, stem + R - sd / 2 + rim + R - 0.6],
  ]);
  return settle(M().Manifold.revolve(prof, 96));
}

export const USEFUL_DEFS: PartDef[] = [
  {
    type: 'wallHook',
    label: 'Haczyk ścienny',
    category: 'useful',
    hole: false,
    description: 'Haczyk na ręcznik, kurtkę albo torbę. Płytka do ściany i ramię z końcówką w górę. Drukuje się płasko, bez podpór.',
    params: [n('H', 'Wysokość płytki', 50, 25, 150), n('hookW', 'Szerokość haczyka', 16, 6, 60), n('D', 'Wysięg', 30, 10, 120, 1, 'Na ręcznik 30, na kurtkę 40–50.'), n('tip', 'Końcówka w górę', 8, 3, 30), n('T', 'Grubość płytki', 4, 2, 10, 0.5), ...screwParams],
    build: wallHook,
  },
  {
    type: 'hookRail',
    label: 'Listwa z haczykami',
    category: 'useful',
    hole: false,
    description: 'Na klucze, smycze albo ścierki: listwa z kilkoma haczykami. Liczba haczyków i odstęp ustalają długość.',
    params: [count('N', 'Liczba haczyków', 5, 1, 20), n('gap', 'Odstęp między haczykami', 22, 8, 100), n('hookW', 'Szerokość haczyka', 8, 4, 30), n('H', 'Wysokość listwy', 35, 20, 100), n('D', 'Wysięg', 22, 8, 80), n('tip', 'Końcówka w górę', 6, 3, 20), n('T', 'Grubość listwy', 4, 2, 10, 0.5), ...screwParams],
    build: hookRail,
  },
  {
    type: 'shelfHook',
    label: 'Haczyk pod półkę',
    category: 'useful',
    hole: false,
    description: 'Wsuwany na brzeg półki: kubki, ścierki, kable wiszą pod spodem. Podaj grubość półki. Drukuje się na boku.',
    params: [n('shelf', 'Grubość półki', 18, 5, 40, 0.5, 'Zmierz suwmiarką. Haczyk dodaje 0,4 mm luzu.'), n('A', 'Głębokość wsunięcia', 40, 15, 120), n('drop', 'Opuszczenie haczyka', 25, 5, 100), n('R', 'Promień haczyka', 12, 5, 40), n('T', 'Grubość', 4, 2.5, 8, 0.5), n('W', 'Szerokość', 15, 6, 40)],
    build: shelfHook,
  },
  {
    type: 'pegHook',
    label: 'Haczyk do ścianki ażurowej',
    category: 'useful',
    hole: false,
    description: 'Do ścianki z otworami (pegboard): dwa bolce w otwory i ramię na narzędzie. Raster 25 mm albo 1 cal.',
    params: [
      { ...select('pitchS', 'Raster otworów', '25.4', [['25.4', '1 cal (25,4 mm)'], ['25', '25 mm']]) },
      n('pitch', 'Odstęp otworów w pionie', 25.4, 10, 80, 0.1),
      n('pegD', 'Średnica otworu', 6, 3, 10, 0.1),
      n('board', 'Grubość ścianki', 4, 1, 20, 0.5),
      n('L', 'Długość ramienia', 50, 15, 200),
      n('tipH', 'Końcówka w górę', 10, 0, 40),
    ],
    normalize: (prev, next) => (prev.pitchS !== next.pitchS ? { ...next, pitch: Number(next.pitchS) } : next),
    build: pegHook,
  },
  {
    type: 'spiceRack',
    label: 'Przyprawnik schodkowy',
    category: 'useful',
    hole: false,
    description: 'Schodki na słoiczki: każdy rząd wyżej, z rantem z przodu. Podaj średnicę słoiczka i ile ich stoi w rzędzie.',
    params: [n('jar', 'Średnica słoiczka', 45, 20, 100), count('per', 'Słoiczków w rzędzie', 4, 1, 10), count('steps', 'Liczba schodków', 3, 1, 5), n('rise', 'Wysokość schodka', 22, 10, 50)],
    build: spiceRack,
  },
  {
    type: 'slotRack',
    label: 'Stojak na pokrywki i deski',
    category: 'useful',
    hole: false,
    description: 'Podstawa z pionowymi przegrodami: pokrywki, deski do krojenia, talerze, płyty, tablety. Odstęp = grubość rzeczy + zapas.',
    params: [count('N', 'Liczba przegródek', 5, 1, 15), n('gap', 'Szerokość przegródki', 25, 5, 80, 1, 'Grubość deski albo uchwytu pokrywki + 3–5 mm.'), n('H', 'Wysokość przegród', 70, 20, 200), n('D', 'Głębokość', 90, 30, 250), n('T', 'Grubość przegrody', 3, 1.6, 8, 0.2)],
    build: slotRack,
  },
  {
    type: 'bagClip',
    label: 'Klips do woreczków',
    category: 'useful',
    hole: false,
    description: 'Zamknięcie do torebek: pręt i rurka z wycięciem. Złożoną torebkę dociskasz prętem w rurkę. Dwie części obok siebie.',
    params: [n('L', 'Długość', 110, 40, 250), n('d', 'Średnica pręta', 6, 4, 12, 0.5), n('bag', 'Miejsce na torebkę', 0.6, 0.2, 2, 0.1, 'Grubsze torebki (kawa, karma): 0,8–1.')],
    build: bagClip,
  },
  {
    type: 'brushHolder',
    label: 'Stojak na szczoteczki',
    category: 'useful',
    hole: false,
    description: 'Blok z otworami na szczoteczki i pastę. Otwory na wylot, żeby woda spływała.',
    params: [count('N', 'Liczba otworów', 4, 1, 8), n('d', 'Średnica otworu', 16, 8, 40), n('H', 'Wysokość', 40, 15, 100)],
    build: brushHolder,
  },
  {
    type: 'soapDish',
    label: 'Mydelniczka z odpływem',
    category: 'useful',
    hole: false,
    description: 'Tacka z żeberkami i szczelinami: mydło leży suche, woda ścieka. Podaj wymiary kostki mydła.',
    params: [n('W', 'Szerokość', 110, 60, 200), n('D', 'Głębokość', 75, 40, 150)],
    build: soapDish,
  },
  {
    type: 'plantLabel',
    label: 'Etykieta do roślin',
    category: 'useful',
    hole: false,
    description: 'Wbijana tabliczka z wypukłym napisem w jednym albo dwóch wierszach, z wyborem kroju i wielkości liter. Dla dwóch kolorów: zmiana filamentu na wysokości napisu.',
    params: [
      { key: 'text', label: 'Napis (1. wiersz)', type: 'text', def: 'Bazylia', max: 24 },
      { key: 'text2', label: '2. wiersz (opcjonalnie)', type: 'text', def: '', max: 24, hint: 'Np. odmiana albo data wysiewu. Puste = jeden wiersz.' },
      FONT,
      n('size', 'Wysokość liter', 0, 0, 40, 0.5, '0 = sama się dobiera do tabliczki. Większe litery powiększają tabliczkę.'),
      n('depth', 'Wypukłość liter', 0.8, 0.4, 3, 0.2),
      n('W', 'Szerokość tabliczki', 60, 30, 200),
      n('H', 'Wysokość tabliczki', 20, 10, 100),
      n('stake', 'Długość szpikulca', 80, 30, 200),
    ],
    build: plantLabel,
  },
  {
    type: 'hoseHanger',
    label: 'Uchwyt na wąż ogrodowy',
    category: 'useful',
    hole: false,
    description: 'Ścienny wieszak na zwinięty wąż: szerokie siodło, żeby wąż się nie załamywał. Drukuje się na boku.',
    params: [n('hose', 'Średnica węża', 19, 10, 40, 0.5, '1/2 cala ok. 17, 3/4 cala ok. 24.'), count('coils', 'Ile zwojów obok siebie', 6, 1, 15), n('W', 'Szerokość', 30, 15, 80), ...screwParams],
    build: hoseHanger,
  },
  {
    type: 'plantClip',
    label: 'Klips do roślin',
    category: 'useful',
    hole: false,
    description: 'Mocuje łodygę do patyka: jedno kółko na patyk, drugie otwarte na łodygę.',
    params: [n('stick', 'Średnica patyka', 8, 3, 25, 0.5), n('stem', 'Średnica łodygi', 6, 2, 30, 0.5), n('H', 'Wysokość', 6, 3, 15)],
    build: plantClip,
  },
  {
    type: 'toolRail',
    label: 'Uchwyt na śrubokręty',
    category: 'useful',
    hole: false,
    description: 'Półka z otworami na trzonki i płyta do ściany. Średnica otworu = trzonek + zapas, rączka opiera się na półce.',
    params: [count('N', 'Liczba otworów', 8, 1, 20), n('d', 'Średnica otworu', 9, 3, 30, 0.5), n('gap', 'Odstęp', 14, 5, 50), n('D', 'Głębokość półki', 35, 20, 80), { key: 'slot', label: 'Szczelina do przodu (wkładanie z boku)', type: 'bool', def: false }, ...screwParams],
    build: toolRail,
  },
  {
    type: 'bitHolder',
    label: 'Uchwyt na bity i wiertła',
    category: 'useful',
    hole: false,
    description: 'Bity 1/4 cala w sześciokątnych gniazdach albo rząd wierteł od najmniejszego do największego.',
    params: [
      { ...select('mode', 'Na co', 'bits', [['bits', 'Bity 1/4" (sześciokąt)'], ['drill', 'Wiertła (rząd średnic)']]) },
      count('rows', 'Rzędy', 2, 1, 10),
      count('cols', 'Kolumny', 6, 1, 20),
      n('dMin', 'Najmniejsze wiertło', 2, 1, 20, 0.5, undefined, (p) => p.mode === 'drill'),
      n('dMax', 'Największe wiertło', 10, 1, 25, 0.5, undefined, (p) => p.mode === 'drill'),
      n('dStep', 'Co ile', 1, 0.5, 5, 0.5, undefined, (p) => p.mode === 'drill'),
      n('H', 'Wysokość bloku', 18, 8, 60),
    ],
    paramsFor: (p) => USEFUL_DEFS.find((d) => d.type === 'bitHolder')!.params.filter((d) => p.mode === 'drill' ? d.key !== 'rows' && d.key !== 'cols' : true),
    build: bitHolder,
  },
  {
    type: 'batteryTray',
    label: 'Organizer na baterie',
    category: 'useful',
    hole: false,
    description: 'Blok z gniazdami na baterie: AA, AAA, C, D, 18650 albo 9V. Baterie wystają do połowy, łatwo je wyjąć.',
    params: [{ ...select('cell', 'Bateria', 'AA', Object.entries(CELLS).map(([k, v]) => [k, v.label] as [string, string])) }, count('rows', 'Rzędy', 2, 1, 10), count('cols', 'Kolumny', 6, 1, 15)],
    build: batteryTray,
  },
  {
    type: 'cableClip',
    label: 'Uchwyt na kable',
    category: 'useful',
    hole: false,
    description: 'Klips z zatrzaskowymi kółkami na kable: pod blat, na ścianę albo listwę. Kabel wciska się od góry.',
    params: [count('N', 'Liczba kabli', 3, 1, 10), n('d', 'Średnica kabla', 6, 2, 20, 0.5), n('W', 'Szerokość klipsa', 10, 5, 30), ...screwParams],
    build: cableClip,
  },
  {
    type: 'penCup',
    label: 'Kubek na długopisy',
    category: 'useful',
    hole: false,
    description: 'Okrągły albo sześciokątny pojemnik na biurko, z przegrodami albo bez.',
    params: [{ ...select('shape', 'Kształt', 'round', [['round', 'Okrągły'], ['hex', 'Sześciokątny']]) }, n('D', 'Średnica', 75, 30, 200), n('H', 'Wysokość', 100, 30, 250), count('parts', 'Przegrody (0 = bez)', 3, 0, 6)],
    build: penCup,
  },
  {
    type: 'doorStop',
    label: 'Odbojnik do drzwi (klin)',
    category: 'useful',
    hole: false,
    description: 'Klin pod drzwi z rowkami i otworem do powieszenia. Podaj szczelinę pod drzwiami.',
    params: [n('gap', 'Szczelina pod drzwiami', 12, 3, 40, 0.5), n('L', 'Długość', 90, 40, 200), n('W', 'Szerokość', 40, 20, 80)],
    build: doorStop,
  },
  {
    type: 'spinningTop',
    label: 'Bączek',
    category: 'useful',
    hole: false,
    description: 'Zabawka: bączek z trzonkiem. Zbudowany tak, jak się drukuje: trzonkiem w dół, stożki pod 45°, bez podpór.',
    params: [n('D', 'Średnica', 45, 20, 100), n('stem', 'Długość trzonka', 15, 6, 40)],
    build: spinningTop,
  },
];
