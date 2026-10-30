'use strict';

/* ---------- state ---------- */
const S = {
  L: null, R: null, err: { L: '', R: '' }, busy: { L: false, R: false },
  pairs: [], sel: null, filter: { added: true, removed: true, modified: true, same: true }, q: '',
  closed: new Set(), opts: { ws: false, cs: false, fold: false }, tab: 'code', expanded: new Set(), block: -1, blocks: 0, rows: [],
  drafts: new Map(), typing: null, typingTimer: 0, lineSel: null  // unsaved folder edits, see merge.js
};
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
