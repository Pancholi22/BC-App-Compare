'use strict';

/* ---------- diff rows ---------- */
function buildRows(A, B) {
  const parts = Diff.diffArrays(A.map(normLine), B.map(normLine));
  const rows = []; let i = 0, j = 0;
  for (let k = 0; k < parts.length; k++) {
    const c = parts[k], cn = c.value.length;
    if (!c.added && !c.removed) { for (let x = 0; x < cn; x++) rows.push({ t: 'eq', l: i++, r: j++ }); }
    else if (c.removed) {
      const nx = parts[k+1];
      if (nx && nx.added) {
        const nn = nx.value.length, m = Math.max(cn, nn);
        for (let x = 0; x < m; x++) { const hl = x < cn, hr = x < nn; rows.push({ t: hl && hr ? 'chg' : hl ? 'del' : 'add', l: hl ? i + x : null, r: hr ? j + x : null }); }
        i += cn; j += nn; k++;
      } else for (let x = 0; x < cn; x++) rows.push({ t: 'del', l: i++, r: null });
    } else for (let x = 0; x < cn; x++) rows.push({ t: 'add', l: null, r: j++ });
  }
  let b = -1;
  rows.forEach((r, x) => { if (r.t !== 'eq') { if (x === 0 || rows[x-1].t === 'eq') b++; r.b = b; } });
  return { rows, blocks: b + 1 };
}

function intraline(a, b) {
  if (a.length > 3000 || b.length > 3000) return [[[0, a.length]], [[0, b.length]]];
  const parts = Diff.diffWordsWithSpace(a, b, { ignoreCase: S.opts.cs });
  const ml = [], mr = []; let pl = 0, pr = 0;
  for (const p of parts) {
    const len = p.value.length;
    if (p.removed) { if (!S.opts.ws || p.value.trim()) ml.push([pl, pl + len]); pl += len; }
    else if (p.added) { if (!S.opts.ws || p.value.trim()) mr.push([pr, pr + len]); pr += len; }
    else { pl += len; pr += len; }
  }
  return [ml, mr];
}
