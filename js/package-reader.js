'use strict';

/* ---------- package reading ---------- */
function normPath(p) {
  let s = p;
  for (let k = 0; k < 4; k++) { try { const d = decodeURIComponent(s); if (d === s) break; s = d; } catch { break; } }
  return s.replace(/\\/g, '/');
}
const stripBom = t => t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t;

async function readPackage(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let off = -1;
  for (let i = 0, n = Math.min(buf.length - 4, 8192); i < n; i++) {
    if (buf[i] === 0x50 && buf[i+1] === 0x4B && buf[i+2] === 3 && buf[i+3] === 4) { off = i; break; }
  }
  if (off < 0) throw new Error('No readable contents found. This may be a runtime package or an encrypted AppSource app.');
  const zip = await JSZip.loadAsync(buf.subarray(off));
  const files = [];
  for (const [p, e] of Object.entries(zip.files)) {
    if (e.dir) continue;
    const path = normPath(p);
    const bin = BIN_RE.test(path);
    files.push({ path, bin, data: bin ? await e.async('uint8array') : stripBom(await e.async('string')) });
  }
  return buildApp(file.name, files);
}

function parseManifest(xml) {
  const m = { attrs: {}, idRanges: [], deps: [], features: [], rep: {}, build: {} };
  if (!xml) return m;
  try {
    const d = new DOMParser().parseFromString(xml, 'application/xml');
    const attrsOf = el => el ? Object.fromEntries([...el.attributes].map(a => [a.name, a.value])) : {};
    m.attrs = attrsOf(d.getElementsByTagName('App')[0]);
    m.idRanges = [...d.getElementsByTagName('IdRange')].map(e => `${e.getAttribute('MinObjectId')}..${e.getAttribute('MaxObjectId')}`);
    m.deps = [...d.getElementsByTagName('Dependency')].map(attrsOf);
    m.features = [...d.getElementsByTagName('Feature')].map(e => e.textContent.trim());
    m.rep = attrsOf(d.getElementsByTagName('ResourceExposurePolicy')[0]);
    m.build = attrsOf(d.getElementsByTagName('Build')[0]);
  } catch {}
  return m;
}

function collectSymbols(node, out) {
  if (!node || typeof node !== 'object') return out;
  for (const [k, type] of Object.entries(SYM_TYPES)) {
    if (Array.isArray(node[k])) for (const s of node[k]) out.push({ type, sym: s });
  }
  if (Array.isArray(node.Namespaces)) for (const n of node.Namespaces) collectSymbols(n, out);
  return out;
}

function parseAlObjects(text, path) {
  const found = [];
  OBJ_RE.lastIndex = 0;
  let m;
  while ((m = OBJ_RE.exec(text))) {
    let name = m[3];
    if (name[0] === '"') name = name.slice(1, -1).replace(/""/g, '"');
    found.push({ index: m.index, type: m[1].toLowerCase(), id: m[2] ? +m[2] : null, name });
  }
  if (!found.length) return [{ type: 'other', id: null, name: path.split('/').pop(), text }];
  return found.map((f, i) => ({
    type: f.type, id: f.id, name: f.name,
    text: text.slice(i === 0 ? 0 : f.index, i + 1 < found.length ? found[i+1].index : text.length).replace(/\s+$/, '') + '\n'
  }));
}

function buildApp(fileName, files) {
  const byPath = new Map(files.map(f => [f.path.toLowerCase(), f]));
  const manifest = parseManifest(byPath.get('navxmanifest.xml')?.data);
  let symRoot = null;
  const symFile = byPath.get('symbolreference.json');
  if (symFile) { try { symRoot = JSON.parse(symFile.data); } catch {} }
  const symList = collectSymbols(symRoot, []);
  const symMap = new Map();
  for (const s of symList) symMap.set(s.type + '|' + String(s.sym.Name || '').toLowerCase(), s);

  const objects = [], others = [];
  for (const f of files) {
    if (!f.bin && /\.al$/i.test(f.path)) {
      for (const o of parseAlObjects(f.data, f.path)) {
        const k = o.type + '|' + o.name.toLowerCase();
        const s = symMap.get(k);
        if (s) symMap.delete(k);
        objects.push({ ...o, path: f.path, sym: s ? s.sym : null, fromSymbols: false });
      }
    } else {
      let data = f.data;
      if (!f.bin && /\.json$/i.test(f.path)) { try { data = JSON.stringify(JSON.parse(data), null, 2); } catch {} }
      others.push({ type: 'file', id: null, name: f.path, path: f.path, bin: f.bin, text: f.bin ? null : data, bytes: f.bin ? data : null });
    }
  }
  const hasSource = objects.length > 0;
  for (const s of symMap.values()) {
    objects.push({ type: s.type, id: s.sym.Id ?? null, name: s.sym.Name || '(unnamed)', path: s.sym.ReferenceSourceFileName || '', sym: s.sym, fromSymbols: true, text: outline(s.type, s.sym) });
  }
  return { fileName, manifest, objects, files: others, hasSource, symbolCount: symList.length };
}
