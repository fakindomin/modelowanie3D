/**
 * Geodesic dome: the sphere from a subdivided icosahedron (class I, one vertex at the top), cut at a ring
 * near the wanted height. Struts are bought rods (wood dowels, PVC conduit) or printed; every node is a
 * printed hub, a flat puck with blind sockets drilled at the strut's angles, printed flat side down.
 */
import type { Manifold } from 'manifold-3d';
import * as THREE from 'three';
import { M } from '../geom/manifold';
import type { Params, PartDef } from './def';
import { textOutline } from './text';
import { num } from './util';

export interface DomeEdge {
  a: number;
  b: number;
  /** Strut class: A is the shortest. */
  cls: string;
}
export interface Dome {
  nodes: THREE.Vector3[];
  edges: DomeEdge[];
  /** Chord length of each class on a unit sphere. */
  lengths: Record<string, number>;
  /** Height of the cut on a unit sphere (z of the base ring) and how uneven the base ring is. */
  zCut: number;
  baseSpread: number;
}

const PHI = (1 + Math.sqrt(5)) / 2;

function icosahedron(): { v: THREE.Vector3[]; f: [number, number, number][] } {
  const raw: [number, number, number][] = [];
  for (const a of [-1, 1]) for (const b of [-PHI, PHI]) raw.push([0, a, b], [a, b, 0], [b, 0, a]);
  let v = raw.map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
  // One vertex to the top.
  const q = new THREE.Quaternion().setFromUnitVectors(v.find((p) => p.z > 0 && Math.abs(p.x) < 1e-9)!.clone(), new THREE.Vector3(0, 0, 1));
  v = v.map((p) => p.applyQuaternion(q));
  const e = Math.min(...v.slice(1).map((p) => p.distanceTo(v[0])));
  const near = (i: number, j: number) => Math.abs(v[i].distanceTo(v[j]) - e) < 1e-6;
  const f: [number, number, number][] = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) if (near(i, j) && near(j, k) && near(i, k)) f.push([i, j, k]);
  return { v, f };
}

/** Dome of frequency `freq`; `height` is the wanted share of the sphere (0.5 = half, 0.625 = 5/8). */
export function geodesic(freq: number, height: number): Dome {
  const { v, f } = icosahedron();
  const nodes: THREE.Vector3[] = [];
  const index = new Map<string, number>();
  const id = (p: THREE.Vector3) => {
    const k = `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)},${Math.round(p.z * 1e6)}`;
    let i = index.get(k);
    if (i === undefined) {
      i = nodes.length;
      index.set(k, i);
      nodes.push(p);
    }
    return i;
  };
  const edgeSet = new Set<string>();
  const pairs: [number, number][] = [];
  const link = (a: number, b: number) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edgeSet.has(k)) {
      edgeSet.add(k);
      pairs.push([a, b]);
    }
  };
  for (const [ia, ib, ic] of f) {
    const A = v[ia], B = v[ib], C = v[ic];
    const pt = (i: number, j: number) => {
      const k = freq - i - j;
      return id(new THREE.Vector3().addScaledVector(A, i / freq).addScaledVector(B, j / freq).addScaledVector(C, k / freq).normalize());
    };
    for (let i = 0; i <= freq; i++)
      for (let j = 0; i + j <= freq; j++) {
        const p = pt(i, j);
        if (i + j < freq) {
          link(p, pt(i + 1, j));
          link(p, pt(i, j + 1));
          link(pt(i + 1, j), pt(i, j + 1));
        }
      }
  }
  // The cut: the ring of nodes nearest the wanted height.
  const want = 1 - 2 * height;
  const levels = [...new Set(nodes.map((p) => Math.round(p.z * 1e4) / 1e4))].sort((a, b) => a - b);
  // Rings of a frequency-3 sphere are not flat: group nodes within a band and take the band nearest the wish.
  const bands: number[][] = [];
  for (const z of levels) {
    const last = bands[bands.length - 1];
    if (last && z - last[last.length - 1] < 0.06 / freq) last.push(z);
    else bands.push([z]);
  }
  const band = bands.reduce((best, b) => (Math.abs(b[0] - want) < Math.abs(best[0] - want) ? b : best), bands[0]);
  const zCut = band[0];
  const keep = nodes.map((p) => p.z >= zCut - 1e-6);
  const map = new Map<number, number>();
  const kept: THREE.Vector3[] = [];
  nodes.forEach((p, i) => {
    if (keep[i]) {
      map.set(i, kept.length);
      kept.push(p);
    }
  });
  const raw = pairs.filter(([a, b]) => keep[a] && keep[b]).map(([a, b]) => ({ a: map.get(a)!, b: map.get(b)!, len: nodes[a].distanceTo(nodes[b]) }));
  // Strut classes by length.
  const lens: number[] = [];
  for (const e of raw) if (!lens.some((l) => Math.abs(l - e.len) < 1e-4)) lens.push(e.len);
  lens.sort((x, y) => x - y);
  const letter = (len: number) => String.fromCharCode(65 + lens.findIndex((l) => Math.abs(l - len) < 1e-4));
  const lengths: Record<string, number> = {};
  lens.forEach((l, i) => (lengths[String.fromCharCode(65 + i)] = l));
  return {
    nodes: kept,
    edges: raw.map((e) => ({ a: e.a, b: e.b, cls: letter(e.len) })),
    lengths,
    zCut,
    baseSpread: band[band.length - 1] - band[0],
  };
}

export interface HubSocket {
  /** Around the hub, degrees from the first socket. */
  az: number;
  /** Below the hub's face, degrees. */
  tilt: number;
  cls: string;
}

/** Sockets of every node, in the node's frame (z out of the sphere, x towards the first socket), and the frame. */
export function hubsOf(d: Dome): { sockets: HubSocket[]; frame: THREE.Quaternion; key: string }[] {
  return d.nodes.map((p, i) => {
    const n = p.clone().normalize();
    const out = d.edges.filter((e) => e.a === i || e.b === i).map((e) => ({ dir: d.nodes[e.a === i ? e.b : e.a].clone().sub(p).normalize(), cls: e.cls }));
    const tangent = (v: THREE.Vector3) => v.clone().addScaledVector(n, -v.dot(n)).normalize();
    const ref = tangent(out[0].dir);
    const side = n.clone().cross(ref);
    const list = out
      .map((o) => {
        const t = tangent(o.dir);
        let az = (Math.atan2(t.dot(side), t.dot(ref)) * 180) / Math.PI;
        if (az < 0) az += 360;
        return { az, tilt: (Math.asin(-o.dir.dot(n)) * 180) / Math.PI, cls: o.cls };
      })
      .sort((a, b) => a.az - b.az);
    // Canonical start: the rotation whose (class, gap) sequence sorts first, so equal hubs get one key.
    const seq = (s: number) => list.map((_, k) => list[(s + k) % list.length]);
    const sig = (arr: typeof list) => arr.map((o, k) => `${o.cls}${Math.round(o.tilt * 2) / 2}/${Math.round((((arr[(k + 1) % arr.length].az - o.az + 360) % 360) || 360) * 2) / 2}`).join(' ');
    let best = 0;
    for (let s = 1; s < list.length; s++) if (sig(seq(s)) < sig(seq(best))) best = s;
    const ordered = seq(best);
    const a0 = ordered[0].az;
    const sockets = ordered.map((o) => ({ az: Math.round(((o.az - a0 + 360) % 360) * 10) / 10, tilt: Math.round(o.tilt * 10) / 10, cls: o.cls }));
    // Frame: x along the first socket's direction in the face, z out of the sphere.
    const x = ref.clone().applyAxisAngle(n, (a0 * Math.PI) / 180);
    const y = n.clone().cross(x);
    const frame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
    return { sockets, frame, key: sig(ordered) };
  });
}

export const socketsToString = (s: HubSocket[]) => s.map((o) => `${o.cls}:${o.az}:${o.tilt}`).join(';');
export const socketsOf = (p: Params): HubSocket[] =>
  String(p.sockets ?? '')
    .split(';')
    .filter(Boolean)
    .map((s) => {
      const [cls, az, tilt] = s.split(':');
      return { cls, az: Number(az), tilt: Number(tilt) };
    });

/** Size of a hub from its strut diameter: the core (where sockets end) and the puck's radius. */
export function hubSize(p: Params) {
  const d = num(p, 'd') + num(p, 'luz'), depth = num(p, 'depth'), wall = num(p, 'wall');
  const own = Math.max(d * 0.75, d / 2 / Math.sin(Math.PI / Math.max(3, socketsOf(p).length)) + wall / 2);
  // A dome passes one core for all its hubs, so struts of one class are all the same length.
  const core = Math.max(own, Number(p.core) || 0);
  return { d, depth, wall, core, R: core + depth };
}

/** Teardrop hole (point up, so it prints without support) along +Z from z0 to z1. */
function teardrop(d: number, z0: number, z1: number): Manifold {
  const C = M().CrossSection;
  const r = d / 2;
  // The point is cut flat a little above the circle: a 0,5·r bridge instead of a sharp tip through the wall.
  const tip = C.square([r * Math.SQRT2, r * Math.SQRT2], true).rotate(45).intersect(C.square([2 * r, 1.15 * r]).translate([-r, 0]));
  return C.circle(r, 32).add(tip).extrude(z1 - z0).translate([0, 0, z0]);
}

/**
 * A star of arms around a core, flat on top (the outside of the dome). Printed top face down: every arm's
 * underside follows its socket, so nothing overhangs, and the sockets' teardrop points face up.
 */
function buildHub(p: Params): Manifold {
  const api = M();
  const s = socketsOf(p);
  const { d, wall, core, R } = hubSize(p);
  const half = d / 2 + wall;
  const top = half;
  // A small round middle; the arms themselves meet there.
  const solids: Manifold[] = [api.Manifold.cylinder(top + half, half * 1.2, half * 1.2, 48).translate([0, 0, -half])];
  const cuts: Manifold[] = [];
  const toMat = (m: THREE.Matrix4) => m.elements as unknown as Parameters<Manifold['transform']>[0];
  for (const o of s) {
    const az = (o.az * Math.PI) / 180, tilt = (o.tilt * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(tilt), Math.sin(az) * Math.cos(tilt), -Math.sin(tilt));
    // Local frame: z along the socket, y as close to straight down as it can be (the teardrop's point, up in print), x level.
    const down = new THREE.Vector3(0, 0, -1).addScaledVector(dir, dir.z).normalize();
    const x = down.clone().cross(dir);
    const frame = new THREE.Matrix4().makeBasis(x, down, dir);
    // The arm: from the core to the end, as wide as the socket and its walls, from `half` below the socket upwards.
    // Square towards the flat face (it prints on it), round on the far side: less plastic in the corners.
    const arm = api.Manifold.cube([2 * half, 2 * R, R + 1], false)
      .translate([-half, -2 * R, 0])
      .add(api.Manifold.cylinder(R + 1, half + 0.15 * (d / 2), half + 0.15 * (d / 2), 40))
      .transform(toMat(frame));
    solids.push(arm);
    cuts.push(teardrop(d, core, R + 5).transform(toMat(frame)));
    // Between the flat face and the socket the slope leaves a solid wedge: hollow it with a tent open on the flat
    // face, sides at 45°. Printed face down, the tent's roof needs no support.
    {
      const tanT = Math.tan(tilt);
      const ux = Math.cos(az), uy = Math.sin(az), vx = -uy, vy = ux;
      const tri = (rho: number) => {
        const hgt = Math.min(rho * tanT - 0.3, d / 2);
        return hgt > 0.6 ? [[rho * ux - hgt * vx, rho * uy - hgt * vy, top + 0.01], [rho * ux + hgt * vx, rho * uy + hgt * vy, top + 0.01], [rho * ux, rho * uy, top - hgt]] : null;
      };
      // Clear of the core, of the pilot hole and of the arm's end.
      const pilot = R - Math.min(8, (R - core) / 2);
      const from = core + 1.2 * Math.min(6, d * 0.6) + 1;
      const a0 = tri(from), a1 = tri(pilot - 3);
      if (a1 && pilot - 3 > from + 3) cuts.push(api.Manifold.hull([...(a0 ?? [[from * ux, from * uy, top + 0.01]]), ...a1] as [number, number, number][]));
    }
    // A pilot hole from the top for a 3 mm screw that holds the strut.
    const at = dir.clone().multiplyScalar(R - Math.min(8, (R - core) / 2));
    cuts.push(api.Manifold.cylinder(top - at.z + 1, 1.25, 1.25, 16).translate([at.x, at.y, at.z]));
    // The strut's letter on the top face, over its socket.
    const size = Math.min(6, d * 0.6);
    const l = size >= 3 ? textOutline(o.cls, 'sans-bold', size, 0) : null;
    if (l) {
      const rr = core + size * 0.6;
      cuts.push(l.rotate(o.az - 90).translate([Math.cos(az) * rr, Math.sin(az) * rr]).extrude(0.8).translate([0, 0, top - 0.6]));
    }
  }
  let m = api.Manifold.union(solids);
  // Everything above the flat top goes.
  const b = m.boundingBox();
  m = m.intersect(api.Manifold.cube([b.max[0] - b.min[0] + 2, b.max[1] - b.min[1] + 2, top - b.min[2] + 1]).translate([b.min[0] - 1, b.min[1] - 1, b.min[2] - 1]));
  const label = String(p.label ?? '');
  if (label) {
    const t = textOutline(label, 'sans-bold', Math.min(5, core * 0.55), 0);
    if (t) cuts.push(t.extrude(0.8).translate([0, 0, top - 0.6]));
  }
  return m.subtract(api.Manifold.union(cuts));
}

export const DOME_DEFS: PartDef[] = [
  {
    type: 'domeHub',
    label: 'Węzeł kopuły',
    category: 'joints',
    hole: false,
    hidden: true,
    description: 'Węzeł kopuły geodezyjnej: krążek z gniazdami na pręty pod właściwymi kątami. Robi go kreator „Kopuła geodezyjna”.',
    params: [
      { key: 'd', label: 'Średnica pręta', type: 'number', def: 10, min: 4, max: 32, step: 0.5, unit: 'mm' },
      { key: 'luz', label: 'Luz gniazda', type: 'number', def: 0.4, min: 0, max: 2, step: 0.05, unit: 'mm' },
      { key: 'depth', label: 'Głębokość gniazda', type: 'number', def: 25, min: 10, max: 80, step: 1, unit: 'mm' },
      { key: 'wall', label: 'Ścianka', type: 'number', def: 2.4, min: 1.2, max: 8, step: 0.2, unit: 'mm' },
      { key: 'sockets', label: 'Gniazda (klasa:kąt:pochylenie)', type: 'text', def: 'A:0:10;A:72:10;A:144:10;A:216:10;A:288:10' },
      { key: 'label', label: 'Napis', type: 'text', def: '' },
      { key: 'core', label: 'Środek (do dna gniazd)', type: 'number', def: 0, min: 0, max: 60, step: 0.5, unit: 'mm', hint: '0 = najmniejszy możliwy.' },
    ],
    build: buildHub,
  },
];

/** The core every hub of a dome uses: the largest one its busiest hub needs. */
export const domeCore = (d: number, wall: number, maxSockets: number) => Math.max(d * 0.75, d / 2 / Math.sin(Math.PI / Math.max(3, maxSockets)) + wall / 2);
