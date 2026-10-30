import type { Manifold } from 'manifold-3d';
import { M } from '../geom/manifold';
import type { ParamDef, Params, PartDef } from './def';
import { block, clearance, cyl, num } from './util';

/** Ring lying along Y (pipe direction), centred on the origin. */
function ringY(r: number, R: number, w: number): Manifold {
  return cyl(w, R).subtract(cyl(w + 2, r).translate([0, 0, -1])).translate([0, 0, -w / 2]).rotate([90, 0, 0]);
}

/** Ears with a screw hole each, on the bed, from |x| = x0 outward. */
function ears(x0: number, ear: number, w: number, t: number, d: number): Manifold {
  let m = block(ear, w, t, x0 + ear / 2).add(block(ear, w, t, -x0 - ear / 2));
  if (d > 0) for (const s of [-1, 1]) m = m.subtract(cyl(t + 2, d / 2).translate([s * (x0 + ear / 2), 0, -1]));
  return m;
}

const PIPE: ParamDef = { key: 'Dp', label: 'Średnica rury', type: 'number', def: 20, min: 3, max: 400, step: 0.5, unit: 'mm', hint: 'Zmierz rurę suwmiarką.' };
const WIDTH: ParamDef = { key: 'w', label: 'Szerokość', type: 'number', def: 15, min: 3, max: 200, unit: 'mm' };
const WALL: ParamDef = { key: 't', label: 'Grubość', type: 'number', def: 3, min: 1, max: 20, step: 0.2, unit: 'mm' };
const SCREW: ParamDef = { key: 'd', label: 'Otwór na wkręt', type: 'number', def: 4.5, min: 0, max: 20, step: 0.1, unit: 'mm', hint: '0 = bez otworów.' };

const earSize = (p: Params) => Math.max(8, num(p, 'd') + 7);

export const PIPE_DEFS: PartDef[] = [
  {
    type: 'pipeSaddle',
    label: 'Siodełko na rurę',
    category: 'fittings',
    hole: false,
    description: 'Mocuje rurę leżącą na ścianie lub blacie: łuk nad rurą i dwa uszy na wkręty. Rura biegnie wzdłuż Y.',
    params: [PIPE, clearance(0.3, 'Dodawany do promienia: rura wchodzi bez siłowania.'), WIDTH, WALL, SCREW],
    build: (p) => {
      const Dp = num(p, 'Dp'), R = Dp / 2 + num(p, 'luz'), t = num(p, 't'), w = num(p, 'w'), zc = Dp / 2;
      // Upper half of the ring over the pipe, legs down to the surface, ears on it.
      const arch = ringY(R, R + t, w).intersect(block(2 * (R + t) + 2, w + 2, R + t + 1)).translate([0, 0, zc]);
      const legs = block(t, w, zc, R + t / 2).add(block(t, w, zc, -R - t / 2));
      return arch.add(legs).add(ears(R + t - 0.01, earSize(p), w, t, num(p, 'd')));
    },
  },
  {
    type: 'pipeClip',
    label: 'Klips na rurę',
    category: 'fittings',
    hole: false,
    description: 'Zatrzaskowy uchwyt: rurę wciskasz od góry. Podstawa z otworem na wkręt (wkręcasz przed włożeniem rury).',
    params: [
      PIPE,
      clearance(0.2, 'Dodawany do promienia: mniejszy luz trzyma mocniej.'),
      WIDTH,
      WALL,
      { key: 'open', label: 'Rozwarcie', type: 'number', def: 80, min: 40, max: 98, step: 1, unit: '%', hint: 'Szerokość wejścia jako część średnicy rury. Mniej = mocniej trzyma, trudniej wcisnąć.' },
      SCREW,
    ],
    build: (p) => {
      const Dp = num(p, 'Dp'), R = Dp / 2 + num(p, 'luz'), t = num(p, 't'), w = num(p, 'w'), d = num(p, 'd');
      const zc = t + R + t - 0.2;
      // Opening: the chord where the ring is as wide as `open`% of the pipe.
      const half = (Dp * num(p, 'open')) / 200;
      const zo = Math.sqrt(Math.max(0, R * R - half * half));
      let ring = ringY(R, R + t, w).translate([0, 0, zc]);
      ring = ring.subtract(block(2 * half, w + 2, R + t + 1, 0, 0, zc + zo));
      let base = block(2 * (R + t), w, t);
      if (d > 0) base = base.subtract(cyl(t + 2, d / 2).translate([0, 0, -1])).subtract(cyl(R, d).translate([0, 0, t]));
      // A web joins the ring to the base; the screw head goes in through the ring.
      const web = block(Math.min(2 * R, 2 * (R + t) * 0.6), w, zc - R).subtract(cyl(zc, d > 0 ? d : 0.01).translate([0, 0, -1]));
      const bore = cyl(w + 2, R).translate([0, 0, -(w + 2) / 2]).rotate([90, 0, 0]).translate([0, 0, zc]);
      return base.add(web).add(ring).subtract(bore);
    },
  },
  {
    type: 'pipeClamp',
    label: 'Obejma dwudzielna',
    category: 'fittings',
    hole: false,
    description: 'Dwie połówki obejmy z uszami na śruby, drukowane uszami na stole. Między uszami zostaje 1 mm szczeliny, więc śruby zaciskają rurę.',
    params: [PIPE, WIDTH, WALL, { ...SCREW, def: 4.5, label: 'Otwór na śrubę' }],
    build: (p) => {
      const Dp = num(p, 'Dp'), R = Dp / 2, t = num(p, 't'), w = num(p, 'w'), d = num(p, 'd');
      // Each half is a bit less than half a ring: its centre sits 0.5 mm below the face the halves
      // meet on, so the bolts close a 1 mm gap and squeeze the pipe.
      const half = () => {
        const arch = ringY(R, R + t, w).translate([0, 0, -0.5]).intersect(block(2 * (R + t) + 2, w + 2, R + t + 1));
        const legs = block(t, w, t, R + t / 2).add(block(t, w, t, -R - t / 2));
        return arch.add(legs).add(ears(R + t - 0.01, earSize(p), w, t, d));
      };
      const g = w / 2 + 4;
      return M().Manifold.union([half().translate([0, -g, 0]), half().translate([0, g, 0])]);
    },
  },
];
