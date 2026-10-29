import type { Part } from '../types';

/** The right panel's operations, always listed in this order. */
export type Op = 'magnets' | 'bend' | 'shell' | 'infill' | 'xform' | 'split' | 'pattern' | 'edges' | 'texture';

/** Why an operation is greyed out for an element, and what to use instead. */
export interface OpOff {
  why: string;
  use?: string;
}

type Group = 'container' | 'plate' | 'profile' | 'tubeProfile' | 'basic' | 'sketch' | 'text' | 'thread' | 'gear' | 'rack' | 'joint' | 'fitting' | 'pipe' | 'figurine' | 'mesh';

const GROUPS: Record<string, Group> = {
  box: 'container', lid: 'container', drawer: 'container', cabinet: 'container',
  plate: 'plate', perfPlate: 'plate', slab: 'plate',
  flat: 'profile', angle: 'profile', channel: 'profile', tee: 'profile',
  tube: 'tubeProfile', rhs: 'tubeProfile', rod: 'tubeProfile',
  cube: 'basic', cylinder: 'basic', cone: 'basic', sphere: 'basic', wedge: 'basic',
  sketch: 'sketch', sketchRev: 'sketch',
  text: 'text',
  bolt: 'thread', threadNut: 'thread', nut: 'thread', screw: 'thread', insert: 'thread', threadTest: 'thread',
  gear: 'gear', ringGear: 'gear', bevelGear: 'gear', worm: 'gear', wormWheel: 'gear', planetary: 'gear', gt2Pulley: 'gear',
  rack: 'rack',
  hinge: 'joint', hingePip: 'joint', boxHinge: 'joint', snapFit: 'joint', dovetail: 'joint', peg: 'joint', pegSquare: 'joint',
  gland: 'fitting', hoseBarb: 'fitting', cableClamp: 'fitting', oring: 'fitting', gasket: 'fitting',
  pipeClamp: 'pipe', pipeClip: 'pipe', pipeSaddle: 'pipe',
  figurine: 'figurine',
  mesh: 'mesh',
};

const THREAD_USE = 'Rozmiar i kierunek gwintu (prawy / lewy) w Wymiarach.';
const GEAR_USE = 'Moduł, liczba zębów, kierunek skosu i wypełnienie w Wymiarach.';

/** Greyed-out operations per group (anything not listed is active). */
const OFF: Partial<Record<Group, Partial<Record<Op, OpOff>>>> = {
  container: {
    bend: { why: 'Pudełka się nie gnie, ścianki by się pofałdowały.', use: 'Zegnij płytę albo płaskownik.' },
    shell: { why: 'Pudełko jest już puste w środku.', use: 'Grubość ścianki i dna w Wymiarach.' },
  },
  plate: { shell: { why: 'Płyta jest cienka i pełna, nie ma czego wydrążyć.', use: 'Wypełnienie (ażur) robi kratownicę.' } },
  profile: { shell: { why: 'Profil jest cienkościenny, nie ma czego wydrążyć.', use: 'Wypełnienie (ażur) albo rura / profil zamknięty.' } },
  tubeProfile: { shell: { why: 'Rura i profil zamknięty są już puste.', use: 'Grubość ścianki w Wymiarach.' } },
  text: {
    shell: { why: 'Litery są za cienkie, żeby je wydrążyć.' },
    infill: { why: 'Litery są za wąskie na kratownicę.' },
    split: { why: 'Napis jest mały, mieści się na stole.' },
    edges: { why: 'Krawędzie liter są za drobne na zaokrąglenie.', use: 'Wysokość liter i czcionka w Wymiarach.' },
    texture: { why: 'Litery są za małe na fakturę.' },
  },
  thread: {
    magnets: { why: 'Śruba i nakrętka pracują gwintem, magnes osłabiłby je.' },
    bend: { why: 'Gięcie zniszczy gwint.', use: 'Zegnij płaskownik albo płytę, w której jest otwór z gwintem.' },
    shell: { why: 'Wydrążenie osłabi gwint.', use: 'Otwór w środku śruby (króciec) w Wymiarach.' },
    infill: { why: 'Kratownica przetnie gwint.' },
    xform: { why: 'Skala zmieni skok gwintu, a lustro jego kierunek. Gwint przestanie pasować do normy.', use: THREAD_USE },
    split: { why: 'Podział przetnie gwint.', use: 'Krótsza śruba albo osobne części.' },
  },
  gear: {
    magnets: { why: 'Zębatka się obraca, magnes wytrąci ją z równowagi.', use: 'Otwór na wałek i piasta w Wymiarach.' },
    bend: { why: 'Gięcie zniszczy zęby.' },
    shell: { why: 'Wydrążenie osłabi zęby i piastę.', use: GEAR_USE },
    infill: { why: 'Zębatka ma własne wypełnienie (szprychy, otwory, kratownica).', use: GEAR_USE },
    xform: { why: 'Skala zmieni moduł, a lustro kierunek skosu. Para przestanie się zazębiać.', use: GEAR_USE },
    split: { why: 'Podział przetnie zęby.' },
    edges: { why: 'Zaokrąglenie zmieni zarys zębów.' },
    texture: { why: 'Faktura na zębach zablokuje przekładnię.' },
  },
  rack: {
    magnets: { why: 'Listwa pracuje zębami, magnes przeszkodzi w zazębieniu.' },
    shell: { why: 'Wydrążenie osłabi zęby.' },
    infill: { why: 'Kratownica przetnie zęby.' },
    xform: { why: 'Skala zmieni moduł, para przestanie się zazębiać.', use: GEAR_USE },
    edges: { why: 'Zaokrąglenie zmieni zarys zębów.' },
    texture: { why: 'Faktura na zębach zablokuje przekładnię.' },
  },
  joint: {
    bend: { why: 'Gięcie rozstroi oczka i czopy.' },
    shell: { why: 'Za cienkie, żeby wydrążyć.' },
    infill: { why: 'Za małe na kratownicę.' },
    xform: { why: 'Skala zmieni luz, a od luzu zależy, czy zawias i zatrzask działa.', use: 'Wymiary i luz w Wymiarach.' },
    split: { why: 'Podział przetnie oczka lub haczyk.' },
    edges: { why: 'Zaokrąglenie zmieni pasowanie.' },
    texture: { why: 'Faktura zablokuje ruch.' },
  },
  fitting: {
    magnets: { why: 'Przepust uszczelnia i trzyma kabel, magnes nic nie da.' },
    bend: { why: 'Gięcie zniszczy gwint i uszczelkę.' },
    shell: { why: 'Przepust jest już pusty w środku.' },
    infill: { why: 'Kratownica przetnie uszczelnienie.' },
    xform: { why: 'Skala zmieni gwint i średnicę kabla.', use: 'Średnica kabla i gwint w Wymiarach.' },
    split: { why: 'Przepust jest mały, mieści się na stole.' },
    edges: { why: 'Zaokrąglenie zmieni pasowanie nakrętki.' },
    texture: { why: 'Nakrętka dociskowa ma już radełko.' },
  },
  pipe: {
    magnets: { why: 'Obejma trzyma się rury, magnes nic nie da.' },
    bend: { why: 'Obejma jest już wygięta na rurę.', use: 'Średnica rury w Wymiarach.' },
    shell: { why: 'Obejma jest cienka, nie ma czego wydrążyć.' },
    split: { why: 'Obejma jest mała, mieści się na stole.' },
  },
  figurine: {
    bend: { why: 'Figurka nie ma płaskich części do gięcia.' },
    infill: { why: 'Kratownica popsuje wygląd figurki.', use: 'Skorupa (wydrążenie) oszczędza filament.' },
    edges: { why: 'Figurka jest już zaokrąglona.' },
    texture: { why: 'Figurka ma własną powierzchnię.' },
  },
  mesh: {
    edges: { why: 'W wczytanym STL nie ma krawędzi do zaokrąglenia.' },
    texture: { why: 'Faktura nie działa na wczytanym STL.' },
  },
};

const HOLE_OFF: OpOff = { why: 'To otwór: operacja działa na pełną bryłę.', use: 'Zaznacz element pełny albo całą bryłę.' };

/** Null when the operation is active for the part, otherwise why it is greyed out. */
export function opOff(part: Part, op: Op): OpOff | null {
  if (part.hole) return op === 'pattern' ? null : HOLE_OFF;
  if (op === 'pattern' && part.rigid) return { why: 'To część zestawu: kopia samej części rozbiłaby zestaw.', use: 'Dodaj drugi zestaw z menu.' };
  const g = GROUPS[part.type];
  return (g && OFF[g]?.[op]) || null;
}

const SENSITIVE: Record<string, string> = {
  thread: 'gwint', gear: 'zębatkę', rack: 'listwę zębatą', joint: 'zawias lub zatrzask', fitting: 'przepust',
};
const SENSITIVE_HOLES: Record<string, string> = { threadHole: 'otwór z gwintem' };

/**
 * Elements a whole-body operation would spoil: threads, gears, hinges, glands (as solids or
 * threaded holes). The message names them; empty when nothing is at risk.
 */
export function bodyRisk(parts: Part[], body: number, op: 'bend' | 'xform' | 'split'): string {
  const hit = parts.filter((p) => p.body === body && (p.hole ? SENSITIVE_HOLES[p.type] : SENSITIVE[GROUPS[p.type]]));
  if (!hit.length) return '';
  const names = [...new Set(hit.map((p) => (p.hole ? SENSITIVE_HOLES[p.type] : SENSITIVE[GROUPS[p.type]])))].join(', ');
  const what =
    op === 'bend' ? 'Gięcie zniekształci te miejsca, jeśli wpadną w strefę gięcia: ustaw zgięcie z dala od nich.'
    : op === 'xform' ? 'Skala zmieni skok gwintu, moduł zębów i luzy, a lustro odwróci kierunek gwintu. Do zmiany rozmiaru użyj Wymiarów.'
    : 'Nie tnij przez nie: przesuń płaszczyznę podziału obok.';
  return `W tej bryle jest ${names}. ${what}`;
}
