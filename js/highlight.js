'use strict';

/* ---------- AL / generic highlighting ---------- */
const KW = new Set(('begin end if then else case of for to downto do while repeat until exit var procedure trigger local internal protected true false not and or xor div mod with in ' +
  'table tableextension page pageextension pagecustomization codeunit report reportextension xmlport query enum enumextension interface permissionset permissionsetextension controladdin profile entitlement ' +
  'field fields key keys area group part systempart action actions layout dataitem dataset column requestpage rendering labels value namespace using extends implements foreach break continue temporary ' +
  'addfirst addlast addafter addbefore modify movefirst movelast moveafter movebefore cuegroup repeater fieldgroup fieldgroups views view separator customaction fileuploadaction label event elements schema textelement fieldelement tableelement fieldattribute textattribute').split(' '));
const TY = new Set(('record integer decimal text code boolean date time datetime guid option biginteger duration char byte blob media mediaset recordid recordref fieldref keyref ' +
  'jsonobject jsonarray jsontoken jsonvalue httpclient httpcontent httpheaders httprequestmessage httpresponsemessage textbuilder list dictionary instream outstream errorinfo notification dialog ' +
  'secrettext filterpagebuilder xmldocument xmlelement xmlnode xmlnodelist xmlattribute variant action testpage').split(' '));

function tokenize(lines, lang) {
  const out = []; let inBlock = false, inXmlC = false;
  for (const line of lines) {
    const toks = [];
    if (line.length > 4000) { out.push(toks); continue; }
    let i = 0; const n = line.length;
    while (i < n) {
      if (inBlock) { const e = line.indexOf('*/', i); const end = e < 0 ? n : e + 2; toks.push([i, end, 'c']); i = end; if (e >= 0) inBlock = false; continue; }
      if (inXmlC) { const e = line.indexOf('-->', i); const end = e < 0 ? n : e + 3; toks.push([i, end, 'c']); i = end; if (e >= 0) inXmlC = false; continue; }
      const ch = line[i], nx = line[i+1];
      if (lang !== 'xml' && ch === '/' && nx === '/') { toks.push([i, n, 'c']); break; }
      if (lang !== 'xml' && ch === '/' && nx === '*') { inBlock = true; continue; }
      if (lang === 'xml' && line.startsWith('<!--', i)) { inXmlC = true; continue; }
      if (ch === "'" && lang !== 'xml') {
        let j = i + 1;
        while (j < n) { if (line[j] === "'") { if (lang === 'al' && line[j+1] === "'") { j += 2; continue; } break; } if (line[j] === '\\' && lang !== 'al') j++; j++; }
        toks.push([i, Math.min(j + 1, n), 's']); i = j + 1; continue;
      }
      if (ch === '"') {
        let j = i + 1;
        while (j < n && line[j] !== '"') { if (line[j] === '\\' && lang !== 'al') j++; j++; }
        toks.push([i, Math.min(j + 1, n), lang === 'al' ? 'q' : 's']); i = j + 1; continue;
      }
      if (/[0-9]/.test(ch) && !/[\w]/.test(line[i-1] || '')) { const m = /^\d+(\.\d+)?/.exec(line.slice(i, i + 40)); toks.push([i, i + m[0].length, 'n']); i += m[0].length; continue; }
      if (/[A-Za-z_]/.test(ch)) {
        const m = /^[A-Za-z_]\w*/.exec(line.slice(i, i + 80)); const w = m[0].toLowerCase();
        if (lang === 'al') { if (KW.has(w)) toks.push([i, i + w.length, 'k']); else if (TY.has(w)) toks.push([i, i + w.length, 'y']); }
        else if (lang === 'js' && /^(function|return|const|let|var|if|else|for|while|new|this|class|true|false|null|undefined|typeof|async|await)$/.test(w)) toks.push([i, i + w.length, 'k']);
        i += m[0].length; continue;
      }
      i++;
    }
    out.push(toks);
  }
  return out;
}
function langOf(p) {
  if (p.kind === 'object') return 'al';
  const n = p.name.toLowerCase();
  if (/\.(js|ts|json)$/.test(n)) return 'js';
  if (/\.(xml|xlf|html?|svg|rdlc|rdl)$/.test(n)) return 'xml';
  if (/\.css$/.test(n)) return 'css';
  return 'txt';
}

function paint(text, toks, marks) {
  if (!text) return ' ';
  if ((!toks || !toks.length) && (!marks || !marks.length)) return esc(text);
  const n = text.length, cls = new Array(n).fill(''), mk = new Uint8Array(n);
  for (const [a, b, c] of toks || []) for (let i = a; i < b && i < n; i++) cls[i] = c;
  for (const [a, b] of marks || []) for (let i = a; i < b && i < n; i++) mk[i] = 1;
  let html = '', i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && cls[j] === cls[i] && mk[j] === mk[i]) j++;
    let seg = esc(text.slice(i, j));
    if (cls[i]) seg = `<span class="${cls[i]}">${seg}</span>`;
    if (mk[i]) seg = `<mark>${seg}</mark>`;
    html += seg; i = j;
  }
  return html;
}
