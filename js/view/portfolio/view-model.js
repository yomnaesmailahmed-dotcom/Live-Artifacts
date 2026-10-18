// Projects page bindings.
import { buildShell } from '../shell.js';
import { isManagement } from '../../state/session-store.js';
import { fmtDate, fmtHours, displayName, todayIso } from '../../ui/format.js';
import { STATUS_CHIP } from '../../ui/tokens.js';

const STATUSES = ['On Track', 'At Risk', 'Delayed', 'On Hold', 'Not Started', 'Completed', 'Not Awarded'];

export function buildViewModel(S, act) {
  const shell = buildShell(S, act, 'projects');
  const clientName = Object.fromEntries(S.clients.map((c) => [c.id, c.name]));
  const dmOf = {};
  S.members.filter((m) => m.role === 'dm').forEach((m) => { (dmOf[m.project_id] = dmOf[m.project_id] || []).push(m.user_id); });
  const nameOf = (id) => displayName(S.people[id]) || '…';

  const all = S.projects.filter((p) => !p.archived).map((p) => {
    const m = S.metrics[p.id] || {};
    const status = m.status || 'Not Started';
    return { p, m, status, dms: dmOf[p.id] || [] };
  });

  const F = S.filter;
  const q = F.q.trim().toLowerCase();
  const shown = all.filter(({ p, status, dms }) =>
    (!F.client || p.client_id === F.client) && (!F.status || status === F.status) && (!F.dm || dms.includes(F.dm))
    && (!q || `${p.code} ${p.name} ${clientName[p.client_id] || ''} ${p.location}`.toLowerCase().includes(q)))
    .sort((a, b) => (clientName[a.p.client_id] || '').localeCompare(clientName[b.p.client_id] || '') || String(a.p.code).localeCompare(String(b.p.code)) || a.p.name.localeCompare(b.p.name));

  const count = (s) => all.filter((x) => x.status === s).length;
  const sum = (f) => all.reduce((n, x) => n + Number(f(x) || 0), 0);
  const overdue = sum((x) => x.m.deliverables_overdue);
  const budget = sum((x) => (x.m.budget_total ?? x.p.budget_hours));
  const consumed = sum((x) => x.m.consumed_hours);
  const vos = sum((x) => x.m.vo_open), incs = sum((x) => x.m.incidents_open);

  const dmIds = [...new Set(all.flatMap((x) => x.dms))];

  // Waiting on you
  const today = todayIso();
  const projName = Object.fromEntries(S.projects.map((p) => [p.id, `${p.code ? p.code + ' · ' : ''}${p.name}`]));
  const waiting = [
    ...S.myQueries.filter((q) => q.status === 'Open').map((q) => ({
      sort: q.due_on || '9999', kind: 'QUERY', title: q.question, project: projName[q.project_id] || '',
      due: q.due_on ? fmtDate(q.due_on) : 'no due date', late: q.due_on && q.due_on < today ? 'OVERDUE' : '',
      href: `./Project.dc.html?id=${q.project_id}#queries`, verb: 'Answer',
    })),
    ...S.myActions.filter((a) => !['Done', 'Cancelled'].includes(a.status)).map((a) => ({
      sort: a.due_on || '9999', kind: 'ACTION', title: a.title || '(untitled action)', project: projName[a.project_id] || '',
      due: a.due_on ? fmtDate(a.due_on) : 'no due date', late: a.due_on && a.due_on < today ? 'OVERDUE' : '',
      href: `./Project.dc.html?id=${a.project_id}#timeline`, verb: 'Update',
    })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));
  const canCreate = isManagement(S);

  return {
    ...shell,
    loading: !S.loaded && S.auth === 'ready',
    loaded: S.loaded,
    isEmpty: S.loaded && all.length === 0,
    hasRows: shown.length > 0,
    noMatch: S.loaded && all.length > 0 && shown.length === 0,
    canCreate, cannotCreate: !canCreate,
    waiting, hasWaiting: waiting.length > 0, waitingLabel: `Waiting on you · ${waiting.length}`,
    kTotal: all.length, kOn: count('On Track'), kDelayed: count('Delayed'), kRisk: count('At Risk'), kHold: count('On Hold'), kOverdue: overdue,
    kBudget: fmtHours(budget), kConsumed: fmtHours(consumed), kVos: vos, kIncs: incs,
    kPct: budget > 0 ? `${Math.round((consumed / budget) * 1000) / 10}%` : '—',
    clientOptions: S.clients.map((c) => ({ value: c.id, label: c.name })),
    dmOptions: dmIds.map((id) => ({ value: id, label: nameOf(id) })),
    statusOptions: STATUSES.map((s) => ({ value: s, label: s })),
    fClient: F.client, fDm: F.dm, fStatus: F.status, fQ: F.q,
    setClient: act.setFilter('client'), setDm: act.setFilter('dm'), setStatus: act.setFilter('status'), setQ: act.setFilter('q'),
    clearFilters: act.clearFilters, filtersOn: !!(F.client || F.dm || F.status || F.q),
    shownLabel: shown.length === all.length ? `${all.length} project${all.length === 1 ? '' : 's'}` : `${shown.length} of ${all.length} projects`,
    rows: shown.map(({ p, m, status, dms }) => ({
      href: `./Project.dc.html?id=${p.id}`,
      code: p.code || '—', name: p.name, client: clientName[p.client_id] || '—',
      dm: dms.length ? dms.map(nameOf).join(', ') : '[needed]', dmStyle: dms.length ? '' : 'background: #FFF2CC;',
      status, statusStyle: STATUS_CHIP[status] || '', why: m.status_basis || '',
      deliv: m.deliverables_total ? `${m.deliverables_submitted} / ${m.deliverables_total}` : '—',
      overdue: m.deliverables_overdue ? `${m.deliverables_overdue} late` : '', overdueStyle: m.deliverables_overdue ? 'color: #C00000; font-weight: 600;' : '',
      next: m.next_due_on ? `${fmtDate(m.next_due_on)} · ${m.next_due_title || ''}` : '—',
      last: m.last_submission_on ? `${fmtDate(m.last_submission_on)} · ${m.last_submission_title || ''} ${m.last_submission_rev || ''}`.trim() : '—',
      budget: fmtHours(m.budget_total ?? p.budget_hours),
      hours: m.consumed_hours ? `${fmtHours(m.consumed_hours)} · ${m.consumed_pct ?? '—'}%` : '—',
      hoursStyle: m.consumed_pct >= Number((S.settings && S.settings.at_risk_pct) || 90) ? 'color: #A00000; font-weight: 600;' : '',
      eac: m.eac ? fmtHours(m.eac) : '—', eacStyle: Number(m.hours_variance) < 0 ? 'color: #C00000; font-weight: 600;' : '',
      open: [m.vo_open ? `${m.vo_open} VO` : '', m.incidents_open ? `${m.incidents_open} INC` : '', m.queries_open ? `${m.queries_open} Q` : '',
        m.actions_late ? `${m.actions_late} late ACT` : '', m.milestones_late ? `${m.milestones_late} slip` : ''].filter(Boolean).join(' · ') || '—',
    })),
    creating: S.creating, notCreating: !S.creating,
    createBusy: S.createBusy, createErr: S.createErr, hasCreateErr: !!S.createErr,
    createLabel: S.createBusy ? 'Creating…' : 'Create project',
    openCreate: act.openCreate, closeCreate: act.closeCreate, createProject: act.createProject,
  };
}
