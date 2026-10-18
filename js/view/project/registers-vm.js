// Project page: Variations, Incidents and Hours tab bindings + the email checkpoint dialog.
import { VO_STATUSES, VO_STATUS_SHORT, VO_TRIGGERS, INCIDENT_CATEGORIES, RESPONSIBILITIES, RESPONSIBILITY_BASES, INCIDENT_STATUSES, ORIGINS, regNo, periodToMonth, parsePcuRows } from '../../domain/registers.js';
import { fmtDate, fmtHours, todayIso } from '../../ui/format.js';
import { CHIP_DONE, CHIP_OPEN } from '../../ui/tokens.js';

const opts = (list) => list.map((v) => (Array.isArray(v) ? { value: v[0], label: v[1] } : { value: v, label: v }));
const str = (v) => (v === null || v === undefined ? '' : String(v));
const money = (n, cur) => (n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${cur}`);
const VO_CHIP = {
  candidate: 'border-style: dashed; color: #1E3FBF; border-color: #2F5BFF;',
  draft: CHIP_OPEN, submitted: 'background: #F2F5FF; border-color: #2F5BFF; color: #1E3FBF;',
  approved: CHIP_DONE, rejected: 'background: #FDECEC; border-color: #C00000; color: #A00000;', withdrawn: 'color: #8A8F96; border-color: #C9CDD6;',
};

export function buildRegisters(S, act, perm) {
  const M = S.metrics || {};
  const cur = (S.settings && S.settings.currency) || 'SAR';
  const delTitle = Object.fromEntries(S.deliverables.map((d) => [d.id, d.title || '(untitled)']));
  const delOptions = [{ value: '', label: '— none —' }, ...S.deliverables.map((d) => ({ value: d.id, label: d.title || '(untitled)' }))];
  const voOptions = [{ value: '', label: '— none —' }, ...S.variations.map((v) => ({ value: v.id, label: `${regNo('VO', v.number)} ${v.title || ''}`.trim() }))];
  const fromVo = new Set(S.deliverables.filter((d) => d.variation_id).map((d) => d.variation_id));
  const confirm = (key) => ({ confirming: S.confirmDelete === key, notConfirming: S.confirmDelete !== key, askDelete: () => act.askDelete(key) });

  // ── VOs ──
  const variations = S.variations.map((v) => {
    const canDecide = perm.canManage;
    const statusOptions = VO_STATUSES.filter(([k]) => canDecide || !['approved', 'rejected'].includes(k) || k === v.status).map(([value, label]) => ({ value, label }));
    return {
      no: regNo('VO', v.number), title: v.title, description: v.description, direction: v.direction,
      status: v.status, statusShort: VO_STATUS_SHORT[v.status], statusStyle: VO_CHIP[v.status] || '', statusOptions,
      trigger: VO_TRIGGERS[v.trigger_source] || '', linked: v.deliverable_id ? delTitle[v.deliverable_id] || '' : '', hasLinked: !!v.deliverable_id,
      deliverable: v.deliverable_id || '',
      emailFrom: v.email_from, emailSubject: v.email_subject, emailOn: str(v.email_received_on), emailLink: v.email_link, emailQuote: v.email_quote,
      hasEmail: !!(v.email_subject || v.email_from || v.email_quote || v.email_link), hasLink: /^https?:\/\//i.test(v.email_link || ''),
      days: str(v.time_impact_days), hours: str(v.hours_impact), fee: str(v.fee_impact), clientRef: v.client_ref,
      submittedOn: str(v.submitted_on), decidedOn: str(v.decided_on),
      highlight: S.highlightVo === v.id ? 'outline: 2px solid #2F5BFF;' : '',
      inDeliverables: fromVo.has(v.id), canAddDeliverable: perm.canEdit && !fromVo.has(v.id) && v.status !== 'rejected' && v.status !== 'withdrawn',
      set: Object.fromEntries(['title', 'description', 'direction', 'status', 'deliverable_id', 'email_from', 'email_subject', 'email_received_on', 'email_link', 'email_quote', 'time_impact_days', 'hours_impact', 'fee_impact', 'client_ref', 'submitted_on', 'decided_on']
        .map((k) => [k, act.editVo(v.id, k)])),
      toDeliverable: () => act.voToDeliverable(v.id),
      ...confirm(`v:${v.id}`), confirmDelete: () => act.removeRow('variations', v.id),
    };
  });
  const cp = S.checkpoint;
  const cpDeliverable = cp && cp.deliverableId ? S.deliverables.find((d) => d.id === cp.deliverableId) : null;
  const cpSubmission = cp && cp.submissionId ? S.submissions.find((s) => s.id === cp.submissionId) : null;

  // ── incidents ──
  const incidents = S.incidents.map((i) => ({
    no: regNo('INC', i.number), title: i.title, description: i.description, origin: i.origin, isExternal: i.origin === 'external',
    category: i.category, responsibility: i.responsibility, basis: i.responsibility_basis,
    occurred: str(i.occurred_on), deliverable: i.deliverable_id || '', vo: i.variation_id || '',
    days: str(i.time_impact_days), hoursEst: str(i.hours_impact), hoursSpent: str(i.hours_spent), cost: str(i.cost_impact),
    action: i.action, owner: i.owner, due: str(i.due_on), status: i.status,
    statusStyle: i.status === 'Closed' ? CHIP_DONE : CHIP_OPEN,
    overdueAction: i.status !== 'Closed' && i.due_on && i.due_on < todayIso() ? 'ACTION OVERDUE' : '',
    canRaiseVo: perm.canEdit && i.origin === 'external' && !i.variation_id,
    linkedVo: i.variation_id ? (voOptions.find((o) => o.value === i.variation_id) || {}).label || '' : '',
    set: Object.fromEntries(['title', 'description', 'origin', 'category', 'responsibility', 'responsibility_basis', 'occurred_on', 'deliverable_id', 'variation_id', 'time_impact_days', 'hours_impact', 'hours_spent', 'cost_impact', 'action', 'owner', 'due_on', 'status']
      .map((k) => [k, act.editIncident(i.id, k)])),
    raiseVo: () => act.incidentToVo(i.id),
    ...confirm(`n:${i.id}`), confirmDelete: () => act.removeRow('incidents', i.id),
  }));

  // ── hours ──
  const compOptions = [{ value: '', label: 'Project total' }, ...S.components.map((c) => ({ value: c.id, label: `${c.code} ${c.name}`.trim() }))];
  const snapshots = S.hours.map((h) => ({
    month: periodToMonth(h.period), component: h.component_id || '', hours: str(h.cumulative_hours), progress: str(h.progress_pct), note: h.note,
    set: { period: act.editSnapshot(h.id, 'period'), component_id: act.editSnapshot(h.id, 'component_id'), cumulative_hours: act.editSnapshot(h.id, 'cumulative_hours'), progress_pct: act.editSnapshot(h.id, 'progress_pct'), note: act.editSnapshot(h.id, 'note') },
    ...confirm(`h:${h.id}`), confirmDelete: () => act.removeRow('hours', h.id),
  }));
  const pcu = parsePcuRows(S.pcuText, S.components);
  const budget = Number(M.budget_total || 0), eac = Number(M.eac || 0);
  const approvedVos = S.variations.filter((v) => v.status === 'approved' && v.direction === 'external');
  const P = S.project || {};

  return {
    // variations
    variations, hasVariations: variations.length > 0, noVariations: S.loaded && variations.length === 0,
    voLine: `${M.vo_open || 0} open · ${M.vo_approved || 0} approved (+${fmtHours(M.vo_approved_hours || 0)} h, +${M.vo_approved_days || 0} days, ${money(M.vo_approved_fee || 0, cur)}) · ${fmtHours(M.vo_pending_hours || 0)} h awaiting the client`,
    addVo: act.addVo, openGeneralCheckpoint: () => act.openCheckpoint({}),
    directionOptions: opts([['external', 'External (client)'], ['internal', 'Internal']]),
    delOptions, voOptions, currency: cur,
    // checkpoint dialog
    checkpointOpen: !!cp,
    checkpointContext: cpSubmission ? `${cpDeliverable ? cpDeliverable.title : ''} · ${cpSubmission.revision} (${fmtDate(cpSubmission.submitted_on)})` : (cpDeliverable ? cpDeliverable.title : 'No deliverable linked — the VO stands on its own'),
    checkpointToday: todayIso(), checkpointBusy: S.checkpointBusy, checkpointErr: S.checkpointErr, hasCheckpointErr: !!S.checkpointErr,
    checkpointLabel: S.checkpointBusy ? 'Saving…' : 'Raise VO draft',
    submitCheckpoint: act.submitCheckpoint, closeCheckpoint: act.closeCheckpoint,
    // incidents
    incidents, hasIncidents: incidents.length > 0, noIncidents: S.loaded && incidents.length === 0,
    incLine: `${M.incidents_open || 0} open · rework spent ${fmtHours(M.incident_hours_internal || 0)} h internal / ${fmtHours(M.incident_hours_external || 0)} h external · cost ${money(M.incident_cost_internal || 0, cur)} internal / ${money(M.incident_cost_external || 0, cur)} external · ${fmtHours(M.incident_remaining_hours || 0)} h still to spend`,
    addInternalIncident: () => act.addIncident('internal'), addExternalIncident: () => act.addIncident('external'),
    originOptions: opts(ORIGINS), categoryOptions: opts(INCIDENT_CATEGORIES), respOptions: opts(RESPONSIBILITIES), basisOptions: opts(RESPONSIBILITY_BASES), incStatusOptions: opts(INCIDENT_STATUSES),
    // hours
    hBudgetBase: fmtHours(P.budget_hours), hVoHours: fmtHours(M.vo_approved_hours || 0), hBudget: fmtHours(budget),
    hConsumed: fmtHours(M.consumed_hours || 0), hAsOf: M.consumed_as_of ? `as of ${fmtDate(M.consumed_as_of).slice(3)}` : 'no PCU data yet',
    hPct: M.consumed_pct == null ? '—' : `${M.consumed_pct}%`, hFtc: fmtHours(M.forecast_to_complete || 0), hEac: fmtHours(eac),
    hVariance: fmtHours(M.hours_variance || 0), hVarianceStyle: Number(M.hours_variance || 0) < 0 ? 'color: #C00000;' : '',
    hIncInt: fmtHours(M.incident_hours_internal || 0), hIncExt: fmtHours(M.incident_hours_external || 0),
    hPctStyle: M.consumed_pct >= Number((S.settings && S.settings.at_risk_pct) || 90) ? 'color: #A00000;' : '',
    adjustedFinish: M.adjusted_finish ? fmtDate(M.adjusted_finish) : '—', baselineFinish: fmtDate(P.baseline_finish),
    hasEot: Number(M.vo_approved_days || 0) !== 0, eotDays: String(M.vo_approved_days || 0),
    budgetLines: approvedVos.map((v) => ({ label: `${regNo('VO', v.number)} ${v.title}`, hours: `+${fmtHours(v.hours_impact || 0)}` })),
    hasBudgetLines: approvedVos.length > 0,
    snapshots, hasSnapshots: snapshots.length > 0, noSnapshots: S.loaded && snapshots.length === 0,
    hoursCompOptions: compOptions, addSnapshot: act.addSnapshot,
    pcuOpen: S.pcuOpen, togglePcu: act.togglePcu, pcuLabel: S.pcuOpen ? 'Close paste' : 'Paste PCU export…',
    pcuText: S.pcuText, setPcuText: act.setPcuText, importPcu: act.importPcu, pcuNone: pcu.rows.length === 0,
    pcuSummary: S.pcuText.trim() ? `${pcu.rows.length} row${pcu.rows.length === 1 ? '' : 's'} ready${pcu.errors.length ? ` · ${pcu.errors.length} skipped` : ''}` : 'Paste rows copied from the PCU export.',
    pcuErrors: pcu.errors.slice(0, 5), hasPcuErrors: pcu.errors.length > 0,
    pcuImportLabel: pcu.rows.length ? `Import ${pcu.rows.length} row${pcu.rows.length === 1 ? '' : 's'}` : 'Import',
    pcuMsg: S.pcuMsg, hasPcuMsg: !!S.pcuMsg,
  };
}
