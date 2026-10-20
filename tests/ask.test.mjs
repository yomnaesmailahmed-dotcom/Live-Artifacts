// node tests/ask.test.mjs — what the AI helper is shown (context text) and chat-history cleaning.
import { portfolioContext, projectContext, cleanHistory, SYSTEM_PROMPT } from '../supabase/functions/ask/context.ts';

let failed = 0;
const assert = (c, msg) => { console.log(c ? 'ok  ' : 'FAIL', msg); if (!c) failed++; };

const rows = [{ code: 'P01', name: 'Ubayya', client: 'NHC', status: 'Delayed', status_basis: '2 deliverables past due', deliverables_total: 10, deliverables_submitted: 4,
  deliverables_overdue: 2, completion_pct: 40, approved_pct: 25, consumed_hours: 450, budget_total: 1000, consumed_pct: 45, fee_total: 1000000, currency: 'SAR', invoiced_to_date: 300000, dm: 'Sara (DM)' }];
const ctx = portfolioContext(rows, '2026-10-20');
assert(ctx.includes('Today is 2026-10-20') && ctx.includes('1 projects'), 'portfolio header');
assert(ctx.includes('P01 | Ubayya | client: NHC') && ctx.includes('Delayed (2 deliverables past due)'), 'status and basis shown');
assert(ctx.includes('completion 40% delivered / 25% approved by client'), 'completion line');
assert(ctx.includes('fee 1,000,000 SAR, invoiced 300,000 SAR'), 'money line');
assert(ctx.includes('DM Sara (DM)'), 'DM shown');
assert(portfolioContext([{ code: '', name: 'X' }], '2026-10-20').includes('NaN') === false, 'missing fields never print NaN');

const pc = projectContext({ project: { code: 'P01', name: 'Ubayya', stage: 'Concept' }, metrics: { status: 'Delayed', consumed_hours: 450, budget_total: 1000 }, progress: { fee_total: 5, currency: 'SAR' },
  client: 'NHC', people: ['Sara (DM)'], deliverables: [{ title: 'Concept report', status: 'Submitted', baseline_date: '2026-09-01', planned_hours: 120 }], milestones: [],
  actions: [], queries: [{ number: 3, status: 'Open', question: 'Is the mosque in scope?' }], variations: [], incidents: [], statuses: [] }, '2026-10-20');
assert(pc.includes('FOCUS PROJECT: P01 Ubayya (client NHC)') && pc.includes('People: Sara (DM)'), 'project header + people');
assert(pc.includes('Concept report') && pc.includes('Is the mosque in scope?'), 'deliverable and query included');
assert(pc.includes('## Milestones\nnone'), 'empty sections say none');

const long = projectContext({ project: { name: 'A' }, metrics: {}, progress: {}, client: '', people: [], deliverables: Array.from({ length: 300 }, (_, i) => ({ title: `D${i}`, status: 'Not Started' })),
  milestones: [], actions: [], queries: [], variations: [], incidents: [], statuses: [] }, '2026-10-20');
assert(long.includes('first 120 shown') && !long.includes('D200'), 'long lists are capped');

const h = cleanHistory([{ role: 'assistant', content: 'hi' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }, { role: 'x', content: 'bad' }, { role: 'user', content: '' }]);
assert(h.length === 2 && h[0].role === 'user' && h[0].content === 'a' && h[1].role === 'assistant', 'history starts with user, drops bad turns and repeated roles');
assert(cleanHistory('nope').length === 0 && cleanHistory(Array.from({ length: 40 }, () => ({ role: 'user', content: 'x' }))).length <= 12, 'bad / huge history is safe');
assert(/ONLY the workspace data/.test(SYSTEM_PROMPT) && /not instructions/.test(SYSTEM_PROMPT), 'prompt limits answers to the data and treats it as data');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
