// Zgodność modułu pudełka z tools/pudelko/pudelko.py (v11): bbox i objętość korpusu i pokrywy przy parametrach „legacy”.
// Uruchom: sh scripts/check/pudelko.sh
import { readFileSync } from 'node:fs';
import { initManifold } from '../../src/geom/manifold';
import { korpus, lidInBox, layout, bowlCutter } from '../../src/parts/pudelko';
import { DEFS } from '../../src/catalog';

const ref = JSON.parse(readFileSync(new URL('../../tools/pudelko/ref.json', import.meta.url), 'utf8'));
const def: any = (DEFS as any).pudelko;
const base: any = {}; for (const d of def.params) base[d.key] = d.def;
const legacy = { ...base, lidT: 2.8, trayDepth: 0, garby: true, textMode: 'engrave' };

const info = (m: any) => { const b = m.boundingBox(); return { min: b.min.map((v: number) => +v.toFixed(3)), max: b.max.map((v: number) => +v.toFixed(3)), vol: +m.volume().toFixed(1), st: m.status() }; };
let bad = 0;
const cmp = (name: string, got: any, want: { bounds: number[][]; vol: number }, dz = 0, tolVol = 0.005, tolBox = 0.15) => {
  const dv = (got.vol - want.vol) / want.vol;
  const db = Math.max(...[0, 1, 2].flatMap((i) => [Math.abs(got.min[i] - dz * (i === 2 ? 1 : 0) - want.bounds[0][i]), Math.abs(got.max[i] - dz * (i === 2 ? 1 : 0) - want.bounds[1][i])]));
  const ok = Math.abs(dv) <= tolVol && db <= tolBox && got.st === 'NoError';
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'BŁĄD'} ${name}: obj ${got.vol} vs ${want.vol} (${(dv * 100).toFixed(2)}%), maks. różnica bbox ${db.toFixed(3)} mm, ${got.st}`);
};
(async () => {
  await initManifold();
  const L = layout(legacy);
  console.log(`legacy: X=${L.X} Y=${L.Y} H=${L.H}`);
  cmp('korpus', info(korpus(legacy)), ref.korpus);
  const lid = lidInBox(legacy).lid;
  cmp('pokrywa', info(lid), ref.pokrywa, L.Z_LID0);

  // Domyślne (nowa pokrywa-tacka)
  const Ld = layout(base);
  console.log(`domyślne: X=${Ld.X} Y=${Ld.Y} H=${Ld.H} Z_CH0=${Ld.Z_CH0.toFixed(2)} (v11: ${L.Z_CH0.toFixed(2)})`);
  if (Math.abs(Ld.Z_CH0 - L.Z_CH0) > 1e-6 || Math.abs(Ld.H - L.H - 1) > 1e-6) { bad++; console.log('BŁĄD: Z_CH0/H'); }
  const k = korpus(base), pr = lidInBox(base);
  console.log('korpus', JSON.stringify(info(k)));
  console.log('pokrywa', JSON.stringify(info(pr.lid)), 'napis', pr.text ? JSON.stringify(info(pr.text)) : null);
  // kolizje i luz
  const col = k.intersect(pr.lid).volume();
  console.log(`kolizja korpus/pokrywa: ${col.toFixed(3)} mm3`); if (col > 0.5) bad++;
  const col2 = pr.lid.intersect(pr.text!).volume();
  console.log(`napis nachodzi na pokrywę: ${col2.toFixed(3)} mm3 (ma być ~0)`); if (col2 > 0.5) bad++;
  const full = pr.lid.add(pr.text!);
  const noBowl = lidInBox({ ...base, trayDepth: 0 });
  console.log(`objętość wybrana tacką: ${(noBowl.lid.volume() - pr.lid.volume()).toFixed(0)} mm3`);
  // wszystkie części przez PartDef
  for (const piece of ['korpus', 'pokrywa', 'napis']) { const m = def.build({ ...base, piece }); const i = info(m); console.log(piece, JSON.stringify(i)); if (i.st !== 'NoError' || i.vol <= 0) bad++; }
  // profil tacki: max nachylenie
  const c = bowlCutter(0, 100, 0, 50, 0, 2, 18);
  console.log('bowlCutter', JSON.stringify(info(c)));
  console.log(bad ? `\n${bad} błędów` : '\nwszystko OK'); process.exit(bad ? 1 : 0);
})();
