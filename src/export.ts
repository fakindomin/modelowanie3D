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
  const direct = name.endsWith('.json');
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

/** Binary STL with every body in one file (slicers split it back into objects). */
export function exportSTL(bodies: BodyResult[], name: string) {
  const meshes = bodies.map((b) => b.manifold.getMesh());
  const tris = meshes.reduce((n, m) => n + m.triVerts.length / 3, 0);
  const buf = new ArrayBuffer(84 + tris * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris, true);
  let o = 84;
  for (const m of meshes) {
    const v = m.vertProperties, np = m.numProp, t = m.triVerts;
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i] * np, b = t[i + 1] * np, c = t[i + 2] * np;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      for (const f of [nx, ny, nz]) { dv.setFloat32(o, f, true); o += 4; }
      for (const idx of [a, b, c]) for (let k = 0; k < 3; k++) { dv.setFloat32(o, v[idx + k], true); o += 4; }
      o += 2;
    }
  }
  download(buf, `${name}.stl`, 'model/stl');
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
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
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

/** 3MF with one object per body, so each printed part stays separate in the slicer. */
export function export3MF(bodies: BodyResult[], name: string) {
  const fmt = (n: number) => (Math.round(n * 1e4) / 1e4).toString();
  let objects = '';
  let items = '';
  bodies.forEach((b, i) => {
    const m = b.manifold.getMesh();
    const v = m.vertProperties, np = m.numProp, t = m.triVerts;
    const verts: string[] = [];
    for (let k = 0; k < v.length; k += np) verts.push(`<vertex x="${fmt(v[k])}" y="${fmt(v[k + 1])}" z="${fmt(v[k + 2])}"/>`);
    const tris: string[] = [];
    for (let k = 0; k < t.length; k += 3) tris.push(`<triangle v1="${t[k]}" v2="${t[k + 1]}" v3="${t[k + 2]}"/>`);
    objects += `<object id="${i + 1}" name="Bryla ${b.body}" type="model"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`;
    items += `<item objectid="${i + 1}"/>`;
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="pl-PL" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<resources>${objects}</resources>
<build>${items}</build>
</model>`;
  const enc = new TextEncoder();
  const data = zip([
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
  download(data, `${name}.3mf`, 'model/3mf');
}

export function saveJSON(json: string, name: string) {
  download(json, `${name}.json`, 'application/json');
}
