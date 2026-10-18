// node tests/review.test.mjs — Phase 4 management review rules.
import { indexData, scopeProjects, dataChecks, changesSince, dmQuestions, conflicts, briefing, checklist, workbookSheets } from '../js/domain/review.js';

let failed = 0;
const assert = (c, msg) => { console.log(c ? 'ok  ' : 'FAIL', msg); if (!c) failed++; };
const until = '2026-10-18', since = '2026-09-30';

const D = indexData({
  settings: { at_risk_pct: 90 },
  clients: [{ id: 'c1', name: 'NHC' }, { id: 'c2', name: 'ROSHN' }],
  projects: [
    { id: 'p1', client_id: 'c1', code: 'P01', name: 'Ubayya', budget_hours: 1000, forecast_finish: '2026-12-31' },
    { id: 'p2', client_id: 'c2', code: 'R01', name: 'Sedra', budget_hours: 0 },
    { id: 'p3', client_id: 'c1', code: 'P02', name: 'Archived', archived: true },
  ],
  members: [{ project_id: 'p1', user_id: 'dm1', role: 'dm' }, { project_id: 'p2', user_id: 'u9', role: 'ptm' }],
  metrics: [
    { project_id: 'p1', status: 'Delayed', status_basis: '1 milestone slipping (8 days)', consumed_as_of: '2026-10-01', consumed_hours: 950, budget_total: 1000, consumed_pct: 95, eac: 1100, hours_variance: -100 },
    { project_id: 'p2', status: 'Not Started', status_basis: 'No deliverables or submissions yet' },
  ],
  deliverables: [
    { id: 'd1aaaaaaaa', project_id: 'p1', title: 'Concept report', status: 'In Progress', baseline_date: '2026-10-01' },
    { id: 'd2', project_id: 'p1', title: 'Undated', status: 'Not Started' },
  ],
  milestones: [{ id: 'm1aaaaaaaa', project_id: 'p1', title: 'Concept approval', baseline_finish: '2026-10-10' }, { id: 'm2', project_id: 'p1', title: 'IFC', baseline_finish: '2027-01-31', forecast_finish: '2027-02-15' }],
  variations: [{ id: 'v1aaaaaaaa', project_id: 'p1', number: 1, direction: 'external', status: 'draft', title: 'Third option', fee_impact: 18000 }],
  incidents: [{ id: 'i1aaaaaaaa', project_id: 'p1', number: 1, origin: 'external', status: 'Open', title: 'Late survey', responsibility: 'Client', responsibility_basis: 'Not established' }],
  actions: [{ id: 'a1', project_id: 'p1', number: 2, title: 'Close comments', status: 'In Progress', due_on: '2026-10-12', milestone_id: 'm1aaaaaaaa' }],
  queries: [{ id: 'q1aaaaaaaa', project_id: 'p1', number: 1, question: 'Is the mosque in scope?', status: 'Open', due_on: '2026-10-15', priority: 'High' }],
  statuses: [{ project_id: 'p1', period_start: '2026-10-12', team: 'Landscape', status_flag: 'On Track' }],
  audit: [
    { project_id: 'p1', table_name: 'submissions', action: 'INSERT', at: '2026-10-05T09:00:00Z', changes: { deliverable_id: 'd1aaaaaaaa', revision: 'Rev 00' } },
    { project_id: 'p1', table_name: 'deliverables', row_id: 'd1aaaaaaaa', action: 'UPDATE', at: '2026-10-06T09:00:00Z', changes: { status: ['Not Started', 'In Progress'] } },
    { project_id: 'p1', table_name: 'milestones', row_id: 'm2', action: 'UPDATE', at: '2026-10-07T09:00:00Z', changes: { forecast_finish: [null, '2027-02-15'] } },
    { project_id: 'p1', table_name: 'variations', action: 'INSERT', at: '2026-10-08T09:00:00Z', changes: { number: 1, title: 'Third option' } },
    { project_id: 'p1', table_name: 'projects', action: 'UPDATE', at: '2026-10-09T09:00:00Z', changes: { budget_hours: [800, 1000] } },
    { project_id: 'p1', table_name: 'deliverables', action: 'UPDATE', at: '2026-09-01T09:00:00Z', changes: { status: ['A', 'B'] } },
    { project_id: 'p1', table_name: 'actions', action: 'INSERT', at: '2026-10-09T10:00:00Z', changes: {} },
  ],
});

const all = scopeProjects(D, { kind: 'company' });
assert(all.map((p) => p.code).join(',') === 'P01,R01', 'company scope excludes archived, sorted by client');
assert(scopeProjects(D, { kind: 'client', clientId: 'c2' }).length === 1 && scopeProjects(D, { kind: 'dm', dmId: 'dm1' })[0].id === 'p1', 'client and DM scopes');

const c1 = dataChecks(D, D.projects[0], until).map((c) => c.text);
assert(c1.some((t) => /without a baseline date/.test(t)) && c1.some((t) => /quer/.test(t)) && !c1.some((t) => /No DM/.test(t)), 'p1 checks: undated deliverable + overdue query, DM present');
const c2 = dataChecks(D, D.projects[1], until).map((c) => c.text);
assert(['No DM assigned', 'No budget hours set', 'No PCU hours entered', 'No team status posted', 'No deliverables registered', 'No milestones on the timeline'].every((t) => c2.includes(t)), 'empty project: every gap flagged');

const ch = changesSince(D, 'p1', since, until).map((c) => c.text);
assert(ch.length === 5, 'changes in period only, noise (action insert) dropped');
assert(ch[0] === 'Submitted Rev 00 of Concept report' && ch[1] === '“Concept report”: Not Started → In Progress', 'submission + status sentences');
assert(/IFC” forecast set to 15 Feb 2027/.test(ch[2]) && ch[3] === 'VO-001 raised: Third option' && /budget 800 → 1,000 h/.test(ch[4]), 'milestone, VO and project sentences');
// an item created blank and named later shows its current name
const D2 = indexData({ projects: [], deliverables: [{ id: 'dx', project_id: 'p1', title: 'Named later', source: 'rfp' }],
  audit: [{ project_id: 'p1', table_name: 'deliverables', row_id: 'dx', action: 'INSERT', at: '2026-10-10T00:00:00Z', changes: { title: '', source: 'scope' } }] });
assert(changesSince(D2, 'p1', since, until)[0].text === 'Added deliverable “Named later” (RFP)', 'insert uses the current title and source');

const qs = dmQuestions(D, D.projects[0], until);
const qt = qs.map((q) => q.text).join(' | ');
assert(/Concept approval.*When will it finish/.test(qt) && /Concept report.*new date/.test(qt) && /VO-001.*draft/.test(qt) && /INC-001.*responsible/.test(qt) && /Q-001.*overdue/.test(qt), 'questions from slip, late deliverable, VO draft, incident, overdue query');
assert(qs.every((q) => q.key.length <= 64) && new Set(qs.map((q) => q.key)).size === qs.length, 'question keys unique and fit run_decisions');

const cf = conflicts(D, D.projects[0], until);
assert(cf.length === 3 && cf.some((c) => c.key === 'c:team:p1') && cf.some((c) => c.key === 'c:finish:p1') && cf.some((c) => c.key === 'c:resp:i1aaaaaaaa'), 'conflicts: team vs data, milestone vs project finish, undocumented responsibility');

const dec = { override: {}, wording: {}, resp: {} };
const b = briefing(D, all, dec, until);
assert(/2 projects — 0 on track, 1 delayed/.test(b[0]) && b.some((l) => /^Delayed: Ubayya/.test(l)) && b.some((l) => /Budget pressure: Ubayya at 95%/.test(l)), 'briefing: portfolio, delayed, budget pressure');
assert(b.some((l) => /VO-001 \(18,000 SAR\)/.test(l)) && b.some((l) => /Decisions needed: delay responsibility for Ubayya/.test(l)), 'briefing: VOs and decisions needed');
const b2 = briefing(D, all, { override: {}, wording: { p1: 'Concept approval late — client comments' }, resp: { p1: 'Client' } }, until);
assert(b2.some((l) => /Concept approval late — client comments; responsibility Client/.test(l)) && !b2.some((l) => /Decisions needed/.test(l)), 'briefing uses the reviewer wording and responsibility');

const ck = checklist({ projects: 2, reviewedCards: 2, questionsTotal: 3, answered: 3, conflictsTotal: 3, resolved: 2, approvedStatuses: 2, delayedCount: 1, respSet: 1, warnings: 0 });
assert(ck.filter((c) => !c.good).length === 1 && /Conflicts resolved — 2 of 3/.test(ck.find((c) => !c.good).t), 'checklist flags the open item');

const wb = workbookSheets(D, all, dec, since, until);
assert(wb.summary.length === 3 && wb.summary[1][2] === 'Ubayya' && wb.summary[1][3] === 'Delayed' && wb.summary[1][11] === 95, 'summary sheet rows');
assert(wb.changes.length === 6 && wb.open.some((r) => r[1] === 'VO-001') && wb.open.some((r) => r[1] === 'ACT-002') && wb.open.some((r) => r[1] === 'Q-001'), 'changes + open items sheets');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
