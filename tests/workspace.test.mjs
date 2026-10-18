// node tests/workspace.test.mjs — domain rules + live-table sync against a fake Supabase client.
import { parseDeliverableRows, nextRevision, deliverablePatchForSubmission, isOverdue, sourceKey } from '../js/domain/deliverables.js';
import { projectPermissions } from '../js/domain/roles.js';
import { parseDateLoose, fmtDate } from '../js/ui/format.js';
import { createLiveTable } from '../js/lib/live-table.js';
import { ORIGIN } from '../js/lib/store.js';

let failed = 0;
const assert = (c, msg) => { console.log(c ? 'ok  ' : 'FAIL', msg); if (!c) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── domain ──────────────────────────────────────────────
assert(parseDateLoose('2026-09-20') === '2026-09-20' && parseDateLoose('20/09/2026') === '2026-09-20'
  && parseDateLoose('20 Sep 2026') === '2026-09-20' && parseDateLoose('20-Sep-26') === '2026-09-20', 'dates parse in common formats');
assert(parseDateLoose('31/02/2026') === null && parseDateLoose('soon') === null, 'invalid dates rejected');
assert(fmtDate('2026-09-05') === '05 Sep 2026' && fmtDate(null) === '—', 'dates display');

const pasted = 'Phase\tDeliverable\tSource\tRef\tBaseline\tHours\n'
  + 'Concept\tConcept report\tRFP\tRFP §3.1\t15/10/2026\t120\n'
  + 'Schematic\tSD drawings\tTechnical proposal\tTP 4.2\t2026-11-30\t1,250\n'
  + 'IFC\tIFC package\tscope\t\t\t\n'
  + 'Bad\t\tRFP\n'
  + 'Bad2\tX\tRFP\t\tnot a date\t';
const parsed = parseDeliverableRows(pasted);
assert(parsed.rows.length === 3, 'paste: 3 good rows, header skipped');
assert(parsed.rows[0].source === 'rfp' && parsed.rows[0].baseline_date === '2026-10-15' && parsed.rows[0].planned_hours === 120, 'paste: RFP row mapped');
assert(parsed.rows[1].source === 'proposal' && parsed.rows[1].planned_hours === 1250, 'paste: proposal row, thousands separator');
assert(parsed.rows[2].baseline_date === null && parsed.rows[2].planned_hours === null, 'paste: blanks stay empty');
assert(parsed.errors.length === 2, 'paste: 2 errors reported');
assert(sourceKey('VO-003') === 'vo' && sourceKey('Added by DM') === 'added' && sourceKey('') === 'scope', 'source keys');

assert(nextRevision([]) === 'Rev 00' && nextRevision([{ revision: 'Rev 00' }, { revision: 'Rev 03' }]) === 'Rev 04', 'next revision');
const d = { status: 'In Progress', actual_date: null };
assert(JSON.stringify(deliverablePatchForSubmission(d, { submitted_on: '2026-10-01', client_response: 'Pending' })) === JSON.stringify({ status: 'Submitted', actual_date: '2026-10-01' }), 'submission marks deliverable submitted');
assert(deliverablePatchForSubmission({ status: 'Submitted', actual_date: '2026-10-01' }, { submitted_on: '2026-10-01', client_response: 'Approved' }).status === 'Approved', 'client approval approves deliverable');
assert(deliverablePatchForSubmission({ status: 'Submitted', actual_date: 'x' }, { submitted_on: '2026-10-01', client_response: 'Revise & resubmit' }).status === 'In Progress', 'revise & resubmit reopens');
assert(Object.keys(deliverablePatchForSubmission(d, { submitted_on: null })).length === 0, 'no date → no change');
assert(isOverdue({ status: 'In Progress', baseline_date: '2026-01-01' }, '2026-10-18') && !isOverdue({ status: 'Submitted', baseline_date: '2026-01-01' }, '2026-10-18')
  && !isOverdue({ status: 'In Progress', baseline_date: '2026-01-01', forecast_date: '2026-12-01' }, '2026-10-18'), 'overdue rule uses forecast first');

const p = (g, r) => projectPermissions(g, r);
assert(p('management', null).canManage && p('admin', null).canDelete, 'management/admin manage everything');
assert(p('member', 'dm').canManage && p('member', 'ptm').canEdit && !p('member', 'ptm').canManage, 'DM manages, PTM edits');
assert(p('member', 'team').canRead && !p('member', 'team').canEdit && !p('member', null).canRead, 'team reads, stranger nothing');

// ── live-table against a fake client ────────────────────
function fakeClient(seed) {
  const db = new Map(seed.map((r) => [r.id, { ...r }]));
  const calls = [];
  const handlers = [];
  let statusCb;
  const from = (table) => {
    let op = 'select', payload = null; const eqs = [];
    const run = () => {
      calls.push({ table, op, payload, eqs: [...eqs] });
      if (op === 'select') return { data: [...db.values()].filter((r) => eqs.every(([c, v]) => r[c] === v)), error: null };
      if (op === 'insert') { [].concat(payload).forEach((r) => db.set(r.id, { ...r })); return { data: null, error: null }; }
      if (op === 'update') {
        const hit = [...db.values()].filter((r) => eqs.every(([c, v]) => r[c] === v));
        if (payload.title === 'FORBIDDEN') return { data: [], error: null };
        hit.forEach((r) => Object.assign(r, payload));
        return { data: hit.map((r) => ({ id: r.id })), error: null };
      }
      if (op === 'delete') { [...db.values()].filter((r) => eqs.every(([c, v]) => r[c] === v)).forEach((r) => db.delete(r.id)); return { data: null, error: null }; }
      return { data: null, error: null };
    };
    const b = {
      select() { return b; }, eq(c, v) { eqs.push([c, v]); return b; },
      insert(p) { op = 'insert'; payload = p; return b; }, update(p) { op = 'update'; payload = p; return b; }, delete() { op = 'delete'; return b; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] || null : r.data, error: r.error }); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  };
  return {
    db, calls,
    emit(event, row) { handlers.filter((h) => h.event === event).forEach((h) => h.cb(event === 'DELETE' ? { old: row } : { new: row })); },
    from,
    channel() { const ch = { on(_t, f, cb) { handlers.push({ event: f.event, cb }); return ch; }, subscribe(cb) { statusCb = cb; cb('SUBSCRIBED'); return ch; } }; return ch; },
    removeChannel() {},
  };
}

const sb = fakeClient([
  { id: 'd1', project_id: 'p1', title: 'Concept report', planned_hours: 120 },
  { id: 'd2', project_id: 'p1', title: 'SD drawings', planned_hours: 300 },
  { id: 'x9', project_id: 'p2', title: 'Other project', planned_hours: 1 },
]);
let rows = [], st = {};
const t = createLiveTable({ sb, table: 'deliverables', filter: { column: 'project_id', value: 'p1' }, codecs: { planned_hours: 'number' },
  sort: (a, b) => a.title.localeCompare(b.title), onChange: (r) => { rows = r; }, onStatus: (s) => { st = s; } });
await t.start();
assert(rows.length === 2 && rows[0].title === 'Concept report', 'loads only the filtered rows, sorted');

t.update('d1', { title: 'C' }, { typing: true });
t.update('d1', { title: 'Co' }, { typing: true });
t.update('d1', { title: 'Concept report v2' }, { typing: true });
assert(rows.find((r) => r.id === 'd1').title === 'Concept report v2' && st.saving, 'optimistic update + saving');
await sleep(300);
assert(!sb.calls.some((c) => c.op === 'update'), 'typing debounced');
sb.emit('UPDATE', { id: 'd1', project_id: 'p1', title: 'stale remote', planned_hours: 120 });
assert(rows.find((r) => r.id === 'd1').title === 'Concept report v2', 'pending local edit survives a remote update');
await sleep(500);
const ups = sb.calls.filter((c) => c.op === 'update');
assert(ups.length === 1 && ups[0].payload.title === 'Concept report v2' && ups[0].payload.updated_origin === ORIGIN, 'one write with the final text and origin');
assert(!st.saving, 'saved');

t.update('d2', { planned_hours: '' });
await sleep(120);
assert(sb.db.get('d2').planned_hours === null, 'number codec: empty → null');

sb.emit('UPDATE', { id: 'd2', project_id: 'p1', title: 'SD drawings (client)', planned_hours: 310 });
assert(rows.find((r) => r.id === 'd2').title === 'SD drawings (client)', 'remote update applied when nothing pending');

const newId = await t.insert({ project_id: 'p1', title: 'IFC package', planned_hours: '80' });
assert(rows.length === 3 && sb.db.get(newId).planned_hours === 80, 'insert with client id + codec');
sb.emit('DELETE', { id: newId });
assert(rows.length === 2, 'remote delete removes row');
sb.emit('DELETE', { id: 'x9' });
assert(rows.length === 2, 'delete for a row we never had is ignored');

t.update('d1', { title: 'FORBIDDEN' });
await sleep(150);
assert(st.error && rows.find((r) => r.id === 'd1').title === 'Concept report v2', 'RLS-refused update reported and rolled back');

await t.remove('d2');
assert(rows.length === 1 && !sb.db.has('d2'), 'remove');
t.close();

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
