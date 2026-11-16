// Zgodność modułu pudełka z tools/pudelko/pudelko.py (v11): bbox i objętość korpusu i pokrywy przy parametrach „legacy”.
// Uruchom: sh scripts/check/pudelko.sh
import { readFileSync } from 'node:fs';
import { initManifold } from '../../src/geom/manifold';
import { korpus, lidInBox, layout, bowlCutter, pudelkoNotes } from '../../src/parts/pudelko';
import { DEFS } from '../../src/catalog';
import { poseScores } from '../../src/geom/orient';

const ref = JSON.parse(readFileSync(new URL('../../tools/pudelko/ref.json', import.meta.url), 'utf8'));
const def: any = (DEFS as any).pudelko;
const base: any = {}; for (const d of def.params) base[d.key] = d.def;
const legacy = { ...base, lidT: 2.8, trayDepth: 0, garby: true, textMode: 'engrave', rampSide: 'off' };

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

  // ---- punkt 2: parametry wnętrza ----
  const vol = (q: any) => korpus({ ...base, ...q }).volume();
  const Lx = (q: any) => layout({ ...base, ...q });
  const expect = (name: string, ok: boolean, info = '') => { if (!ok) bad++; console.log(`${ok ? 'OK ' : 'BŁĄD'} ${name} ${info}`); };
  const d0 = Lx({});
  expect('młynek Ø 50 → Y +10', Math.abs(Lx({ gD: 50 }).Y - d0.Y - 10) < 1e-6, `(Y ${d0.Y} → ${Lx({ gD: 50 }).Y})`);
  expect('młynek Ø 50 → X +10 (strona młynka)', Math.abs(Lx({ gD: 50 }).X - d0.X - 10) < 1e-6);
  expect('młynek H 40 → H +7', Math.abs(Lx({ gH: 40 }).H - d0.H - 7) < 0.11, `(H ${d0.H} → ${Lx({ gH: 40 }).H})`);
  expect('bibułki grubość 20 → Y +7', Math.abs(Lx({ bookT: 20 }).Y - d0.Y - 7) < 1e-6);
  expect('zapalniczka L 90 → X +8', Math.abs(Lx({ lL: 90 }).X - d0.X - 8) < 1e-6);
  expect('Z_CH0 niezależne od grubości pokrywy', Math.abs(Lx({ lidT: 5 }).Z_CH0 - d0.Z_CH0) < 1e-6);
  // skos: usuwa ≈ ½·dł·głęb·szerokość i jest symetryczny lewy/prawy
  const v0 = vol({ rampSide: 'off' }), vR = vol({ rampSide: 'right' }), vL = vol({ rampSide: 'left' });
  const want = 0.5 * 25 * 2.0 * (26 + 0.8);
  expect('skos prawy usuwa ~½·25·2·26,8 mm³', Math.abs((v0 - vR) - want) < 0.03 * want, `(${(v0 - vR).toFixed(0)} vs ${want.toFixed(0)})`);
  expect('skos lewy = prawy (objętość)', Math.abs(vL - vR) < 1, `(${(v0 - vL).toFixed(0)} vs ${(v0 - vR).toFixed(0)})`);
  // kontrole
  const nd = pudelkoNotes(base);
  console.log(nd.map((n) => `[${n.level}] ${n.text}`).join('\n'));
  expect('domyślne bez błędów i ostrzeżeń', nd.every((n) => n.level === 'ok'));
  expect('skos 4,6° i podniesienie 4,6 mm', nd.some((n) => /4,6°/.test(n.text) && /4,6 mm/.test(n.text)));
  expect('za strome → ostrzeżenie', pudelkoNotes({ ...base, rampDepth: 5, rampLen: 20 }).some((n) => n.level !== 'ok' && /stromy/.test(n.text)));
  expect('za płytkie → ostrzeżenie o uniesieniu', pudelkoNotes({ ...base, rampDepth: 0.6 }).some((n) => n.level === 'warn'));
  expect('za cienko pod zapalniczką → błąd', pudelkoNotes({ ...base, lT: 30 }).some((n) => n.level === 'error'));
  expect('za płytkie pudełko → błąd (ubijak)', pudelkoNotes({ ...base, gD: 20, bookT: 5 }).some((n) => n.level === 'error'));
  expect('bardzo wysokie bibułki → błąd szuflady', pudelkoNotes({ ...base, bookH: 80 }).some((n) => n.level === 'error'));
  // wariacje: każda budowa poprawna, korpus nie koliduje z pokrywą, magnesy szuflad mieszczą się w kieszeni
  const variants: any[] = [{}, { gD: 25 }, { gD: 60 }, { gH: 20 }, { gH: 60 }, { bookL: 70 }, { bookL: 160 }, { bookT: 8 }, { bookH: 20 }, { bookH: 40 }, { lL: 60 }, { lL: 110 }, { lW: 20 }, { lT: 10 }, { lT: 22 },
    { rampSide: 'left' }, { rampSide: 'off' }, { rampLen: 40, rampDepth: 3 }, { lidT: 3 }, { lidT: 6, trayDepth: 3 }, { gD: 28, bookL: 70, lL: 60, bookT: 8, gH: 25 }, { gD: 70, gH: 60, bookL: 180, lL: 120, bookH: 45 }, { gD: 20, bookL: 60, lL: 50, bookT: 5, gH: 25, bookH: 20, lT: 8, lW: 15 }];
  for (const q of variants) {
    const pp = { ...base, ...q }; const t0 = Date.now();
    const k = korpus(pp), l = lidInBox(pp);
    const st = [k.status(), l.lid.status()].join(','), c = k.intersect(l.lid).volume();
    const notes = pudelkoNotes(pp).filter((n) => n.level === 'error').length;
    const ok = st === 'NoError,NoError' && c < 0.5 && k.volume() > 0 && l.lid.volume() > 0;
    expect(`wariant ${JSON.stringify(q)}`, ok, `[${st}] kolizja ${c.toFixed(2)} mm³, błędów kontroli: ${notes}, ${Date.now() - t0} ms`);
  }

  // ---- zakresy suwaków: losowe przeciąganie nigdy nie daje uwagi/błędu ----
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let st: any = { ...base }; let repairs = 0, steps = 0, narrowed = new Set<string>();
  const allOk = (q: any) => pudelkoNotes(q).every((n) => n.level === 'ok');
  expect('stan startowy dozwolony', allOk(st));
  for (let i = 0; i < 400; i++) {
    const fields = def.paramsFor(st).filter((d: any) => d.key !== 'garby' && (!d.show || d.show(st)));
    const d = fields[Math.floor(rnd() * fields.length)];
    let v: any;
    if (d.type === 'number') { const stp = d.step ?? 1; const k = Math.floor((d.max - d.min) / stp); v = Math.round((d.min + Math.floor(rnd() * (k + 1)) * stp) * 1000) / 1000; v = Math.min(d.max, Math.max(d.min, v)); if (d.min > def.params.find((x: any) => x.key === d.key).min || d.max < def.params.find((x: any) => x.key === d.key).max) narrowed.add(d.key); }
    else if (d.type === 'select') v = d.options[Math.floor(rnd() * d.options.length)].value; else continue;
    const nextRaw = { ...st, [d.key]: v };
    const next = def.normalize(st, nextRaw);
    if (JSON.stringify(next) !== JSON.stringify(nextRaw)) repairs++;
    st = next; steps++;
    if (!allOk(st)) { expect(`krok ${i}: ${d.key}=${v} daje stan niedozwolony`, false, pudelkoNotes(st).filter((n) => n.level !== 'ok').map((n) => n.text).join(' | ')); break; }
    if (i % 25 === 0) { const k = korpus(st), l = lidInBox(st); const c = k.intersect(l.lid).volume(); if (k.status() !== 'NoError' || l.lid.status() !== 'NoError' || c > 0.5) expect(`krok ${i}: geometria`, false, JSON.stringify(st)); }
  }
  expect(`${steps} losowych kroków bez uwag i błędów`, bad === 0, `(korekt przy wyborze opcji: ${repairs}, zawężone suwaki: ${[...narrowed].join(', ')})`);
  // wartość wklejona z JSON poza zakresem jest korygowana
  const fixed = def.normalize(base, { ...base, bookH: 80, gH: 20 });
  expect('niedozwolone wartości z JSON są korygowane', allOk(fixed), JSON.stringify({ bookH: fixed.bookH, gH: fixed.gH }));
  const r0 = def.paramsFor(base); const rg = (k: string) => { const d = r0.find((x: any) => x.key === k); return `${k}: ${d.min}–${d.max}`; };
  console.log('zakresy przy wartościach domyślnych:', ['gH', 'bookH', 'lT', 'rampDepth', 'rampLen', 'trayDepth', 'traySlope', 'lidT', 'gD', 'bookT'].map(rg).join(', '));

  // ---- ułożenie w edytorze i do druku ----
  const pk = def.build({ ...base, piece: 'korpus' }), pl = def.build({ ...base, piece: 'pokrywa' }), pn = def.build({ ...base, piece: 'napis' });
  const bk = pk.boundingBox(), bl = pl.boundingBox(), bn = pn.boundingBox();
  expect('pokrywa w złożeniu leży w kanale korpusu (z)', bl.min[2] >= Ld.Z_CH0 - 1e-6 && bl.max[2] <= Ld.H, `(z ${bl.min[2].toFixed(2)}–${bl.max[2].toFixed(2)}, kanał od ${Ld.Z_CH0.toFixed(2)}, H ${Ld.H})`);
  expect('napis w złożeniu leży w pokrywie', bn.min[2] >= bl.min[2] && bn.max[2] <= bl.max[2] + 1e-6 && bn.min[0] >= bl.min[0] && bn.max[0] <= bl.max[0]);
  expect('korpus i pokrywa w złożeniu nie nachodzą', pk.intersect(pl).volume() < 0.5);
  const tl = def.printTurn({ ...base, piece: 'pokrywa' }), tn = def.printTurn({ ...base, piece: 'napis' }), tk = def.printTurn({ ...base, piece: 'korpus' });
  expect('pokrywa i napis mają pozycję drukową (obrót 180° wokół X), korpus nie', JSON.stringify(tl) === '[0,180]' && JSON.stringify(tn) === '[0,180]' && tk === null);
  const { turnManifold } = await import('../../src/geom/orient');
  const fl = turnManifold(pl, tl), fn = turnManifold(pn, tn);
  const bfl = fl.boundingBox(), bfn = fn.boundingBox();
  const ov = poseScores(fl)[0].overhang;
  console.log(`pokrywa do druku: nawisy ${ov.toFixed(0)} mm² (w złożeniu ${poseScores(pl)[0].overhang.toFixed(0)} mm²), napis z min ${bfn.min[2].toFixed(2)} vs pokrywa z min ${bfl.min[2].toFixed(2)}`);
  expect('pokrywa górą do stołu: mało nawisów (tacka z góry)', ov < 300);
  expect('napis leży równo z górną ścianką pokrywy przy stole', Math.abs(bfn.min[2] - bfl.min[2]) < 1e-6 && Math.abs(bfn.max[2] - bfn.min[2] - 0.8) < 1e-6);
  // podgląd: wysunięta pokrywa nie koliduje z korpusem i leży dalej w X
  const open = def.build({ ...base, piece: 'pokrywa', lidOpen: 100 }), bo = open.boundingBox();
  expect('pokrywa wysunięta na 100% nie koliduje i jest przesunięta', pk.intersect(open).volume() < 0.5 && bo.max[0] < 20, `(x do ${bo.max[0].toFixed(1)}, od ${bo.min[0].toFixed(1)})`);
  const oc = lidInBox(base).lid.volume(), od = open.volume();
  expect('wysunięcie nie zmienia bryły pokrywy', Math.abs(oc - od) < 1e-3);
  console.log(bad ? `\n${bad} błędów` : '\nwszystko OK'); process.exit(bad ? 1 : 0);
})();
