'use strict';

/* ---------- rendering: tree ---------- */
function visiblePairs() {
  const q = S.q.trim().toLowerCase();
  return S.pairs.filter(p => S.filter[p.status] && (!q ||
    p.name.toLowerCase().includes(q) || String(p.id ?? '').includes(q) ||
    (p.L && p.L.name.toLowerCase().includes(q)) || (p.L?.path || '').toLowerCase().includes(q) || (p.R?.path || '').toLowerCase().includes(q)));
}
function renderSummary() {
  const c = { added: 0, removed: 0, modified: 0, same: 0 };
  for (const p of S.pairs) c[p.status]++;
  $('summary').innerHTML = STATUS.map(s => `<button type="button" class="chip ${s}" data-f="${s}" aria-pressed="${S.filter[s]}" title="Show or hide ${LABEL[s].toLowerCase()} items"><b>${c[s]}</b><span>${LABEL[s]}</span></button>`).join('');
}
function renderTree() {
  const el = $('tree');
  if (!S.pairs.length) { el.innerHTML = `<div class="tree-empty">${S.L || S.R ? 'Load the second package to see differences.' : 'Load two packages to start.'}</div>`; return; }
  const vis = visiblePairs();
  if (!vis.length) { el.innerHTML = '<div class="tree-empty">Nothing matches the current filters.</div>'; return; }
  const groups = new Map();
  for (const p of vis) { if (!groups.has(p.type)) groups.set(p.type, []); groups.get(p.type).push(p); }
  let html = '';
  for (const [type, list] of groups) {
    const diffs = list.filter(p => p.status !== 'same').length, closed = S.closed.has(type);
    html += `<div class="grp"><button type="button" class="ghead${closed ? ' closed' : ''}" data-g="${type}" aria-expanded="${!closed}"><span class="chev">▾</span>${TYPE[type].many}<span class="cnt">${diffs ? diffs + ' of ' : ''}${list.length}</span></button>`;
    if (!closed) for (const p of list) {
      const isFile = p.kind === 'file';
      const nm = p.L && p.R && p.L.name !== p.R.name ? `${p.L.name} → ${p.R.name}` : p.name;
      html += `<button type="button" class="row ${p.status}${isFile ? ' noid' : ''}${isDirty(p) ? ' dirty' : ''}${S.sel === p.i ? ' sel' : ''}" data-i="${p.i}" title="${esc(LABEL[p.status] + ': ' + nm)}"><span class="st ${p.status}">${GLYPH[p.status]}</span>${isFile ? '' : `<span class="id">${p.id ?? ''}</span>`}<span class="nm">${esc(nm)}</span></button>`;
    }
    html += '</div>';
  }
  el.innerHTML = html;
}
