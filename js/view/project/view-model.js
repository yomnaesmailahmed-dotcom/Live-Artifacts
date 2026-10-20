// Project page bindings.
import { buildShell } from '../shell.js';
import { globalRole } from '../../state/session-store.js';
import { projectPermissions, PROJECT_ROLES, PROJECT_ROLE_SHORT } from '../../domain/roles.js';
import { SOURCES, SOURCE_SHORT, DELIVERABLE_STATUSES, SUBMISSION_RESPONSES, WORK_STATUSES, isOverdue, parseDeliverableRows } from '../../domain/deliverables.js';
import { fmtDate, fmtHours, todayIso, displayName, initials } from '../../ui/format.js';
import { STATUS_CHIP, TOGGLE_ON, FILTER_OFF } from '../../ui/tokens.js';
import { moneyFigures, fmtMoney, fmtPct } from '../../domain/progress.js';
import { buildRegisters } from './registers-vm.js';
import { buildSchedule } from './schedule-vm.js';
import { buildMail } from './mail-vm.js';

const STATUS_OVERRIDES = ['', 'Not Started', 'On Track', 'At Risk', 'Delayed', 'On Hold', 'Completed', 'Not Awarded'];
const PO = ['Not Provided', 'Received', 'Not Received'];
const opts = (list) => list.map((v) => (Array.isArray(v) ? { value: v[0], label: v[1] } : { value: v, label: v || 'Automatic (from data)' }));
const TAB_LABELS = [['overview', 'Overview'], ['deliverables', 'Deliverables'], ['timeline', 'Timeline'], ['queries', 'Queries & status'], ['variations', 'Variations'], ['incidents', 'Incidents'], ['hours', 'Hours'], ['team', 'Team']];

export function buildViewModel(S, act) {
  const shell = buildShell(S, act, 'projects');
  const me = S.user && S.user.id;
  const myMembership = S.members.find((m) => m.user_id === me);
  const perm = projectPermissions(globalRole(S), myMembership && myMembership.role);
  const P = S.project || {};
  const M = S.metrics || {};
  const today = todayIso();
  const ro = !perm.canEdit, roManage = !perm.canManage;
  const clientName = (S.clients.find((c) => c.id === P.client_id) || {}).name || '';
  const status = M.status || 'Not Started';

  // ── deliverables ──
  const subsBy = {};
  S.submissions.forEach((s) => { (subsBy[s.deliverable_id] = subsBy[s.deliverable_id] || []).push(s); });
  const phases = [...new Set(S.deliverables.map((d) => d.phase).filter(Boolean))];
  const compOptions = [{ value: '', label: '—' }, ...S.components.map((c) => ({ value: c.id, label: `${c.code} ${c.name}`.trim() }))];
  const shownDeliverables = S.deliverables.filter((d) => (!S.sourceFilter || d.source === S.sourceFilter) && (!S.phaseFilter || d.phase === S.phaseFilter));
  const countSource = (k) => S.deliverables.filter((d) => d.source === k).length;
  const late = S.deliverables.filter((d) => isOverdue(d, today)).length;

  const deliverables = shownDeliverables.map((d) => {
    const subs = subsBy[d.id] || [];
    const lastSub = subs[subs.length - 1];
    const overdue = isOverdue(d, today);
    const delKey = `d:${d.id}`;
    return {
      id: d.id, phase: d.phase, title: d.title, source: d.source, sourceShort: SOURCE_SHORT[d.source], sourceRef: d.source_ref,
      component: d.component_id || '', baseline: d.baseline_date || '', forecast: d.forecast_date || '', actual: d.actual_date || '',
      hours: d.planned_hours == null ? '' : String(d.planned_hours), status: d.status,
      rowStyle: overdue ? 'background: #F6E7E4;' : '', titleStyle: d.title ? '' : 'background: #F5ECD3;',
      lateLabel: overdue ? 'LATE' : '', subsLabel: subs.length ? `${subs.length} · ${lastSub.revision}` : 'none',
      expanded: !!S.expanded[d.id], expandLabel: S.expanded[d.id] ? 'Hide' : 'Submissions',
      confirming: S.confirmDelete === delKey, notConfirming: S.confirmDelete !== delKey,
      setPhase: act.editDeliverable(d.id, 'phase'), setTitle: act.editDeliverable(d.id, 'title'), setSource: act.editDeliverable(d.id, 'source'),
      setRef: act.editDeliverable(d.id, 'source_ref'), setComponent: act.editDeliverable(d.id, 'component_id'),
      setBaseline: act.editDeliverable(d.id, 'baseline_date'), setForecast: act.editDeliverable(d.id, 'forecast_date'), setActual: act.editDeliverable(d.id, 'actual_date'),
      setHours: act.editDeliverable(d.id, 'planned_hours'), setStatus: act.editDeliverable(d.id, 'status'),
      toggle: () => act.toggleExpand(d.id), askDelete: () => act.askDelete(delKey), confirmDelete: () => act.removeRow('deliverables', d.id),
      addSubmission: () => act.addSubmission(d.id),
      checkpoint: () => act.openCheckpoint({ deliverableId: d.id }),
      voRef: d.variation_id ? d.source_ref || 'VO' : '',
      subs: subs.map((s) => {
        const sKey = `s:${s.id}`;
        return {
          revision: s.revision, submitted: s.submitted_on || '', response: s.client_response, responseOn: s.response_on || '', notes: s.notes,
          setRevision: act.editSubmission(s.id, 'revision'), setSubmitted: act.editSubmission(s.id, 'submitted_on'),
          setResponse: act.editSubmission(s.id, 'client_response'), setResponseOn: act.editSubmission(s.id, 'response_on'), setNotes: act.editSubmission(s.id, 'notes'),
          confirming: S.confirmDelete === sKey, notConfirming: S.confirmDelete !== sKey,
          askDelete: () => act.askDelete(sKey), confirmDelete: () => act.removeRow('submissions', s.id),
          checkpoint: () => act.openCheckpoint({ deliverableId: d.id, submissionId: s.id }),
        };
      }),
      noSubs: !subs.length,
    };
  });

  const paste = parseDeliverableRows(S.pasteText);

  // ── team ──
  const roleLabel = Object.fromEntries(PROJECT_ROLES);
  const here = S.presence.filter((p) => p.user_id !== me);
  const members = S.members
    .map((m) => ({ m, p: S.people[m.user_id] }))
    .sort((a, b) => PROJECT_ROLES.findIndex((r) => r[0] === a.m.role) - PROJECT_ROLES.findIndex((r) => r[0] === b.m.role))
    .map(({ m, p }) => {
      const key = `${m.project_id}|${m.user_id}`;
      const online = S.presence.find((x) => x.user_id === m.user_id);
      return {
        name: displayName(p) || '…', email: (p && p.email) || '', role: m.role, roleLabel: roleLabel[m.role], roleShort: PROJECT_ROLE_SHORT[m.role],
        isMe: m.user_id === me, online: online ? `Online · ${online.tab}` : '',
        setRole: act.setMemberRole(key),
        confirming: S.confirmDelete === `m:${key}`, notConfirming: S.confirmDelete !== `m:${key}`,
        askDelete: () => act.askDelete(`m:${key}`), confirmDelete: () => act.removeMember(key),
      };
    });
  const dms = S.members.filter((m) => m.role === 'dm').map((m) => displayName(S.people[m.user_id]) || '…');
  const ptms = S.members.filter((m) => m.role === 'ptm').map((m) => displayName(S.people[m.user_id]) || '…');

  return {
    ...shell,
    loading: !S.loaded && S.auth === 'ready', notFound: S.loaded && S.notFound, ready: S.loaded && !S.notFound,
    canEdit: perm.canEdit, canManage: perm.canManage, readOnly: ro, readOnlyManage: roManage,
    myRole: myMembership ? roleLabel[myMembership.role] : (perm.canManage ? 'Management' : ''),
    accessNote: perm.canEdit ? '' : 'You can view this project. Only its DM, PTM or management can change it.',
    hasAccessNote: !perm.canEdit,

    // header
    pName: P.name || '', pCode: P.code || '', pClient: clientName, pLocation: P.location || '',
    status, statusStyle: STATUS_CHIP[status] || '', statusBasis: M.status_basis || '',
    dmNames: dms.length ? dms.join(', ') : '[no DM yet]', ptmNames: ptms.length ? ptms.join(', ') : '[no PTM yet]',
    here: here.map((p) => ({ initials: initials(p.name || p.email), title: `${p.name || p.email} — ${p.tab}` })),
    hasHere: here.length > 0, hereLabel: here.length === 1 ? '1 other person here' : `${here.length} others here`,

    tabs: TAB_LABELS.map(([k, label]) => {
      const n = { deliverables: S.deliverables.length, timeline: S.milestones.length, queries: S.queries.filter((q) => q.status === 'Open').length, variations: S.variations.length, incidents: S.incidents.filter((i) => i.status !== 'Closed').length, team: S.members.length }[k];
      const inbox = k === 'variations' ? S.candidates.filter((c) => c.status === 'new').length : 0;
      return { label: `${n === undefined ? label : `${label} · ${n}`}${inbox ? ` · ✉ ${inbox} new` : ''}`, selected: S.tab === k ? 'true' : 'false', pick: () => act.setTab(k) };
    }),
    tOverview: S.tab === 'overview', tDeliverables: S.tab === 'deliverables', tTeam: S.tab === 'team',
    tVariations: S.tab === 'variations', tIncidents: S.tab === 'incidents', tHours: S.tab === 'hours',
    tTimeline: S.tab === 'timeline', tQueries: S.tab === 'queries',
    ...buildRegisters(S, act, perm),
    ...buildSchedule(S, act, perm),
    ...buildMail(S, act, perm),
    kConsumed: fmtHours(M.consumed_hours || 0), kBudgetTotal: fmtHours(M.budget_total ?? P.budget_hours), kEac: fmtHours(M.eac || 0),
    kPct: M.consumed_pct == null ? '—' : `${M.consumed_pct}%`, kVoOpen: M.vo_open || 0, kIncOpen: M.incidents_open || 0,

    // budget & progress
    ...buildProgress(S, P, M),

    // overview
    kTotal: M.deliverables_total || 0, kSubmitted: M.deliverables_submitted || 0, kApproved: M.deliverables_approved || 0,
    kLate: M.deliverables_overdue || 0, kAwaiting: M.awaiting_client || 0,
    kPlanned: fmtHours(M.planned_hours), kBudget: fmtHours(P.budget_hours),
    nextDue: M.next_due_on ? `${fmtDate(M.next_due_on)} · ${M.next_due_title || ''}` : '—',
    lastSub: M.last_submission_on ? `${fmtDate(M.last_submission_on)} · ${M.last_submission_title || ''} ${M.last_submission_rev || ''}`.trim() : '—',
    f: {
      name: P.name || '', code: P.code || '', client: P.client_id || '', location: P.location || '', stage: P.stage || '',
      override: P.status_override || '', po: P.po_status || 'Not Provided', start: P.start_date || '', baseline: P.baseline_finish || '',
      forecast: P.forecast_finish || '', actual: P.actual_finish || '', budget: P.budget_hours == null ? '' : String(P.budget_hours),
      fee: P.contract_fee == null ? '' : String(P.contract_fee), currency: P.currency || 'SAR',
      invoiced: P.invoiced_to_date == null ? '' : String(P.invoiced_to_date), cost: P.cost_to_date == null ? '' : String(P.cost_to_date),
      rfp: P.rfp_ref || '', proposal: P.proposal_ref || '', scope: P.scope_summary || '',
    },
    set: Object.fromEntries(['name', 'code', 'client_id', 'location', 'stage', 'status_override', 'po_status', 'start_date', 'baseline_finish', 'forecast_finish', 'actual_finish', 'budget_hours', 'contract_fee', 'currency', 'invoiced_to_date', 'cost_to_date', 'rfp_ref', 'proposal_ref', 'scope_summary']
      .map((k) => [k, act.editProject(k)])),
    clientOptions: S.clients.map((c) => ({ value: c.id, label: c.name })),
    overrideOptions: opts(STATUS_OVERRIDES), poOptions: opts(PO),
    components: S.components.map((c) => ({
      code: c.code, name: c.name, discipline: c.discipline, stage: c.stage, workStatus: c.work_status,
      setCode: act.editComponent(c.id, 'code'), setName: act.editComponent(c.id, 'name'), setDiscipline: act.editComponent(c.id, 'discipline'),
      setStage: act.editComponent(c.id, 'stage'), setWork: act.editComponent(c.id, 'work_status'),
      confirming: S.confirmDelete === `c:${c.id}`, notConfirming: S.confirmDelete !== `c:${c.id}`,
      askDelete: () => act.askDelete(`c:${c.id}`), confirmDelete: () => act.removeRow('components', c.id),
    })),
    noComponents: !S.components.length, addComponent: act.addComponent,
    canDelete: perm.canDelete, archived: !!P.archived,
    archiveLabel: P.archived ? 'Restore to portfolio' : 'Archive project',
    archiveNote: P.archived ? 'Archived — hidden from the Projects list.' : 'Archiving hides it from the Projects list; nothing is deleted.',
    toggleArchive: act.toggleArchive,
    confirmingProject: S.confirmDelete === 'project', notConfirmingProject: S.confirmDelete !== 'project',
    askDeleteProject: () => act.askDelete('project'), deleteProject: act.deleteProject,
    workOptions: opts(WORK_STATUSES),

    // deliverables
    sourceChips: SOURCES.map(([k, label]) => ({ label: `${label} · ${countSource(k)}`, style: S.sourceFilter === k ? TOGGLE_ON : FILTER_OFF, pick: () => act.setSourceFilter(k) })),
    phaseOptions: [{ value: '', label: 'All phases' }, ...phases.map((p) => ({ value: p, label: p }))], phaseFilter: S.phaseFilter, setPhaseFilter: act.setPhaseFilter,
    filtering: !!(S.sourceFilter || S.phaseFilter),
    contractLine: `${S.deliverables.length} deliverables · ${countSource('rfp') + countSource('proposal') + countSource('scope')} contracted (RFP, proposal, scope) · ${countSource('added') + countSource('vo')} added or by VO · ${late} late`,
    deliverables, hasDeliverables: deliverables.length > 0, noDeliverables: S.loaded && S.deliverables.length === 0,
    noneShown: S.deliverables.length > 0 && deliverables.length === 0,
    sourceOptions: SOURCES.map(([v, label]) => ({ value: v, label })), statusOptions: opts(DELIVERABLE_STATUSES), responseOptions: opts(SUBMISSION_RESPONSES), compOptions,
    addDeliverable: act.addDeliverable,
    pasteOpen: S.pasteOpen, togglePaste: act.togglePaste, pasteLabel: S.pasteOpen ? 'Close paste' : 'Paste from Excel…',
    pasteText: S.pasteText, setPasteText: act.setPasteText, importPaste: act.importPaste,
    pasteCount: paste.rows.length, pasteNone: paste.rows.length === 0,
    pasteSummary: S.pasteText.trim() ? `${paste.rows.length} row${paste.rows.length === 1 ? '' : 's'} ready${paste.errors.length ? ` · ${paste.errors.length} skipped` : ''}` : 'Paste rows copied from Excel (tab-separated).',
    pasteErrors: paste.errors.slice(0, 5), hasPasteErrors: paste.errors.length > 0,
    importLabel: paste.rows.length ? `Import ${paste.rows.length} deliverable${paste.rows.length === 1 ? '' : 's'}` : 'Import',

    // team
    members, noMembers: !S.members.length,
    invites: S.invites.map((i) => ({ email: i.email, role: PROJECT_ROLE_SHORT[i.role], confirming: S.confirmDelete === `i:${i.id}`, notConfirming: S.confirmDelete !== `i:${i.id}`, askDelete: () => act.askDelete(`i:${i.id}`), confirmDelete: () => act.cancelInvite(i.id) })),
    hasInvites: S.invites.length > 0,
    roleOptions: PROJECT_ROLES.map(([value, label]) => ({ value, label })),
    invite: act.invite, inviteBusy: S.inviteBusy, inviteLabel: S.inviteBusy ? 'Adding…' : 'Add to project',
    inviteErr: S.inviteErr, hasInviteErr: !!S.inviteErr, inviteMsg: S.inviteMsg, hasInviteMsg: !!S.inviteMsg,
    presenceList: S.presence.map((p) => ({ initials: initials(p.name || p.email), name: p.name || p.email, tab: p.tab, isMe: p.user_id === me })),
  };
}

// Budget (money) and progress: ours (delivered) vs. what the client has approved, next to hours burned.
const bar = (pct, color) => `width: ${Math.max(0, Math.min(100, Number(pct) || 0))}%; background: ${color};`;

function buildProgress(S, P, M) {
  const pr = S.progress || {};
  const cur = pr.currency || P.currency || '';
  const F = moneyFigures(S.progress, M);
  const gapNote = (v, ahead, behind) => (v == null || Math.abs(v) < 0.5 ? '' : (v > 0 ? ahead : behind).replace('{n}', String(Math.abs(v))));
  return {
    hasProgress: !!S.progress,
    bFee: fmtMoney(F.fee, cur), bFeeBase: fmtMoney(pr.contract_fee, cur), bFeeVo: fmtMoney(pr.vo_fee, cur),
    bInvoiced: fmtMoney(F.invoiced, cur), bBilledPct: fmtPct(F.billedPct), bRemaining: fmtMoney(F.remaining, cur),
    bCost: fmtMoney(F.cost, cur), bCostPct: fmtPct(F.costPct), bMargin: fmtMoney(F.margin, cur), bEarned: fmtMoney(F.earned, cur),
    bMarginStyle: F.margin != null && F.margin < 0 ? 'color: #B05A5A;' : '',
    pDelivered: fmtPct(F.completion), pApproved: fmtPct(F.approved), pHours: fmtPct(M.consumed_pct), pBilled: fmtPct(F.billedPct),
    barDelivered: bar(F.completion, '#5A63A8'), barApproved: bar(F.approved, '#7FA08A'), barHours: bar(M.consumed_pct, '#C2A25A'), barBilled: bar(F.billedPct, '#8C8FC0'),
    awaitingNote: gapNote(F.awaitingGap, '{n} points delivered but not yet approved by the client', ''),
    burnNote: gapNote(F.burnGap, 'Hours burned are {n} points ahead of delivery', 'Delivery is {n} points ahead of hours burned'),
    billingNote: gapNote(F.billingGap, 'Invoiced {n} points ahead of the work delivered', 'Invoiced {n} points behind the work delivered'),
    hasProgressNotes: !!(gapNote(F.awaitingGap, 'x', '') || gapNote(F.burnGap, 'x', 'x') || gapNote(F.billingGap, 'x', 'x')),
  };
}
