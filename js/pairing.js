'use strict';

/* ---------- pairing ---------- */
function normLine(l) {
  if (S.opts.ws) l = l.replace(/\s+/g, ' ').trim();
  if (S.opts.cs) l = l.toLowerCase();
  return l;
}
const normText = t => t == null ? null : t.split(/\r?\n/).map(normLine).join('\n').replace(/\n+$/, '');

function pairApps(A, B) {
  const pairs = [];
  const mk = (L, R, kind) => ({ kind, type: (R || L).type, L, R, id: (R || L).id, name: (R || L).name });
  const match = (la, ra, kind, keyFns) => {
    const used = new Set(); let pending = la.slice();
    for (const kf of keyFns) {
      const idx = new Map();
      ra.forEach((o, i) => { const k = kf(o); if (k != null && !used.has(i) && !idx.has(k)) idx.set(k, i); });
      const rest = [];
      for (const o of pending) {
        const k = kf(o), i = k != null ? idx.get(k) : undefined;
        if (i != null && !used.has(i)) { used.add(i); pairs.push(mk(o, ra[i], kind)); } else rest.push(o);
      }
      pending = rest;
    }
    for (const o of pending) pairs.push(mk(o, null, kind));
    ra.forEach((o, i) => { if (!used.has(i)) pairs.push(mk(null, o, kind)); });
  };
  match(A.objects, B.objects, 'object', [o => o.type + '|' + o.name.toLowerCase(), o => o.id != null ? o.type + '|' + o.id : null]);
  // a source folder has no package files (manifest, symbols, …), so only compare those between two .app files
  if (!A.isFolder && !B.isFolder) match(A.files, B.files, 'file', [o => o.path.toLowerCase()]);
  pairs.sort((x, y) => TYPE[x.type].order - TYPE[y.type].order || (x.id ?? 1e12) - (y.id ?? 1e12) || x.name.localeCompare(y.name));
  pairs.forEach((p, i) => p.i = i);
  return pairs;
}

function bytesEq(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
function computeStatuses() {
  for (const p of S.pairs) {
    if (!p.L) p.status = 'added';
    else if (!p.R) p.status = 'removed';
    else if (p.L.bin || p.R.bin) p.status = (p.L.bin && p.R.bin && bytesEq(p.L.bytes, p.R.bytes)) ? 'same' : 'modified';
    else p.status = normText(p.L.text) === normText(p.R.text) && p.L.name === p.R.name && p.L.id === p.R.id ? 'same' : 'modified';
  }
}
