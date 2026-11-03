import { FAMILIES } from './families';
import { DEFS } from './catalog';
import { WIZARDS } from './wizards';

/**
 * The „Projekty” tab: ready things grouped by where they are used. One thing may sit in several
 * places (tags); each opens a wizard, adds a part sized from what the user measures, or a family variant.
 */
export type UseCat = 'home' | 'kitchen' | 'bath' | 'garden' | 'workshop' | 'desk' | 'electronics' | 'kids';

export const USE_CATS: { id: UseCat; label: string; icon: string }[] = [
  { id: 'home', label: 'Dom', icon: 'wallHook' },
  { id: 'kitchen', label: 'Kuchnia', icon: 'spiceRack' },
  { id: 'bath', label: 'Łazienka', icon: 'soapDish' },
  { id: 'garden', label: 'Ogród i balkon', icon: 'plantLabel' },
  { id: 'workshop', label: 'Warsztat', icon: 'toolRail' },
  { id: 'desk', label: 'Biurko', icon: 'penCup' },
  { id: 'electronics', label: 'Elektronika', icon: 'gland' },
  { id: 'kids', label: 'Dzieci i zabawki', icon: 'spinningTop' },
];

export type ProjectItem = { label: string; desc: string; tags: UseCat[]; icon: string } & (
  | { kind: 'wizard'; wizard: string }
  | { kind: 'part'; type: string }
  | { kind: 'family'; family: string; variant: string }
  | { kind: 'figurines' }
);

const wiz = (id: string, tags: UseCat[], icon: string): ProjectItem => ({ kind: 'wizard', wizard: id, label: WIZARDS[id].label, desc: WIZARDS[id].desc, tags, icon });
const part = (type: string, tags: UseCat[]): ProjectItem => ({ kind: 'part', type, label: DEFS[type].label, desc: DEFS[type].description, tags, icon: type });
const fam = (family: string, variant: string, label: string, tags: UseCat[]): ProjectItem => {
  const f = FAMILIES.find((x) => x.id === family)!;
  const v = f.variants.find((x) => x.label === variant)!;
  return { kind: 'family', family, variant, label, desc: v.hint ?? DEFS[v.type].description, tags, icon: v.type };
};

export const PROJECT_ITEMS: ProjectItem[] = [
  // Wizards: whole projects step by step.
  wiz('frame', ['home', 'garden'], 'pipeEnd'),
  wiz('organizer', ['kitchen', 'desk', 'workshop'], 'box'),
  wiz('box', ['home', 'kitchen'], 'lid'),
  wiz('cabinet', ['home', 'workshop', 'desk'], 'cabinet'),
  wiz('case', ['electronics'], 'box'),
  wiz('panel', ['electronics'], 'plate'),
  wiz('junction', ['electronics', 'garden'], 'gland'),
  wiz('pot', ['garden', 'home'], 'cylinder'),
  wiz('stand', ['desk'], 'wedge'),
  // Everyday things sized from one measurement.
  part('wallHook', ['home', 'bath']),
  part('hookRail', ['home']),
  part('shelfHook', ['kitchen', 'home']),
  part('doorStop', ['home']),
  part('spiceRack', ['kitchen']),
  part('slotRack', ['kitchen']),
  part('bagClip', ['kitchen']),
  part('brushHolder', ['bath']),
  part('soapDish', ['bath']),
  part('plantLabel', ['garden']),
  part('plantClip', ['garden']),
  part('hoseHanger', ['garden']),
  part('toolRail', ['workshop']),
  part('bitHolder', ['workshop']),
  part('pegHook', ['workshop']),
  part('batteryTray', ['workshop', 'electronics']),
  part('cableClip', ['desk', 'electronics']),
  part('penCup', ['desk']),
  part('spinningTop', ['kids']),
  // Cables and desk.
  part('cableComb', ['electronics', 'desk', 'workshop']),
  part('cableLatch', ['desk', 'electronics', 'home']),
  part('deskEdgeClip', ['desk']),
  part('cableCorner', ['desk', 'home']),
  part('baseboardClip', ['home']),
  part('deskGrommet', ['desk']),
  part('zipTie', ['electronics', 'workshop', 'garden']),
  part('cableSleeve', ['desk', 'electronics']),
  // Furniture and DIY.
  part('furnitureKnob', ['home', 'kitchen']),
  part('furnitureHandle', ['home', 'kitchen']),
  part('thumbKnob', ['workshop']),
  part('furnitureFoot', ['home']),
  part('cornerGuard', ['home', 'workshop']),
  part('profileCap', ['workshop', 'home', 'garden']),
  part('standoff', ['electronics', 'workshop']),
  part('magnetCatch', ['home', 'kitchen']),
  part('wallBumper', ['home']),
  part('mountWedge', ['home', 'workshop']),
  part('ventGrille', ['home', 'bath', 'kitchen']),
  part('reducer', ['workshop']),
  part('linkBin', ['desk', 'workshop', 'kitchen']),
  part('linearSlide', ['workshop']),
  part('hoseTee', ['garden', 'workshop']),
  part('filmClip', ['garden']),
  // Bathroom and kids.
  part('showerHook', ['bath']),
  part('cornerShelf', ['bath']),
  part('cosmeticOrganizer', ['bath', 'desk']),
  part('drainStrainer', ['bath', 'kitchen']),
  part('bookmark', ['kids']),
  part('namePuzzle', ['kids']),
  part('whistle', ['kids', 'garden']),
  part('ticTacToe', ['kids']),
  part('die', ['kids']),
  // Workshop.
  part('drillGuide', ['workshop']),
  part('wrench', ['workshop']),
  part('toolStand', ['workshop', 'electronics']),
  part('funnel', ['kitchen', 'workshop', 'garden']),
  part('measureCup', ['kitchen', 'garden']),
  part('clampSquare', ['workshop']),
  // Ready elements that are useful on their own.
  fam('box', 'Okrągłe z zakręcaną pokrywką', 'Słoik z zakręcaną pokrywką', ['kitchen', 'workshop']),
  fam('box', 'Z pokrywką na zawiasie', 'Pudełko z pokrywką na zawiasie', ['home', 'desk']),
  fam('drawer', 'Obudowa z szufladami', 'Szafka z szufladami (szybka)', ['workshop', 'desk']),
  fam('springMech', 'Klamerka', 'Klamerka', ['home', 'kitchen']),
  fam('springMech', 'Zasuwka sprężynowa', 'Zasuwka sprężynowa', ['home']),
  fam('springMech', 'Clicker', 'Clicker (pstryczek)', ['kids']),
  fam('springMech', 'Mechanizm długopisowy', 'Mechanizm długopisowy', ['kids', 'desk']),
  part('pipeClip', ['workshop', 'garden']),
  part('hoseBarb', ['garden']),
  part('gland', ['electronics']),
  part('threadTest', ['workshop']),
  { kind: 'figurines', label: 'Figurki (żebrowana kolekcja)', desc: 'Zwierzaki i postacie do druku: osobna zakładka Figurki.', tags: ['kids'], icon: 'figurine' },
];

export const itemsIn = (c: UseCat) => PROJECT_ITEMS.filter((i) => i.tags.includes(c));
