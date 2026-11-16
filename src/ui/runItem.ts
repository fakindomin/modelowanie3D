import { useStore } from '../store';
import { FAMILIES } from '../families';
import { GEAR_PAIR } from '../simple';
import type { ProjectItem } from '../projects';

/** Opens one entry of „Projekty” the way the library does: a wizard, or a new project from a part or a variant. */
export function runProjectItem(i: ProjectItem) {
  const st = useStore.getState();
  if (i.kind === 'wizard') return st.openWizard({ id: i.wizard });
  st.openWizard(null); // a wizard left open earlier must not cover the project
  if (i.kind === 'figurines') return st.setTab('fig');
  st.setTab('tech');
  st.startNew();
  if (i.kind === 'part') {
    const id = useStore.getState().add(i.type);
    if (GEAR_PAIR[i.type]) useStore.getState().matingGear(id, GEAR_PAIR[i.type]);
  } else {
    const f = FAMILIES.find((x) => x.id === i.family)!;
    useStore.getState().addVariant(f, f.variants.find((v) => v.label === i.variant)!, 'M');
  }
  setTimeout(() => useStore.getState().fit(), 80);
}
