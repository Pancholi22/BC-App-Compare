'use strict';

/* ---------- merging: copy changes between sides, edit the folder side in place ---------- */
// Only a folder side opened with write access can change. Unsaved edits live in S.drafts (one per object),
// and the diff, statuses and tree all read through textOf(), so edits show up immediately.
// Nothing touches the disk until saveAll().
const otherSide = s => s === 'L' ? 'R' : 'L';
const sideWord = s => s === 'L' ? 'left' : 'right';
const canEdit = side => !!(S[side]?.isFolder && S[side].writable);
const draftKey = (side, o) => side + '|' + o.type + '|' + o.path + '|' + o.name.toLowerCase();
const draftOf = (p, side) => p[side] ? S.drafts.get(draftKey(side, p[side])) : null;
const draftDirty = d => !!d && d.text !== d.orig;
const isDirty = p => draftDirty(draftOf(p, 'L')) || draftDirty(draftOf(p, 'R'));
const dirtyCount = () => [...S.drafts.values()].filter(draftDirty).length;
// a side can receive code if it is editable and the other side has real text (not a symbol outline or a binary file)
const canTake = (p, to) => { const src = p[otherSide(to)]; return canEdit(to) && !!src && !src.fromSymbols && !src.bin && !p[to]?.bin; };

function textOf(p, side) {
  const o = p[side];
  if (!o) return null;
  const d = draftOf(p, side);
  return d ? d.text : o.text;
}
const linesOf = (p, side) => { const t = textOf(p, side); return t == null ? [] : t.replace(/\r?\n$/, '').split(/\r?\n/); };

function setLines(p, side, lines, pushUndo = true) {
  const o = p[side], k = draftKey(side, o);
  let d = S.drafts.get(k);
  if (!d) { const orig = o.text.replace(/\r\n/g, '\n'); d = { orig, text: orig, undo: [] }; S.drafts.set(k, d); }
  if (pushUndo) { d.undo.push(d.text); S.typing = null; }
  d.text = lines.join('\n') + '\n';
}

// refresh statuses, tree and the view after an edit, keeping scroll position and (optionally) the caret
function afterChange(focus) {
  clearTimeout(S.typingTimer);
  computeStatuses(); renderSummary(); renderTree();
  const w = $('diffwrap'), st = w ? w.scrollTop : 0;
  renderView();
  const w2 = $('diffwrap'); if (w2) w2.scrollTop = st;
  if (focus) {
    const el = document.querySelector(`td.ed[data-side="${focus.side}"][data-ln="${focus.ln}"]`);
    if (el) { el.focus({ preventScroll: true }); placeCaret(el, focus.off); }
  }
}

/* ---------- copy actions ---------- */
// copy change block b (as numbered by buildRows in the current view) onto side `to`
function copyBlock(b, to, jump) {
  const p = S.pairs[S.sel], rows = S.rows;
  if (!p || !canTake(p, to) || b < 0) return;
  const from = otherSide(to), fk = from === 'L' ? 'l' : 'r', tk = to === 'L' ? 'l' : 'r';
  const blk = rows.filter(r => r.b === b); if (!blk.length) return;
  const src = linesOf(p, from), dst = linesOf(p, to);
  const sIdx = blk.map(r => r[fk]).filter(v => v != null), dIdx = blk.map(r => r[tk]).filter(v => v != null);
  let at = dIdx[0];
  if (at == null) {  // nothing on the target side: insert after the last target line before the block
    at = 0;
    for (let x = rows.indexOf(blk[0]) - 1; x >= 0; x--) if (rows[x][tk] != null) { at = rows[x][tk] + 1; break; }
  }
  dst.splice(at, dIdx.length, ...sIdx.map(i => src[i]));
  setLines(p, to, dst);
  afterChange();
  if (jump && S.blocks) goTo(Math.min(b, S.blocks - 1));  // the copied block is gone, so b is now the next one
}

function copyAll(to) {
  const p = S.pairs[S.sel];
  if (!p || !canTake(p, to) || !p[to]) return;
  setLines(p, to, linesOf(p, otherSide(to)));
  afterChange();
}

async function createInFolder(to) {
  const p = S.pairs[S.sel], src = p && p[otherSide(to)];
  if (!src || p[to] || !canTake(p, to)) return;
  try {
    S[to] = await createObjectFile(S[to], src.path, textOf(p, otherSide(to)), src.name);
    recompute(true);
    toast('Created ' + S[to].srcFiles[S[to].srcFiles.length - 1].path);
  } catch (e) { toast(e.message || String(e)); }
}

function undo() {
  const p = S.pairs[S.sel]; if (!p) return;
  for (const s of ['R', 'L']) {
    const d = draftOf(p, s);
    if (d?.undo.length) { d.text = d.undo.pop(); S.typing = null; afterChange(); return; }
  }
}

function revert() {
  const p = S.pairs[S.sel]; if (!p || !isDirty(p)) return;
  if (!confirm('Throw away the unsaved changes to this object?')) return;
  for (const s of ['L', 'R']) if (p[s]) S.drafts.delete(draftKey(s, p[s]));
  afterChange();
}

async function saveAll() {
  const dirty = [...S.drafts].filter(([, d]) => draftDirty(d));
  if (!dirty.length) return;
  clearTimeout(S.typingTimer);
  const btn = $('saveBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  let n = 0;
  try {
    for (const [k, d] of dirty) {
      const side = k[0], o = [...S[side].objects, ...S[side].files].find(x => draftKey(side, x) === k);
      if (!o) throw new Error('An edited object could not be found any more. Reload the folder.');
      S[side] = await saveObjectText(S[side], o, d.text);
      S.drafts.delete(k); n++;
    }
    toast(`Saved ${n} object${n > 1 ? 's' : ''} to the folder`);
  } catch (e) { toast(e.message || String(e)); }
  for (const [k, d] of [...S.drafts]) if (!draftDirty(d)) S.drafts.delete(k);
  recompute(true);
}

// before replacing or swapping packages: returns false if the user wants to keep unsaved edits
function dropDrafts() {
  if (dirtyCount() && !confirm('You have unsaved changes. Discard them?')) return false;
  S.drafts.clear();
  return true;
}

/* ---------- toolbar + per-block arrows ---------- */
function mergeTools(p) {
  const sides = ['L', 'R'].filter(canEdit);
  if (!sides.length) return '';
  let h = '';
  for (const to of sides) {
    const from = otherSide(to), arrow = to === 'R' ? '→' : '←';
    if (!canTake(p, to)) continue;
    if (p[to]) h += `<button class="btn" type="button" data-takeall="${to}" title="Replace the ${sideWord(to)} side with the whole ${sideWord(from)} object">Copy all ${arrow}</button>`;
    else h += `<button class="btn" type="button" data-create="${to}" title="Write this object as a new .al file in the ${sideWord(to)} folder">Create in ${sideWord(to)} folder ${arrow}</button>`;
  }
  const undoable = ['L', 'R'].some(s => draftOf(p, s)?.undo.length), n = dirtyCount();
  h += `<button class="btn" type="button" id="undoBtn" ${undoable ? '' : 'disabled'} title="Undo (Ctrl+Z)">Undo</button>`;
  if (isDirty(p)) h += `<button class="btn" type="button" id="revertBtn" title="Throw away unsaved changes to this object">Revert</button>`;
  h += `<button class="btn primary" type="button" id="saveBtn" ${n ? '' : 'disabled'} title="Write all unsaved changes to the folder (Ctrl+S)">Save${n ? ` (${n})` : ''}</button>`;
  return `<div class="merge">${h}</div>`;
}

function blockArrows(p, b) {
  let h = '';
  if (canTake(p, 'R') && p.R) h += `<button type="button" class="take" data-take="${b}" data-to="R" title="Copy this change to the right (Alt+→)">→</button>`;
  if (canTake(p, 'L') && p.L) h += `<button type="button" class="take" data-take="${b}" data-to="L" title="Copy this change to the left (Alt+←)">←</button>`;
  return h;
}

/* ---------- inline editing of the folder side ---------- */
function caretIn(el) {
  const s = getSelection();
  if (!s.rangeCount || !el.contains(s.anchorNode)) return 0;
  const r = document.createRange(); r.selectNodeContents(el); r.setEnd(s.anchorNode, s.anchorOffset);
  return r.toString().length;
}
function placeCaret(el, off) {
  const s = getSelection(), r = document.createRange(), w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { if (off <= n.length) { r.setStart(n, off); r.collapse(true); s.removeAllRanges(); s.addRange(r); return; } off -= n.length; }
  r.selectNodeContents(el); r.collapse(false); s.removeAllRanges(); s.addRange(r);
}
const cellText = td => td.textContent.replace(/ /g, ' ');

// typing updates the draft at once; the diff re-renders after a short pause (or at once for a multi-line paste)
document.addEventListener('input', e => {
  const td = e.target.closest?.('td.ed'); if (!td) return;
  const p = S.pairs[S.sel], side = td.dataset.side, ln = +td.dataset.ln, key = side + ':' + ln;
  const parts = cellText(td).split(/\r?\n/), lines = linesOf(p, side);
  if (S.lineSel) { S.lineSel = null; paintSel(); }
  let off = caretIn(td), li = 0;
  while (li < parts.length - 1 && off > parts[li].length) { off -= parts[li].length + 1; li++; }
  setLines(p, side, [...lines.slice(0, ln), ...parts, ...lines.slice(ln + 1)], S.typing !== key);
  S.typing = key;
  clearTimeout(S.typingTimer);
  if (parts.length > 1) { S.typing = null; afterChange({ side, ln: ln + li, off }); return; }
  S.typingTimer = setTimeout(() => {
    const a = document.activeElement;
    afterChange(a?.matches?.('td.ed') ? { side: a.dataset.side, ln: +a.dataset.ln, off: caretIn(a) } : null);
  }, 600);
});

/* ---------- line selection + toggle comment (Ctrl+/) ---------- */
// Each editable line is its own contenteditable, so a native selection can't span lines.
// Shift+↑/↓ and Shift+click build a line selection instead: S.lineSel = { i, side, anchor, head }.
function selRange(p, side) {
  const s = S.lineSel;
  return s && s.i === p.i && s.side === side ? [Math.min(s.anchor, s.head), Math.max(s.anchor, s.head)] : null;
}
const lineSelected = (p, side, idx) => { const r = selRange(p, side); return !!r && r[0] !== r[1] && idx >= r[0] && idx <= r[1]; };
function paintSel() {
  const p = S.pairs[S.sel]; if (!p) return;
  document.querySelectorAll('td.ed').forEach(td => td.classList.toggle('lsel', lineSelected(p, td.dataset.side, +td.dataset.ln)));
}
function extendSel(p, side, from, to) {
  const s = S.lineSel;
  S.lineSel = { i: p.i, side, anchor: s && s.i === p.i && s.side === side ? s.anchor : from, head: to };
  paintSel();
}

// line comment, or [open, close] wrapped around each line, picked from the file type
const COMMENT_STYLES = [
  [/\.(xml|xlf|html?|svg|rdlc?|config|xsd|resx|xaml)$/i, '<!--', '-->'], [/\.(css|less|scss)$/i, '/*', '*/'],
  [/\.(ps1|psm1|py|ya?ml|sh|toml|rb|r|gitignore)$/i, '#'], [/\.(ini|cfg|inf)$/i, ';'], [/\.sql$/i, '--']
];
function commentStyle(p) {
  if (p.kind !== 'object') for (const [re, open, close] of COMMENT_STYLES) if (re.test(p.name)) return [open, close];
  return ['//'];
}
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cellOf = node => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.('td.ed');

// lines a line command acts on: the line selection, a native selection spanning lines, or just the caret's line
function targetRange(p, side, ln) {
  const s = getSelection(), ca = cellOf(s.anchorNode), cf = cellOf(s.focusNode);
  if (ca && cf && ca !== cf && ca.dataset.side === side && cf.dataset.side === side) return [+ca.dataset.ln, +cf.dataset.ln].sort((x, y) => x - y);
  return selRange(p, side) || [ln, ln];
}
const isMultiSel = (p, side, ln) => { const [a, b] = targetRange(p, side, ln); return a !== b; };

/* ---------- multi-line commands: delete, cut/copy, indent ---------- */
function deleteLines(p, side, a, b) {
  const lines = linesOf(p, side);
  lines.splice(a, b - a + 1);
  if (!lines.length) lines.push('');
  const ln = Math.min(a, lines.length - 1);
  setLines(p, side, lines);
  S.lineSel = { i: p.i, side, anchor: ln, head: ln };
  afterChange({ side, ln, off: 0 });
}
function copyText(text) {
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove(); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(fallback); else fallback();
}
// Tab / Shift+Tab on a selection: add or remove one indent level (4 spaces, or a tab) on every non-blank line
function indentLines(p, side, a, b, out, focusLn, off) {
  const lines = linesOf(p, side);
  let shift = 0;
  for (let i = a; i <= b; i++) {
    const before = lines[i];
    if (out) lines[i] = lines[i].replace(/^( {1,4}|\t)/, '');
    else if (lines[i].trim()) lines[i] = '    ' + lines[i];
    if (i === focusLn) shift = lines[i].length - before.length;
  }
  setLines(p, side, lines);
  afterChange({ side, ln: focusLn, off: Math.max(0, off + shift) });
}

// like VS Code: if every non-blank selected line is commented, uncomment them; otherwise comment them all at
// the smallest indentation of the selection
function toggleComment(td) {
  const p = S.pairs[S.sel], side = td.dataset.side, ln = +td.dataset.ln;
  const [a, b] = targetRange(p, side, ln);
  const lines = linesOf(p, side), [open, close] = commentStyle(p);
  const idx = []; for (let i = a; i <= b && i < lines.length; i++) if (lines[i].trim()) idx.push(i);
  if (!idx.length) return;
  const prefix = new RegExp(`^(\\s*)${escRe(open)} ?`);
  const full = close ? new RegExp(`^(\\s*)${escRe(open)} ?(.*?) ?${escRe(close)}\\s*$`) : prefix;
  const uncomment = idx.every(i => full.test(lines[i]));
  const before = lines[ln] ?? '', off = caretIn(td);
  let shift = 0;  // how far the caret's line moved, so the caret stays on the same character
  if (uncomment) {
    for (const i of idx) {
      const m = prefix.exec(lines[i]);
      if (i === ln) shift = m[1].length - m[0].length;
      lines[i] = close ? lines[i].replace(full, '$1$2') : lines[i].replace(prefix, '$1');
    }
  } else {
    const ind = Math.min(...idx.map(i => /^\s*/.exec(lines[i])[0].length));
    for (const i of idx) lines[i] = lines[i].slice(0, ind) + open + ' ' + lines[i].slice(ind) + (close ? ' ' + close : '');
    if (idx.includes(ln) && off >= ind) shift = open.length + 1;
  }
  setLines(p, side, lines);
  const after = lines[ln] ?? '';
  afterChange({ side, ln, off: before === after ? off : Math.max(0, Math.min(after.length, off + shift)) });
}

document.addEventListener('mousedown', e => {
  const td = e.target.closest?.('td.ed'); if (!td) return;
  const p = S.pairs[S.sel], side = td.dataset.side, ln = +td.dataset.ln;
  if (e.shiftKey) {
    const cur = cellOf(document.activeElement);
    e.preventDefault();
    extendSel(p, side, cur && cur.dataset.side === side ? +cur.dataset.ln : ln, ln);
    td.focus();
  } else {
    S.lineSel = { i: p.i, side, anchor: ln, head: ln }; paintSel();
    if (e.button === 0) dragFrom = { side, ln };
  }
});

// dragging the mouse across editable lines selects them (the browser can't select across separate editable cells)
let dragFrom = null;
document.addEventListener('mouseover', e => {
  if (!dragFrom) return;
  if (!(e.buttons & 1)) { dragFrom = null; return; }
  const td = e.target.closest?.('td.ed');
  if (!td || td.dataset.side !== dragFrom.side) return;
  const p = S.pairs[S.sel], ln = +td.dataset.ln;
  if (S.lineSel?.head !== ln) extendSel(p, dragFrom.side, dragFrom.ln, ln);
});
document.addEventListener('mouseup', () => {
  if (!dragFrom) return;
  dragFrom = null;
  // leave a plain caret instead of the partial text highlight the browser drew in the first line
  const p = S.pairs[S.sel], s = getSelection();
  if (p && S.lineSel && S.lineSel.anchor !== S.lineSel.head && s.rangeCount) s.collapseToStart();
});

document.addEventListener('keydown', e => {
  const td = e.target.closest?.('td.ed'); if (!td) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && !e.altKey && (e.code === 'Slash' || e.key === '/')) { e.preventDefault(); toggleComment(td); return; }
  const p = S.pairs[S.sel], side = td.dataset.side, ln = +td.dataset.ln;
  const [a, b] = targetRange(p, side, ln), multi = a !== b;
  if (mod && e.shiftKey && k === 'k') { e.preventDefault(); deleteLines(p, side, a, b); return; }  // VS Code: delete line(s)
  if (multi && mod && !e.shiftKey && (k === 'c' || k === 'x')) {
    e.preventDefault();
    copyText(linesOf(p, side).slice(a, b + 1).join('\n') + '\n');
    if (k === 'x') deleteLines(p, side, a, b); else toast(`Copied ${b - a + 1} lines`);
    return;
  }
  if (multi && !mod && !e.altKey) {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteLines(p, side, a, b); return; }
    if (e.key === 'Tab') { e.preventDefault(); indentLines(p, side, a, b, e.shiftKey, ln, caretIn(td)); return; }
  }
  if (!multi && e.key === 'Tab' && e.shiftKey && !mod) { e.preventDefault(); indentLines(p, side, ln, ln, true, ln, caretIn(td)); return; }
  if (mod || e.altKey) return;
  if (!e.shiftKey && S.lineSel && e.key !== 'Shift') {
    // any other key drops a multi-line selection (it only drives Ctrl+/)
    const had = lineSelected(p, side, ln); S.lineSel = { i: p.i, side, anchor: ln, head: ln }; if (had) paintSel();
  }
  const lines = linesOf(p, side), t = lines[ln] ?? '', off = caretIn(td), collapsed = getSelection().isCollapsed;
  const edit = (nl, focus) => { e.preventDefault(); setLines(p, side, nl); afterChange(focus); };
  if (e.key === 'Enter') edit([...lines.slice(0, ln), t.slice(0, off), t.slice(off), ...lines.slice(ln + 1)], { side, ln: ln + 1, off: 0 });
  else if (e.key === 'Backspace' && collapsed && off === 0 && ln > 0)
    edit([...lines.slice(0, ln - 1), lines[ln - 1] + t, ...lines.slice(ln + 1)], { side, ln: ln - 1, off: lines[ln - 1].length });
  else if (e.key === 'Delete' && collapsed && off === t.length && ln < lines.length - 1)
    edit([...lines.slice(0, ln), t + lines[ln + 1], ...lines.slice(ln + 2)], { side, ln, off });
  else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const to = ln + (e.key === 'ArrowUp' ? -1 : 1);
    const next = document.querySelector(`td.ed[data-side="${side}"][data-ln="${to}"]`);
    if (next) {
      e.preventDefault();
      if (e.shiftKey) extendSel(p, side, ln, to);
      next.focus(); placeCaret(next, Math.min(off, cellText(next).length));
    }
  }
  else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); document.execCommand('insertText', false, '    '); }
});

window.addEventListener('beforeunload', e => { if (dirtyCount()) e.preventDefault(); });
