'use strict';

/* ---------- pairing ---------- */
function normLine(l) {
  if (S.opts.ws) l = l.replace(/\s+/g, ' ').trim();
  if (S.opts.cs) l = l.toLowerCase();
  return l;
}
const normText = t => t == null ? null : t.split(/\r?\n/).map(normLine).join('\n').replace(/\n+$/, '');

const PKG_ONLY_RE = /^(\[content_types\]\.xml|navxmanifest\.xml|symbolreference\.json|mediaidlisting\.xml|doccomments\.xml|_rels\/.*)$/i;
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
  // a file the other folder could not read would otherwise show up as added/removed
  const readable = (list, other) => { const bad = new Set((other.unreadable || []).map(x => x.toLowerCase())); return bad.size ? list.filter(f => !bad.has(f.path.toLowerCase())) : list; };
  A = { ...A, files: readable(A.files, B) }; B = { ...B, files: readable(B.files, A) };
  if (A.isFolder === B.isFolder) match(A.files, B.files, 'file', [o => o.path.toLowerCase()]);
  else {
    // .app vs folder: leave out what only the compiler produces (manifest, symbols, …) and the folder's app.json,
    // then pair by path, by path without a leading src/ (the picked folder may be src itself), then by unique file name
    const keep = (app, f) => app.isFolder ? !isAppJson(f.path) : !PKG_ONLY_RE.test(f.path);
    const fa = A.files.filter(f => keep(A, f)), fb = B.files.filter(f => keep(B, f));
    const lc = o => o.path.toLowerCase(), base = o => lc(o).split('/').pop();
    const count = list => list.reduce((m, o) => m.set(base(o), (m.get(base(o)) || 0) + 1), new Map());
    const ca = count(fa), cb = count(fb);
    match(fa, fb, 'file', [lc, o => lc(o).replace(/^src\//, ''), o => ca.get(base(o)) <= 1 && cb.get(base(o)) <= 1 ? base(o) : null]);
  }
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
    else p.status = normText(textOf(p, 'L')) === normText(textOf(p, 'R')) && p.L.name === p.R.name && p.L.id === p.R.id ? 'same' : 'modified';
  }
}
