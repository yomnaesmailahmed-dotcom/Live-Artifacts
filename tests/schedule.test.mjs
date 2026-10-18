// node tests/schedule.test.mjs — Phase 3 schedule rules (must match project_metrics in SQL) and Gantt maths.
import { milestoneSlipDays, milestoneEffectiveFinish, actionLateReason, weekStart, timelineRange, span, pct, monthTicks, daysBetween } from '../js/domain/schedule.js';
import { projectPermissions } from '../js/domain/roles.js';

let failed = 0;
const assert = (c, msg) => { console.log(c ? 'ok  ' : 'FAIL', msg); if (!c) failed++; };
const today = '2026-10-18';

assert(daysBetween('2026-10-01', '2026-10-18') === 17, 'days between');
// slip rules — same cases as the SQL rule test
assert(milestoneSlipDays({ baseline_finish: '2026-11-07' }, today) === 0, 'future baseline, no forecast → not slipping');
assert(milestoneSlipDays({ baseline_finish: '2026-10-15' }, today) === 3, 'baseline passed 3 days ago → 3 days');
assert(milestoneSlipDays({ baseline_finish: '2026-10-15', forecast_finish: '2026-10-30' }, today) === 15, 'forecast 15 days after baseline → 15');
assert(milestoneSlipDays({ baseline_finish: '2026-10-01', forecast_finish: '2026-10-05' }, today) === 17, 'stale forecast in the past → counts to today');
assert(milestoneSlipDays({ baseline_finish: '2026-10-01', actual_finish: '2026-10-10' }, today) === 0, 'finished → no slip');
assert(milestoneEffectiveFinish({ baseline_finish: '2026-10-15' }, today) === today, 'effective finish never before today');

const ms = { title: 'Concept approval', baseline_finish: '2026-11-07' };
assert(actionLateReason({ status: 'In Progress', due_on: '2026-10-10' }, null, today) === '8 days overdue', 'overdue action');
assert(/after “Concept approval”/.test(actionLateReason({ status: 'Not Started', due_on: '2026-11-20' }, ms, today)), 'action due after its milestone');
assert(actionLateReason({ status: 'Done', due_on: '2026-10-10' }, null, today) === '', 'done action never late');
assert(actionLateReason({ status: 'In Progress', due_on: '2026-11-01' }, ms, today) === '', 'on-time action');

assert(weekStart('2026-10-15') === '2026-10-12' && weekStart('2026-10-12') === '2026-10-12' && weekStart('2026-10-18') === '2026-10-12', 'week starts Monday (matches SQL isodow)');

const range = timelineRange([{ baseline_start: '2026-09-01', baseline_finish: '2026-12-31' }], [{ start_on: '2026-10-01', due_on: '2026-10-31' }], today);
assert(range.start === '2026-08-29' && range.end === '2027-01-03', 'range spans everything with 3-day padding');
const s = span(range, '2026-09-01', '2026-12-31');
assert(s.left > 0 && s.left < 3 && s.left + s.width > 97 && s.left + s.width <= 100, 'bar fits the range');
assert(span(range, null, null) === null && span(range, '2026-10-18', null).width >= 0.8, 'missing dates → no bar; one date → thin marker');
assert(pct(range, '2030-01-01') === 100 && pct(range, '2020-01-01') === 0, 'markers clamp to the range');
const ticks = monthTicks(range);
assert(ticks.length === 5 && ticks[0].iso === '2026-09-01' && ticks[4].iso === '2027-01-01', 'month ticks Sep–Jan');
assert(timelineRange([], [], today).days >= 28, 'empty timeline still shows a month');

const team = projectPermissions('member', 'team'), viewer = projectPermissions('member', 'viewer');
assert(team.canContribute && !team.canEdit && !viewer.canContribute, 'team contributes (queries, status), viewer does not');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
