// node tests/import.test.mjs — reading .xlsx / .csv and mapping sheet columns onto the registers.
import { deflateRawSync } from 'node:zlib';
import { readXlsx, parseCsv } from '../js/lib/xlsx-reader.js';
import { detectTarget, mapColumns, buildRows, splitDuplicates, toIsoDate } from '../js/domain/import-map.js';

let failed = 0;
const assert = (c, msg) => { console.log(c ? 'ok  ' : 'FAIL', msg); if (!c) failed++; };

// ── a tiny .xlsx writer (zip with one stored and the rest deflated entries) ──
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  files.forEach(([name, text], i) => {
    const raw = Buffer.from(text), method = i === 0 ? 0 : 8, data = method ? deflateRawSync(raw) : raw, nameB = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(method, 8); h.writeUInt32LE(crc32(raw), 14);
    h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nameB.length, 26);
    parts.push(h, nameB, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(method, 10); c.writeUInt32LE(crc32(raw), 16);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameB.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameB);
    offset += 30 + nameB.length + data.length;
  });
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  const out = Buffer.concat([...parts, cd, end]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
}
const wbXml = '<workbook><sheets><sheet name="Deliverables" sheetId="1" r:id="rId1"/><sheet name="Secret" state="hidden" sheetId="2" r:id="rId2"/></sheets></workbook>';
const rels = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>';
const shared = '<sst><si><t>Phase</t></si><si><t>Deliverable</t></si><si><t>Baseline date</t></si><si><t>Hours</t></si><si><t>Concept</t></si><si><t>Report &amp; drawings</t></si><si><r><t>Site </t></r><r><t>plan</t></r></si></sst>';
const sheet1 = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>
<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2"><v>46000</v></c><c r="D2"><v>120</v></c></row>
<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="s"><v>6</v></c><c r="C3" t="inlineStr"><is><t>15/11/2026</t></is></c><c r="D3"/></row>
<row r="5"><c r="B5" t="inlineStr"><is><t>Bad date row</t></is></c><c r="C5" t="inlineStr"><is><t>soon</t></is></c></row>
</sheetData></worksheet>`;
const xlsx = zip([['[Content_Types].xml', '<Types/>'], ['xl/workbook.xml', wbXml], ['xl/_rels/workbook.xml.rels', rels], ['xl/sharedStrings.xml', shared], ['xl/worksheets/sheet1.xml', sheet1], ['xl/worksheets/sheet2.xml', '<worksheet/>']]);

const sheets = await readXlsx(xlsx);
assert(sheets.length === 1 && sheets[0].name === 'Deliverables', 'reads visible sheets only');
const t = sheets[0].rows;
assert(t[0].join('|') === 'Phase|Deliverable|Baseline date|Hours', 'header row read from shared strings');
assert(t[1][1] === 'Report & drawings' && t[2][1] === 'Site plan', 'XML entities and rich-text runs decoded');
assert(t[1][2] === '46000' && t[2][2] === '15/11/2026', 'numbers and inline strings read');
assert(t.length === 5 && t[3].length === 0, 'blank rows kept in place');

let threw = false; try { await readXlsx(new ArrayBuffer(100)); } catch (_) { threw = true; }
assert(threw, 'a non-xlsx file is rejected');

assert(parseCsv('a,b\n"x, y","say ""hi"""\n')[1].join('|') === 'x, y|say "hi"', 'CSV quotes handled');
assert(parseCsv('a;b;c\n1;2;3')[1].join('|') === '1|2|3' && parseCsv('﻿a\tb\n1\t2')[0][0] === 'a', 'CSV delimiter detected, BOM dropped');

assert(toIsoDate('46000').value === '2025-12-09' && toIsoDate('2026-10-20').value === '2026-10-20' && toIsoDate('20/10/2026').value === '2026-10-20', 'dates: Excel serial and text');
assert(toIsoDate('soon').error === 'soon' && toIsoDate('').value === null, 'bad / empty date');

assert(detectTarget(t) === 'deliverables', 'sheet recognised as deliverables');
assert(detectTarget([['Action', 'Owner', 'Due date', 'Status']]) === 'actions', 'sheet recognised as actions');
assert(detectTarget([['Milestone', 'Baseline start', 'Baseline finish', 'Forecast']]) === 'milestones', 'sheet recognised as milestones');
assert(detectTarget([['Month', 'Component', 'Cumulative hours']]) === 'hours', 'sheet recognised as hours');
const m = mapColumns('deliverables', t);
assert(m.mapping.find((x) => x.field === 'title').col === 1 && m.mapping.find((x) => x.field === 'baseline_date').col === 2 && m.mapping.find((x) => x.field === 'planned_hours').col === 3, 'columns mapped by header name');

const d = buildRows('deliverables', t);
assert(d.rows.length === 2 && d.total === 3 && d.errors.length === 1 && /Row 5.*soon/.test(d.errors[0]), 'two good rows, bad date reported with its row');
assert(d.rows[0].baseline_date === '2025-12-09' && d.rows[0].planned_hours === 120 && d.rows[0].source === 'scope' && d.rows[1].baseline_date === '2026-11-15', 'values converted');

const dup = splitDuplicates('deliverables', d.rows, [{ phase: 'concept', title: 'report & drawings' }]);
assert(dup.fresh.length === 1 && dup.duplicates.length === 1, 'rows already in the project are skipped');
assert(splitDuplicates('deliverables', [d.rows[0], d.rows[0]], []).fresh.length === 1, 'repeats inside the file are skipped');

const ms = buildRows('milestones', [['Milestone', 'Type', 'Start', 'Finish'], ['Concept', 'client review', '2026-01-10', '2026-01-01'], ['Detail', 'Phase', '2026-01-01', '2026-03-01']]);
assert(ms.rows.length === 1 && ms.errors.length === 1 && ms.rows[0].kind === 'Phase', 'milestone with start after finish rejected; kind matched');
const ac = buildRows('actions', [['Action', 'Owner', 'Start', 'Due', 'Status'], ['Send drawings', 'Sara', '2026-02-10', '2026-02-01', 'in progress']]);
assert(ac.rows[0].start_on === '2026-02-01' && ac.rows[0].status === 'In Progress' && ac.rows[0].owner_name === 'Sara', 'action start pulled back to due; status matched');
const hr = buildRows('hours', [['Month', 'Component', 'Cumulative hours', 'Progress %'], ['2026-09', 'C01', '1,250', '40%'], ['2026-09', 'ZZ', '5', ''], ['10/2026', '', '300', '']], { components: [{ code: 'C01', id: 'c1' }] });
assert(hr.rows.length === 2 && hr.rows[0].cumulative_hours === 1250 && hr.rows[0].progress_pct === 40 && hr.rows[0].period === '2026-09-01' && hr.rows[0].component_id === 'c1', 'hours rows converted');
assert(hr.errors.length === 1 && /ZZ/.test(hr.errors[0]) && hr.rows[1].period === '2026-10-01' && hr.rows[1].component_id === null, 'unknown component reported; project-total row kept');
assert(!buildRows('deliverables', [['Foo', 'Bar'], ['1', '2']]).ready, 'unrelated sheet is not importable');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
