import type { Category, Params } from './catalog';

export type Size = 'S' | 'M' | 'L';

/** One way to make a family member: a part type with preset parameters, sometimes with extra pieces. */
export interface Variant {
  label: string;
  type: string;
  params?: Params;
  /** Extra pieces added together: a lid, drawers in the cabinet, a hinged or sliding lid. */
  extra?: 'lid' | 'drawers' | 'hinged' | 'slide';
  /** Per-size parameters (overrides the family's). */
  sizes?: Record<Size, Params>;
  hint?: string;
}

export interface Family {
  id: string;
  label: string;
  /** Icon (part type). */
  icon: string;
  category: Category;
  variants: Variant[];
  sizes?: Record<Size, Params>;
}

const boxSizes: Record<Size, Params> = { S: { W: 60, D: 40, H: 30 }, M: { W: 80, D: 60, H: 40 }, L: { W: 120, D: 80, H: 60 } };

/** Scales a type's length parameters for S/M/L: half and double of the default. */
export const SCALE: Record<Size, number> = { S: 0.5, M: 1, L: 2 };
/** Parameters scaled with the size (lengths, not wall thicknesses or clearances). */
export const SCALED = ['W', 'D', 'H', 'L', 'A', 'B', 'D1', 'D2'];

export const FAMILIES: Family[] = [
  {
    id: 'box',
    label: 'Pudełka',
    icon: 'box',
    category: 'ready',
    sizes: boxSizes,
    variants: [
      { label: 'Prostokątne', type: 'box' },
      { label: 'Okrągłe', type: 'box', params: { shape: 'round' } },
      { label: 'Sześciokątne', type: 'box', params: { shape: 'hex' } },
      { label: 'Z przegródkami', type: 'box', params: { nx: 3, ny: 2 } },
      { label: 'Z pokrywką w komplecie', type: 'box', extra: 'lid' },
      { label: 'Z pokrywką na zawiasie', type: 'box', extra: 'hinged', hint: 'Pudełko, płaska pokrywka i zawias print-in-place na tylnej krawędzi.' },
      { label: 'Z wsuwaną pokrywką', type: 'box', params: { slide: true, T: 3 }, extra: 'slide' },
    ],
  },
  {
    id: 'lid',
    label: 'Pokrywki',
    icon: 'lid',
    category: 'ready',
    sizes: { S: { W: 60, D: 40 }, M: { W: 80, D: 60 }, L: { W: 120, D: 80 } },
    variants: [
      { label: 'Płaska', type: 'lid', params: { R: 0 } },
      { label: 'Z rantem (wciskana)', type: 'lid', params: { R: 4 } },
      { label: 'Okrągła z rantem', type: 'lid', params: { shape: 'round', R: 4 } },
    ],
  },
  {
    id: 'drawer',
    label: 'Szuflady',
    icon: 'drawer',
    category: 'ready',
    variants: [
      { label: 'Pojedyncza szuflada', type: 'drawer', sizes: { S: { W: 40, D: 60, H: 25 }, M: { W: 60, D: 80, H: 30 }, L: { W: 90, D: 120, H: 45 } } },
      { label: 'Obudowa z szufladami', type: 'cabinet', extra: 'drawers', sizes: { S: { w: 40, h: 25, D: 65, cols: 2, rows: 2 }, M: { w: 60, h: 30, D: 85, cols: 2, rows: 3 }, L: { w: 90, h: 45, D: 125, cols: 3, rows: 3 } } },
      { label: 'Sama obudowa', type: 'cabinet' },
    ],
  },
  {
    id: 'plates',
    label: 'Płyty',
    icon: 'slab',
    category: 'ready',
    sizes: { S: { W: 60, D: 40, T: 2 }, M: { W: 100, D: 60, T: 3 }, L: { W: 150, D: 100, T: 4 } },
    variants: [
      { label: 'Pełna płyta', type: 'slab' },
      { label: 'Z otworami montażowymi', type: 'plate' },
      { label: 'Perforowana', type: 'perfPlate' },
    ],
  },
  {
    id: 'square',
    label: 'Profile kanciaste',
    icon: 'angle',
    category: 'profile',
    variants: [
      { label: 'Płaskownik', type: 'flat' },
      { label: 'Kątownik', type: 'angle' },
      { label: 'Teownik', type: 'tee' },
      { label: 'Ceownik', type: 'channel' },
      { label: 'Profil zamknięty', type: 'rhs' },
    ],
  },
  {
    id: 'round',
    label: 'Okrągłe',
    icon: 'tube',
    category: 'profile',
    variants: [
      { label: 'Rura', type: 'tube' },
      { label: 'Pręt', type: 'rod' },
      { label: 'Walec', type: 'cylinder' },
      { label: 'Stożek', type: 'cone' },
    ],
  },
  {
    id: 'solids',
    label: 'Bryły',
    icon: 'cube',
    category: 'basic',
    variants: [
      { label: 'Prostopadłościan', type: 'cube' },
      { label: 'Klin', type: 'wedge' },
      { label: 'Kula', type: 'sphere' },
    ],
  },
];

/** Types that live inside a family (shown there, not as loose tiles). */
export const IN_FAMILY = new Set(FAMILIES.flatMap((f) => f.variants.map((v) => v.type)));
