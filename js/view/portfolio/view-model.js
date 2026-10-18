// Projects page bindings.
import { buildShell } from '../shell.js';
import { isManagement } from '../../state/session-store.js';
import { fmtDate, fmtHours, displayName } from '../../ui/format.js';
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
  const overdue = all.reduce((n, x) => n + (x.m.deliverables_overdue || 0), 0);
  const budget = all.reduce((n, x) => n + Number(x.p.budget_hours || 0), 0);

  const dmIds = [...new Set(all.flatMap((x) => x.dms))];
  const canCreate = isManagement(S);

  return {
    ...shell,
    loading: !S.loaded && S.auth === 'ready',
    loaded: S.loaded,
    isEmpty: S.loaded && all.length === 0,
    hasRows: shown.length > 0,
    noMatch: S.loaded && all.length > 0 && shown.length === 0,
    canCreate, cannotCreate: !canCreate,
    kTotal: all.length, kOn: count('On Track'), kDelayed: count('Delayed'), kRisk: count('At Risk'), kHold: count('On Hold'), kOverdue: overdue,
    kBudget: fmtHours(budget),
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
      budget: fmtHours(p.budget_hours),
    })),
    creating: S.creating, notCreating: !S.creating,
    createBusy: S.createBusy, createErr: S.createErr, hasCreateErr: !!S.createErr,
    createLabel: S.createBusy ? 'Creating…' : 'Create project',
    openCreate: act.openCreate, closeCreate: act.closeCreate, createProject: act.createProject,
  };
}
