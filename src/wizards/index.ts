import { FRAME_WIZARD } from './frame';
import type { Wizard, WizardEntry } from './types';

export const WIZARDS: Record<string, Wizard> = { [FRAME_WIZARD.id]: FRAME_WIZARD };

const soon = (id: string, label: string, desc: string): WizardEntry => ({ id, label, desc, ready: false });

/** The gallery: ready wizards first in each group, planned ones greyed out. */
export const WIZARD_GROUPS: { label: string; items: WizardEntry[] }[] = [
  {
    label: 'Ramy i konstrukcje',
    items: [
      { id: 'frame', label: FRAME_WIZARD.label, desc: FRAME_WIZARD.desc, ready: true },
      soon('profileFrame', 'Rama z profili', 'Kwadratowe profile, łączniki z czopem, panele.'),
      soon('rack', 'Regał modułowy', 'Półki, przegrody, rozbudowa w górę i w bok.'),
      soon('stand', 'Stojak', 'Na rośliny, monitor, telefon, narzędzia.'),
      soon('dome', 'Kopuła geodezyjna', 'Pręty i węzły, rozmiar i częstotliwość podziału.'),
    ],
  },
  {
    label: 'Pojemniki',
    items: [
      soon('organizer', 'Organizer do szuflady', 'Wymiary szuflady, siatka przegródek.'),
      soon('box', 'Pudełko z pokrywką', 'Zawias, magnesy, zatrzask albo gwint.'),
      soon('cabinet', 'Szafka z szufladami', 'Liczba szuflad, prowadnice, uchwyty.'),
      soon('stack', 'Pojemniki piętrowe', 'Stackowane moduły o jednej podstawie.'),
    ],
  },
  {
    label: 'Obudowy elektroniki',
    items: [
      soon('case', 'Obudowa płytki', 'Raspberry Pi, Arduino, ESP32, złącza i wentylacja.'),
      soon('panel', 'Panel sterowania', 'Przyciski, pokrętła, wyświetlacz.'),
      soon('junction', 'Puszka z dławikami', 'Szczelna puszka z wejściami kabli.'),
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
      soon('pot', 'Doniczka z podstawką', 'Rozmiar, odpływ, podstawka.'),
      soon('holders', 'Uchwyty ścienne', 'Na narzędzia, kable, rowery.'),
      soon('irrigation', 'Nawadnianie z rur', 'Rury, trójniki i kroplowniki.'),
    ],
  },
  {
    label: 'Części zamienne',
    items: [soon('spare', 'Część z pomiaru', 'Wymiary z suwmiarki krok po kroku.')],
  },
];
