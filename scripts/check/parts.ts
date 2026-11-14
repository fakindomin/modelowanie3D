// Builds every part in many variants and checks: an 'around' texture never climbs onto a narrower end (thread,
// neck), and dividers never show on the outside. Run: npm run check:parts [type,type...]
import { initManifold } from '../../src/geom/manifold';
import { DEFS } from '../../src/catalog';
import { applyTexture } from '../../src/geom/texture';
const RIBS: any = { pattern: 'ribs', face: 'around', mode: 'add', depth: 0.8, spacing: 3, angle: 0, margin: 2 };
function variants(def: any) {
  const base: any = {}; for (const d of def.params) base[d.key] = d.def;
  const out: any[] = [base];
  for (const d of def.params) {
    if (d.type === 'bool') out.push({ ...base, [d.key]: !d.def });
    if (d.type === 'select' && d.options) for (const o of d.options) { const v = Array.isArray(o) ? o[0] : o.value ?? o; if (v !== d.def) out.push({ ...base, [d.key]: v }); }
  }
  // threads on: enable screw-like bools together with other options
  const sw = out.filter((p) => p.screw);
  for (const s of sw) for (const d of def.params) if (d.type === 'select' && d.options) for (const o of d.options) { const v = Array.isArray(o) ? o[0] : o.value ?? o; out.push({ ...s, [d.key]: v }); }
  return out.slice(0, 40);
}
function radii(m: any, cx: number, cy: number, n = 60) {
  const b = m.boundingBox(); const r: number[] = [];
  for (let i = 0; i < n; i++) { const z = b.min[2] + (i + 0.5) * (b.max[2] - b.min[2]) / n; const s = m.slice(z); const sb = s.bounds(); r.push(s.isEmpty() ? 0 : Math.max(sb.max[0] - cx, cx - sb.min[0], sb.max[1] - cy, cy - sb.min[1])); s.delete(); }
  return r;
}
(async () => {
  await initManifold();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  if (process.argv[2] === 'list') { console.log(Object.keys(DEFS).join(',')); return; }
  const bad: string[] = [];
  let n = 0;
  for (const [type, def] of Object.entries(DEFS as any) as any) {
    if (only && !only.includes(type)) continue;
    console.error('type', type);
    for (const p of variants(def)) {
      let m: any;
      try { m = def.build(p); } catch { continue; }
      if (!m || m.isEmpty?.()) continue;
      n++;
      const b = m.boundingBox();
      const ex = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
      const tag = `${type} ${JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k, v]) => (def.params.find((d: any) => d.key === k)?.def) !== v)))}`;
      // A: around texture must not grow narrow zones (round about Z only, for brevity)
      if (Math.abs(ex[0] - ex[1]) < 0.02 * Math.max(ex[0], ex[1]) && ex[2] > 6) {
        const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
        try {
          const t = applyTexture(m, RIBS);
          const r0 = radii(m, cx, cy), r1 = radii(t, cx, cy);
          const full = Math.max(...r0);
          const hits = r0.map((r, i) => (r > 0.5 && r < full - 1 && r1[i] > r + 0.1 ? i : -1)).filter((i) => i >= 0);
          if (hits.length) bad.push(`TEX ${tag}: narrow zone grew at ${hits.length}/60 heights`);
        } catch (e: any) { bad.push(`TEXERR ${tag}: ${e.message}`); }
      }
      // B: dividers must not change the outside
      const divKeys = ['nx', 'ny', 'nr'].filter((k) => def.params.some((d: any) => d.key === k));
      if (divKeys.length) {
        try {
          const pd = { ...p, nx: 3, ny: 2, nr: 4 };
          const p0 = { ...p, nx: 1, ny: 1, nr: 1, div: '', ring: 0 };
          for (const mode of p.shape === 'round' || p.shape === 'hex' ? ['grid', 'radial'] : ['grid']) {
            const a = def.build({ ...p0, divMode: mode }), c = def.build({ ...pd, divMode: mode });
            const ba = a.boundingBox(), bc = c.boundingBox();
            const cx = (ba.min[0] + ba.max[0]) / 2, cy = (ba.min[1] + ba.max[1]) / 2;
            const ra = radii(a, cx, cy), rc = radii(c, cx, cy);
            const grow = rc.map((r, i) => r - ra[i]).filter((d) => d > 0.05);
            const bbGrow = [0, 1, 2].some((i) => bc.min[i] < ba.min[i] - 0.05 || bc.max[i] > ba.max[i] + 0.05);
            if (grow.length || bbGrow) bad.push(`DIV ${tag} ${mode}: dividers stick out (${grow.length}/60 heights, bbox ${bbGrow})`);
          }
        } catch (e: any) { bad.push(`DIVERR ${tag}: ${e.message}`); }
      }
    }
  }
  console.log('built', n);
  console.log(bad.join('\n') || 'no problems');
})();
