'use strict';

/* ---------- AL project folder reading ---------- */
// A folder side is built from its .al files only (plus app.json for name/version), so it can be
// compared against the source inside a .app. Objects pair by type + name, so file paths don't matter.
const SKIP_DIR_RE = /^(\.alpackages|\.vscode|\.git|\.snapshots|\.output|node_modules)$/i;
const isAlFile = p => /\.al$/i.test(p);
const isAppJson = p => /(^|\/)app\.json$/i.test(p);

// list: [{ path, file }] where path starts with the picked folder's name ("MyApp/src/Foo.Table.al")
async function readFolder(folderName, list) {
  const files = []; let appJson = null;
  for (const { path, file } of list) {
    const segs = normPath(path).split('/');
    if (segs.slice(0, -1).some(s => SKIP_DIR_RE.test(s))) continue;
    const rel = segs.length > 1 ? segs.slice(1).join('/') : segs[0];
    if (isAlFile(rel)) files.push({ path: rel, bin: false, data: stripBom(await file.text()) });
    else if (isAppJson(rel) && (!appJson || segs.length < appJson.depth)) appJson = { depth: segs.length, file };
  }
  if (!files.length) throw new Error('No .al files found in this folder.');
  const app = buildApp(folderName, files);
  app.isFolder = true;
  app.alFileCount = files.length;
  if (appJson) { try { app.manifest = manifestFromAppJson(JSON.parse(stripBom(await appJson.file.text()))); } catch {} }
  return app;
}

// map app.json onto the same shape parseManifest() returns for NavxManifest.xml
function manifestFromAppJson(j) {
  const m = parseManifest(null);
  const cap = k => k[0].toUpperCase() + k.slice(1);
  for (const k of ['id', 'name', 'publisher', 'version', 'brief', 'platform', 'application', 'runtime', 'target', 'showMyCode'])
    if (j[k] != null) m.attrs[cap(k)] = String(j[k]);
  m.idRanges = (j.idRanges || (j.idRange ? [j.idRange] : [])).map(r => `${r.from}..${r.to}`);
  m.deps = (j.dependencies || []).map(d => ({ Id: d.id || d.appId, Name: d.name, Publisher: d.publisher, MinVersion: d.version }));
  m.features = j.features || [];
  m.rep = Object.fromEntries(Object.entries(j.resourceExposurePolicy || {}).map(([k, v]) => [cap(k), String(v)]));
  return m;
}

// <input webkitdirectory> gives a flat FileList with webkitRelativePath
function listFromInput(fileList) {
  return [...fileList].map(f => ({ path: f.webkitRelativePath || f.name, file: f }));
}

// drag & drop gives a FileSystemDirectoryEntry; walk it, skipping tool/package folders
async function listFromEntry(dirEntry) {
  const out = [];
  const readAll = async dir => {
    const reader = dir.createReader(), all = [];
    for (;;) { const batch = await new Promise((res, rej) => reader.readEntries(res, rej)); if (!batch.length) return all; all.push(...batch); }
  };
  const walk = async entry => {
    if (entry.isFile) {
      const path = entry.fullPath.replace(/^\//, '');
      if (isAlFile(path) || isAppJson(path)) out.push({ path, file: await new Promise((res, rej) => entry.file(res, rej)) });
    } else if (entry === dirEntry || !SKIP_DIR_RE.test(entry.name)) {
      for (const c of await readAll(entry)) await walk(c);
    }
  };
  await walk(dirEntry);
  return out;
}
