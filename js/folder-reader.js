'use strict';

/* ---------- AL project folder reading ---------- */
// A folder side is built from all of its files: .al files become objects (paired by type + name, so their paths
// don't matter); every other file is compared by path (text gets a diff, binary a same/different check).
// app.json also supplies the name/version shown in the slot.
const SKIP_DIR_RE = /^(\.alpackages|\.vscode|\.git|\.snapshots|\.output|node_modules)$/i;
const isAlFile = p => /\.al$/i.test(p);
const isAppJson = p => /(^|\/)app\.json$/i.test(p);
const MAX_FILE = 20 * 1024 * 1024;
// skip dot-files (.gitignore, …) and compiled .app packages sitting in the project
const wantFile = p => !/(^|\/)\.[^/]*$/.test(p) && !/\.app$/i.test(p);

// list: [{ path, file, handle? }] where path starts with the picked folder's name ("MyApp/src/Foo.Table.al").
// handle is a FileSystemFileHandle when the folder was opened with write access (see listFromHandle).
async function readFolder(folderName, list) {
  let appJson = null;
  const unreadable = [];
  const readOne = async ({ path, file, handle }) => {
    const segs = normPath(path).split('/');
    if (segs.slice(0, -1).some(s => SKIP_DIR_RE.test(s))) return null;
    const rel = segs.length > 1 ? segs.slice(1).join('/') : segs[0];
    if (!wantFile(rel)) return null;
    // One bad file must not fail the whole folder: OneDrive "online-only" files, locked files, or files that
    // changed after they were listed throw NotReadableError. Retry once with a fresh File from the handle, then skip.
    let buf = null;
    for (let attempt = 0; attempt < 2 && !buf; attempt++) {
      try {
        if (!file || attempt) file = handle ? await handle.getFile() : file;
        if (file.size > MAX_FILE) return null;
        buf = new Uint8Array(await file.arrayBuffer());
      } catch (e) { if (attempt || !handle) { unreadable.push(rel); return null; } }
    }
    if (isAppJson(rel) && (!appJson || segs.length < appJson.depth)) appJson = { depth: segs.length, buf };
    // binary by extension, or by a NUL byte near the start (unknown formats)
    if (BIN_RE.test(rel) || buf.subarray(0, 8000).includes(0)) return { path: rel, bin: true, data: buf, handle };
    // keep BOM and line-ending style so a save writes the file back the way it was
    const data = new TextDecoder().decode(buf);  // strips a UTF-8 BOM
    return { path: rel, bin: false, data, handle, bom: buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, crlf: data.includes('\r\n') };
  };
  // read a few files at a time: much faster on big folders, without opening thousands of reads at once
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (next < list.length) { const i = next++; out[i] = await readOne(list[i]); } }));
  const files = out.filter(Boolean);
  if (!files.length) throw new Error(unreadable.length
    ? `None of the ${unreadable.length} files could be read. If this folder is in OneDrive, right-click it and choose "Always keep on this device", then try again.`
    : 'No files found in this folder.');
  let manifest = null;
  if (appJson) { try { manifest = manifestFromAppJson(JSON.parse(new TextDecoder().decode(appJson.buf))); } catch {} }
  const app = folderApp(folderName, files, manifest, list.root, unreadable.sort());
  if (unreadable.length) toast(`${unreadable.length} file${unreadable.length > 1 ? 's' : ''} in "${folderName}" could not be read and were skipped`);
  return app;
}

// root: the folder's FileSystemDirectoryHandle (writable folders only), used to create new files
// unreadable: paths that were listed but could not be read (kept so the slot can warn about them)
function folderApp(folderName, files, manifest, root, unreadable = []) {
  const app = buildApp(folderName, files, true);
  app.isFolder = true;
  app.alFileCount = files.filter(f => isAlFile(f.path)).length;
  app.otherFileCount = files.length - app.alFileCount;
  app.srcFiles = files;
  app.writable = files.every(f => f.handle);
  app.root = root || null;
  app.unreadable = unreadable;
  if (manifest) app.manifest = manifest;
  return app;
}

/* ---------- saving edits back to the folder ---------- */
// Replace one object's text inside its .al file (a file can hold several objects) and write it to disk.
// Works the same for a non-AL text file, whose single "object" is the whole file.
// Returns the rebuilt folder app so the comparison can be refreshed.
async function saveObjectText(app, obj, newText) {
  const f = app.srcFiles.find(x => x.path === obj.path);
  if (!f?.handle) throw new Error('This folder was opened read-only. Open it with "Choose folder" or drag it in (Edge/Chrome) to edit.');
  const perm = { mode: 'readwrite' };
  if ((await f.handle.queryPermission?.(perm)) !== 'granted' && (await f.handle.requestPermission?.(perm)) !== 'granted')
    throw new Error('Permission to write the file was not granted.');
  const old = obj.text.replace(/\s+$/, '');
  const at = f.data.indexOf(old);
  if (at < 0) throw new Error('Could not find this object in its file. Reload the folder and try again.');
  let nt = newText.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (f.crlf) nt = nt.replace(/\n/g, '\r\n');
  const data = f.data.slice(0, at) + nt + f.data.slice(at + old.length);
  const w = await f.handle.createWritable();
  await w.write((f.bom ? '﻿' : '') + data);
  await w.close();
  f.data = data;
  return folderApp(app.fileName, app.srcFiles, app.manifest, app.root, app.unreadable);
}

// Write an object that only exists on the other side as a new .al file, at the same relative path it has there.
async function createObjectFile(app, relPath, text, objName) {
  if (!app.root) throw new Error('This folder was opened read-only. Open it with "Choose folder" or drag it in (Edge/Chrome) to edit.');
  const perm = { mode: 'readwrite' };
  if ((await app.root.queryPermission?.(perm)) !== 'granted' && (await app.root.requestPermission?.(perm)) !== 'granted')
    throw new Error('Permission to write to the folder was not granted.');
  let path = normPath(relPath || '').replace(/^\/+/, '');
  if (!path) path = 'src/' + objName.replace(/[^\w.-]+/g, '') + '.al';
  // the picked folder may be the src folder itself
  if (/^src\//i.test(path) && !app.srcFiles.some(f => /^src\//i.test(f.path))) path = path.slice(4);
  const taken = x => app.srcFiles.some(f => f.path.toLowerCase() === x.toLowerCase());
  for (let n = 2; taken(path); n++) path = path.replace(/(\.\d+)?\.al$/i, `.${n}.al`);
  const segs = path.split('/'), name = segs.pop();
  let dir = app.root;
  for (const s of segs) dir = await dir.getDirectoryHandle(s, { create: true });
  const handle = await dir.getFileHandle(name, { create: true });
  const crlf = app.srcFiles.some(f => f.crlf);  // follow the project's line endings
  let data = text.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
  if (crlf) data = data.replace(/\n/g, '\r\n');
  const w = await handle.createWritable();
  await w.write(data);
  await w.close();
  return folderApp(app.fileName, [...app.srcFiles, { path, bin: false, data, handle, bom: false, crlf }], app.manifest, app.root, app.unreadable);
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

// File System Access API (Edge/Chrome): walk a directory handle, keeping each file's handle so edits can be saved
const canPickWritable = 'showDirectoryPicker' in window;
async function listFromHandle(dirHandle) {
  const out = [];
  const walk = async (dir, prefix) => {
    for await (const [name, h] of dir.entries()) {
      const path = prefix + '/' + name;
      // the File is fetched later, when it is read (a File taken now can go stale while thousands of others are listed)
      if (h.kind === 'file') { if (wantFile(path)) out.push({ path, file: null, handle: h }); }
      else if (!SKIP_DIR_RE.test(name)) await walk(h, path);
    }
  };
  await walk(dirHandle, dirHandle.name);
  out.root = dirHandle;
  return out;
}

// drag & drop gives a FileSystemDirectoryEntry (read-only fallback); walk it, skipping tool/package folders
async function listFromEntry(dirEntry) {
  const out = [];
  const readAll = async dir => {
    const reader = dir.createReader(), all = [];
    for (;;) { const batch = await new Promise((res, rej) => reader.readEntries(res, rej)); if (!batch.length) return all; all.push(...batch); }
  };
  const walk = async entry => {
    if (entry.isFile) {
      const path = entry.fullPath.replace(/^\//, '');
      if (wantFile(path)) out.push({ path, file: await new Promise((res, rej) => entry.file(res, rej)) });
    } else if (entry === dirEntry || !SKIP_DIR_RE.test(entry.name)) {
      for (const c of await readAll(entry)) await walk(c);
    }
  };
  await walk(dirEntry);
  return out;
}
