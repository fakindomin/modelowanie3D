// Small schematic pictograms for the part library (cross-sections / silhouettes).
const PATHS: Record<string, string> = {
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
