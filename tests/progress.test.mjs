// node tests/progress.test.mjs — money + completion rules and the per-client rollup.
import { moneyFigures, clientRollup, fmtMoney, fmtPct } from '../js/domain/progress.js';

let failed = 0;
const assert = (c, msg) => { console.log(c ? 'ok  ' : 'FAIL', msg); if (!c) failed++; };

const f = moneyFigures({ fee_total: 1000000, invoiced_to_date: 300000, cost_to_date: 450000, completion_pct: 40, approved_pct: 25 }, { consumed_pct: 55 });
assert(f.remaining === 700000, 'fee remaining = fee − invoiced');
assert(f.earned === 400000, 'earned value = fee × completion');
assert(f.billedPct === 30 && f.costPct === 45, 'billed and cost percentages');
assert(f.margin === 550000, 'margin = fee − cost');
assert(f.awaitingGap === 15, 'delivered 40% but client approved 25% → 15 points awaiting');
assert(f.burnGap === 15, 'hours 55% vs completion 40% → burning 15 points ahead');
assert(f.billingGap === -10, 'invoiced 30% vs delivered 40% → 10 points under-billed');

const empty = moneyFigures(null, null);
assert(empty.fee === 0 && empty.completion === null && empty.billedPct === null && empty.burnGap === null, 'no data → nulls, no NaN');

assert(fmtMoney(1234567, 'SAR') === '1,234,567 SAR' && fmtMoney(null) === '—', 'money format');
assert(fmtPct(33.333) === '33.3%' && fmtPct(null) === '—', 'percent format');

const clients = [{ id: 'c1', name: 'NHC' }, { id: 'c2', name: 'Sedra' }];
const projects = [
  { id: 'p1', client_id: 'c1', budget_hours: 1000 }, { id: 'p2', client_id: 'c1', budget_hours: 500 },
  { id: 'p3', client_id: 'c2', budget_hours: 0 }, { id: 'p4', client_id: 'c2', budget_hours: 0, archived: true },
];
const prog = {
  p1: { currency: 'SAR', fee_total: 3000, invoiced_to_date: 1000, cost_to_date: 500, completion_pct: 60, approved_pct: 30 },
  p2: { currency: 'SAR', fee_total: 1000, invoiced_to_date: 0, cost_to_date: 100, completion_pct: 20, approved_pct: 20 },
  p3: { currency: 'USD', fee_total: 0, completion_pct: null, approved_pct: null },
};
const met = { p1: { status: 'Delayed', consumed_hours: 600, budget_total: 1000 }, p2: { status: 'On Track', consumed_hours: 100, budget_total: 500 } };
const rows = clientRollup(projects, clients, prog, met);
assert(rows.length === 2 && rows[0].client === 'NHC', 'one row per client, sorted; archived projects ignored');
assert(rows[0].projects === 2 && rows[0].fee === 4000 && rows[0].invoiced === 1000, 'fees and invoices add up');
assert(rows[0].completion === 50 && rows[0].approved === 27.5, 'completion weighted by fee (3000/1000)');
assert(rows[0].awaitingGap === 22.5 && rows[0].delayed === 1, 'awaiting gap and delayed count');
assert(rows[0].hoursPct === 46.7, 'hours consumed % across the client');
assert(rows[1].projects === 1 && rows[1].completion === null && rows[1].currency === 'USD', 'project without deliverables → no completion');

const mixed = clientRollup(
  [{ id: 'a', client_id: 'c1' }, { id: 'b', client_id: 'c1' }], clients,
  { a: { currency: 'SAR', fee_total: 100, invoiced_to_date: 50 }, b: { currency: 'USD', fee_total: 100, invoiced_to_date: 0 } }, {});
assert(mixed[0].mixed && mixed[0].currency === '' && mixed[0].billedPct === null, 'mixed currencies flagged, no billed %');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
