import type { Manifold } from 'manifold-3d';
import type { Part, Vec3 } from '../types';
import { M } from './manifold';
import * as THREE from 'three';
import { bendZone } from './bend';
import { buildBodies, failed, worldBox, worldManifold } from './parts';
import { surfaceAbove, surfaceBelow } from './snap';
import { findLid, ringOk } from './magnets';

/** A correction "Popraw wszystkie" may apply. */
export type Fix = { kind: 'move'; id: string; position: Vec3 } | { kind: 'mirror'; body: number; lid: string; resting: boolean };

export interface Issue {
  level: 'error' | 'warn' | 'info';
  text: string;
  /** What to select when the issue is clicked: a part id or "g:<body>". */
  select?: string;
  fix?: Fix;
}

export interface CheckResult {
  issues: Issue[];
  bodies: number;
  /** Heading for a focused check (e.g. magnets when a lid is added). */
  title?: string;
}

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

type Box = { min: [number, number, number]; max: [number, number, number] };

/** Maps a box found in a rotated slice back to the body's own coordinates. */
function unrotate(axis: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box {
  // axis 0 sliced after rotate([0,90,0]): (x,y,z) -> (z, y, -x); axis 1 after rotate([90,0,0]): (x,y,z) -> (x, -z, y).
  if (axis === 0) return { min: [-z1, y0, x0], max: [-z0, y1, x1] };
  if (axis === 1) return { min: [x0, z0, -y1], max: [x1, z1, -y0] };
  return { min: [x0, y0, z0], max: [x1, y1, z1] };
}

const touch = (a: Box, b: Box, e = 0.6) => [0, 1, 2].every((k) => a.min[k] - e <= b.max[k] && b.min[k] - e <= a.max[k]);

/**
 * Looks for walls thinner than `w`: slices the body along each axis and "opens" every slice
 * (shrink then grow by w/2), so material thinner than w disappears. A real thin wall shows up in
 * slices along two different axes; a slice grazing a curved surface only in one, so those are ignored.
 */
function thinWall(m: Manifold, w: number): Box | null {
  const rots: [number, number, number][] = [
    [0, 90, 0],
    [90, 0, 0],
    [0, 0, 0],
  ];
  const found: Box[][] = [[], [], []];
  for (const axis of [2, 0, 1]) {
    const r = m.rotate(rots[axis]);
    const b = r.boundingBox();
    const z0 = b.min[2] + 0.15, z1 = b.max[2] - 0.15;
    if (z1 <= z0) continue;
    const n = Math.min(32, Math.max(6, Math.ceil((z1 - z0) / 1.5)));
    const step = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      const z = z0 + step * (i + 0.5);
      const cs = r.slice(z);
      if (cs.isEmpty()) continue;
      const opened = cs.offset(-w / 2, 'Round').offset(w / 2, 'Round');
      for (const piece of cs.subtract(opened).decompose()) {
        // Thread tips and rounded corners lose a little; a real thin wall loses a sizeable strip.
        if (piece.area() < Math.max(1, w * w * 1.5)) continue;
        const pb = piece.bounds();
        found[axis].push(unrotate(axis, pb.min[0], pb.max[0], pb.min[1], pb.max[1], z - step / 2, z + step / 2));
      }
    }
  }
  for (let a = 0; a < 3; a++)
    for (const box of found[a])
      for (let c = a + 1; c < 3; c++) if (found[c].some((o) => touch(box, o))) return box;
  return null;
}

/** Features that only work while round and straight. */
const FRAGILE = ['magnet', 'threadHole', 'threadNut', 'bolt', 'insert'];

export function runCheck(parts: Part[], minWall: number): CheckResult {
  const issues: Issue[] = [];
  for (const p of parts)
    if (failed(p)) issues.push({ level: 'error', text: `„${p.name}” ma wymiary, z których nie da się zbudować bryły (pokazany jako mały sześcian).`, select: p.id });

  // Threads and magnet pockets in a bend come out warped.
  for (const body of new Set(parts.map((p) => p.body))) {
    const holder = parts.find((p) => p.body === body && !p.hole && p.bend?.on);
    if (!holder) continue;
    const b = holder.bend!;
    const flat = new THREE.Box3();
    parts.filter((p) => p.body === body && !p.hole).forEach((p) => flat.union(worldBox(p)));
    const ax = b.axis === 'x' ? 'x' : 'y';
    const [z0, z1] = bendZone(b, flat.min[ax], flat.max[ax], flat.max.z - flat.min.z);
    const hit = parts.filter((p) => p.body === body && FRAGILE.includes(p.type) && worldBox(p).max[ax] > z0 && worldBox(p).min[ax] < z1);
    if (hit.length)
      issues.push({ level: 'warn', text: `Bryła ${body} jest gięta, a ${hit.map((p) => `„${p.name}”`).join(', ')} ${hit.length === 1 ? 'leży' : 'leżą'} w miejscu gięcia: gwint albo gniazdo wyjdzie krzywe. Przesuń poza zgięcie albo dodaj po gięciu.`, select: hit[0].id });
  }

  const bodies = buildBodies(parts);
  try {
    // Bodies that intersect each other would fuse or fight in the slicer.
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        const ba = a.manifold.boundingBox(), bb = b.manifold.boundingBox();
        if ([0, 1, 2].some((k) => ba.min[k] >= bb.max[k] || bb.min[k] >= ba.max[k])) continue;
        const inter = a.manifold.intersect(b.manifold);
        const v = inter.volume();
        inter.delete();
        if (v > 0.5)
          issues.push({
            level: 'warn',
            text: `Bryła ${a.body} i bryła ${b.body} nachodzą na siebie (${fmt(v, 0)} mm³). Jeśli mają być jednym wydrukiem, połącz je w jedną bryłę; jeśli osobnymi, rozsuń je.`,
            select: `g:${a.body}`,
          });
      }

    const boxes = bodies.map((b) => b.manifold.boundingBox());
    for (const [i, b] of bodies.entries()) {
      const box = boxes[i];
      // Parts of an assembly (a lid on a box, figurine ears) float on purpose.
      const resting = boxes.some((o, j) => j !== i && o.min[2] < box.min[2] + 0.6 && o.max[2] > box.min[2] - 0.6);
      const figurine = parts.some((p) => p.body === b.body && p.type === 'figurine');
      if (box.min[2] > 0.05 && !resting && !figurine)
        issues.push({ level: 'info', text: `Bryła ${b.body} wisi ${fmt(box.min[2])} mm nad stołem. Slicer położy ją na stole sam, ale sprawdź, czy tak ma być.`, select: `g:${b.body}` });
      if (box.min[2] < -0.05) issues.push({ level: 'warn', text: `Bryła ${b.body} wchodzi ${fmt(-box.min[2])} mm pod stół.`, select: `g:${b.body}` });
      const size = [0, 1, 2].map((k) => box.max[k] - box.min[k]);
      if (size[0] > 220 || size[1] > 220 || size[2] > 250)
        issues.push({ level: 'info', text: `Bryła ${b.body} ma ${size.map((s) => fmt(s, 0)).join(' × ')} mm i może nie zmieścić się na stole drukarki.`, select: `g:${b.body}` });
      const thin = thinWall(b.manifold, minWall);
      if (thin)
        issues.push({
          level: 'warn',
          text: `Bryła ${b.body} ma ściankę cieńszą niż ${fmt(minWall)} mm (około X ${fmt((thin.min[0] + thin.max[0]) / 2, 0)}, Y ${fmt((thin.min[1] + thin.max[1]) / 2, 0)}, Z ${fmt((thin.min[2] + thin.max[2]) / 2, 0)}). Drukarka może jej nie wydrukować albo będzie bardzo słaba.`,
          select: `g:${b.body}`,
        });
    }

    // Holes that cut nothing were probably moved off their part.
    for (const h of parts.filter((p) => p.hole)) {
      const hb = worldBox(h);
      const solids = parts.filter((p) => !p.hole && p.body === h.body && !worldBox(p).intersect(hb.clone()).isEmpty());
      let cuts = false;
      if (solids.length) {
        const hm = worldManifold(h);
        for (const s of solids) {
          const sm = worldManifold(s);
          const inter = sm.intersect(hm);
          cuts = inter.volume() > 0.01;
          inter.delete();
          sm.delete();
          if (cuts) break;
        }
        hm.delete();
      }
      if (!cuts) issues.push({ level: 'warn', text: h.clip ? `„${h.name}” nie obejmuje swojej bryły, więc nic z niej nie zostanie. Nałóż go na bryłę albo zmień „Rodzaj”.` : `„${h.name}” nic nie wycina. Przesuń go w bryłę albo usuń.`, select: h.id });
    }
    issues.push(...magnetIssues(parts));
  } finally {
    bodies.forEach((b) => {
      b.geometry.dispose();
      b.manifold.delete();
    });
  }
  return { issues, bodies: bodies.length };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Magnet pockets placed by hand: flush with the surface (or sealed 0,4–1,2 mm under it), fully in
 * material with a wall around, laid out symmetrically, and matched by pockets in the lid.
 */
export function magnetIssues(parts: Part[]): Issue[] {
  const issues: Issue[] = [];
  const bodies = [...new Set(parts.filter((p) => p.type === 'magnet' && p.hole).map((p) => p.body))];
  for (const body of bodies) {
    const solids = parts.filter((p) => p.body === body && !p.hole);
    if (!solids.length) continue;
    const pockets = parts.filter((p) => p.body === body && p.type === 'magnet' && p.hole);
    const ms = solids.map(worldManifold);
    const union = M().Manifold.union(ms);
    ms.forEach((m) => m.delete());
    const box = worldBox(solids[0]).clone();
    solids.forEach((p) => box.union(worldBox(p)));
    try {
      for (const p of pockets) {
        const hb = worldBox(p);
        const x = (hb.min.x + hb.max.x) / 2, y = (hb.min.y + hb.max.y) / 2, r = (hb.max.x - hb.min.x) / 2;
        let surf = -Infinity, under = Infinity;
        for (const s of solids) {
          surf = Math.max(surf, surfaceBelow(s, x, y) ?? -Infinity);
          under = Math.min(under, surfaceAbove(s, x, y) ?? Infinity);
        }
        if (!Number.isFinite(surf)) {
          issues.push({ level: 'warn', text: `„${p.name}” nie leży nad żadną częścią bryły ${body}.`, select: p.id });
          continue;
        }
        // A pocket opens at the face it is closest to: the top (box rim) or the underside (lid lying on the box).
        const gapTop = surf - hb.max.z, gapBot = hb.min.z - under;
        const fromBelow = Number.isFinite(under) && Math.abs(gapBot) < Math.abs(gapTop);
        const gap = fromBelow ? gapBot : gapTop;
        const shift = fromBelow ? -gap : gap;
        const where = fromBelow ? 'pod spodem' : 'ponad powierzchnię';
        const flush: Vec3 = [p.position[0], p.position[1], r2(p.position[2] + shift)];
        if (gap < -0.05) {
          issues.push({ level: 'warn', text: `„${p.name}” wystaje ${fmt(-gap)} mm ${where}: magnes nie będzie równo z krawędzią.`, select: p.id, fix: { kind: 'move', id: p.id, position: flush } });
          continue;
        }
        if ((gap > 0.05 && gap < 0.4) || gap > 1.25) {
          issues.push({
            level: 'warn',
            text: `„${p.name}” jest ${fmt(gap)} mm ${fromBelow ? 'nad spodem' : 'pod powierzchnią'}: za głęboko na odkryte gniazdo${gap < 0.4 ? ', a za cienko na ukryte (min. 0,4 mm)' : ', a za grubo na ukryte (maks. 1,2 mm)'}. Poprawka zrówna je z powierzchnią.`,
            select: p.id,
            fix: { kind: 'move', id: p.id, position: flush },
          });
          continue;
        }
        const pm = worldManifold(p);
        const inter = pm.intersect(union);
        const inside = inter.volume() / Math.max(pm.volume(), 1e-6);
        inter.delete();
        pm.delete();
        if (inside < 0.97) issues.push({ level: 'warn', text: `„${p.name}” wychodzi poza materiał (przebija ściankę albo dno). Przesuń je albo dodaj słupek.`, select: p.id });
        else if (!ringOk(union, x, y, r, (hb.min.z + hb.max.z) / 2))
          issues.push({ level: 'warn', text: `Ścianka wokół „${p.name}” jest cieńsza niż 1,2 mm. Magnes może ją rozsadzić; dodaj słupek albo przesuń gniazdo do środka.`, select: p.id });
      }
      if (pockets.length > 1) {
        const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2;
        const has = (x: number, y: number) => pockets.some((q) => Math.hypot(q.position[0] - x, q.position[1] - y) < 0.6);
        const odd = pockets.find((q) => !has(2 * cx - q.position[0], q.position[1]) && !has(q.position[0], 2 * cy - q.position[1]));
        if (odd) issues.push({ level: 'info', text: `Gniazda w bryle ${body} nie są rozstawione symetrycznie (np. „${odd.name}”). Pokrywka obrócona o 180° nie będzie pasować.`, select: odd.id });
      }
      const lid = findLid(parts, body, box);
      if (lid) {
        const inLid = parts.filter((q) => q.body === lid.part.body && q.type === 'magnet').length;
        if (!inLid)
          issues.push({ level: 'warn', text: `Pokrywka „${lid.part.name}” nie ma gniazd na magnesy. Poprawka doda ${pockets.length} ${pockets.length % 10 >= 2 && pockets.length % 10 <= 4 && (pockets.length % 100 < 12 || pockets.length % 100 > 14) ? 'lustrzane gniazda' : 'lustrzanych gniazd'}.`, select: lid.part.id, fix: { kind: 'mirror', body, lid: lid.part.id, resting: lid.resting } });
        else if (inLid !== pockets.length)
          issues.push({ level: 'warn', text: `Pudełko ma ${pockets.length} gniazd, a pokrywka „${lid.part.name}” ${inLid}.`, select: lid.part.id });
      }
    } finally {
      union.delete();
    }
  }
  return issues;
}

