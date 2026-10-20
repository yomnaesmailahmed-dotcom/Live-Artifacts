// Project page: QC tab bindings.
import { GATES, GATE_STATUSES, isPassed, hasEvidence, canSetGate, canSignGate, deliverableQc, qcSummary } from '../../domain/qc.js';
import { fmtDate } from '../../ui/format.js';
import { CHIP_DONE, CHIP_OPEN } from '../../ui/tokens.js';

const GATE_STYLE = {
  done: CHIP_DONE,
  waived: 'border-style: dashed; color: #3F477F; border-color: #5A63A8;',
  pending: 'color: #646A78; border-color: #CBCED8;',
};
const SHORT = { done: 'Done', waived: 'Waived', pending: 'Pending' };
const str = (v) => (v === null || v === undefined ? '' : String(v));

export function buildQc(S, act, perm) {
  const by = new Map(S.qc.map((c) => [`${c.deliverable_id}:${c.gate}`, c]));
  const list = S.deliverables.filter((d) => d.status !== 'Cancelled');
  const sum = qcSummary(S.deliverables, S.qc);
  const who = Object.fromEntries(Object.entries(S.people || {}).map(([id, p]) => [id, p.full_name || (p.email || '').split('@')[0]]));

  const qcRows = list.map((d) => {
    const checks = [1, 2, 3].map((g) => by.get(`${d.id}:${g}`) || null);
    const q = deliverableQc(d, checks);
    const openN = S.qcOpen && S.qcOpen.startsWith(`${d.id}:`) ? Number(S.qcOpen.split(':')[1]) : 0;
    const gates = GATES.map((g) => {
      const c = checks[g.n - 1];
      const st = c ? c.status : 'pending';
      const warn = st === 'done' && !hasEvidence(c) ? ' ⚠' : '';
      return { text: `${g.label} · ${SHORT[st]}${warn}`, style: `${GATE_STYLE[st]}${openN === g.n ? ' outline: 2px solid #5A63A8;' : ''}`, open: String(openN === g.n), pick: () => act.openGate(`${d.id}:${g.n}`) };
    });
    let detail = null;
    if (openN) {
      const g = GATES[openN - 1];
      const c = checks[openN - 1] || {};
      const current = c.status || 'pending';
      const mayEdit = canSignGate(openN, perm);
      const options = GATE_STATUSES.filter(([k]) => k === current || canSetGate(openN, k, checks, perm).ok).map(([value, label]) => ({ value, label }));
      const reasons = GATE_STATUSES.filter(([k]) => k !== current).map(([k]) => canSetGate(openN, k, checks, perm)).filter((x) => !x.ok).map((x) => x.reason);
      const block = !mayEdit ? g.who : (options.length < 2 ? reasons[0] || '' : '');
      detail = {
        gateTitle: `${g.label} — ${g.title}`, who: g.who, hasBlock: !!block, block,
        status: current, statusOptions: options, statusLocked: options.length < 2,
        locked: !mayEdit, by: str(c.checked_by_name), signedBy: c.done_by ? (who[c.done_by] || '') : 'Name of the checker', on: str(c.checked_on),
        notes: str(c.notes), subject: str(c.evidence_subject), from: str(c.evidence_from), received: str(c.evidence_received_on),
        link: str(c.evidence_link), hasLink: /^https?:\/\//i.test(c.evidence_link || ''), quote: str(c.evidence_quote),
        set: Object.fromEntries(['status', 'checked_by_name', 'checked_on', 'notes', 'evidence_subject', 'evidence_from', 'evidence_received_on', 'evidence_link', 'evidence_quote']
          .map((k) => [k, act.editGate(d.id, openN, k)])),
      };
    }
    const done = checks.filter((c) => c && c.status === 'done');
    const last = done.length ? done[done.length - 1] : null;
    return {
      phase: d.phase || '', title: d.title || '(untitled)', status: d.status,
      rowStyle: q.sentWithoutQc ? 'background: #F6E7E4;' : '',
      flag: q.sentWithoutQc ? 'WITH CLIENT WITHOUT FULL QC' : (q.missingEvidence ? 'EVIDENCE MISSING' : ''),
      gates, isOpen: !!openN, d: detail || {},
      evidence: q.complete && !q.missingEvidence ? 'Complete' : (last ? `${last.evidence_received_on ? fmtDate(last.evidence_received_on) : (hasEvidence(last) ? 'filed' : 'none yet')}` : '—'),
      evidenceStyle: q.missingEvidence ? 'color: #944747; font-weight: 600;' : '',
    };
  });

  return {
    qcRows, qcHasRows: qcRows.length > 0, qcEmpty: qcRows.length === 0,
    qcLine: `${sum.total} deliverable${sum.total === 1 ? '' : 's'} · ${sum.complete} fully QC’d · ${sum.inProgress} in progress · ${sum.total - sum.complete - sum.inProgress} not started`,
    qcWarn: sum.sentWithoutQc > 0 || sum.missingEvidence > 0,
    qcWarnText: [sum.sentWithoutQc ? `${sum.sentWithoutQc} deliverable${sum.sentWithoutQc === 1 ? ' is' : 's are'} with the client without all three QC gates.` : '',
      sum.missingEvidence ? `${sum.missingEvidence} deliverable${sum.missingEvidence === 1 ? ' has' : 's have'} a QC gate marked done with no email evidence.` : ''].filter(Boolean).join(' '),
  };
}
