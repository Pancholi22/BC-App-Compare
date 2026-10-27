'use strict';

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button, i[data-goto]');
  if (!t) return;
  if (t.dataset.pick) $('file' + t.dataset.pick).click();
  else if (t.dataset.pickdir) $('dir' + t.dataset.pickdir).click();
  else if (t.dataset.f) { S.filter[t.dataset.f] = !S.filter[t.dataset.f]; renderSummary(); renderTree(); }
  else if (t.dataset.g) { S.closed.has(t.dataset.g) ? S.closed.delete(t.dataset.g) : S.closed.add(t.dataset.g); renderTree(); }
  else if (t.dataset.i != null) { S.sel = +t.dataset.i; renderTree(); renderView(); }
  else if (t.dataset.tab) { if (!t.disabled) { S.tab = t.dataset.tab; renderView(); } }
  else if (t.dataset.fold) { S.expanded.add(t.dataset.fold); const w = $('diffwrap'), st = w ? w.scrollTop : 0; renderCode(S.pairs[S.sel]); if ($('diffwrap')) $('diffwrap').scrollTop = st; }
  else if (t.dataset.goto != null) goTo(+t.dataset.goto);
  else if (t.id === 'nextBtn') goTo(S.block + 1);
  else if (t.id === 'prevBtn') goTo(S.block < 0 ? S.blocks - 1 : S.block - 1);
  else if (t.id === 'swapBtn') { [S.L, S.R] = [S.R, S.L]; [S.err.L, S.err.R] = [S.err.R, S.err.L]; recompute(true); }
  else if (t.id === 'copyBtn') {
    const a = S.L.manifest.attrs, b = S.R.manifest.attrs, c = { added: 0, removed: 0, modified: 0, same: 0 };
    S.pairs.forEach(p => c[p.status]++);
    const txt = [`BC App Compare`, `Left:  ${a.Name || S.L.fileName} ${a.Version || ''} (${a.Publisher || ''})`, `Right: ${b.Name || S.R.fileName} ${b.Version || ''} (${b.Publisher || ''})`,
      `Added ${c.added} · Removed ${c.removed} · Modified ${c.modified} · Same ${c.same}`, '', 'Status\tType\tID\tName',
      ...summaryRows().filter(r => r[0] !== 'Same').map(r => r.join('\t'))].join('\n');
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Summary copied'); } catch { toast('Copy failed'); } ta.remove(); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Summary copied'), fallback); else fallback();
  }
  else if (t.id === 'csvBtn') {
    const cell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const csv = [['Status','Type','ID','Name'], ...summaryRows()].map(r => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `compare_${(S.L.manifest.attrs.Version || 'L')}_vs_${(S.R.manifest.attrs.Version || 'R')}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fileL' || t.id === 'fileR') { const f = t.files[0]; if (f) loadFile(t.id.slice(-1), f); t.value = ''; }
  else if (t.id === 'dirL' || t.id === 'dirR') {
    const list = listFromInput(t.files);
    if (list.length) loadFolder(t.id.slice(-1), list[0].path.split('/')[0], list);
    t.value = '';
  }
  else if (t.id === 'optFold') { S.opts.fold = t.checked; renderCode(S.pairs[S.sel]); }
  else if (t.id === 'optWs' || t.id === 'optCs') { S.opts[t.id === 'optWs' ? 'ws' : 'cs'] = t.checked; computeStatuses(); renderSummary(); renderTree(); renderView(); }
});
$('search').addEventListener('input', e => { S.q = e.target.value; renderTree(); });

document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if ((k === 'n' || e.key === 'F8') && !e.shiftKey) { e.preventDefault(); goTo(S.block + 1); }
  else if (k === 'p' || (e.key === 'F8' && e.shiftKey)) { e.preventDefault(); goTo(S.block < 0 ? S.blocks - 1 : S.block - 1); }
  else if (k === 'j' || k === 'k') {
    const vis = visiblePairs(); if (!vis.length) return;
    let ix = vis.findIndex(p => p.i === S.sel); ix = k === 'j' ? Math.min(vis.length - 1, ix + 1) : Math.max(0, ix - 1);
    S.sel = vis[ix].i; renderTree(); renderView();
    document.querySelector('.row.sel')?.scrollIntoView({ block: 'nearest' });
  }
});

// drag & drop: on a slot loads that side; anywhere else, two items fill both sides.
// A dropped folder is read as AL source; a folder + .app dropped together puts the .app left, the folder right.
let dragDepth = 0;
const isFileDrag = e => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragover', e => { if (!isFileDrag(e)) return; e.preventDefault(); const s = e.target.closest('.slot'); document.querySelectorAll('.slot').forEach(x => x.classList.toggle('drag', x === s)); });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.querySelectorAll('.slot').forEach(x => x.classList.remove('drag')); });
document.addEventListener('drop', e => {
  if (!isFileDrag(e)) return;
  e.preventDefault(); document.querySelectorAll('.slot').forEach(x => x.classList.remove('drag'));
  const slot = e.target.closest('.slot');
  // entries must be taken synchronously; the DataTransfer is emptied once this handler returns
  const entries = [...(e.dataTransfer.items || [])].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  const dirs = entries.filter(en => en.isDirectory);
  if (dirs.length) {
    const appEntry = entries.find(en => en.isFile && /\.app$/i.test(en.name));
    const appFile = appEntry && [...e.dataTransfer.files].find(f => f.name === appEntry.name);
    if (appFile && !slot) { loadFile('L', appFile); loadFolder('R', dirs[0].name, listFromEntry(dirs[0])); }
    else loadFolder(slot ? slot.dataset.side : (!S.L ? 'L' : 'R'), dirs[0].name, listFromEntry(dirs[0]));
    return;
  }
  const files = [...e.dataTransfer.files]; if (!files.length) return;
  if (files.length >= 2) loadTwo(files);
  else if (slot) loadFile(slot.dataset.side, files[0]);
  else loadFile(!S.L ? 'L' : 'R', files[0]);
});
window.addEventListener('resize', () => requestAnimationFrame(drawRuler));
if (inFrame) $('csvBtn').hidden = true;
