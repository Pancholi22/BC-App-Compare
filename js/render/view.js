'use strict';

/* ---------- rendering: view ---------- */
function renderView() {
  const v = $('view');
  if (!S.L || !S.R) {
    v.innerHTML = `<div class="msg"><h3>${S.L || S.R ? 'One more package' : 'Compare two .app packages'}</h3><p>Drop the older version on the left box and the newer version on the right. You can also drop both files at once anywhere on the page.</p><p>Either side can also be an AL project folder (the folder with app.json, or its src folder) to compare source against a built .app.</p><p>Everything runs in your browser. The files are never uploaded.</p></div>`;
    return;
  }
  const p = S.pairs[S.sel];
  if (!p) { v.innerHTML = '<div class="msg"><h3>Pick an item</h3><p>Choose an object from the list to see its differences.</p></div>'; return; }
  const isManifest = p.kind === 'file' && /(^|\/)navxmanifest\.xml$/i.test(p.name);
  // a source folder has no symbols, so a structure diff against it would show every member as added/removed
  const hasStruct = (p.kind === 'object' && (p.L?.sym || p.R?.sym) && !S.L.isFolder && !S.R.isFolder) || isManifest;
  if (!hasStruct && S.tab === 'struct') S.tab = 'code';
  const notes = [];
  if (p.L && p.R && p.L.name !== p.R.name) notes.push(`Renamed from "${p.L.name}"`);
  if (p.L && p.R && p.L.id !== p.R.id && p.kind === 'object') notes.push(`ID changed ${p.L.id} → ${p.R.id}`);
  if ((p.L?.fromSymbols || p.R?.fromSymbols)) notes.push('No source in package: comparing symbol outline');
  const pth = o => o ? esc(o.path || '') : '<i>not in this package</i>';
  if (isDirty(p)) notes.push('Unsaved changes');
  const showCode = S.tab === 'code';
  v.innerHTML = `
    <div class="vhead">
      <span class="typebadge">${TYPE[p.type].one}</span>
      ${p.kind === 'object' && p.id != null ? `<span class="vid">${p.id}</span>` : ''}
      <h2>${esc(p.name)}</h2>
      <span class="pill ${p.status}">${LABEL[p.status]}</span>
      ${notes.map(n => `<span class="note">${esc(n)}</span>`).join('')}
      <div class="paths"><span title="${p.L ? esc(p.L.path) : ''}">L: ${pth(p.L)}</span><span title="${p.R ? esc(p.R.path) : ''}">R: ${pth(p.R)}</span></div>
    </div>
    <div class="vtools">
      <div class="tabs" role="tablist">
        <button type="button" class="tab" role="tab" data-tab="code" aria-selected="${S.tab === 'code'}">${p.kind === 'object' ? 'Code' : 'Content'}</button>
        <button type="button" class="tab" role="tab" data-tab="struct" aria-selected="${S.tab === 'struct'}" ${hasStruct ? '' : 'disabled title="No symbol information for this item"'}>Structure</button>
      </div>
      ${showCode ? mergeTools(p) : ''}
      <div class="opts" ${showCode ? '' : 'hidden'}>
        <label class="toggle"><input type="checkbox" id="optFold" ${S.opts.fold ? 'checked' : ''}>Only changes</label>
        <label class="toggle"><input type="checkbox" id="optWs" ${S.opts.ws ? 'checked' : ''}>Ignore whitespace</label>
        <label class="toggle"><input type="checkbox" id="optCs" ${S.opts.cs ? 'checked' : ''}>Ignore case</label>
      </div>
      <div class="nav" ${showCode ? '' : 'hidden'}>
        <button class="btn" type="button" id="prevBtn" title="Previous change (P)">↑ Prev</button>
        <span class="counter" id="counter"></span>
        <button class="btn" type="button" id="nextBtn" title="Next change (N)">Next ↓</button>
      </div>
    </div>
    <div id="notice"></div>
    <div class="vbody" id="vbody"></div>`;
  if (S.tab === 'struct') renderStructure(p, isManifest); else renderCode(p);
}

function renderCode(p) {
  const body = $('vbody');
  S.block = -1; S.blocks = 0;
  if ((p.L && p.L.bin) || (p.R && p.R.bin)) {
    const sz = o => o ? `${o.bytes ? o.bytes.length.toLocaleString() : 0} bytes` : 'not present';
    body.innerHTML = `<div class="msg"><h3>Binary file</h3><p>Left: ${sz(p.L)}<br>Right: ${sz(p.R)}</p><p>${p.status === 'same' ? 'The two files are byte-for-byte identical.' : 'The files differ.'}</p></div>`;
    updateCounter(); return;
  }
  // lines come through textOf(), so unsaved edits are included
  const A = linesOf(p, 'L'), B = linesOf(p, 'R');
  const { rows, blocks } = buildRows(A, B);
  S.blocks = blocks; S.rows = rows;
  // folder sides opened for writing are editable in place; the middle column holds per-change copy arrows
  const ed = { L: canEdit('L') && !!p.L, R: canEdit('R') && !!p.R };
  const arrows = (canTake(p, 'L') && p.L) || (canTake(p, 'R') && p.R), cols = arrows ? 5 : 4;
  const lang = langOf(p), big = A.length + B.length > 60000;
  const tA = big ? [] : tokenize(A, lang), tB = big ? [] : tokenize(B, lang);
  let fold = S.opts.fold;
  if (!fold && rows.length > 6000) { fold = true; $('notice').innerHTML = '<div class="notice">Large file: unchanged lines are collapsed.</div>'; }

  // decide which eq rows are hidden behind fold rows
  const CTX = 3, show = new Array(rows.length).fill(true);
  if (fold) {
    const near = new Array(rows.length).fill(false);
    rows.forEach((r, x) => { if (r.t !== 'eq') for (let d = -CTX; d <= CTX; d++) if (rows[x+d]) near[x+d] = true; });
    rows.forEach((r, x) => { if (r.t === 'eq' && !near[x]) show[x] = false; });
  }
  const cell = (side, idx, lines, toks, marks) => idx == null ? `<td class="ln"></td><td class="cd ${side} gap"></td>`
    : ed[side] ? `<td class="ln">${idx + 1}</td><td class="cd ${side} ed${lineSelected(p, side, idx) ? ' lsel' : ''}" contenteditable="plaintext-only" spellcheck="false" data-side="${side}" data-ln="${idx}">${lines[idx] ? paint(lines[idx], toks[idx], marks) : '<br>'}</td>`
    : `<td class="ln">${idx + 1}</td><td class="cd ${side}">${paint(lines[idx], toks[idx], marks)}</td>`;
  let html = `<table class="diff"><colgroup><col class="ln"><col>${arrows ? '<col class="mg">' : ''}<col class="ln"><col></colgroup><tbody>`;
  for (let x = 0; x < rows.length; x++) {
    if (!show[x]) {
      let y = x; while (y < rows.length && !show[y]) y++;
      const key = p.i + ':' + x;
      if (S.expanded.has(key)) { for (let z = x; z < y; z++) show[z] = true; }
      else { html += `<tr class="fold"><td colspan="${cols}"><button type="button" data-fold="${key}">⋯ ${y - x} unchanged line${y - x > 1 ? 's' : ''} · show</button></td></tr>`; x = y - 1; continue; }
    }
    const r = rows[x];
    let ml = null, mr = null;
    if (r.t === 'chg') [ml, mr] = intraline(A[r.l], B[r.r]);
    const mid = arrows ? `<td class="mg">${r.b != null && (x === 0 || rows[x-1].b !== r.b) ? blockArrows(p, r.b) : ''}</td>` : '';
    html += `<tr class="r-${r.t}"${r.b != null ? ` data-b="${r.b}"` : ''}>${cell('L', r.l, A, tA, ml)}${mid}${cell('R', r.r, B, tB, mr)}</tr>`;
  }
  html += '</tbody></table>';
  if (!A.length && !B.length) html = '<div class="msg"><p>Empty file.</p></div>';
  body.innerHTML = `<div class="diffwrap" id="diffwrap">${html}</div><div class="ruler" id="ruler" aria-hidden="true"></div>`;
  updateCounter();
  requestAnimationFrame(drawRuler);
}

function drawRuler() {
  const wrap = $('diffwrap'), ruler = $('ruler');
  if (!wrap || !ruler) return;
  const total = wrap.scrollHeight || 1; let html = '';
  for (let b = 0; b < S.blocks; b++) {
    const trs = wrap.querySelectorAll(`tr[data-b="${b}"]`); if (!trs.length) continue;
    const first = trs[0], last = trs[trs.length - 1];
    const top = first.offsetTop / total * 100, h = (last.offsetTop + last.offsetHeight - first.offsetTop) / total * 100;
    const kinds = new Set([...trs].map(t => t.className.slice(2)));
    const k = kinds.has('chg') || (kinds.has('del') && kinds.has('add')) ? 'chg' : kinds.has('del') ? 'del' : 'add';
    html += `<i class="${k}" data-goto="${b}" style="top:${top}%;height:${h}%"></i>`;
  }
  ruler.innerHTML = html;
}

function updateCounter() {
  const c = $('counter'); if (!c) return;
  c.textContent = !S.blocks ? 'No changes' : S.block < 0 ? `${S.blocks} change${S.blocks > 1 ? 's' : ''}` : `${S.block + 1} of ${S.blocks}`;
  $('prevBtn').disabled = !S.blocks; $('nextBtn').disabled = !S.blocks;
}
function goTo(b) {
  const wrap = $('diffwrap'); if (!wrap || !S.blocks) return;
  S.block = (b + S.blocks) % S.blocks;
  wrap.querySelectorAll('tr.cur').forEach(t => t.classList.remove('cur'));
  const trs = wrap.querySelectorAll(`tr[data-b="${S.block}"]`);
  trs.forEach(t => t.classList.add('cur'));
  if (trs[0]) wrap.scrollTo({ top: Math.max(0, trs[0].offsetTop - wrap.clientHeight / 3), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  updateCounter();
}

function renderStructure(p, isManifest) {
  const sections = isManifest ? manifestDiff(S.L.manifest, S.R.manifest) : structureDiff(p.L?.sym, p.R?.sym);
  const changed = sections.filter(s => s.rows.length);
  let html = '';
  if (!changed.length) html = `<p class="ok">No structural changes. ${sections.reduce((n, s) => n + s.same, 0)} members compared.</p>`;
  for (const s of changed) {
    html += `<h3>${esc(s.title)} <small>${s.rows.length} changed${s.same ? ` · ${s.same} unchanged` : ''}</small></h3>
      <div class="tw"><table class="sd"><thead><tr><th style="width:90px">Change</th><th>Item</th><th>Left</th><th>Right</th></tr></thead><tbody>` +
      s.rows.map(r => `<tr class="${r.st}"><td><span class="pill ${r.st}">${LABEL[r.st]}</span></td><td class="it">${esc(r.item)}</td><td class="v l">${esc(r.l)}</td><td class="v r">${esc(r.r)}</td></tr>`).join('') +
      '</tbody></table></div>';
  }
  $('vbody').innerHTML = `<div class="struct">${html}</div>`;
}
