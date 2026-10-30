import type { Params } from './def';
import type { WallSide } from './connectors';
import { connectorParams } from './connectors';

/** A port on the board edge: which edge, position along it from the board corner, height of its centre above the board top. */
interface Port {
  label: string;
  edge: 'x0' | 'x1' | 'y0';
  at: number;
  z: number;
  params: Params;
}

export interface Board {
  label: string;
  L: number;
  W: number;
  /** Board thickness. */
  t: number;
  holes: [number, number][];
  /** Mounting hole for a self-tapping screw (pilot diameter) and standoff diameter. */
  pilot: number;
  standoff: number;
  /** Tallest part above the board. */
  top: number;
  ports: Port[];
  /** microSD slot: edge x0, centre along the edge, below (-1) or above (+1) the board. */
  sd?: { at: number; side: -1 | 1 };
  hint: string;
}

const plug = (kind: string, extra: Params = {}): Params => ({ ...connectorParams(kind), mode: 'plug', ...extra });
const sock = (kind: string, extra: Params = {}): Params => ({ ...connectorParams(kind), mode: 'socket', ...extra });
const B85_HOLES: [number, number][] = [
  [3.5, 3.5],
  [61.5, 3.5],
  [3.5, 52.5],
  [61.5, 52.5],
];

/** Typical dimensions from the official mechanical drawings; ports within about ±0,5 mm. */
export const BOARDS: Record<string, Board> = {
  pi5: {
    label: 'Raspberry Pi 5',
    L: 85, W: 56, t: 1.6, holes: B85_HOLES, pilot: 2.2, standoff: 6, top: 16.5,
    ports: [
      { label: 'USB-C zasilanie', edge: 'y0', at: 11.2, z: 1.6, params: plug('usbc') },
      { label: 'micro HDMI 0', edge: 'y0', at: 25.8, z: 1.5, params: plug('microhdmi') },
      { label: 'micro HDMI 1', edge: 'y0', at: 39.2, z: 1.5, params: plug('microhdmi') },
      { label: 'Ethernet', edge: 'x1', at: 10.2, z: 6.8, params: sock('rj45') },
      { label: 'USB 2.0', edge: 'x1', at: 29.1, z: 8, params: sock('usba2') },
      { label: 'USB 3.0', edge: 'x1', at: 47, z: 8, params: sock('usba2') },
    ],
    sd: { at: 28, side: -1 },
    hint: 'Pi 5 grzeje się mocniej: zostaw miejsce na radiator lub dodaj otwory wentylacyjne w pokrywce.',
  },
  pi4: {
    label: 'Raspberry Pi 4B',
    L: 85, W: 56, t: 1.6, holes: B85_HOLES, pilot: 2.2, standoff: 6, top: 16.5,
    ports: [
      { label: 'USB-C zasilanie', edge: 'y0', at: 11.2, z: 1.6, params: plug('usbc') },
      { label: 'micro HDMI 0', edge: 'y0', at: 26, z: 1.5, params: plug('microhdmi') },
      { label: 'micro HDMI 1', edge: 'y0', at: 39.5, z: 1.5, params: plug('microhdmi') },
      { label: 'Audio', edge: 'y0', at: 53.5, z: 3, params: sock('jack35', { d: 7 }) },
      { label: 'USB 3.0', edge: 'x1', at: 9, z: 8, params: sock('usba2') },
      { label: 'USB 2.0', edge: 'x1', at: 27, z: 8, params: sock('usba2') },
      { label: 'Ethernet', edge: 'x1', at: 45.75, z: 6.8, params: sock('rj45') },
    ],
    sd: { at: 28, side: -1 },
    hint: 'Gniazda USB i Ethernet wchodzą w otwory w ściance, więc płytkę wkłada się lekko pod kątem.',
  },
  pi3: {
    label: 'Raspberry Pi 3B+',
    L: 85, W: 56, t: 1.6, holes: B85_HOLES, pilot: 2.2, standoff: 6, top: 16.5,
    ports: [
      { label: 'micro USB zasilanie', edge: 'y0', at: 10.6, z: 1.4, params: plug('microusb') },
      { label: 'HDMI', edge: 'y0', at: 32, z: 3, params: plug('hdmi') },
      { label: 'Audio', edge: 'y0', at: 53.5, z: 3, params: sock('jack35', { d: 7 }) },
      { label: 'Ethernet', edge: 'x1', at: 10.25, z: 6.8, params: sock('rj45') },
      { label: 'USB 1–2', edge: 'x1', at: 29, z: 8, params: sock('usba2') },
      { label: 'USB 3–4', edge: 'x1', at: 47, z: 8, params: sock('usba2') },
    ],
    sd: { at: 28, side: -1 },
    hint: 'Ten sam rozstaw otworów co Pi 4 i Pi 5, ale inne położenie gniazd.',
  },
  zero2: {
    label: 'Raspberry Pi Zero 2 W',
    L: 65, W: 30, t: 1.4, pilot: 2.2, standoff: 5, top: 4,
    holes: [
      [3.5, 3.5],
      [61.5, 3.5],
      [3.5, 26.5],
      [61.5, 26.5],
    ],
    ports: [
      { label: 'mini HDMI', edge: 'y0', at: 12.4, z: 1.6, params: plug('minihdmi') },
      { label: 'micro USB dane', edge: 'y0', at: 41.4, z: 1.3, params: plug('microusb') },
      { label: 'micro USB zasilanie', edge: 'y0', at: 54, z: 1.3, params: plug('microusb') },
    ],
    sd: { at: 16.9, side: 1 },
    hint: 'Bez wlutowanych pinów GPIO. Z pinami podnieś pudełko o ok. 9 mm.',
  },
  pico: {
    label: 'Raspberry Pi Pico',
    L: 51, W: 21, t: 1, pilot: 1.7, standoff: 4.5, top: 3.5,
    holes: [
      [2, 4.8],
      [49, 4.8],
      [2, 16.2],
      [49, 16.2],
    ],
    ports: [{ label: 'micro USB', edge: 'x0', at: 10.5, z: 1.4, params: plug('microusb') }],
    hint: 'Przycisk BOOTSEL jest przy złączu USB; jeśli go potrzebujesz, dodaj otwór okrągły w pokrywce.',
  },
  uno: {
    label: 'Arduino Uno R3',
    L: 68.6, W: 53.3, t: 1.6, pilot: 2.6, standoff: 6, top: 12,
    holes: [
      [14, 2.5],
      [15.3, 50.7],
      [66.1, 7.6],
      [66.1, 35.5],
    ],
    ports: [
      { label: 'USB-B', edge: 'x0', at: 38.1, z: 5.5, params: sock('usbb') },
      { label: 'Gniazdo zasilania DC', edge: 'x0', at: 7.6, z: 5.5, params: sock('dc55', { d: 11.5 }) },
    ],
    hint: 'Gniazda USB-B i DC wystają ok. 6 mm poza płytkę: wchodzą w otwory w lewej ściance. Otwory w płytce są na wkręty M3.',
  },
};

export const EDGE_SIDE: Record<Port['edge'], WallSide> = { x0: 'left', x1: 'right', y0: 'front' };
