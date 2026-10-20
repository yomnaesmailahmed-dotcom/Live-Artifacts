// node tests/qc.test.mjs — QC gate rules (must match private.guard_qc in SQL).
import { canSetGate, deliverableQc, qcSummary, hasEvidence, isPassed, canSignGate } from '../js/domain/qc.js';
import { projectPermissions } from '../js/domain/roles.js';

let failed = 0;
const assert = (c, msg) => { console.log(c ? 'ok  ' : 'FAIL', msg); if (!c) failed++; };

const team = projectPermissions('member', 'team');
const ptm = projectPermissions('member', 'ptm');
const dm = projectPermissions('member', 'dm');
const viewer = projectPermissions('member', 'viewer');
const done = { status: 'done', evidence_subject: 'QC1 ok' };
const none = [null, null, null];

assert(canSignGate(1, team) && !canSignGate(2, team) && !canSignGate(3, team), 'team signs QC1 only');
assert(canSignGate(2, ptm) && !canSignGate(3, ptm), 'PTM signs QC1/QC2, not QC3');
assert(canSignGate(3, dm), 'DM signs QC3');
assert(!canSignGate(1, viewer), 'viewer signs nothing');

assert(canSetGate(1, 'done', none, team).ok, 'team can do QC1');
assert(!canSetGate(2, 'done', [done, null, null], team).ok, 'team cannot do QC2');
assert(!canSetGate(2, 'done', none, ptm).ok && /QC1/.test(canSetGate(2, 'done', none, ptm).reason), 'QC2 needs QC1 first');
assert(canSetGate(2, 'done', [done, null, null], ptm).ok, 'PTM can do QC2 after QC1');
assert(!canSetGate(3, 'done', [done, done, null], ptm).ok, 'PTM cannot do QC3');
assert(canSetGate(3, 'done', [done, done, null], dm).ok, 'DM can do QC3 after QC2');
assert(!canSetGate(1, 'waived', none, ptm).ok && canSetGate(1, 'waived', none, dm).ok, 'only the DM waives');
assert(!canSetGate(1, 'pending', [done, done, null], dm).ok, 'cannot reopen QC1 while QC2 is done');
assert(canSetGate(2, 'pending', [done, done, null], dm).ok, 'can reopen the latest gate');
assert(canSetGate(1, 'done', [done, null, null], viewer).ok, 'no change is always allowed');

assert(isPassed({ status: 'waived' }) && !isPassed({ status: 'pending' }) && !isPassed(null), 'waived counts as passed');
assert(hasEvidence({ evidence_link: 'https://x' }) && !hasEvidence({ evidence_subject: '' }) && !hasEvidence(null), 'evidence = subject, link or quote');

const q1 = deliverableQc({ status: 'Submitted' }, [done, { status: 'waived' }, null]);
assert(q1.passed === 2 && q1.next === 3 && q1.sentWithoutQc && !q1.complete, 'submitted with QC3 open is flagged');
const q2 = deliverableQc({ status: 'In Progress' }, [done, done, { status: 'done' }]);
assert(q2.complete && q2.next === 0 && q2.missingEvidence && !q2.sentWithoutQc, 'all done, QC3 without evidence flagged');

const ds = [{ id: 'a', status: 'Approved' }, { id: 'b', status: 'In Progress' }, { id: 'c', status: 'Cancelled' }, { id: 'd', status: 'Not Started' }];
const checks = [
  ...[1, 2, 3].map((g) => ({ deliverable_id: 'a', gate: g, status: 'done', evidence_quote: 'ok' })),
  { deliverable_id: 'b', gate: 1, status: 'done', evidence_quote: 'ok' },
  { deliverable_id: 'c', gate: 1, status: 'done' },
];
const s = qcSummary(ds, checks);
assert(s.total === 3 && s.complete === 1 && s.inProgress === 1 && s.sentWithoutQc === 0 && s.missingEvidence === 0, 'summary ignores cancelled deliverables');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
