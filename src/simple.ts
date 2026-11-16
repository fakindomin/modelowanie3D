import type { Part } from './types';

/**
 * The app adjusts ready-made models; it is not a CAD. These types are bare building blocks or features
 * (solids, holes, pegs, sockets…) that the user can no longer add by hand. They still exist inside
 * wizards and as options of ready-made models (magnets, labels, connector cut-outs).
 */
export const REMOVED_TYPES = new Set([
  'slab', 'tee', 'channel', 'rhs', 'rod', 'tube',
  'cube', 'cylinder', 'cone', 'wedge', 'sphere', 'text', 'textCut', 'sketch', 'sketchRev',
  'hole', 'holeBox', 'peg', 'pegSquare', 'magnet', 'insert', 'screw', 'nut',
  'threadHole', 'pilot', 'snapFit', 'dovetail', 'dovetailSlot', 'springPocket', 'oring', 'connector', 'mesh',
]);

/** Types an old project may hold only when a wizard or an option of a ready-made model put them there. */
const OPTION_TYPES = new Set(['magnet', 'text', 'textCut', 'connector', 'hole']);

/** Parts that make an old project unusable here: blocks the user placed by hand. */
export function bareParts(parts: Part[]): Part[] {
  return parts.filter((p) => REMOVED_TYPES.has(p.type) && !p.wiz && !OPTION_TYPES.has(p.type));
}

/** The „Części techniczne” tab: ready-made technical parts in seven groups. */
export const TECH_GROUPS: { id: string; label: string; fams: string[]; types: string[] }[] = [
  { id: 'cont', label: 'Pojemniki i mechanizmy', fams: ['box', 'pi', 'lid', 'drawer', 'plates', 'springMech'], types: [] },
  { id: 'rails', label: 'Listwy, rury i łączniki', fams: ['square', 'round'], types: ['pipeFitting', 'profileFitting', 'springClip'] },
  { id: 'screws', label: 'Śruby i nakrętki', fams: [], types: ['bolt', 'threadNut', 'threadTest'] },
  { id: 'hinges', label: 'Zawiasy', fams: [], types: ['hinge', 'hingePip'] },
  { id: 'gears', label: 'Zębatki', fams: [], types: ['gear', 'ringGear', 'rack', 'bevelGear', 'worm', 'wormWheel', 'planetary', 'gt2Pulley'] },
  { id: 'springs', label: 'Sprężyny', fams: [], types: ['springFlat', 'springCoil', 'springTorsion', 'springSpiral'] },
  { id: 'seals', label: 'Uszczelki i przepusty', fams: [], types: ['gasket', 'gland', 'cableSlot', 'cableClamp', 'hoseBarb', 'oringPart', 'pipeSaddle', 'pipeClip', 'pipeClamp'] },
];

/** Gears come in pairs: the part added with each one. */
export const GEAR_PAIR: Record<string, 'gear' | 'rack' | 'bevel' | 'worm' | 'wheel'> = {
  gear: 'gear',
  rack: 'gear',
  bevelGear: 'bevel',
  worm: 'wheel',
  wormWheel: 'worm',
};

/** Parts that go to print: bodies switched off with „drukuj” stay in the preview only. */
export function printable(parts: Part[]): Part[] {
  const off = new Set(parts.filter((p) => p.noPrint).map((p) => p.body));
  return off.size ? parts.filter((p) => !off.has(p.body)) : parts;
}

/** The part a printed body is known by (the box, not its magnet pockets or labels). */
export function mainOf(parts: Part[], body: number): Part | undefined {
  const members = parts.filter((p) => p.body === body);
  return members.find((p) => !p.hole && !REMOVED_TYPES.has(p.type)) ?? members.find((p) => !p.hole) ?? members[0];
}
