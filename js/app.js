'use strict';

/* ---------- orchestration ---------- */
function recompute(keepSel) {
  const prev = keepSel && S.sel != null ? S.pairs[S.sel] : null;
  S.pairs = S.L && S.R ? pairApps(S.L, S.R) : [];
  computeStatuses();
  S.expanded.clear();
  if (prev) { const m = S.pairs.find(p => p.type === prev.type && p.name === prev.name); S.sel = m ? m.i : null; }
  if (S.sel == null || !S.pairs[S.sel]) { const f = S.pairs.find(p => p.status === 'modified') || S.pairs.find(p => p.status !== 'same') || S.pairs[0]; S.sel = f ? f.i : null; }
  renderAll();
}
function renderAll() {
  renderSlot('L'); renderSlot('R'); renderSummary(); renderTree(); renderView();
  const none = !S.pairs.length;
  $('copyBtn').disabled = none; $('csvBtn').disabled = none;
}

// read: async () => app; label is used in error messages
async function loadSide(side, label, read) {
  S.busy[side] = true; S.err[side] = ''; renderSlot(side);
  try { S[side] = await read(); }
  catch (e) { S[side] = null; S.err[side] = `${label}: ${e.message || e}`; }
  S.busy[side] = false;
  S.sel = null; recompute(false);
}
const loadFile = (side, file) => loadSide(side, file.name, () => readPackage(file));
// list may be an array or a promise of one (drag & drop walks the folder asynchronously)
const loadFolder = (side, name, list) => loadSide(side, name, async () => readFolder(name, await list));
async function loadTwo(files) {
  S.busy.L = S.busy.R = true; S.err.L = S.err.R = ''; renderSlot('L'); renderSlot('R');
  const res = await Promise.all(files.slice(0, 2).map(f => readPackage(f).then(a => ({ a }), e => ({ e: `${f.name}: ${e.message || e}` }))));
  S.busy.L = S.busy.R = false;
  let [x, y] = res;
  if (x.a && y.a && verCmp(x.a.manifest.attrs.Version, y.a.manifest.attrs.Version) > 0) [x, y] = [y, x];
  S.L = x.a || null; S.err.L = x.e || ''; S.R = y.a || null; S.err.R = y.e || '';
  S.sel = null; recompute(false);
}

function summaryRows() {
  return S.pairs.map(p => [LABEL[p.status], TYPE[p.type].one, p.id ?? '', p.L && p.R && p.L.name !== p.R.name ? `${p.L.name} → ${p.R.name}` : p.name]);
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 1800); }
