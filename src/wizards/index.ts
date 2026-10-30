import { FRAME_WIZARD } from './frame';
import { BOX_WIZARD, CABINET_WIZARD, ORGANIZER_WIZARD } from './containers';
import { CASE_WIZARD, JUNCTION_WIZARD, PANEL_WIZARD } from './electronics';
import { POT_WIZARD, STAND_WIZARD } from './home';
import type { Wizard, WizardEntry } from './types';

export const WIZARDS: Record<string, Wizard> = Object.fromEntries([FRAME_WIZARD, ORGANIZER_WIZARD, BOX_WIZARD, CABINET_WIZARD, CASE_WIZARD, PANEL_WIZARD, JUNCTION_WIZARD, POT_WIZARD, STAND_WIZARD].map((w) => [w.id, w]));
const ready = (w: Wizard): WizardEntry => ({ id: w.id, label: w.label, desc: w.desc, ready: true });

const soon = (id: string, label: string, desc: string): WizardEntry => ({ id, label, desc, ready: false });

/** The gallery: ready wizards first in each group, planned ones greyed out. */
export const WIZARD_GROUPS: { label: string; items: WizardEntry[] }[] = [
  {
    label: 'Ramy i konstrukcje',
    items: [
      ready(FRAME_WIZARD),
      soon('profileFrame', 'Rama z profili', 'Kwadratowe profile, łączniki z czopem, panele.'),
      soon('rack', 'Regał modułowy', 'Półki, przegrody, rozbudowa w górę i w bok.'),
      soon('dome', 'Kopuła geodezyjna', 'Pręty i węzły, rozmiar i częstotliwość podziału.'),
    ],
  },
  {
    label: 'Pojemniki',
    items: [
      ready(ORGANIZER_WIZARD),
      ready(BOX_WIZARD),
      ready(CABINET_WIZARD),
      soon('stack', 'Pojemniki piętrowe', 'Stackowane moduły o jednej podstawie.'),
    ],
  },
  {
    label: 'Obudowy elektroniki',
    items: [
      ready(CASE_WIZARD),
      ready(PANEL_WIZARD),
      ready(JUNCTION_WIZARD),
    ],
  },
  {
    label: 'Mechanizmy',
    items: [
      soon('gearbox', 'Przekładnia', 'Przełożenie, osie, obudowa.'),
      soon('door', 'Drzwiczki z zawiasem', 'Zawias, zamknięcie na magnes.'),
      soon('slide', 'Prowadnica liniowa', 'Wózek na rurach albo profilu.'),
    ],
  },
  {
    label: 'Dom i ogród',
    items: [
      ready(POT_WIZARD),
      ready(STAND_WIZARD),
      soon('holders', 'Uchwyty ścienne', 'Na narzędzia, kable, rowery.'),
      soon('irrigation', 'Nawadnianie z rur', 'Rury, trójniki i kroplowniki.'),
    ],
  },
  {
    label: 'Części zamienne',
    items: [soon('spare', 'Część z pomiaru', 'Wymiary z suwmiarki krok po kroku.')],
  },
];
