import { FRAME_WIZARD } from './frame';
import { BOX_WIZARD, CABINET_WIZARD, ORGANIZER_WIZARD } from './containers';
import { CASE_WIZARD, JUNCTION_WIZARD, PANEL_WIZARD } from './electronics';
import { POT_WIZARD, STAND_WIZARD } from './home';
import { DOME_WIZARD } from './dome';
import { GEARBOX_WIZARD } from './gearbox';
import { STACK_WIZARD } from './stack';
import { HOLDERS_WIZARD } from './holders';
import { DOOR_WIZARD } from './door';
import { RACK_WIZARD } from './rack';
import { PROFILE_FRAME_WIZARD } from './profileFrame';
import { IRRIGATION_WIZARD } from './irrigation';
import type { Wizard, WizardEntry } from './types';

export const WIZARDS: Record<string, Wizard> = Object.fromEntries([FRAME_WIZARD, ORGANIZER_WIZARD, BOX_WIZARD, CABINET_WIZARD, CASE_WIZARD, PANEL_WIZARD, JUNCTION_WIZARD, POT_WIZARD, STAND_WIZARD, DOME_WIZARD, GEARBOX_WIZARD, STACK_WIZARD, HOLDERS_WIZARD, DOOR_WIZARD, RACK_WIZARD, PROFILE_FRAME_WIZARD, IRRIGATION_WIZARD].map((w) => [w.id, w]));
const ready = (w: Wizard): WizardEntry => ({ id: w.id, label: w.label, desc: w.desc, ready: true });

const soon = (id: string, label: string, desc: string): WizardEntry => ({ id, label, desc, ready: false });

/** The gallery: ready wizards first in each group, planned ones greyed out. */
export const WIZARD_GROUPS: { label: string; items: WizardEntry[] }[] = [
  {
    label: 'Ramy i konstrukcje',
    items: [
      ready(FRAME_WIZARD),
      ready(PROFILE_FRAME_WIZARD),
      ready(DOME_WIZARD),
      ready(RACK_WIZARD),
    ],
  },
  {
    label: 'Pojemniki',
    items: [
      ready(ORGANIZER_WIZARD),
      ready(BOX_WIZARD),
      ready(CABINET_WIZARD),
      ready(STACK_WIZARD),
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
      ready(GEARBOX_WIZARD),
      ready(DOOR_WIZARD),
      soon('slide', 'Prowadnica liniowa', 'Wózek na rurach albo profilu.'),
    ],
  },
  {
    label: 'Dom i ogród',
    items: [
      ready(POT_WIZARD),
      ready(STAND_WIZARD),
      ready(HOLDERS_WIZARD),
      ready(IRRIGATION_WIZARD),
    ],
  },
  {
    label: 'Części zamienne',
    items: [soon('spare', 'Część z pomiaru', 'Wymiary z suwmiarki krok po kroku.')],
  },
];
