// Project page: Timeline (Gantt + milestones + action plan) and Queries & status bindings.
import { MILESTONE_KINDS, ACTION_STATUSES, QUERY_STATUSES, PRIORITIES, STATUS_FLAGS, milestoneSlipDays, actionLateReason, isOpenAction, timelineRange, span, pct, monthTicks, weekStart } from '../../domain/schedule.js';
import { regNo } from '../../domain/registers.js';
import { fmtDate, todayIso, displayName } from '../../ui/format.js';
import { CHIP_DONE, CHIP_OPEN, TOGGLE_ON, FILTER_OFF } from '../../ui/tokens.js';

const opts = (list) => list.map((v) => (Array.isArray(v) ? { value: v[0], label: v[1] } : { value: v, label: v }));
const str = (v) => (v === null || v === undefined ? '' : String(v));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FLAG_STYLE = { 'On Track': CHIP_DONE, 'At Risk': CHIP_OPEN, Blocked: 'background: #FDECEC; border-color: #C00000; color: #A00000;' };
const QUERY_STYLE = { Open: CHIP_OPEN, Answered: 'background: #F2F5FF; border-color: #2F5BFF; color: #1E3FBF;', Closed: CHIP_DONE };

export function buildSchedule(S, act, perm) {
  const today = todayIso();
  const me = S.user && S.user.id;
  const M = S.metrics || {};
  const msById = Object.fromEntries(S.milestones.map((m) => [m.id, m]));
  const name = (id) => displayName(S.people[id]) || '…';
  const confirm = (key) => ({ confirming: S.confirmDelete === key, notConfirming: S.confirmDelete !== key, askDelete: () => act.askDelete(key) });
  const memberOptions = [{ value: '', label: '— named below —' }, ...S.members.map((m) => ({ value: m.user_id, label: `${name(m.user_id)} (${m.role.toUpperCase()})` }))];
  const msOptions = [{ value: '', label: '— no milestone —' }, ...S.milestones.map((m) => ({ value: m.id, label: m.title || '(untitled milestone)' }))];
  const delOptions = [{ value: '', label: '— none —' }, ...S.deliverables.map((d) => ({ value: d.id, label: d.title || '(untitled)' }))];
  const compOptions = [{ value: '', label: '— whole project —' }, ...S.components.map((c) => ({ value: c.id, label: `${c.code} ${c.name}`.trim() }))];

  // ── Gantt ──
  const range = timelineRange(S.milestones, S.actions, today);
  const todayLeft = pct(range, today);
  const bar = (from, to, style) => { const s = span(range, from, to); return s ? `left: ${s.left}%; width: ${s.width}%; ${style}` : 'display: none;'; };
  const ganttRow = (label, sub, base, extra, done, kind, lateText) => ({ label, sub, base, extra, done, kind, lateText, today: `left: ${todayLeft}%;` });
  const rows = [];
  const actionsBy = {};
  S.actions.forEach((a) => { (actionsBy[a.milestone_id || ''] = actionsBy[a.milestone_id || ''] || []).push(a); });
  const actionRow = (a) => {
    const late = actionLateReason(a, msById[a.milestone_id], today);
    const done = !isOpenAction(a);
    return ganttRow(`${regNo('ACT', a.number)} ${a.title || '(untitled action)'}`, `${a.owner_id ? name(a.owner_id) : (a.owner_name || 'no owner')} · ${a.status}`,
      bar(a.start_on || a.due_on, a.due_on || a.start_on, done ? 'background: #8A8F96;' : (late ? 'background: #C00000;' : 'background: #2F5BFF;')),
      'display: none;', 'display: none;', 'action', late);
  };
  S.milestones.forEach((m) => {
    const slip = milestoneSlipDays(m, today);
    const effective = m.actual_finish || (m.forecast_finish || m.baseline_finish ? [m.forecast_finish || m.baseline_finish, today].sort().pop() : null);
    rows.push(ganttRow(m.title || '(untitled milestone)', `${m.kind}${m.baseline_finish ? ' · baseline ' + fmtDate(m.baseline_finish) : ''}`,
      bar(m.baseline_start || m.baseline_finish, m.baseline_finish, 'background: #C9CDD6;'),
      slip ? bar(m.baseline_finish, effective, 'background: repeating-linear-gradient(45deg, #C00000 0 4px, #FDECEC 4px 8px);') : 'display: none;',
      m.actual_finish ? bar(m.actual_finish, m.actual_finish, 'background: #16191D; width: 6px;') : 'display: none;',
      'milestone', slip ? `${slip} days late` : ''));
    (actionsBy[m.id] || []).forEach((a) => rows.push(actionRow(a)));
  });
  (actionsBy[''] || []).forEach((a) => rows.push(actionRow(a)));
  const ticks = monthTicks(range).map((t) => ({ left: `left: ${t.left}%;`, label: `${MONTHS[+t.iso.slice(5, 7) - 1]} ${t.iso.slice(2, 4)}` }));

  // ── milestone + action tables ──
  const milestones = S.milestones.map((m) => {
    const slip = milestoneSlipDays(m, today);
    return {
      title: m.title, phase: m.phase, kind: m.kind, component: m.component_id || '',
      start: str(m.baseline_start), baseline: str(m.baseline_finish), forecast: str(m.forecast_finish), actual: str(m.actual_finish),
      slipLabel: slip ? `${slip}d LATE` : (m.actual_finish ? 'DONE' : ''), slipStyle: slip ? 'color: #A00000; font-weight: 600;' : 'color: #5B6068;',
      rowStyle: slip ? 'background: #FDECEC;' : '',
      actionsCount: (actionsBy[m.id] || []).length,
      set: Object.fromEntries(['title', 'phase', 'kind', 'component_id', 'baseline_start', 'baseline_finish', 'forecast_finish', 'actual_finish'].map((k) => [k, act.editMilestone(m.id, k)])),
      addAction: () => act.addAction(m.id),
      ...confirm(`ms:${m.id}`), confirmDelete: () => act.removeRow('milestones', m.id),
    };
  });
  const actions = S.actions.map((a) => {
    const late = actionLateReason(a, msById[a.milestone_id], today);
    const mine = a.owner_id === me;
    const full = perm.canEdit, progress = perm.canEdit || (mine && perm.canContribute);
    return {
      no: regNo('ACT', a.number), title: a.title, owner: a.owner_id || '', ownerName: a.owner_name, milestone: a.milestone_id || '', deliverable: a.deliverable_id || '',
      start: str(a.start_on), due: str(a.due_on), done: str(a.done_on), status: a.status, planned: str(a.planned_hours), actual: str(a.actual_hours), notes: a.notes,
      late, rowStyle: late ? 'background: #FDECEC;' : (isOpenAction(a) ? '' : 'background: #F6F5F1;'),
      mineLabel: mine ? 'YOURS' : '', roFull: !full, roProgress: !progress,
      set: Object.fromEntries(['title', 'owner_id', 'owner_name', 'milestone_id', 'deliverable_id', 'start_on', 'due_on', 'status', 'planned_hours', 'actual_hours', 'notes'].map((k) => [k, act.editAction(a.id, k)])),
      ...confirm(`ac:${a.id}`), confirmDelete: () => act.removeRow('actions', a.id),
    };
  });

  // ── queries ──
  const dm = S.members.find((m) => m.role === 'dm');
  const qShown = S.queries.filter((q) => S.queryFilter === 'all' || (S.queryFilter === 'open' ? q.status === 'Open' : q.assigned_to === me && q.status === 'Open'));
  const queries = qShown.map((q) => {
    const canAnswer = perm.canEdit || q.assigned_to === me;
    const canEditQ = perm.canEdit || q.raised_by === me;
    const overdue = q.status === 'Open' && q.due_on && q.due_on < today;
    return {
      no: regNo('Q', q.number), question: q.question, context: q.context, priority: q.priority, status: q.status, statusStyle: QUERY_STYLE[q.status] || '',
      priorityStyle: q.priority === 'Urgent' ? 'color: #A00000; font-weight: 600;' : (q.priority === 'High' ? 'color: #5C4300; font-weight: 600;' : 'color: #5B6068;'),
      from: q.raised_by ? name(q.raised_by) : '—', to: q.assigned_to ? name(q.assigned_to) : 'unassigned', assignee: q.assigned_to || '',
      due: str(q.due_on), dueLabel: q.due_on ? fmtDate(q.due_on) : 'no due date', overdueLabel: overdue ? 'OVERDUE' : '',
      linked: [q.milestone_id && msById[q.milestone_id] ? msById[q.milestone_id].title : '', q.deliverable_id ? (S.deliverables.find((d) => d.id === q.deliverable_id) || {}).title || '' : ''].filter(Boolean).join(' · '),
      answer: q.answer, answeredLine: q.answered_at ? `Answered by ${q.answered_by ? name(q.answered_by) : '…'} · ${fmtDate(String(q.answered_at).slice(0, 10))}` : '',
      roAnswer: !canAnswer, roQuestion: !canEditQ, canClose: (canAnswer || canEditQ) && q.status !== 'Closed', canReopen: (canAnswer || canEditQ) && q.status === 'Closed',
      cardStyle: q.assigned_to === me && q.status === 'Open' ? 'border-color: #C9A227;' : '',
      set: Object.fromEntries(['question', 'context', 'priority', 'assigned_to', 'due_on', 'answer', 'status'].map((k) => [k, act.editQuery(q.id, k)])),
      close: () => act.editQuery(q.id, 'status')('Closed'), reopen: () => act.editQuery(q.id, 'status')('Open'),
      ...confirm(`q:${q.id}`), confirmDelete: () => act.removeRow('queries', q.id),
    };
  });
  const qCount = (f) => S.queries.filter(f).length;

  // ── team status ──
  const statuses = S.statuses.map((s) => {
    const canEditS = perm.canEdit || s.reported_by === me;
    return {
      week: `Week of ${fmtDate(s.period_start)}`, team: s.team || 'Team', by: s.reported_by ? name(s.reported_by) : '—',
      flag: s.status_flag, flagStyle: FLAG_STYLE[s.status_flag] || '', progress: str(s.progress_pct), hours: str(s.hours_this_period),
      doneText: s.done_text, nextText: s.next_text, blockers: s.blockers, blockersStyle: s.blockers ? 'border-color: #C00000;' : '', ro: !canEditS,
      set: Object.fromEntries(['team', 'status_flag', 'progress_pct', 'hours_this_period', 'done_text', 'next_text', 'blockers'].map((k) => [k, act.editStatus(s.id, k)])),
      ...confirm(`st:${s.id}`), confirmDelete: () => act.removeRow('statuses', s.id), canDelete: canEditS,
    };
  });

  return {
    // timeline
    ganttRows: rows, hasGantt: rows.length > 0, ticks, ganttRange: `${fmtDate(range.start)} – ${fmtDate(range.end)}`,
    milestones, hasMilestones: milestones.length > 0, noMilestones: S.loaded && milestones.length === 0,
    actions, hasActions: actions.length > 0, noActions: S.loaded && actions.length === 0,
    scheduleLine: `${M.milestones_total || 0} milestones · ${M.milestones_done || 0} done · ${M.milestones_late || 0} slipping${M.max_slip_days ? ` (up to ${M.max_slip_days} days)` : ''} · ${M.actions_open || 0} open actions · ${M.actions_late || 0} late${M.next_milestone_on ? ` · next: ${M.next_milestone_title || ''} ${fmtDate(M.next_milestone_on)}` : ''}`,
    addMilestone: act.addMilestone, addLooseAction: () => act.addAction(null),
    kindOptions: opts(MILESTONE_KINDS), actionStatusOptions: opts(ACTION_STATUSES), memberOptions, msOptions, actDelOptions: delOptions, msCompOptions: compOptions,
    // queries
    canContribute: perm.canContribute, queries, hasQueries: queries.length > 0, noQueries: S.loaded && queries.length === 0,
    queryTabs: [['open', `Open · ${qCount((q) => q.status === 'Open')}`], ['mine', `Assigned to me · ${qCount((q) => q.assigned_to === me && q.status === 'Open')}`], ['all', `All · ${S.queries.length}`]]
      .map(([k, label]) => ({ label, style: S.queryFilter === k ? TOGGLE_ON : FILTER_OFF, pick: () => act.setQueryFilter(k) })),
    queryLine: `${M.queries_open || 0} open · ${M.queries_overdue || 0} overdue`,
    raiseQuery: act.raiseQuery, queryBusy: S.queryBusy, queryErr: S.queryErr, hasQueryErr: !!S.queryErr, queryLabel: S.queryBusy ? 'Sending…' : 'Raise query',
    defaultAssignee: dm ? dm.user_id : '', assigneeOptions: [{ value: '', label: '— unassigned —' }, ...S.members.filter((m) => m.role !== 'viewer').map((m) => ({ value: m.user_id, label: `${name(m.user_id)} (${m.role.toUpperCase()})` }))],
    priorityOptions: opts(PRIORITIES), queryStatusOptions: opts(QUERY_STATUSES), qMsOptions: msOptions, qDelOptions: delOptions,
    // team status
    statuses, hasStatuses: statuses.length > 0, noStatuses: S.loaded && statuses.length === 0,
    addStatus: act.addStatus, statusBusy: S.statusBusy, statusErr: S.statusErr, hasStatusErr: !!S.statusErr, statusLabel: S.statusBusy ? 'Saving…' : 'Post update',
    thisWeek: weekStart(today), flagOptions: opts(STATUS_FLAGS),
    latestFlag: M.status_flag || '', latestFlagStyle: FLAG_STYLE[M.status_flag] || '', hasLatestFlag: !!M.status_flag,
    latestLine: M.status_reported_on ? `Latest team status (week of ${fmtDate(M.status_reported_on)})${M.status_progress != null ? ` · ${M.status_progress}% complete` : ''}` : '',
  };
}
