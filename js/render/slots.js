'use strict';

/* ---------- rendering: slots ---------- */
function verCmp(a, b) {
  const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
  for (let i = 0; i < 4; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}
function renderSlot(side) {
  const el = $('slot' + side), app = S[side];
  const tag = side === 'L' ? 'Left · older' : 'Right · newer';
  el.classList.toggle('filled', !!app);
  if (S.busy[side]) { el.innerHTML = `<div class="info"><span class="side-tag">${tag}</span><span class="pkg-meta">Reading…</span></div>`; return; }
  if (!app) {
    el.innerHTML = `<div class="info"><span class="side-tag">${tag}</span><span class="pkg-name">Drop a .app file or source folder here</span>` +
      (S.err[side] ? `<span class="pkg-err">${esc(S.err[side])}</span>` : `<span class="pkg-meta">or choose one from your computer</span>`) +
      `</div><div class="acts"><button class="btn primary" type="button" data-pick="${side}">Choose .app</button>` +
      `<button class="btn" type="button" data-pickdir="${side}">Choose folder</button></div>`;
    return;
  }
  const a = app.manifest.attrs;
  const meta = (app.isFolder
    ? ['Source folder', app.fileName !== a.Name && app.fileName, a.Publisher, `${app.objects.length} objects in ${app.alFileCount} .al files`]
    : [a.Publisher, a.Runtime && 'Runtime ' + a.Runtime, a.Application && 'BC ' + a.Application, a.Target,
      `${app.objects.length} objects`, app.hasSource ? 'source included' : 'symbols only (no source)']).filter(Boolean).join(' · ');
  el.innerHTML = `<div class="info"><span class="side-tag">${tag}${app.isFolder ? ' · <em>folder</em>' : ''}</span>
    <span class="pkg-name" title="${esc(app.fileName)}">${esc(a.Name || app.fileName)}<span class="ver">${esc(a.Version || '')}</span></span>
    <span class="pkg-meta" title="${esc(meta)}">${esc(meta)}</span></div>
    <div class="acts"><button class="btn" type="button" data-pick="${side}">.app</button><button class="btn" type="button" data-pickdir="${side}">Folder</button></div>`;
}
