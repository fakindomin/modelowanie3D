import type { CrossSection, Manifold } from 'manifold-3d';
import * as THREE from 'three';
import type { Part, Vec3 } from '../types';
import { M } from '../geom/manifold';
import type { Params, PartDef } from './def';
import { num, select } from './util';

/**
 * Cut-outs for common connectors, as seen from outside the wall (x to the right, z up).
 * Sizes are typical values for the most common parts, before clearance; check yours with a caliper.
 */
export interface ConnSpec {
  label: string;
  group: 'usb' | 'power' | 'other';
  shape: 'rect' | 'stadium' | 'circle' | 'dflat' | 'trap' | 'chamfer';
  w: number;
  h: number;
  /** Corner radius (rect), chamfer size (chamfer), bottom width (trap), flat-to-flat (dflat). */
  r?: number;
  /** Which corners are chamfered: top, bottom or both. */
  cut?: 'top' | 'bottom' | 'both';
  /** Plug moulding, for a socket soldered on a board inside: the wall has to let the plug in. */
  plug?: [number, number, number];
  /** Screw holes either side: spacing and diameter. */
  screws?: [number, number];
  screwsOn?: boolean;
  /** Held by snap-in clips that need a thin wall. */
  snap?: boolean;
  hint?: string;
}

export const CONNECTORS: Record<string, ConnSpec> = {
  usbc: { label: 'USB-C', group: 'usb', shape: 'stadium', w: 9.0, h: 3.3, plug: [12.4, 6.5, 3.2], screws: [15, 2.2], hint: 'Gniazdo 8,9 × 3,2 mm, wtyczka ok. 12,4 × 6,5 mm.' },
  usba: { label: 'USB-A', group: 'usb', shape: 'rect', w: 13.1, h: 5.7, r: 0.5, plug: [16, 8, 1.5], screws: [30, 3.2], hint: 'Gniazdo 13 × 5,7 mm; panelowe przedłużacze USB-A mają śruby co ok. 30 mm.' },
  usba2: { label: 'USB-A podwójne (piętrowe)', group: 'usb', shape: 'rect', w: 14.8, h: 16.0, r: 0.5, hint: 'Dwa gniazda USB-A jedno nad drugim, jak w Raspberry Pi.' },
  microusb: { label: 'micro USB', group: 'usb', shape: 'trap', w: 7.6, h: 2.7, r: 6.0, plug: [10.6, 6.8, 1.5], hint: 'Trapez 7,5 mm u góry, ok. 6 mm u dołu.' },
  usbb: { label: 'USB-B (drukarkowe)', group: 'usb', shape: 'chamfer', w: 12.0, h: 10.9, r: 1.7, cut: 'top', plug: [16, 15.5, 1], screws: [30, 3.2] },
  hdmi: { label: 'HDMI', group: 'usb', shape: 'chamfer', w: 15.2, h: 5.8, r: 1.4, cut: 'bottom', plug: [21, 11, 2], screws: [26, 3.2] },
  microhdmi: { label: 'micro HDMI', group: 'usb', shape: 'chamfer', w: 6.8, h: 3.0, r: 0.8, cut: 'bottom', plug: [11.5, 7.5, 1.5] },
  minihdmi: { label: 'mini HDMI', group: 'usb', shape: 'chamfer', w: 11.2, h: 3.4, r: 1, cut: 'bottom', plug: [14.5, 8, 1.5] },
  rj45: { label: 'RJ45 (Ethernet)', group: 'usb', shape: 'rect', w: 16.2, h: 13.8, r: 0.5, screws: [26, 3.2], hint: 'Gniazdo na płytce 16 × 13,5 mm; wtyczka z zatrzaskiem przechodzi przez ten sam otwór.' },
  xt30: { label: 'XT30', group: 'power', shape: 'chamfer', w: 10.2, h: 5.2, r: 1.5, cut: 'top', screws: [18, 2.2] },
  xt60: { label: 'XT60', group: 'power', shape: 'chamfer', w: 15.8, h: 8.2, r: 2.4, cut: 'top', screws: [24, 3.2], screwsOn: true, hint: 'Panelowe gniazdo XT60 przykręca się dwiema śrubami M3.' },
  xt90: { label: 'XT90', group: 'power', shape: 'chamfer', w: 21.8, h: 10.8, r: 3, cut: 'top', screws: [31, 3.2], screwsOn: true },
  dc55: { label: 'DC 5,5 × 2,1 (zasilacz)', group: 'power', shape: 'circle', w: 8.1, h: 8.1, hint: 'Gniazdo panelowe z gwintem M8 i nakrętką. Wersje z gwintem 11 mm: wpisz średnicę 11,2 w „Średnica”.' },
  iecc14: { label: 'IEC C14 (kabel komputerowy)', group: 'power', shape: 'chamfer', w: 27.4, h: 19.8, r: 3.6, cut: 'bottom', screws: [40, 3.2], snap: true, hint: 'Wersja zatrzaskowa: ścianka pod zatrzaskami ok. 1,6 mm. Wersja przykręcana: śruby co 40 mm.' },
  iecc8: { label: 'IEC C8 („ósemka”)', group: 'power', shape: 'stadium', w: 19.6, h: 10.8, screws: [28, 3.2], snap: true, hint: 'Typowe gniazdo zatrzaskowe; wymiary różnią się między producentami, zmierz swoje.' },
  rocker: { label: 'Wyłącznik kołyskowy (KCD1)', group: 'power', shape: 'rect', w: 19.2, h: 12.9, r: 0.5, snap: true, hint: 'Standardowy otwór 19 × 13 mm, zatrzaski na ściankę 1–2 mm.' },
  jack35: { label: 'Jack 3,5 mm', group: 'other', shape: 'circle', w: 6.1, h: 6.1, hint: 'Gniazdo panelowe z gwintem M6.' },
  led3: { label: 'Dioda LED 3 mm', group: 'other', shape: 'circle', w: 3.1, h: 3.1 },
  led5: { label: 'Dioda LED 5 mm', group: 'other', shape: 'circle', w: 5.1, h: 5.1 },
  button12: { label: 'Przycisk / wyłącznik 12 mm', group: 'other', shape: 'circle', w: 12.1, h: 12.1 },
  button16: { label: 'Przycisk / wyłącznik 16 mm', group: 'other', shape: 'circle', w: 16.1, h: 16.1 },
  pot: { label: 'Potencjometr (gwint M7)', group: 'other', shape: 'circle', w: 7.2, h: 7.2, hint: 'Typowy potencjometr 16 mm z gwintem M7. Kołek blokujący pomijamy (zetnij go albo dowierć).' },
  gx12: { label: 'GX12 (lotnicze)', group: 'other', shape: 'circle', w: 12.1, h: 12.1 },
  gx16: { label: 'GX16 (lotnicze)', group: 'other', shape: 'circle', w: 16.1, h: 16.1 },
  sma: { label: 'SMA (antena)', group: 'other', shape: 'dflat', w: 6.5, h: 6.5, r: 5.8, hint: 'Gniazdo z gwintem 1/4" i ścięciem 5,8 mm, które blokuje obracanie.' },
};

const circle = (d: number) => M().CrossSection.circle(d / 2, 64);
const rrect = (w: number, h: number, r: number): CrossSection => {
  r = Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  const core = M().CrossSection.square([w - 2 * r, h - 2 * r], true);
  return r > 0.01 ? core.offset(r, 'Round', 2, 48) : core;
};

/** Points given as seen from outside (x right, z up); flipped to the section's y which ends up as -z. */
function view(points: [number, number][]): CrossSection {
  const pts = points.map(([x, z]) => [x, -z] as [number, number]);
  let area = 0;
  pts.forEach(([x0, y0], i) => {
    const [x1, y1] = pts[(i + 1) % pts.length];
    area += x0 * y1 - x1 * y0;
  });
  return M().CrossSection.ofPolygons([area < 0 ? pts.reverse() : pts]);
}

/** Opening size for this type and mode, including the clearance on every side. */
export function connOpening(p: Params) {
  const s = CONNECTORS[String(p.kind)] ?? CONNECTORS.usbc;
  const luz = num(p, 'luz');
  if (s.shape === 'circle' || s.shape === 'dflat') {
    const d = num(p, 'd') + 2 * luz;
    return { s, w: d, h: d };
  }
  if (p.mode === 'plug' && s.plug) return { s, w: s.plug[0] + 2 * luz, h: s.plug[1] + 2 * luz };
  return { s, w: s.w + 2 * luz, h: s.h + 2 * luz };
}

function openingSection(p: Params): CrossSection {
  const { s, w, h } = connOpening(p);
  const luz = num(p, 'luz');
  if (s.shape === 'circle') return circle(w);
  if (s.shape === 'dflat') {
    const flat = (s.r ?? w) + 2 * luz;
    return circle(w).intersect(M().CrossSection.square([flat, w + 2], true));
  }
  if (p.mode === 'plug' && s.plug) return rrect(w, h, s.plug[2] + luz);
  if (s.shape === 'stadium') return rrect(w, h, h / 2);
  if (s.shape === 'rect') return rrect(w, h, (s.r ?? 0) + luz);
  const x = w / 2, z = h / 2;
  if (s.shape === 'trap') {
    const xb = ((s.r ?? w) + 2 * luz) / 2;
    return view([[-x, z], [x, z], [xb, -z], [-xb, -z]]);
  }
  // Chamfered rectangle.
  const c = Math.min(s.r ?? 1, z, x);
  const top = s.cut !== 'bottom', bottom = s.cut !== 'top';
  const pts: [number, number][] = [];
  if (top) pts.push([-x + c, z], [x - c, z], [x, z - c]);
  else pts.push([-x, z], [x, z]);
  if (bottom) pts.push([x, -z + c], [x - c, -z], [-x + c, -z], [-x, -z + c]);
  else pts.push([x, -z], [-x, -z]);
  if (top) pts.push([-x, z - c]);
  return view(pts);
}

/** Extrudes a section seen from outside into the wall: from y0 to y1 (inwards is +y). */
const through = (cs: CrossSection, y0: number, y1: number): Manifold => cs.extrude(y1 - y0).rotate([-90, 0, 0]).translate([0, y0, 0]);

/** Margin around the opening kept at the thin snap-in wall thickness. */
const SNAP_MARGIN = 2.5;

function screwsOf(p: Params) {
  const s = CONNECTORS[String(p.kind)] ?? CONNECTORS.usbc;
  return p.screws && s.screws ? { sp: num(p, 'sp'), d: num(p, 'sd') } : null;
}

/** Outline of the reinforcement around the opening and its screws. */
export function frameSize(p: Params) {
  const { s, w, h } = connOpening(p);
  const fw = num(p, 'fw');
  const gap = s.snap && p.mode !== 'plug' ? SNAP_MARGIN : 0;
  const sc = screwsOf(p);
  const W = Math.max(w + 2 * gap, sc ? sc.sp + sc.d : 0) + 2 * fw;
  const H = Math.max(h + 2 * gap, sc ? sc.d : 0) + 2 * fw;
  return { W, H, gap };
}

/**
 * Connector set in its own frame: the wall's outer face is y = 0, the inside is +y,
 * the opening is centred on x = 0, z = 0. Piece "cut" makes the opening (plus screw holes and
 * a thinner area for snap-in clips), piece "frame" is the reinforcement on the inner face.
 */
function connector(p: Params): Manifold {
  const wall = num(p, 'wall'), ft = num(p, 'ft');
  const deep = wall + ft + 1;
  const { s } = connOpening(p);
  if (p.piece === 'frame') {
    const f = frameSize(p);
    return through(rrect(f.W, f.H, 1.5), wall - 0.05, wall + ft);
  }
  let m = through(openingSection(p), -1, deep);
  const sc = screwsOf(p);
  if (sc) for (const sx of [-1, 1]) m = m.add(through(circle(sc.d), -1, deep).translate([(sx * sc.sp) / 2, 0, 0]));
  const thin = num(p, 'snapT');
  if (s.snap && p.mode !== 'plug' && thin < wall + ft) {
    const { w, h } = connOpening(p);
    m = m.add(through(rrect(w + 2 * SNAP_MARGIN, h + 2 * SNAP_MARGIN, 1), thin, deep));
  }
  return m;
}

const group = (g: ConnSpec['group']) =>
  Object.entries(CONNECTORS)
    .filter(([, s]) => s.group === g)
    .map(([k, s]) => [k, s.label] as [string, string]);

export const CONNECTOR_DEFS: PartDef[] = [
  {
    type: 'connector',
    label: 'Otwór pod złącze',
    category: 'connectors',
    hole: false,
    hidden: true,
    description: 'Gotowy otwór pod typowe złącze z luzem, opcjonalnymi śrubami i wzmocnieniem od środka. Zaznacz pudełko przed dodaniem, wtedy otwór stanie na przedniej ściance.',
    pieces: [
      { value: 'cut', label: 'otwór', hole: true, body: 'sel' },
      { value: 'frame', label: 'wzmocnienie', hole: false, body: 'sel' },
    ],
    params: [
      select('kind', 'Złącze', 'usbc', [...group('usb'), ...group('power'), ...group('other')]),
      select('mode', 'Co przechodzi przez ściankę', 'socket', [
        ['socket', 'Gniazdo wkładane w ściankę'],
        ['plug', 'Wtyczka do gniazda na płytce w środku'],
      ]),
      { key: 'd', label: 'Średnica', type: 'number', def: 8.1, min: 1, max: 60, step: 0.1, unit: 'mm', show: (p) => ['circle', 'dflat'].includes(CONNECTORS[String(p.kind)]?.shape) },
      { key: 'luz', label: 'Luz na stronę', type: 'number', def: 0.2, min: 0, max: 1.5, step: 0.05, unit: 'mm', hint: 'Dodawany z każdej strony otworu. 0,2 mm zwykle daje wcisk bez szlifowania.' },
      { key: 'wall', label: 'Grubość ścianki', type: 'number', def: 2, min: 0.6, max: 20, step: 0.2, unit: 'mm', hint: 'Ustawiana sama według zaznaczonego pudełka.' },
      { key: 'fw', label: 'Szerokość wzmocnienia', type: 'number', def: 3, min: 1, max: 20, step: 0.5, unit: 'mm', group: 'Wzmocnienie od środka', hint: 'Ramka dookoła otworu po wewnętrznej stronie ścianki. Nie potrzebujesz jej? Usuń element „wzmocnienie”.' },
      { key: 'ft', label: 'Grubość wzmocnienia', type: 'number', def: 2, min: 0.4, max: 20, step: 0.2, unit: 'mm', hint: 'Gniazda z gwintem (DC, jack, GX): gwint musi przejść przez ściankę i ramkę, żeby złapać nakrętkę.' },
      { key: 'screws', label: 'Otwory na śruby', type: 'bool', def: false, show: (p) => !!CONNECTORS[String(p.kind)]?.screws },
      { key: 'sp', label: 'Rozstaw śrub', type: 'number', def: 15, min: 4, max: 100, step: 0.5, unit: 'mm', show: (p) => !!p.screws && !!CONNECTORS[String(p.kind)]?.screws },
      { key: 'sd', label: 'Średnica otworów na śruby', type: 'number', def: 2.2, min: 1, max: 8, step: 0.1, unit: 'mm', show: (p) => !!p.screws && !!CONNECTORS[String(p.kind)]?.screws },
      { key: 'snapT', label: 'Ścianka pod zatrzaskami', type: 'number', def: 1.6, min: 0.6, max: 5, step: 0.1, unit: 'mm', show: (p) => !!CONNECTORS[String(p.kind)]?.snap && p.mode !== 'plug', hint: 'Zatrzaski gniazd i wyłączników łapią ściankę 1–2 mm; grubsza zostaje pocieniona dookoła otworu.' },
    ],
    place: (sel, p, part) => {
      const pose = wallPose(sel, defaultSide(sel), part);
      return { position: pose.position, rotation: pose.rotation, params: pose.wall ? { ...p, wall: pose.wall } : p };
    },
    normalize: (prev, next) => {
      if (prev.kind === next.kind) return next;
      const s = CONNECTORS[String(next.kind)] ?? CONNECTORS.usbc;
      return {
        ...next,
        mode: s.plug ? next.mode : 'socket',
        d: s.shape === 'circle' || s.shape === 'dflat' ? s.w : next.d,
        screws: !!s.screwsOn,
        sp: s.screws?.[0] ?? next.sp,
        sd: s.screws?.[1] ?? next.sd,
      };
    },
    build: connector,
  },
];

/** Starting parameters for a connector type (what normalize() would set). */
export function connectorParams(kind: string): Params {
  const s = CONNECTORS[kind];
  const p: Params = { kind, screws: !!s.screwsOn };
  if (s.shape === 'circle' || s.shape === 'dflat') p.d = s.w;
  if (s.screws) [p.sp, p.sd] = s.screws;
  return p;
}

export type WallSide = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export const WALL_SIDES: { side: WallSide; label: string }[] = [
  { side: 'front', label: 'Przód' },
  { side: 'back', label: 'Tył' },
  { side: 'left', label: 'Lewa' },
  { side: 'right', label: 'Prawa' },
  { side: 'top', label: 'Góra' },
  { side: 'bottom', label: 'Dół' },
];

const ROT: Record<WallSide, Vec3> = { front: [0, 0, 0], back: [0, 0, 180], left: [0, 0, -90], right: [0, 0, 90], top: [-90, 0, 0], bottom: [90, 0, 0] };

/** Wall thickness of a part on the given side, when it is known (box walls and floor, plates, lids). */
export function wallOf(part: Part | undefined, side: WallSide): number | null {
  if (!part) return null;
  const T = Number(part.params.T);
  if (part.type === 'box' || part.type === 'drawer') return side === 'bottom' ? Number(part.params.B) : side === 'top' ? null : T;
  if (['lid', 'slab', 'plate', 'perfPlate'].includes(part.type)) return side === 'top' || side === 'bottom' ? T : null;
  return null;
}

/** Wall a connector goes on when added: the front of a box, the top of a flat plate or lid. */
export function defaultSide(box: THREE.Box3): WallSide {
  const s = box.getSize(new THREE.Vector3());
  return s.z < Math.min(s.x, s.y) / 4 ? 'top' : 'front';
}

/**
 * Pose of a connector on one wall of a body's box: centred on the wall, at mid height of the
 * inside for a box with a floor. `along` keeps the current position along the wall when given.
 */
export function wallPose(box: THREE.Box3, side: WallSide, part?: Part, along?: Vec3): { position: Vec3; rotation: Vec3; wall: number | null } {
  const c = box.getCenter(new THREE.Vector3());
  const floor = part && (part.type === 'box' || part.type === 'drawer') ? Number(part.params.B) : 0;
  const zc = (box.min.z + floor + box.max.z) / 2;
  const a = along ?? [c.x, c.y, zc];
  const inX = (v: number) => Math.min(box.max.x, Math.max(box.min.x, v));
  const inY = (v: number) => Math.min(box.max.y, Math.max(box.min.y, v));
  const inZ = (v: number) => Math.min(box.max.z, Math.max(box.min.z + floor, v));
  const position: Vec3 =
    side === 'front' ? [inX(a[0]), box.min.y, inZ(a[2])]
    : side === 'back' ? [inX(a[0]), box.max.y, inZ(a[2])]
    : side === 'left' ? [box.min.x, inY(a[1]), inZ(a[2])]
    : side === 'right' ? [box.max.x, inY(a[1]), inZ(a[2])]
    : side === 'top' ? [inX(a[0]), inY(a[1]), box.max.z]
    : [inX(a[0]), inY(a[1]), box.min.z];
  return { position, rotation: ROT[side], wall: wallOf(part, side) };
}

/** Which wall a connector faces, from its rotation. */
export function sideOf(rotation: Vec3): WallSide | null {
  for (const s of WALL_SIDES) if (ROT[s.side].every((v, i) => Math.abs((((v - rotation[i]) % 360) + 540) % 360 - 180) < 1)) return s.side;
  return null;
}
