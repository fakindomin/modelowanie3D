// Zgodność modułu pudełka z tools/pudelko/pudelko.py (v11): bbox i objętość korpusu i pokrywy przy parametrach „legacy”.
// Uruchom: sh scripts/check/pudelko.sh
import { readFileSync } from 'node:fs';
import { initManifold } from '../../src/geom/manifold';
import { korpus, lidInBox, layout, bowlCutter, pudelkoNotes, drawers, drawerPlan } from '../../src/parts/pudelko';
import { DEFS } from '../../src/catalog';
import { poseScores } from '../../src/geom/orient';
import { groupPrintWith } from '../../src/export';

const ref = JSON.parse(readFileSync(new URL('../../tools/pudelko/ref.json', import.meta.url), 'utf8'));
const def: any = (DEFS as any).pudelko;
const base: any = {}; for (const d of def.params) base[d.key] = d.def;
const legacy = { ...base, lidT: 2.8, trayDepth: 0, garby: true, textMode: 'engrave', rampSide: 'off', legacyDrawers: true };

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
  for (const piece of ['korpus', 'pokrywa', 'napis', 'szuflady']) { const m = def.build({ ...base, piece }); const i = info(m); console.log(piece, JSON.stringify(i)); if (i.st !== 'NoError' || i.vol <= 0) bad++; }
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
  expect('za cienko pod zapalniczką → błąd', pudelkoNotes({ ...base, lT: 30, gH: 20 }).some((n) => n.level === 'error'));
  expect('za płytkie pudełko → błąd (ubijak)', pudelkoNotes({ ...base, gD: 20, bookT: 5 }).some((n) => n.level === 'error'));
  expect('bardzo wysokie bibułki → błąd szuflady', pudelkoNotes({ ...base, bookH: 80 }).some((n) => n.level === 'error'));
  // ---- punkt 3: szuflady ----
  const dv = (q: any) => drawers({ ...base, ...q });
  const MAGV = Math.PI * 2.625 ** 2 * 2.2;
  const dr0 = dv({}); const bd = dr0!.boundingBox(), kb = korpus(base).boundingBox();
  expect('szuflady: 2 bryły w jednej części, status OK', !!dr0 && dr0.status() === 'NoError' && dr0.numProp !== undefined, JSON.stringify(info(dr0)));
  expect('szuflady w obrysie pudełka, dnem równo z dołem', bd.min[2] >= -1e-6 && Math.abs(bd.min[2]) < 1e-6 && bd.max[2] <= Ld.H && bd.min[0] >= 0 && bd.max[0] <= Ld.X && bd.max[1] <= Ld.Y, `(x ${bd.min[0].toFixed(1)}–${bd.max[0].toFixed(1)}, y ${bd.min[1].toFixed(1)}–${bd.max[1].toFixed(1)}, z ${bd.min[2].toFixed(1)}–${bd.max[2].toFixed(1)})`);
  expect('szuflady nie kolidują z korpusem (prowadnice, magnesy)', dr0!.intersect(korpus(base)).volume() < 0.5, `(${dr0!.intersect(korpus(base)).volume().toFixed(3)} mm³)`);
  expect('szuflady nie kolidują z pokrywą', dr0!.intersect(pr.lid).volume() < 0.5);
  expect('dwie szuflady identyczne (obj. = 2 × jedna)', Math.abs(dr0!.volume() - 2 * dv({ nDr: 1 })!.volume()) < 0.002 * dr0!.volume(), `(${dr0!.volume().toFixed(0)} vs ${(2 * dv({ nDr: 1 })!.volume()).toFixed(0)})`);
  expect('0 szuflad → brak bryły szuflad', dv({ nDr: 0 }) === null);
  // magnesy mieszczą się w ściankach: objętość kieszeni = pełna (nic nie przebija), dla szuflady i dla wnęki
  expect('magnesy w szufladzie: 2 kieszenie, nie przebijają ścianki', Math.abs(dv({ nDr: 1, dMag: 'off' })!.volume() - dv({ nDr: 1 })!.volume() - 2 * MAGV) < 0.03 * 2 * MAGV, `(${(dv({ nDr: 1, dMag: 'off' })!.volume() - dv({ nDr: 1 })!.volume()).toFixed(0)} vs ${(2 * MAGV).toFixed(0)})`);
  expect('magnesy we wnęce: 4 kieszenie (tył i przód), nie przebijają ścianek', Math.abs(vol({ nDr: 1, dMag: 'off' }) - vol({ nDr: 1 }) - 4 * MAGV) < 0.03 * 4 * MAGV, `(${(vol({ nDr: 1, dMag: 'off' }) - vol({ nDr: 1 })).toFixed(0)} vs ${(4 * MAGV).toFixed(0)})`);
  // najmniejsza dozwolona szuflada z magnesami: magnes mieści się w ściance (strop/skraj)
  const small = { nDr: 1, dW: 30, dH: 11.3, dL: 41.5, dX: 40, dRampH: 3, dRampL: 8 };
  expect('mała szuflada z magnesami jest dozwolona', pudelkoNotes({ ...base, ...small }).every((n) => n.level === 'ok'), pudelkoNotes({ ...base, ...small }).filter((n) => n.level !== 'ok').map((n) => n.text).join(' | '));
  const ds = dv(small)!, ks = korpus({ ...base, ...small });
  expect('mała szuflada: magnesy nie przebijają (obj. kieszeni pełna)', Math.abs(dv({ ...small, dMag: 'off' })!.volume() - ds.volume() - 2 * MAGV) < 0.03 * 2 * MAGV, `(${(dv({ ...small, dMag: 'off' })!.volume() - ds.volume()).toFixed(0)} vs ${(2 * MAGV).toFixed(0)})`);
  expect('mała szuflada nie koliduje z korpusem', ds.intersect(ks).volume() < 0.5 && ds.status() === 'NoError' && ks.status() === 'NoError');
  expect('za niska szuflada z magnesami → błąd', pudelkoNotes({ ...base, nDr: 1, dH: 10 }).some((n) => n.level === 'error' && /za niska/.test(n.text)));
  expect('bez magnesów niższa szuflada jest dozwolona', pudelkoNotes({ ...base, nDr: 1, dMag: 'off', dH: 8, dL: 30, dRampH: 1.5, dRampL: 10 }).every((n) => n.level === 'ok'));
  expect('za szerokie szuflady → błąd', pudelkoNotes({ ...base, dW: 80 }).some((n) => n.level === 'error' && /nie mieszczą/.test(n.text)));
  expect('jedna szuflada: dowolne położenie ciągłe', [0, 17.3, 40, 74.9].every((dX) => { const q = { ...base, nDr: 1, dW: 70, dX }; return pudelkoNotes(q).every((n) => n.level === 'ok') && dv({ nDr: 1, dW: 70, dX })!.intersect(korpus(q)).volume() < 0.5; }));
  { const q = { ...base, nDr: 1, dW: 70, dX: 17.3 }, a = dv({ nDr: 1, dW: 70, dX: 17.3 })!.boundingBox(); expect('położenie przesuwa szufladę o dX', Math.abs(a.min[0] - (Ld.x0 + 17.3 + 0.25)) < 1e-3, `(x min ${a.min[0].toFixed(2)})`); void q; }
  // wysokość pudełka z wysokości szuflady, a bez szuflad – minimum młynek/bibułki
  expect('szuflada wyższa o 5 → pudełko wyższe o 5', Math.abs(Lx({ dH: 17.8 }).H - d0.H - 5) < 0.11);
  const L0d = Lx({ nDr: 0 });
  expect('bez szuflad pudełko jest niższe niż z szufladami', L0d.H < d0.H - 5, `(H ${L0d.H} vs ${d0.H})`);
  expect('bez szuflad: domyślnie bez uwag i błędów', pudelkoNotes({ ...base, nDr: 0 }).every((n) => n.level === 'ok'));
  expect('bez szuflad: dodatek podnosi dno', Math.abs(Lx({ nDr: 0, baseExtra: 6 }).H - L0d.H - 6) < 0.11);
  expect('bez szuflad: korpus z dołem pełnym i napisem, poprawny', (() => { const k0 = korpus({ ...base, nDr: 0 }); return k0.status() === 'NoError' && k0.volume() > 0 && k0.intersect(lidInBox({ ...base, nDr: 0 }).lid).volume() < 0.5; })());
  { const gm = layout({ ...base, nDr: 0, bookH: 60, gH: 20 }); expect('bez szuflad: wysokie bibułki podnoszą minimum', pudelkoNotes({ ...base, nDr: 0, bookH: 60, gH: 20 }).every((n) => n.level === 'ok') && gm.gFloor > 30, `(gFloor ${gm.gFloor})`); }
  { // wysuwanie szuflad (podgląd): niezależnie, bez kolizji, bryła bez zmian
    const o = dv({ drOpen: 100 })!, bo = o.boundingBox(), o2 = dv({ drOpen2: 50 })!, p0 = drawerPlan(base, d0).pull;
    expect('szuflada wysunięta na 100% jedzie w −Y o dł. − 21,5 i nie koliduje', Math.abs(bo.min[1] - (bd.min[1] - p0)) < 1e-6 && o.intersect(korpus(base)).volume() < 0.5, `(pull ${p0}, y min ${bo.min[1].toFixed(1)})`);
    expect('wysuwanie niezależne (prawa 50% ≠ lewa) i nie zmienia objętości', Math.abs(o2.volume() - dr0!.volume()) < 1e-3 && Math.abs(o2.boundingBox().min[1] - (bd.min[1] - p0 / 2)) < 1e-6 && Math.abs(o.volume() - dr0!.volume()) < 1e-3);
  }
  // przegroda zależy od magnesów
  expect('przegroda 3,0 z magnesami, 1,6 bez', Math.abs(drawerPlan(base, d0).P - 3.0) < 1e-9 && Math.abs(drawerPlan({ ...base, dMag: 'off' }, d0).P - 1.6) < 1e-9);
  // wariacje: każda budowa poprawna, korpus nie koliduje z pokrywą, magnesy szuflad mieszczą się w kieszeni
  const variants: any[] = [{}, { gD: 25 }, { gD: 60 }, { gH: 20 }, { gH: 60 }, { bookL: 70 }, { bookL: 160 }, { bookT: 8 }, { bookH: 20 }, { bookH: 40 }, { lL: 60 }, { lL: 110 }, { lW: 20 }, { lT: 10 }, { lT: 22 },
    { rampSide: 'left' }, { rampSide: 'off' }, { rampLen: 40, rampDepth: 3 }, { lidT: 3 }, { lidT: 6, trayDepth: 3 }, { gD: 28, bookL: 70, lL: 60, bookT: 8, gH: 25 }, { gD: 70, gH: 60, bookL: 180, lL: 120, bookH: 45 }, { gD: 20, bookL: 60, lL: 50, bookT: 5, gH: 25, bookH: 20, lT: 8, lW: 15 },
    { nDr: 0 }, { nDr: 1 }, { nDr: 1, dW: 100, dX: 20 }, { nDr: 1, dH: 20, dL: 55 }, { dMag: 'off' }, { dMag: 'off', dH: 8, dL: 30 }, { nDr: 2, dW: 60 }, { nDr: 0, baseExtra: 8 }, { dRampH: 0 }, { dRampH: 5, dRampL: 40 }];
  for (const q of variants) {
    const pp = { ...base, ...q }; const t0 = Date.now();
    const k = korpus(pp), l = lidInBox(pp), dd = drawers(pp);
    const st = [k.status(), l.lid.status(), dd ? dd.status() : 'NoError'].join(','), c = k.intersect(l.lid).volume() + (dd ? dd.intersect(k).volume() + dd.intersect(l.lid).volume() : 0);
    const notes = pudelkoNotes(pp).filter((n) => n.level === 'error').length;
    const ok = st === 'NoError,NoError,NoError' && c < 0.5 && k.volume() > 0 && l.lid.volume() > 0;
    expect(`wariant ${JSON.stringify(q)}`, ok, `[${st}] kolizja ${c.toFixed(2)} mm³, błędów kontroli: ${notes}, ${Date.now() - t0} ms`);
  }

  // ---- zakresy suwaków: losowe przeciąganie nigdy nie daje uwagi/błędu ----
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let st: any = { ...base }; let repairs = 0, steps = 0, narrowed = new Set<string>();
  const allOk = (q: any) => pudelkoNotes(q).every((n) => n.level === 'ok');
  expect('stan startowy dozwolony', allOk(st));
  for (let i = 0; i < 400; i++) {
    const fields = def.paramsFor(st).filter((d: any) => d.key !== 'garby' && d.key !== 'legacyDrawers' && (!d.show || d.show(st)));
    const d = fields[Math.floor(rnd() * fields.length)];
    let v: any;
    if (d.type === 'number') { const stp = d.step ?? 1; const k = Math.floor((d.max - d.min) / stp); v = Math.round((d.min + Math.floor(rnd() * (k + 1)) * stp) * 1000) / 1000; v = Math.min(d.max, Math.max(d.min, v)); if (d.min > def.params.find((x: any) => x.key === d.key).min || d.max < def.params.find((x: any) => x.key === d.key).max) narrowed.add(d.key); }
    else if (d.type === 'select') v = d.options[Math.floor(rnd() * d.options.length)].value; else continue;
    const nextRaw = { ...st, [d.key]: v };
    const next = def.normalize(st, nextRaw);
    if (JSON.stringify(next) !== JSON.stringify(nextRaw)) repairs++;
    st = next; steps++;
    if (!allOk(st)) { expect(`krok ${i}: ${d.key}=${v} daje stan niedozwolony`, false, pudelkoNotes(st).filter((n) => n.level !== 'ok').map((n) => n.text).join(' | ')); break; }
    if (i % 10 === 0) { const k = korpus(st), l = lidInBox(st), dd = drawers(st); const c = k.intersect(l.lid).volume() + (dd ? dd.intersect(k).volume() + dd.intersect(l.lid).volume() : 0); if (k.status() !== 'NoError' || l.lid.status() !== 'NoError' || (dd && dd.status() !== 'NoError') || c > 0.5) expect(`krok ${i}: geometria`, false, JSON.stringify(st)); }
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
  // ---- napis jako druga część obiektu pokrywy (druk wielokolorowy) ----
  const pieces: any[] = def.pieces;
  const bodiesT: any[] = [{ body: 1, manifold: fl0(pk) }, { body: 2, manifold: turnManifold(pl, [0, 180]) }, { body: 3, manifold: turnManifold(pn, [0, 180]) }];
  function fl0(m: any) { return m; }
  const infoT = new Map(bodiesT.map((b, i) => [b.body, { group: 'g1', piece: pieces[i].value, printWith: pieces[i].printWith, name: pieces[i].label }]));
  const merged = groupPrintWith(bodiesT, infoT as any);
  const mh = merged.find((b: any) => b.body === 2) as any;
  expect('napis dołączony do pokrywy: 2 obiekty zamiast 3', merged.length === 2 && !!mh && mh.parts?.length === 2, `(${merged.length} obiekty, części: ${mh?.parts?.map((x: any) => x.name).join(' + ')})`);
  expect('obiekt pokrywy = pokrywa + napis w jednej ramce', Math.abs(mh.manifold.volume() - (pl.volume() + pn.volume())) < 1, `(${mh.manifold.volume().toFixed(0)} vs ${(pl.volume() + pn.volume()).toFixed(0)})`);
  expect('części obiektu mają wspólne współrzędne (napis w obrysie pokrywy)', (() => { const a = mh.parts[0].manifold.boundingBox(), c = mh.parts[1].manifold.boundingBox(); return c.min[0] >= a.min[0] && c.max[0] <= a.max[0] && c.min[1] >= a.min[1] && c.max[1] <= a.max[1] && Math.abs(c.min[2] - a.min[2]) < 1e-6; })());
  expect('korpus bez zmian', merged.find((b: any) => b.body === 1) === bodiesT[0]);
  console.log(bad ? `\n${bad} błędów` : '\nwszystko OK'); process.exit(bad ? 1 : 0);
})();
