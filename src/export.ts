import type { BodyResult } from './geom/parts';

interface ClaudeHost {
  use(name: 'downloads'): Promise<{ save(f: { filename: string; data: Blob | Uint8Array }): Promise<void> } | null>;
}

// Inside a claude.ai artifact plain downloads are blocked; files go through the host's
// `downloads` capability, which only accepts some extensions, so STL/3MF travel inside a .zip.
async function hostSave(bytes: Uint8Array<ArrayBuffer>, name: string): Promise<boolean> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (!host?.use) return false;
  const downloads = await host.use('downloads').catch(() => null);
  if (!downloads) return false;
  const direct = name.endsWith('.json') || name.endsWith('.zip');
  try {
    await downloads.save(direct ? { filename: name, data: bytes } : { filename: name.replace(/\.\w+$/, '') + '.zip', data: zip([{ name, data: bytes }]) });
  } catch {
    /* declined by the viewer */
  }
  return true;
}

async function download(data: ArrayBuffer | Uint8Array<ArrayBuffer> | string, name: string, type: string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  if (await hostSave(bytes, name)) return;
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Binary STL of one mesh, moved by (dx, dy, dz). */
function stlOf(m: ReturnType<BodyResult['manifold']['getMesh']>, dx = 0, dy = 0, dz = 0): Uint8Array<ArrayBuffer> {
  const tris = m.triVerts.length / 3;
  const buf = new ArrayBuffer(84 + tris * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris, true);
  let o = 84;
  const v = m.vertProperties, np = m.numProp, t = m.triVerts;
  const d = [dx, dy, dz];
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * np, b = t[i + 1] * np, c = t[i + 2] * np;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const f of [nx, ny, nz]) { dv.setFloat32(o, f, true); o += 4; }
    for (const idx of [a, b, c]) for (let k = 0; k < 3; k++) { dv.setFloat32(o, v[idx + k] + d[k], true); o += 4; }
    o += 2;
  }
  return new Uint8Array(buf);
}

/** File-safe name: letters (Polish ones too), digits, spaces, dashes. */
const safe = (s: string) => s.replace(/[^\p{L}\p{N} _.-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'czesc';

/**
 * STL: one file per printed part, packed in a .zip. Each part stands on the bed (z = 0) centred on the origin,
 * so the slicer lays them out; one body alone gives a plain .stl.
 */
export function exportSTL(bodies: BodyResult[], name: string, names: Map<number, string> = new Map(), numbered = false) {
  const files = bodies.map((b, i) => {
    const m = b.manifold.getMesh();
    const [x0, y0, z0] = b.manifold.boundingBox().min, [x1, y1] = b.manifold.boundingBox().max;
    const nm = `${numbered ? '' : String(i + 1).padStart(2, '0') + ' '}${safe(names.get(b.body) ?? `Bryla ${b.body}`)}.stl`;
    return { name: nm, data: stlOf(m, -(x0 + x1) / 2, -(y0 + y1) / 2, -z0) };
  });
  if (files.length === 1) return download(files[0].data, `${name}.stl`, 'model/stl');
  download(zip(files), `${name}-stl.zip`, 'application/zip');
}

// ---- minimal ZIP (stored, no compression) for 3MF -------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    // UTF-8 names (Polish letters), date 1980-01-01.
    local.setUint16(6, 0x0800, true);
    local.setUint16(12, 0x0021, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(14, 0x0021, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/**
 * Lays parts out plate by plate (shelves, 5 mm apart, 5 mm from the edges). A new plate starts when the bed is
 * full or the material changes; a part bigger than the bed gets a plate of its own.
 */
export function plates(sizes: { w: number; d: number; group: string }[], bed: [number, number]) {
  const [W, D] = bed, gap = 5;
  const out: { plate: number; x: number; y: number }[] = new Array(sizes.length);
  // Biggest first within each material, materials kept together.
  const order = sizes.map((_, i) => i).sort((a, b) => (sizes[a].group === sizes[b].group ? sizes[b].d * sizes[b].w - sizes[a].d * sizes[a].w : sizes[a].group < sizes[b].group ? -1 : 1));
  let plate = 0, x = gap, y = gap, row = 0, group: string | null = null, used = false;
  const next = () => {
    plate++;
    x = gap;
    y = gap;
    row = 0;
    used = false;
  };
  for (const i of order) {
    const { w, d } = sizes[i];
    if (used && group !== sizes[i].group) next();
    group = sizes[i].group;
    if (used && x + w > W - gap) {
      x = gap;
      y += row + gap;
      row = 0;
    }
    if (used && y + d > D - gap) next();
    out[i] = { plate, x, y };
    used = true;
    x += w + gap;
    row = Math.max(row, d);
  }
  return { at: out, count: plate + 1 };
}

/** A plain 3MF (geometry only, every slicer reads it) with the given objects at their places. */
function make3MF(objs: { mesh: ReturnType<BodyResult['manifold']['getMesh']>; name: string; dx: number; dy: number; dz: number }[], title: string) {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const fmt = (n: number) => (Math.round(n * 1e4) / 1e4).toString();
  let objects = '';
  let items = '';
  objs.forEach((o, i) => {
    const v = o.mesh.vertProperties, np = o.mesh.numProp, t = o.mesh.triVerts;
    const verts: string[] = [];
    // Positions baked into the mesh: slicers judge "several heights = one multi-part object" from the raw mesh, not the item transform.
    for (let k = 0; k < v.length; k += np) verts.push(`<vertex x="${fmt(v[k] + o.dx)}" y="${fmt(v[k + 1] + o.dy)}" z="${fmt(v[k + 2] + o.dz)}"/>`);
    const tris: string[] = [];
    for (let k = 0; k < t.length; k += 3) tris.push(`<triangle v1="${t[k]}" v2="${t[k + 1]}" v3="${t[k + 2]}"/>`);
    objects += `<object id="${i + 1}" name="${esc(o.name)}" type="model"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`;
    items += `<item objectid="${i + 1}"/>`;
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="pl-PL" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${esc(title)}</metadata>
<resources>${objects}</resources>
<build>${items}</build>
</model>`;
  const enc = new TextEncoder();
  return zip([
    {
      name: '[Content_Types].xml',
      data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
      ),
    },
    { name: '3D/3dmodel.model', data: enc.encode(model) },
  ]);
}

/**
 * 3MF laid out bed by bed: one file per bed (each material on its own beds), several packed in a .zip.
 * Plain geometry files: slicers' own multi-plate projects need their full printer settings, which would replace the user's.
 */
export function export3MF(bodies: BodyResult[], name: string, names: Map<number, string> = new Map(), _numbered = false, bed: [number, number] = [256, 256], groups: Map<number, string> = new Map()) {
  const boxes = bodies.map((b) => b.manifold.boundingBox());
  const lay = plates(
    boxes.map((bb, i) => ({ w: bb.max[0] - bb.min[0], d: bb.max[1] - bb.min[1], group: groups.get(bodies[i].body) ?? '' })),
    bed,
  );
  const perPlate = Array.from({ length: lay.count }, () => [] as number[]);
  lay.at.forEach((a, i) => perPlate[a.plate].push(i));
  const files = perPlate.map((ids, k) => {
    const group = groups.get(bodies[ids[0]].body) ?? '';
    const objs = ids.map((i) => {
      const bb = boxes[i], at = lay.at[i];
      return { mesh: bodies[i].manifold.getMesh(), name: names.get(bodies[i].body) ?? `Bryla ${bodies[i].body}`, dx: at.x - bb.min[0], dy: at.y - bb.min[1], dz: -bb.min[2] };
    });
    return { name: `${name} - stol ${k + 1}${group ? ` (${group})` : ''}.3mf`, data: make3MF(objs, `${name}, stół ${k + 1}`) };
  });
  if (files.length === 1) download(files[0].data, `${name}.3mf`, 'model/3mf');
  else download(zip(files), `${name}-3mf.zip`, 'application/zip');
  return lay.count;
}

export function saveJSON(json: string, name: string) {
  download(json, `${name}.json`, 'application/json');
}
