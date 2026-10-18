// node tests/registers.test.mjs — Phase 2 domain rules (VOs, incidents, PCU hours).
import { voFromCheckpoint, voFromIncident, deliverableFromVo, parsePcuRows, monthToPeriod, periodToMonth, regNo, snapshotKey } from '../js/domain/registers.js';

let failed = 0;
const assert = (c, msg) => { console.log(c ? 'ok  ' : 'FAIL', msg); if (!c) failed++; };

assert(regNo('VO', 3) === 'VO-003' && regNo('INC', 12) === 'INC-012' && regNo('VO', 0) === 'VO-…', 'register numbers');
assert(monthToPeriod('2026-10') === '2026-10-01' && monthToPeriod('') === null && periodToMonth('2026-10-01') === '2026-10', 'month ⇄ period');

const vo = voFromCheckpoint({
  projectId: 'p1', deliverable: { id: 'd1', title: 'Plot 2 landscape' }, submission: { id: 's1' },
  form: { title: ' ', email_from: 'client@nhc.sa ', email_subject: 'RE: options', email_received_on: '2026-10-17', email_quote: 'Please add a third option', time_impact_days: '14', hours_impact: '120', fee_impact: '' },
});
assert(vo.trigger_source === 'checkpoint' && vo.status === 'draft' && vo.direction === 'external', 'checkpoint VO is a draft external VO');
assert(vo.title === 'Client change — Plot 2 landscape' && vo.deliverable_id === 'd1' && vo.submission_id === 's1', 'checkpoint VO links deliverable + submission, default title');
assert(vo.time_impact_days === 14 && vo.hours_impact === 120 && vo.fee_impact === null && vo.email_from === 'client@nhc.sa', 'numbers parsed, blanks null, text trimmed');

const rec = voFromIncident('p1', { title: 'Late survey', time_impact_days: 10, hours_impact: 40, cost_impact: 9000, deliverable_id: 'd2' });
assert(rec.trigger_source === 'incident' && rec.title === 'Recovery — Late survey' && rec.hours_impact === 40 && rec.fee_impact === 9000, 'incident → recovery VO');

const dv = deliverableFromVo('p1', { id: 'v1', number: 2, title: 'Third option', hours_impact: 120 }, 7);
assert(dv.source === 'vo' && dv.variation_id === 'v1' && dv.source_ref === 'VO-002' && dv.planned_hours === 120 && dv.sort_order === 7, 'VO → deliverable');

const comps = [{ id: 'c1', code: 'C01' }, { id: 'c2', code: 'C02' }];
const pcu = parsePcuRows('Month\tComponent\tHours\tProgress\n2026-10\tC01\t4,250\t62\nOct 2026\tc02\t300\t\n09/2026\t\t4000\t\n2026-10\tC99\t1\t\nbad\tC01\t1\t\n2026-10\tC01\tx\t', comps);
assert(pcu.rows.length === 3, 'PCU: 3 rows parsed, header skipped');
assert(pcu.rows[0].period === '2026-10-01' && pcu.rows[0].component_id === 'c1' && pcu.rows[0].cumulative_hours === 4250 && pcu.rows[0].progress_pct === 62, 'PCU: component row');
assert(pcu.rows[1].component_id === 'c2' && pcu.rows[1].period === '2026-10-01', 'PCU: "Oct 2026" + case-insensitive code');
assert(pcu.rows[2].component_id === null && pcu.rows[2].period === '2026-09-01', 'PCU: blank code = project total, mm/yyyy');
assert(pcu.errors.length === 3 && /C99/.test(pcu.errors[0]), 'PCU: unknown code, bad month, bad hours reported');
assert(snapshotKey(null, '2026-10-01') === 'project|2026-10-01' && snapshotKey('c1', '2026-10-01') === 'c1|2026-10-01', 'snapshot keys');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
