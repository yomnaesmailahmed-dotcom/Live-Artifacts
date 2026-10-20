// Reads .xlsx and .csv files in the browser with no library: an .xlsx is a zip of XML files, and browsers can
// inflate zip entries themselves (DecompressionStream). Returns plain text cells; formulas give their cached value.
// Limits keep a hostile file from hanging the page.

const MAX_ENTRY_BYTES = 60 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLS = 60;

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function listZip(buf) {
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This is not a valid .xlsx file.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const entries = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('The .xlsx file is damaged.');
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method, size, usize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    has: (name) => entries.has(name),
    names: () => [...entries.keys()],
    async text(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.usize > MAX_ENTRY_BYTES) throw new Error('The file is too large to read.');
      const nameLen = v.getUint16(e.local + 26, true), extraLen = v.getUint16(e.local + 28, true);
      const start = e.local + 30 + nameLen + extraLen;
      const raw = u8.subarray(start, start + e.size);
      if (e.method === 0) return dec.decode(raw);
      if (e.method === 8) return dec.decode(await inflateRaw(raw));
      throw new Error('Unsupported compression in this .xlsx file.');
    },
  };
}

// Small purpose-built XML readers (the file is untrusted; no DOM, no entity expansion beyond the five basics).
const unescapeXml = (t) => String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const attr = (tag, name) => { const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag); return m ? unescapeXml(m[1]) : ''; };
const textOf = (xmlText) => [...String(xmlText).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');
const colIndex = (ref) => {
  const letters = (String(ref).match(/^[A-Z]+/i) || [''])[0].toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsx(buf) {
  const zip = listZip(buf);
  if (!zip.has('xl/workbook.xml')) throw new Error('This is not an Excel workbook.');
  const wb = await zip.text('xl/workbook.xml');
  const rels = (await zip.text('xl/_rels/workbook.xml.rels')) || '';
  const target = new Map([...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const strings = zip.has('xl/sharedStrings.xml')
    ? [...(await zip.text('xl/sharedStrings.xml')).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    : [];
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\s[^>]*>/g)) {
    if (attr(m[0], 'state') === 'hidden') continue;
    let path = target.get(attr(m[0], 'r:id')) || '';
    path = path.startsWith('/') ? path.slice(1) : `xl/${path}`;
    const body = await zip.text(path);
    if (!body) continue;
    const rows = [];
    for (const rm of body.matchAll(/<row(\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
      const r = Number(attr(rm[1] || '', 'r')) - 1;
      if (!(r >= 0) || r >= MAX_ROWS) continue;
      const cells = [];
      for (const cm of rm[2].matchAll(/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = colIndex(attr(cm[1] || '', 'r'));
        if (col < 0 || col >= MAX_COLS) continue;
        const t = attr(cm[1] || '', 't'), inner = cm[2] || '';
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        let val = '';
        if (t === 's') val = strings[Number(v && v[1])] || '';
        else if (t === 'inlineStr') val = textOf(inner);
        else if (v) val = unescapeXml(v[1]);
        if (t === 'b') val = val === '1' ? 'TRUE' : 'FALSE';
        cells[col] = String(val).trim();
      }
      rows[r] = Array.from(cells, (x) => x || '');
    }
    const dense = Array.from(rows, (r) => r || []);
    while (dense.length && !dense[dense.length - 1].some(Boolean)) dense.pop();
    sheets.push({ name: attr(m[0], 'name') || `Sheet ${sheets.length + 1}`, rows: dense });
  }
  return sheets;
}

export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const delim = [',', '\t', ';'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < src.length && rows.length < MAX_ROWS; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(Boolean)) rows.push(row.slice(0, MAX_COLS));
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean) && rows.length < MAX_ROWS) rows.push(row.slice(0, MAX_COLS));
  return rows;
}

// Any supported file → [{ name, rows }]
export async function readTable(file) {
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return readXlsx(await file.arrayBuffer());
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) return [{ name: 'Sheet 1', rows: parseCsv(await file.text()) }];
  if (name.endsWith('.xls')) throw new Error('Old .xls files aren’t supported. Save it as .xlsx or .csv and try again.');
  throw new Error('Choose an Excel (.xlsx) or CSV file.');
}
