import type { ParamDef } from '../catalog';

/**
 * Sorts a model's sizes into named groups for the panel, so a long list reads like the parts of the model
 * (a box, its inside, its drawers) instead of one column of numbers.
 *
 * A model can name its groups itself: `group` on a field starts a group that the next fields join, and
 * „Wnętrze › Młynek” puts it as a sub-group under „Wnętrze”. Otherwise the groups come from the field
 * names (teeth, thread, hole and hub, wall mounting, text…), and whatever is left stays in „Wymiary główne”.
 */
export interface FieldGroup {
  name: string;
  subs: { name: string | null; fields: ParamDef[] }[];
  count: number;
}

/** Fewer fields than this read fine as one list. */
const MIN_FIELDS = 7;
export const MAIN = 'Wymiary główne';

const RULES: [string, RegExp][] = [
  ['Napis', /napis|wiersz|krój pisma|liter|ramk/],
  ['Gwint', /gwint|^skok|dopasowanie|luz na boku zwoju/],
  ['Zęby', /moduł|zęb|^kierunek$|ślimak|zwoj|satelit|słońc|jarzm|wieńca/],
  ['Otwory', /otwory:|otwór od końca/],
  ['Otwór i piasta', /otwór w|piast|wypełnienie|szprych|wieniec pod|środnika/],
  ['Mocowanie do ściany', /mocowanie|wkręt/],
  ['Przegródki', /przegród|komór|pierścień w środku/],
  ['Haczyki i ramiona', /haczyk|wysięg|końcówka w górę|ramion|ramienia/],
  ['Kielich (koniec B)', /kielich/],
  ['Końcówki', /końcówki|zatrzask u|otworów od końca|otwór na wkręt|wysokość bolców/],
  ['Połączenie', /wsunięcia|łącznika|nasuwki|luz na|gładkie|wcisk|bolc|bagnet|o-ring|uszczelk|śrub/],
  ['Rura', /rur/],
  ['Profil', /profil/],
  ['Korpus', /korpus|brzuch|żeber|rowków/],
  ['Głowa', /głow|szyi/],
  ['Ścianki i wykończenie', /grubość ścianki|grubość dna|ścianka|zaokrąglenie|^luz$|rowki na wsuwaną|niższe o|^dno$|radełko/],
];

/** Figurine add-ons (ears, horns…) have plain names, so they go by key. */
const KEY_GROUP: Record<string, string> = { earX: 'Dodatki', earTilt: 'Dodatki', earT: 'Dodatki', detach: 'Dodatki', earL: 'Dodatki', earW: 'Dodatki', ringH: 'Dodatki' };

function ruleGroup(f: ParamDef): string {
  if (KEY_GROUP[f.key]) return KEY_GROUP[f.key];
  const l = f.label.toLowerCase();
  for (const [name, re] of RULES) if (re.test(l)) return name;
  return MAIN;
}

/** Groups for the fields (already filtered to the visible ones, in their order), or null for one plain list. */
export function groupFields(fields: ParamDef[]): FieldGroup[] | null {
  if (fields.length < MIN_FIELDS) return null;
  const named = fields.some((f) => f.group);
  const paths: string[] = [];
  let cur = MAIN;
  for (const f of fields) {
    if (named) {
      if (f.group) cur = f.group;
      paths.push(cur);
    } else {
      // „Średnica otworu” belongs to the hole named just before it (a gear's bore, a flat bar's end hole).
      const prev = paths[paths.length - 1];
      paths.push(/^średnica otworu/i.test(f.label) ? (prev ?? MAIN) : ruleGroup(f));
    }
  }
  const out: FieldGroup[] = [];
  fields.forEach((f, i) => {
    const [top, sub = null] = paths[i].split('›').map((s) => s.trim());
    let g = out.find((x) => x.name === top);
    if (!g) out.push((g = { name: top, subs: [], count: 0 }));
    let s = g.subs.find((x) => x.name === sub);
    if (!s) g.subs.push((s = { name: sub, fields: [] }));
    s.fields.push(f);
    g.count++;
  });
  if (out.length < 2) return null;
  // The main sizes first, the rest in the order the model lists them.
  out.sort((a, b) => (a.name === MAIN ? -1 : b.name === MAIN ? 1 : 0));
  return out;
}

/** „Młynek: średnica” inside „Młynek” reads as „Średnica”; other names stay as they are. */
export function shortLabel(label: string, group: string | null): string {
  const m = /^([^:]+):\s*(.+)$/.exec(label);
  if (!m || !group || m[1].includes('(')) return label;
  const stem = (s: string) => s.toLowerCase().slice(0, 7);
  if (stem(m[1]) !== stem(group)) return label;
  return m[2].charAt(0).toUpperCase() + m[2].slice(1);
}
