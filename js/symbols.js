'use strict';

/* ---------- symbol helpers ---------- */
function tdName(td) {
  if (!td) return '';
  let s = td.Name || '';
  if (td.Subtype && td.Subtype.Name) s += ' "' + td.Subtype.Name + '"';
  if (Array.isArray(td.TypeArguments) && td.TypeArguments.length) s += ' of [' + td.TypeArguments.map(tdName).join(', ') + ']';
  if (td.Temporary) s += ' temporary';
  return s;
}
const propsStr = arr => (arr || []).map(p => `${p.Name} = ${p.Value}`).join('; ');
const sig = m => `(${(m.Parameters || []).map(p => (p.IsVar ? 'var ' : '') + p.Name + ': ' + tdName(p.TypeDefinition)).join('; ')})` + (m.ReturnTypeDefinition ? ': ' + tdName(m.ReturnTypeDefinition) : '');
const q = n => /^[A-Za-z_]\w*$/.test(n) ? n : `"${n}"`;
const NEST = ['Controls','Actions','DataItems','Columns','Elements','Nodes'];

function flatten(arr, out = [], depth = 0) {
  for (const c of arr || []) {
    out.push({ ...c, _depth: depth });
    for (const k of NEST) if (Array.isArray(c[k])) flatten(c[k], out, depth + 1);
  }
  return out;
}

function outline(type, s) {
  const L = ['// Generated from SymbolReference.json (this package does not include AL source)', `${type}${s.Id != null ? ' ' + s.Id : ''} ${q(s.Name || '')}`, '{'];
  for (const p of s.Properties || []) L.push(`    ${p.Name} = ${p.Value};`);
  for (const f of s.Fields || []) L.push(`    field(${f.Id}; ${q(f.Name)}; ${tdName(f.TypeDefinition)})${f.Properties?.length ? '  // ' + propsStr(f.Properties) : ''}`);
  for (const k of s.Keys || []) L.push(`    key(${q(k.Name || '')}; ${(k.FieldNames || []).map(q).join(', ')})`);
  for (const v of s.Values || []) L.push(`    value(${v.Id}; ${q(v.Name)})`);
  for (const v of s.Variables || []) L.push(`    var ${q(v.Name)}: ${tdName(v.TypeDefinition)};`);
  for (const m of s.Methods || []) L.push(`    procedure ${q(m.Name)}${sig(m)};`);
  for (const e of s.Events || []) L.push(`    event ${q(e.Name)}${sig(e)};`);
  for (const c of flatten(s.Controls)) L.push(`    ${'    '.repeat(c._depth)}control ${q(c.Name || '')}${c.TypeDefinition ? ': ' + tdName(c.TypeDefinition) : ''}`);
  for (const a of flatten(s.Actions)) L.push(`    ${'    '.repeat(a._depth)}action ${q(a.Name || '')}`);
  for (const p of s.Permissions || []) L.push(`    permission ${JSON.stringify(p)}`);
  L.push('}');
  return L.join('\n') + '\n';
}

const shallow = m => Object.fromEntries(Object.entries(m).filter(([k, v]) => k !== '_depth' && !(NEST.includes(k) && Array.isArray(v))));
const SEC = {
  Properties: { title: 'Object properties', key: m => m.Name, item: m => m.Name, val: m => String(m.Value) },
  Fields: { title: 'Fields', key: m => 'id' + m.Id, item: m => `${m.Id}  ${q(m.Name)}`, val: m => [tdName(m.TypeDefinition), propsStr(m.Properties)].filter(Boolean).join('  ·  ') },
  Keys: { title: 'Keys', key: m => m.Name, item: m => m.Name, val: m => [(m.FieldNames || []).join(', '), propsStr(m.Properties)].filter(Boolean).join('  ·  ') },
  Values: { title: 'Enum values', key: m => 'id' + m.Id, item: m => `${m.Id}  ${q(m.Name)}`, val: m => propsStr(m.Properties) || '—' },
  Methods: { title: 'Procedures', key: m => m.Name.toLowerCase(), item: m => m.Name, val: m => sig(m) + (m.Properties?.length ? '  ·  ' + propsStr(m.Properties) : '') },
  Events: { title: 'Events', key: m => m.Name.toLowerCase(), item: m => m.Name, val: m => sig(m) },
  Variables: { title: 'Global variables', key: m => m.Name.toLowerCase(), item: m => m.Name, val: m => tdName(m.TypeDefinition) },
  Controls: { title: 'Page controls', flat: true, key: m => String(m.Name).toLowerCase(), item: m => '  '.repeat(m._depth) + m.Name, val: m => [tdName(m.TypeDefinition), propsStr(m.Properties)].filter(Boolean).join('  ·  ') || '—' },
  Actions: { title: 'Actions', flat: true, key: m => String(m.Name).toLowerCase(), item: m => '  '.repeat(m._depth) + m.Name, val: m => propsStr(m.Properties) || '—' }
};
const genericSec = k => ({ title: k.replace(/([a-z])([A-Z])/g, '$1 $2'), flat: NEST.includes(k), key: m => m.Name != null ? String(m.Name).toLowerCase() : m.Id != null ? 'id' + m.Id : JSON.stringify(shallow(m)), item: m => m.Name ?? (m.Id != null ? '#' + m.Id : JSON.stringify(shallow(m)).slice(0, 80)), val: m => JSON.stringify(shallow(m)) });

function membersMap(arr, cfg) {
  const map = new Map(), seen = {};
  for (const m of cfg.flat ? flatten(arr) : (arr || [])) {
    let k = cfg.key(m);
    seen[k] = (seen[k] || 0) + 1;
    if (seen[k] > 1) k += '#' + seen[k];
    map.set(k, m);
  }
  return map;
}

function structureDiff(a, b) {
  const keys = new Set();
  for (const s of [a, b]) if (s) for (const [k, v] of Object.entries(s)) if (Array.isArray(v) && (v.length === 0 || typeof v[0] === 'object')) keys.add(k);
  const order = Object.keys(SEC);
  const list = [...keys].sort((x, y) => (order.indexOf(x) + 1 || 99) - (order.indexOf(y) + 1 || 99) || x.localeCompare(y));
  return list.map(k => {
    const cfg = SEC[k] || genericSec(k);
    return { title: cfg.title, ...diffMaps(membersMap(a?.[k], cfg), membersMap(b?.[k], cfg), cfg.item, cfg.val) };
  });
}

function diffMaps(ma, mb, item, val) {
  const rows = []; let same = 0;
  for (const [k, x] of ma) {
    const y = mb.get(k);
    if (!y) rows.push({ st: 'removed', item: item(x), l: val(x), r: '' });
    else { const vx = val(x), vy = val(y); if (vx !== vy || item(x) !== item(y)) rows.push({ st: 'modified', item: item(x) === item(y) ? item(y) : `${item(x)} → ${item(y)}`, l: vx, r: vy }); else same++; }
  }
  for (const [k, y] of mb) if (!ma.has(k)) rows.push({ st: 'added', item: item(y), l: '', r: val(y) });
  return { rows, same };
}

function manifestDiff(a, b) {
  const kv = o => new Map(Object.entries(o || {}));
  const list = arr => new Map((arr || []).map(x => [typeof x === 'string' ? x : (x.Id || x.Name), x]));
  const ident = x => x, depVal = d => `${d.Publisher || ''} ${d.Name || ''} ≥ ${d.MinVersion || d.Version || ''}`.trim();
  return [
    keyedSection('App', a.attrs, b.attrs),
    { title: 'Dependencies', ...diffMaps(list(a.deps), list(b.deps), d => d.Name || d.Id, depVal) },
    { title: 'Object ID ranges', ...diffMaps(list(a.idRanges), list(b.idRanges), ident, ident) },
    { title: 'Features', ...diffMaps(list(a.features), list(b.features), ident, ident) },
    keyedSection('Resource exposure policy', a.rep, b.rep),
    keyedSection('Build', a.build, b.build)
  ];
}
// attribute-style sections: each row is labelled with the attribute name
function keyedSection(title, a, b) {
  const ma = new Map(Object.entries(a || {})), mb = new Map(Object.entries(b || {}));
  const rows = []; let same = 0;
  for (const [k, v] of ma) { if (!mb.has(k)) rows.push({ st: 'removed', item: k, l: v, r: '' }); else if (mb.get(k) !== v) rows.push({ st: 'modified', item: k, l: v, r: mb.get(k) }); else same++; }
  for (const [k, v] of mb) if (!ma.has(k)) rows.push({ st: 'added', item: k, l: '', r: v });
  return { title, rows, same };
}
