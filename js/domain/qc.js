// QC1 → QC2 → QC3 gate rules (mirror private.guard_qc and project_qc in SQL).

export const GATES = [
  { n: 1, label: 'QC1', title: 'Team self-check', who: 'Anyone on the team signs QC1.' },
  { n: 2, label: 'QC2', title: 'PTM / peer review', who: 'The PTM, DM or management signs QC2.' },
  { n: 3, label: 'QC3', title: 'DM sign-off', who: 'The DM or management signs QC3.' },
];
export const GATE_STATUSES = [['pending', 'Pending'], ['done', 'Done'], ['waived', 'Waived']];

export const isPassed = (c) => !!c && (c.status === 'done' || c.status === 'waived');
export const hasEvidence = (c) => !!c && !!(c.evidence_subject || c.evidence_link || c.evidence_quote);

export function canSignGate(n, perm) {
  if (n === 1) return !!perm.canContribute;
  if (n === 2) return !!perm.canEdit;
  return !!perm.canManage;
}

// Can this person move gate `n` to `status`, given the deliverable's checks (array of 3, null when no row yet)?
export function canSetGate(n, status, checks, perm) {
  const cur = checks[n - 1];
  const from = cur ? cur.status : 'pending';
  if (status === from) return { ok: true };
  if (!canSignGate(n, perm)) return { ok: false, reason: GATES[n - 1].who };
  if (status === 'waived' && !perm.canManage) return { ok: false, reason: 'Only the DM or management can waive a gate.' };
  if (status !== 'pending' && n > 1 && !isPassed(checks[n - 2])) return { ok: false, reason: `QC${n - 1} must be done first.` };
  if (status === 'pending' && checks.slice(n).some(isPassed)) return { ok: false, reason: 'Reopen the later gates first.' };
  return { ok: true };
}

// Summary for one deliverable.
export function deliverableQc(d, checks) {
  const passed = checks.filter(isPassed).length;
  const next = checks.findIndex((c) => !isPassed(c)) + 1; // 0 when all passed
  return {
    passed, complete: passed === 3, next: passed === 3 ? 0 : next,
    missingEvidence: checks.some((c) => c && c.status === 'done' && !hasEvidence(c)),
    sentWithoutQc: ['Submitted', 'Approved'].includes(d.status) && passed < 3,
  };
}

export function qcSummary(deliverables, allChecks) {
  const by = new Map(allChecks.map((c) => [`${c.deliverable_id}:${c.gate}`, c]));
  let complete = 0, inProgress = 0, sentWithoutQc = 0, missingEvidence = 0;
  const live = deliverables.filter((d) => d.status !== 'Cancelled');
  live.forEach((d) => {
    const q = deliverableQc(d, [1, 2, 3].map((g) => by.get(`${d.id}:${g}`) || null));
    if (q.complete) complete++; else if (q.passed > 0) inProgress++;
    if (q.sentWithoutQc) sentWithoutQc++;
    if (q.missingEvidence) missingEvidence++;
  });
  return { total: live.length, complete, inProgress, sentWithoutQc, missingEvidence };
}
