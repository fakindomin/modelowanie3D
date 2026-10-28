// Small schematic pictograms for the part library (cross-sections / silhouettes).
const PATHS: Record<string, string> = {
  text: 'M5 7 H23 M14 7 V23 M10 23 H18',
  textCut: 'M4 5 H24 V23 H4 Z M8 9 H20 M14 9 V19',
  mesh: 'M14 4 L24 10 L24 20 L14 25 L4 20 L4 10 Z M4 10 L14 15 L24 10 M14 15 V25 M9 7.5 L19 12.5',
  box: 'M4 9 L4 24 L24 24 L24 9 M7 9 L7 21 L21 21 L21 9 M14 12 L14 21',
  lid: 'M3 10 H25 V14 H3 Z M7 14 V19 H21 V14',
  drawer: 'M4 7 H24 V23 H4 Z M10 12 Q14 17 18 12',
  cabinet: 'M4 4 H24 V24 H4 Z M6 6 H13 V13 H6 Z M15 6 H22 V13 H15 Z M6 15 H13 V22 H6 Z M15 15 H22 V22 H15 Z',
  plate: 'M3 11 H25 V17 H3 Z M7 14 h0.1 M21 14 h0.1',
  flat: 'M3 12 H25 V16 H3 Z',
  angle: 'M6 5 V23 H24 V19 H10 V5 Z',
  tee: 'M4 19 H24 V23 H4 Z M12 5 H16 V19 H12 Z',
  channel: 'M4 6 V23 H24 V6 H20 V19 H8 V6 Z',
  rhs: 'M5 5 H23 V23 H5 Z M9 9 H19 V19 H9 Z',
  tube: 'M14 4 A10 10 0 1 0 14.01 4 M14 8 A6 6 0 1 0 14.01 8',
  rod: 'M14 5 A9 9 0 1 0 14.01 5',
  cube: 'M5 10 L14 5 L23 10 L23 20 L14 25 L5 20 Z M5 10 L14 15 L23 10 M14 15 V25',
  cylinder: 'M5 8 A9 3.5 0 0 0 23 8 A9 3.5 0 0 0 5 8 V21 A9 3.5 0 0 0 23 21 V8',
  cone: 'M14 4 L4 22 A10 3.5 0 0 0 24 22 Z',
  wedge: 'M4 23 H24 L4 7 Z',
  sphere: 'M14 4 A10 10 0 1 0 14.01 4 M4 14 A10 3.5 0 0 0 24 14',
  hole: 'M14 6 A8 8 0 1 0 14.01 6',
  holeBox: 'M6 6 H22 V22 H6 Z',
  peg: 'M9 24 V9 L11 6 H17 L19 9 V24',
  pegSquare: 'M8 24 V6 H20 V24',
  magnet: 'M5 11 A9 3.5 0 0 0 23 11 A9 3.5 0 0 0 5 11 V17 A9 3.5 0 0 0 23 17 V11 M14 8 V11',
  insert: 'M9 6 H19 V23 H9 Z M9 10 L19 12 M9 14 L19 16 M9 18 L19 20',
  screw: 'M6 5 H22 V10 H17 V24 H11 V10 H6 Z',
  nut: 'M9 5 H19 L24 14 L19 23 H9 L4 14 Z M14 10 A4 4 0 1 0 14.01 10',
  perfPlate: 'M3 11 H25 V17 H3 Z M7 14 h0.1 M11 14 h0.1 M15 14 h0.1 M19 14 h0.1 M23 14 h0.1',
  slab: 'M3 12 L11 8 H25 L17 12 Z M3 12 V16 H17 V12 M17 16 L25 12 V8',
  threadHole: 'M14 5 A9 9 0 1 0 14.01 5 M8 10 L20 12 M7 14 L21 16 M8 18 L20 20',
  bolt: 'M7 4 H21 V9 H7 Z M10 9 V24 H18 V9 M10 12 L18 14 M10 16 L18 18 M10 20 L18 22',
  threadNut: 'M9 5 H19 L24 14 L19 23 H9 L4 14 Z M14 9 A5 5 0 1 0 14.01 9 M11 12 L17 14 M11 15 L17 17',
  pilot: 'M14 9 A5 5 0 1 0 14.01 9 M14 4 V24',
  hinge: 'M4 4 H11 V24 H4 Z M17 4 H24 V24 H17 Z M11 6 H17 V10 H11 Z M11 13 H17 V17 H11 Z M11 20 H17 V24 H11 Z',
  hingePip: 'M4 4 H11 V24 H4 Z M17 4 H24 V24 H17 Z M11 6 H17 V10 H11 Z M11 13 H17 V17 H11 Z M11 20 H17 V24 H11 Z M14 8 h0.1',
  snapFit: 'M8 24 V6 H12 V4 L16 8 L12 12 V24 Z',
  dovetail: 'M4 24 H24 V20 H18 L22 6 H6 L10 20 H4 Z',
  gland: 'M8 4 H20 V9 H8 Z M5 9 H23 V13 H5 Z M9 13 V24 H19 V13 M12 4 V24 M16 4 V24',
  cableSlot: 'M10 8 A6 6 0 1 0 10.01 8 M14 11 H22 A3 3 0 0 1 22 17 H14',
  cableClamp: 'M3 22 H25 V18 H20 A6 6 0 0 0 8 18 H3 Z M14 18 A3 3 0 1 0 14.01 18',
  hoseBarb: 'M10 24 V18 H6 V14 H22 V18 H18 V24 M11 14 L9 10 H19 L17 14 M11 10 L9 6 H19 L17 10 M12 6 V3 H16 V6',
  oring: 'M14 4 A10 10 0 1 0 14.01 4 M14 8 A6 6 0 1 0 14.01 8',
  connector: 'M3 5 H25 V23 H3 Z M8 11 H20 A3 3 0 0 1 20 17 H8 A3 3 0 0 1 8 11 Z',
  piCase: 'M3 9 V24 H25 V9 M6 18 H22 V21 H6 Z M8 15 V18 M20 15 V18 M25 12 H22 V16 H25',
  figurine: 'M14 3 C10 3 9 7 11 10 C6 11 6 18 8 22 H20 C22 18 22 11 17 10 C19 7 18 3 14 3 Z M11 14 V21 M14 13 V22 M17 14 V21',
};

export function Icon({ type, hole }: { type: string; hole: boolean }) {
  return (
    <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden>
      <path
        d={PATHS[type] ?? PATHS.cube}
        fill={hole ? 'none' : 'currentColor'}
        fillOpacity={hole ? 0 : 0.18}
        stroke="currentColor"
        strokeWidth="1.6"
        fillRule="evenodd"
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray={hole ? '2.5 2' : undefined}
      />
    </svg>
  );
}
