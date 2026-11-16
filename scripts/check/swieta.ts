// Zgodność świątecznych modeli z Figurek (src/figurines/swieta.ts) z Pythonem (linia-3d: etykieta.py, foremki_piernik.py, czubek_choinkowy.py).
// Wartości wzorcowe: tools/swieta/ref.json (tools/swieta/make_ref.py). Uruchom: sh scripts/check/swieta.sh
import { readFileSync } from 'node:fs';
import { initManifold } from '../../src/geom/manifold';
import { buildSwieta, buildLabel, buildCutter, buildTopper, buildTaca, fixTopper, topperMin, swietaFileName, SW_MODELS, SW_ORDER, SW_GR, CUTTER_SHAPES, LB } from '../../src/figurines/swieta';
import { poseScores } from '../../src/geom/orient';

const ref = JSON.parse(readFileSync(new URL('../../tools/swieta/ref.json', import.meta.url), 'utf8'));
let bad = 0;
const info = (m: any) => { const b = m.boundingBox(); return { ext: [0, 1, 2].map((i) => b.max[i] - b.min[i]), vol: m.volume(), st: m.status(), parts: m.decompose().length, genus: m.genus(), lo: b.min }; };
const rep = (ok: boolean, text: string) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'BŁĄD'} ${text}`); };
const pct = (a: number, b: number) => ((a - b) / b) * 100;
const near = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
// Nawis > 55° od pionu (powierzchnie skierowane w dół), bez pierwszych 0,6 mm: tam leży dwuschodkowa fazka dna, która drukuje się bez podpór (jak overhang_55 w taca.py).
const overhang55 = (m: any) => {
  const me = m.getMesh(), v = me.vertProperties, t = me.triVerts, np = me.numProp, lim = -Math.sin((55 * Math.PI) / 180);
  let sum = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * np, b = t[i + 1] * np, c = t[i + 2] * np;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz);
    if (l > 0 && nz / l < lim && (v[a + 2] + v[b + 2] + v[c + 2]) / 3 > 0.6) sum += l / 2;
  }
  return sum;
};

(async () => {
  await initManifold();
  for (const r of ref.label) {
    const t0 = Date.now(), res = buildLabel(r.name, r.cap), i = info(res.pieces[0].manifold);
    const dv = pct(i.vol, r.volume);
    rep(Math.abs(dv) < 0.3 && near(i.ext, r.extents, 0.15) && i.st === 'NoError' && i.parts === 1 && i.lo[2] === 0, `etykieta ${r.name} ${r.cap}: obj ${i.vol.toFixed(1)} vs ${r.volume.toFixed(1)} (${dv.toFixed(3)}%), wym ${i.ext.map((v) => v.toFixed(2)).join('×')}, ${i.st}, składowe ${i.parts}, ${Date.now() - t0} ms`);
    const ps = poseScores(res.pieces[0].manifold)[0];
    rep(ps.overhang < 1, `etykieta ${r.name}: nawisy ${ps.overhang.toFixed(1)} mm² (bez podpór)`);
  }
  for (const r of ref.cutter) {
    const t0 = Date.now(), res = buildCutter(r.shape, r.scale, r.flw, r.flt), i = info(res.pieces[0].manifold);
    const dv = pct(i.vol, r.volume);
    rep(Math.abs(dv) < 0.6 && i.st === 'NoError' && i.parts === 1 && Math.abs(i.ext[2] - 16) < 1e-6 && Math.abs(i.lo[2]) < 1e-9, `foremka ${r.shape} k${r.scale} ${r.flw}×${r.flt}: obj ${i.vol.toFixed(1)} vs ${r.volume.toFixed(1)} (${dv.toFixed(3)}%), wym ${i.ext.map((v) => v.toFixed(1)).join('×')}, ${i.st}, tri ${res.pieces[0].manifold.numTri()}, ${Date.now() - t0} ms`);
    const ps = poseScores(res.pieces[0].manifold)[0];
    rep(ps.overhang < 1, `foremka ${r.shape}: nawisy ${ps.overhang.toFixed(1)} mm²`);
  }
  for (const r of ref.topper) {
    const t0 = Date.now(), res = buildTopper(r.top, r.h, r.bulb, r.sleeve), m = res.pieces[0].manifold, i = info(m);
    const dv = pct(i.vol, r.volume);
    rep(Math.abs(dv) < 0.3 && near(i.ext, r.extents, 0.05) && i.st === 'NoError' && i.parts === 1 && i.genus === 0 && Math.abs(i.lo[2]) < 1e-6, `czubek ${r.top}/${r.h}/${r.bulb}/${r.sleeve}: obj ${i.vol.toFixed(1)} vs ${r.volume.toFixed(1)} (${dv.toFixed(3)}%), wym ${i.ext.map((v) => v.toFixed(2)).join('×')}, ${i.st}, tri ${m.numTri()}, ${Date.now() - t0} ms`);
    const ps = poseScores(m)[0];
    // jedyny nawis: płaski sufit wnęki Ø10 (78,5 mm²)
    rep(ps.overhang < 100, `czubek ${r.top}/${r.h}/${r.bulb}/${r.sleeve}: nawisy ${ps.overhang.toFixed(1)} mm² (sufit Ø10 = 78,5), kontakt ${ps.contact.toFixed(0)} mm²`);
  }
  // szkic (draft) i zaciskanie wymiarów
  {
    const full = buildTopper(18, 240, 62, 62, false).pieces[0].manifold, dr = buildTopper(18, 240, 62, 62, true).pieces[0].manifold;
    const dv = pct(dr.volume(), full.volume());
    rep(dr.status() === 'NoError' && Math.abs(dv) < 2 && dr.numTri() < full.numTri() / 2, `czubek szkic: obj ${dr.volume().toFixed(0)} (${dv.toFixed(2)}% od pełnego), tri ${dr.numTri()} vs ${full.numTri()}`);
    const fx = fixTopper({ top: 30, sleeve: 80, bulb: 40, h: 120 }), mn = topperMin(30, 40, 80);
    rep(fx.bulb >= mn.bulbMin && fx.h >= 120, `zaciskanie: top 30, tuleja 80, kula 40, h 120 -> kula ${fx.bulb}, h ${fx.h} (min kuli ${mn.bulbMin})`);
    const res = buildTopper(30, 120, 40, 80);
    rep(res.pieces[0].manifold.status() === 'NoError' && res.notes.some((n) => n.level === 'warn'), `czubek 30/120/40/80 buduje się po zaciśnięciu, ostrzeżenia: ${res.notes.filter((n) => n.level === 'warn').length}`);
  }
  // siatka skrajnych suwaków: nic nie rzuca wyjątku, każda bryła poprawna
  {
    let n = 0, worst = 0, hMax = 0;
    for (const top of [8, 18, 30]) for (const sleeve of [30, 62, 80]) for (const bulb of [40, 62, 100]) for (const h of [120, 240, 250]) {
      const t0 = Date.now();
      try { const r = buildTopper(top, h, bulb, sleeve, true), m = r.pieces[0].manifold; if (m.status() !== 'NoError' || m.volume() <= 0) throw new Error(m.status()); hMax = Math.max(hMax, r.size.h); n++; } catch (e: any) { rep(false, `czubek ${top}/${h}/${bulb}/${sleeve}: ${e.message}`); }
      worst = Math.max(worst, Date.now() - t0);
    }
    rep(n === 81, `siatka suwaków czubka: ${n}/81 poprawnych (draft), najdłużej ${worst} ms, najwyższy ${hMax.toFixed(0)} mm`);
  }
  // etykiety: polskie znaki, najdłuższe imię, puste imię
  for (const [nm, cap] of [['Żółć Ąćęłńóśźż', 15], ['Wiktoria-Aleksandra Kowalska', 15], ['', 11], ['  Ola   Ma  ', 7]] as [string, number][]) {
    const r = buildLabel(nm, cap), i = info(r.pieces[0].manifold);
    rep(i.st === 'NoError' && i.parts === 1, `etykieta „${nm}” ${cap}: ${i.ext.map((v) => v.toFixed(1)).join('×')} mm, ${i.st}, składowe ${i.parts}, ostrzeżeń ${r.notes.filter((n) => n.level === 'warn').length}`);
  }
  // wszystkie kształty foremek na skrajnych suwakach
  for (const [k] of CUTTER_SHAPES) for (const [sc, fw, ft] of [[0.7, 3, 1.6], [1.3, 10, 4]]) {
    const m = buildCutter(k, sc, fw, ft).pieces[0].manifold;
    rep(m.status() === 'NoError' && m.decompose().length === 1, `foremka ${k} k${sc} ${fw}×${ft}: ${m.status()}, tri ${m.numTri()}`);
  }
  // taca: objętość i wymiary jak w taca.py, szczelność, nawisy, luz renifera
  for (const r of ref.tray) {
    const t0 = Date.now(), res = buildTaca(r.len, r.wid, r.h, r.rad), m = res.pieces[0].manifold, i = info(m);
    const dv = pct(i.vol, r.volume);
    rep(Math.abs(dv) < 0.5 && near(i.ext, r.extents, 0.05) && i.st === 'NoError' && i.parts === 1 && i.genus === 0 && Math.abs(i.lo[2]) < 1e-9, `taca ${r.len}×${r.wid}×${r.h} R${r.rad}: obj ${i.vol.toFixed(0)} vs ${r.volume.toFixed(0)} (${dv.toFixed(3)}%), wym ${i.ext.map((v) => v.toFixed(2)).join('×')}, ${i.st}, tri ${m.numTri()}, ${Date.now() - t0} ms`);
    const oh = overhang55(m);
    rep(oh < 1, `taca ${r.len}×${r.wid}×${r.h} R${r.rad}: nawis > 55° ${oh.toFixed(2)} mm² (bez fazki dna), kontakt ${poseScores(m)[0].contact.toFixed(0)} mm²`);
    const ok4 = res.notes.some((n) => n.level === 'ok' && n.text.includes('renifery co 58 mm')), want4 = r.clearance4 >= 0.5;
    const mx = res.notes.find((n) => n.text.includes('mieszczą się w rzędzie do'))?.text.match(/do (\d) szt/)?.[1];
    rep(ok4 === want4 && Number(mx ?? 0) === r.max_reindeer && !res.notes.some((n) => n.text.includes('Ścianka w dolinie')), `taca ${r.len}×${r.wid}×${r.h} R${r.rad}: 4 kręgle ${ok4 ? 'tak' : 'nie'} (Python luz ${r.clearance4.toFixed(2)}), maks. kręgli ${mx ?? 0} (Python ${r.max_reindeer}), uwagi ${res.notes.length}`);
  }
  // taca: domyślne wymiary 240×75×20, wnętrze, nazwa pliku, siatka skrajnych suwaków
  {
    const res = buildTaca(240, 75, 20), d = SW_MODELS.taca.d;
    rep(d.len === 240 && d.wid === 75 && d.h === 20 && d.r === 15, `taca: domyślne ${d.len}×${d.wid}×${d.h}, promień narożników ${d.r}`);
    rep(Math.abs(res.size.w - 240) < 0.05 && Math.abs(res.size.d - 75) < 0.05 && res.size.h === 20 && res.notes.every((n) => n.level === 'ok'), `taca domyślna: rozmiar ${res.size.w.toFixed(2)}×${res.size.d.toFixed(2)}×${res.size.h}, uwagi: ${res.notes.map((n) => n.text.slice(0, 40)).join(' | ')}`);
    rep(swietaFileName([{ type: 'figurine', params: { model: 'taca', len: 240, wid: 75, h: 20, r: 15 } }]) === 'Taca 240x75x20', `nazwa pliku tacy: ${swietaFileName([{ type: 'figurine', params: { model: 'taca', len: 240, wid: 75, h: 20, r: 15 } }])}`);
    const it = SW_GR.tray.items, rngOk = it.every((x) => x.min !== undefined && x.max !== undefined && Number(d[x.k]) >= x.min && Number(d[x.k]) <= x.max);
    rep(rngOk && it.map((x) => x.k).join() === 'len,wid,h,r', `suwaki tacy: ${it.map((x) => `${x.k} ${x.min}–${x.max}`).join(', ')}`);
    let n = 0, worst = 0, bedWarn = 0, noFit = 0, total = 0;
    for (const len of [100, 240, 250]) for (const wid of [40, 75, 150]) for (const h of [10, 20, 40]) for (const rad of [2, 15, 60]) {
      total++;
      const t0 = Date.now();
      try {
        const r = buildTaca(len, wid, h, rad), m = r.pieces[0].manifold;
        if (m.status() !== 'NoError' || m.volume() <= 0 || m.decompose().length !== 1) throw new Error(`${m.status()} składowe ${m.decompose().length}`);
        if (overhang55(m) >= 1) throw new Error('nawis');
        if (r.notes.some((x) => x.text.includes('nie mieści się na stole'))) bedWarn++;
        if (r.notes.some((x) => x.level === 'warn' && x.text.includes('się tu nie zmieści'))) noFit++;
        n++;
      } catch (e: any) { rep(false, `taca ${len}×${wid}×${h} R${rad}: ${e.message}`); }
      worst = Math.max(worst, Date.now() - t0);
    }
    rep(n === total, `siatka suwaków tacy: ${n}/${total} poprawnych, najdłużej ${worst} ms, bez miejsca na stole: ${bedWarn}, bez miejsca na renifera: ${noFit}`);
  }
  // buildSwieta: domyślne wartości każdego modelu
  for (const id of SW_ORDER) {
    const r = buildSwieta(id, { ...SW_MODELS[id].d });
    rep(r.pieces.length === 1 && r.notes.length >= 2 && r.size.w > 10 && r.size.h > 1, `model ${id}: ${r.pieces.map((p) => p.name).join(', ')}, rozmiar ${r.size.w.toFixed(1)}×${r.size.d.toFixed(1)}×${r.size.h.toFixed(1)}, uwagi ${r.notes.length}`);
  }
  console.log(bad ? `\n${bad} BŁĘDÓW` : '\nWSZYSTKO OK');
  process.exit(bad ? 1 : 0);
})();
