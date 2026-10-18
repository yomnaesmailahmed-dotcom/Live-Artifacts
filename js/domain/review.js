// Management review over the real data: scope, data checks, changes since the last review,
// DM questions, conflicts, briefing notes, checklist and the Excel sheets. Pure functions only.
import { regNo } from './registers.js';
import { milestoneSlipDays, milestoneEffectiveFinish, actionLateReason, daysBetween } from './schedule.js';
import { isOverdue } from './deliverables.js';
import { fmtDate, fmtHours } from '../ui/format.js';

export const SCOPES = [['company', 'Whole company'], ['client', 'One client'], ['dm', 'One DM']];
const by = (list, key) => { const m = {}; list.forEach((x) => { (m[x[key]] = m[x[key]] || []).push(x); }); return m; };
const first = (s, n = 90) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));

// Group every per-project table once.
export function indexData(d) {
  return {
    ...d,
    metricsBy: Object.fromEntries((d.metrics || []).map((m) => [m.project_id, m])),
    membersBy: by(d.members || [], 'project_id'),
    deliverablesBy: by(d.deliverables || [], 'project_id'),
    variationsBy: by(d.variations || [], 'project_id'),
    incidentsBy: by(d.incidents || [], 'project_id'),
    milestonesBy: by(d.milestones || [], 'project_id'),
    actionsBy: by(d.actions || [], 'project_id'),
    queriesBy: by(d.queries || [], 'project_id'),
    statusesBy: by(d.statuses || [], 'project_id'),
    auditBy: by(d.audit || [], 'project_id'),
    clientName: Object.fromEntries((d.clients || []).map((c) => [c.id, c.name])),
    deliverableTitle: Object.fromEntries((d.deliverables || []).map((x) => [x.id, x.title || '(untitled)'])),
    milestoneTitle: Object.fromEntries((d.milestones || []).map((x) => [x.id, x.title || '(untitled)'])),
    // current rows, so a change list shows today's titles (items are often created blank, then named)
    current: Object.fromEntries([...(d.deliverables || []), ...(d.variations || []), ...(d.incidents || []), ...(d.milestones || []), ...(d.actions || []), ...(d.ptm_queries || d.queries || [])]
      .map((x) => [x.id, x])),
  };
}

export const dmOf = (D, pid) => ((D.membersBy[pid] || []).find((m) => m.role === 'dm') || {}).user_id || null;

export function scopeProjects(D, scope) {
  return (D.projects || []).filter((p) => !p.archived)
    .filter((p) => scope.kind !== 'client' || p.client_id === scope.clientId)
    .filter((p) => scope.kind !== 'dm' || (D.membersBy[p.id] || []).some((m) => m.role === 'dm' && m.user_id === scope.dmId))
    .sort((a, b) => (D.clientName[a.client_id] || '').localeCompare(D.clientName[b.client_id] || '') || String(a.code).localeCompare(String(b.code)) || a.name.localeCompare(b.name));
}

// ── step 2: is the data good enough to review? ──
export function dataChecks(D, p, until) {
  const out = [];
  const warn = (code, text) => out.push({ key: `chk:${p.id}:${code}`, level: 'warn', text });
  const m = D.metricsBy[p.id] || {};
  if (!dmOf(D, p.id)) warn('dm', 'No DM assigned');
  if (!Number(p.budget_hours)) warn('budget', 'No budget hours set');
  const monthStart = `${until.slice(0, 7)}-01`;
  if (!m.consumed_as_of) warn('pcu', 'No PCU hours entered');
  else if (daysBetween(m.consumed_as_of, monthStart) > 31) warn('pcu', `PCU hours last updated ${fmtDate(m.consumed_as_of).slice(3)}`);
  const statuses = D.statusesBy[p.id] || [];
  const lastStatus = statuses.map((s) => s.period_start).sort().pop();
  if (!lastStatus) warn('status', 'No team status posted');
  else if (daysBetween(lastStatus, until) > 14) warn('status', `Last team status ${fmtDate(lastStatus)}`);
  const undated = (D.deliverablesBy[p.id] || []).filter((x) => !x.baseline_date && !['Cancelled'].includes(x.status)).length;
  if (undated) warn('dates', `${undated} deliverable${undated === 1 ? '' : 's'} without a baseline date`);
  if (!(D.deliverablesBy[p.id] || []).length) warn('deliv', 'No deliverables registered');
  if (!(D.milestonesBy[p.id] || []).length) warn('ms', 'No milestones on the timeline');
  const overdueQ = (D.queriesBy[p.id] || []).filter((q) => q.status === 'Open' && q.due_on && q.due_on < until).length;
  if (overdueQ) warn('queries', `${overdueQ} PTM quer${overdueQ === 1 ? 'y' : 'ies'} overdue`);
  return out;
}

// ── step 3: what changed since the last review (from the audit trail) ──
function changeText(D, e) {
  const c = e.changes || {};
  const live = (D.current && D.current[e.row_id]) || {};
  const was = (k) => (Array.isArray(c[k]) ? c[k][0] : undefined);
  // inserts carry the row as created; prefer the current value for names
  const now = (k) => (Array.isArray(c[k]) ? c[k][1] : (e.action === 'INSERT' && live[k] !== undefined && live[k] !== '' ? live[k] : c[k]));
  const changed = (k) => Array.isArray(c[k]);
  const moved = (label, k) => (was(k) ? `${label} ${fmtDate(was(k))} → ${fmtDate(now(k))}` : `${label} set to ${fmtDate(now(k))}`);
  const ins = e.action === 'INSERT', del = e.action === 'DELETE';
  switch (e.table_name) {
    case 'submissions': {
      const t = D.deliverableTitle[now('deliverable_id')] || 'a deliverable';
      if (ins) return `Submitted ${now('revision') || ''} of ${t}`.replace(/\s+/g, ' ');
      if (changed('client_response')) return `Client response on ${t}: ${was('client_response')} → ${now('client_response')}`;
      return null;
    }
    case 'deliverables':
      if (ins) return `Added deliverable “${first(now('title'))}” (${String(now('source') || '').toUpperCase()})`;
      if (del) return `Removed deliverable “${first(now('title'))}”`;
      if (changed('status')) return `“${first(D.deliverableTitle[e.row_id] || now('title'))}”: ${was('status')} → ${now('status')}`;
      if (changed('forecast_date')) return `“${first(D.deliverableTitle[e.row_id])}” ${moved('forecast', 'forecast_date')}`;
      return null;
    case 'variations':
      if (ins) return `${regNo('VO', now('number'))} raised: ${first(now('title')) || '(untitled)'}`;
      if (changed('status')) return `${regNo('VO', live.number)} ${first(live.title, 50)}: ${was('status')} → ${now('status')}`;
      return null;
    case 'incidents':
      if (ins) return `${regNo('INC', now('number'))} logged (${now('origin')}): ${first(now('title')) || '(untitled)'}`;
      if (changed('status')) return `${regNo('INC', live.number)} ${first(live.title, 50)}: ${was('status')} → ${now('status')}`;
      return null;
    case 'milestones':
      if (ins) return `Milestone added: ${first(now('title')) || '(untitled)'}`;
      if (changed('actual_finish') && now('actual_finish')) return `“${first(D.milestoneTitle[e.row_id])}” finished ${fmtDate(now('actual_finish'))}`;
      if (changed('forecast_finish')) return `“${first(D.milestoneTitle[e.row_id])}” ${moved('forecast', 'forecast_finish')}`;
      if (changed('baseline_finish')) return `“${first(D.milestoneTitle[e.row_id])}” ${moved('baseline', 'baseline_finish')}`;
      return null;
    case 'actions':
      if (ins) return null;
      if (changed('status') && now('status') === 'Done') return `${regNo('ACT', live.number)} done: ${first(live.title || '')}`.trim();
      if (changed('due_on') && was('due_on')) return `${regNo('ACT', live.number)} ${first(live.title, 50)} due ${fmtDate(was('due_on'))} → ${fmtDate(now('due_on'))}`;
      return null;
    case 'ptm_queries':
      if (ins) return `Query raised: ${first(now('question'))}`;
      if (changed('answer') && now('answer')) return `Query answered: ${first(now('answer'))}`;
      return null;
    case 'team_status':
      if (ins) return `Team status (${now('team') || 'team'}): ${now('status_flag')}`;
      return null;
    case 'hours_snapshots':
      if (ins || changed('cumulative_hours')) return `PCU hours ${fmtDate(now('period')).slice(3)}: ${fmtHours(now('cumulative_hours'))}`;
      return null;
    case 'projects': {
      const parts = [];
      if (changed('budget_hours')) parts.push(`budget ${fmtHours(was('budget_hours'))} → ${fmtHours(now('budget_hours'))} h`);
      if (changed('forecast_finish')) parts.push(`forecast finish ${fmtDate(was('forecast_finish'))} → ${fmtDate(now('forecast_finish'))}`);
      if (changed('baseline_finish')) parts.push(`baseline finish ${fmtDate(was('baseline_finish'))} → ${fmtDate(now('baseline_finish'))}`);
      if (changed('status_override')) parts.push(`status set to “${now('status_override') || 'automatic'}”`);
      if (ins) return 'Project created';
      return parts.length ? `Project ${parts.join(', ')}` : null;
    }
    default: return null;
  }
}

export function changesSince(D, pid, since, until) {
  return (D.auditBy[pid] || [])
    .filter((e) => { const d = String(e.at).slice(0, 10); return d > since && d <= until; })
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .map((e) => ({ at: String(e.at).slice(0, 10), table: e.table_name, text: changeText(D, e) }))
    .filter((x) => x.text);
}

// ── step 5: questions for the DMs, generated from the gaps ──
export function dmQuestions(D, p, until) {
  const qs = [];
  const add = (code, text) => qs.push({ key: `q:${p.id}:${code}`.slice(0, 64), text });
  const m = D.metricsBy[p.id] || {};
  (D.milestonesBy[p.id] || []).filter((x) => milestoneSlipDays(x, until) > 0 && !x.forecast_finish)
    .forEach((x) => add(`ms${x.id.slice(0, 8)}`, `“${first(x.title, 60)}” passed its baseline (${fmtDate(x.baseline_finish)}). When will it finish?`));
  (D.deliverablesBy[p.id] || []).filter((x) => isOverdue(x, until)).slice(0, 3)
    .forEach((x) => add(`dl${x.id.slice(0, 8)}`, `“${first(x.title, 60)}” was due ${fmtDate(x.forecast_date || x.baseline_date)}. What is the new date?`));
  (D.variationsBy[p.id] || []).filter((v) => v.direction === 'external' && ['candidate', 'draft'].includes(v.status))
    .forEach((v) => add(`vo${v.id.slice(0, 8)}`, `${regNo('VO', v.number)} “${first(v.title, 50)}” is still a draft. When does it go to the client?`));
  (D.incidentsBy[p.id] || []).filter((i) => i.status !== 'Closed' && (i.responsibility === 'To Be Confirmed' || i.responsibility_basis === 'Not established'))
    .forEach((i) => add(`in${i.id.slice(0, 8)}`, `${regNo('INC', i.number)} “${first(i.title, 50)}”: who is responsible, and is it documented?`));
  if (!m.consumed_as_of || daysBetween(m.consumed_as_of, `${until.slice(0, 7)}-01`) > 31) add('pcu', 'Can PCU confirm consumed hours for this month?');
  (D.queriesBy[p.id] || []).filter((q) => q.status === 'Open' && q.due_on && q.due_on < until)
    .forEach((q) => add(`pq${q.id.slice(0, 8)}`, `${regNo('Q', q.number)} from the team is overdue: “${first(q.question, 70)}”`));
  return qs;
}

// ── step 6: where two sources disagree (the reviewer picks) ──
export function conflicts(D, p, until) {
  const out = [];
  const m = D.metricsBy[p.id] || {};
  const latest = (D.statusesBy[p.id] || []).slice().sort((a, b) => String(b.period_start).localeCompare(String(a.period_start)))[0];
  if (latest && latest.status_flag === 'On Track' && ['Delayed', 'At Risk'].includes(m.status)) {
    out.push({ key: `c:team:${p.id}`, field: 'Status', a: `On Track — team (${latest.team || 'team'}, week of ${fmtDate(latest.period_start)})`, srcA: 'Team status', b: `${m.status} — ${m.status_basis}`, srcB: 'Project data' });
  }
  const msFinish = (D.milestonesBy[p.id] || []).map((x) => milestoneEffectiveFinish(x, until)).filter(Boolean).sort().pop();
  const projFinish = p.forecast_finish || m.adjusted_finish || p.baseline_finish;
  if (msFinish && projFinish && msFinish > projFinish) {
    out.push({ key: `c:finish:${p.id}`, field: 'Finish date', a: fmtDate(projFinish), srcA: p.forecast_finish ? 'Project forecast' : 'Contract finish', b: fmtDate(msFinish), srcB: 'Latest milestone' });
  }
  (D.incidentsBy[p.id] || []).filter((i) => i.status !== 'Closed' && !['To Be Confirmed'].includes(i.responsibility) && i.responsibility_basis === 'Not established')
    .forEach((i) => out.push({ key: `c:resp:${i.id}`, field: `${regNo('INC', i.number)} responsibility`, a: i.responsibility, srcA: 'Named on the incident', b: 'To Be Confirmed', srcB: 'No documented basis' }));
  return out;
}

// ── step 7/8: briefing notes and checklist ──
export function briefing(D, projects, decisions, until, cur = 'SAR') {
  const M = (p) => D.metricsBy[p.id] || {};
  const statusOf = (p) => (decisions.override[p.id] || M(p).status || 'Not Started');
  const count = (s) => projects.filter((p) => statusOf(p) === s).length;
  const budget = projects.reduce((n, p) => n + Number(M(p).budget_total ?? p.budget_hours ?? 0), 0);
  const consumed = projects.reduce((n, p) => n + Number(M(p).consumed_hours || 0), 0);
  const lines = [];
  lines.push(`Portfolio: ${projects.length} project${projects.length === 1 ? '' : 's'} — ${count('On Track')} on track, ${count('Delayed')} delayed, ${count('At Risk')} at risk, ${count('On Hold')} on hold. ${fmtHours(consumed)} of ${fmtHours(budget)} budget hours consumed${budget ? ` (${Math.round((consumed / budget) * 1000) / 10}%)` : ''}.`);
  const delayed = projects.filter((p) => statusOf(p) === 'Delayed');
  if (delayed.length) lines.push(`Delayed: ${delayed.map((p) => `${p.name} (${decisions.wording[p.id] || M(p).status_basis}${decisions.resp[p.id] ? `; responsibility ${decisions.resp[p.id]}` : ''})`).join('; ')}.`);
  const pressure = projects.filter((p) => Number(M(p).consumed_pct) >= Number((D.settings && D.settings.at_risk_pct) || 90) || Number(M(p).hours_variance) < 0);
  if (pressure.length) lines.push(`Budget pressure: ${pressure.map((p) => `${p.name} at ${M(p).consumed_pct ?? '—'}% (forecast ${fmtHours(M(p).eac)} vs ${fmtHours(M(p).budget_total)} h)`).join('; ')}.`);
  const vos = projects.flatMap((p) => (D.variationsBy[p.id] || []).filter((v) => v.direction === 'external' && ['draft', 'submitted', 'candidate'].includes(v.status)).map((v) => `${p.name} ${regNo('VO', v.number)}${v.fee_impact ? ` (${Number(v.fee_impact).toLocaleString('en-US')} ${cur})` : ''}`));
  if (vos.length) lines.push(`Variations awaiting the client or not yet sent: ${vos.join('; ')}.`);
  const inc = projects.flatMap((p) => (D.incidentsBy[p.id] || []).filter((i) => i.status !== 'Closed').map((i) => `${p.name} ${regNo('INC', i.number)} (${i.origin})`));
  if (inc.length) lines.push(`Open incidents: ${inc.join('; ')}.`);
  const needResp = delayed.filter((p) => !decisions.resp[p.id]);
  if (needResp.length) lines.push(`Decisions needed: delay responsibility for ${needResp.map((p) => p.name).join(', ')}.`);
  return lines;
}

export function checklist({ projects, reviewedCards, questionsTotal, answered, conflictsTotal, resolved, approvedStatuses, delayedCount, respSet, warnings }) {
  const ck = (good, t) => ({ good, t });
  return [
    ck(warnings === 0, warnings ? `${warnings} data warning${warnings === 1 ? '' : 's'} open (step 2).` : 'Data checks clear.'),
    ck(reviewedCards === projects, `Project cards reviewed — ${reviewedCards} of ${projects}.`),
    ck(questionsTotal === 0 || answered === questionsTotal, `DM answers recorded — ${answered} of ${questionsTotal}.`),
    ck(resolved === conflictsTotal, `Conflicts resolved — ${resolved} of ${conflictsTotal}.`),
    ck(approvedStatuses === projects, `Statuses approved — ${approvedStatuses} of ${projects}.`),
    ck(respSet >= delayedCount, `Delay responsibility set — ${respSet} of ${delayedCount} delayed project${delayedCount === 1 ? '' : 's'}.`),
    ck(true, 'Every figure comes from the project registers — nothing typed into the summary.'),
  ];
}

// ── step 8: workbook content (rows of plain values) ──
export function workbookSheets(D, projects, decisions, since, until) {
  const M = (p) => D.metricsBy[p.id] || {};
  const summary = [['Client', 'Code', 'Project', 'Status', 'Reason / commentary', 'Responsibility', 'Last submission', 'Next due', 'Late deliverables', 'Budget h (incl. VOs)', 'Consumed h', 'Consumed %', 'At completion h', 'Open VOs', 'Open incidents', 'Slipping milestones', 'Late actions']];
  projects.forEach((p) => {
    const m = M(p);
    summary.push([D.clientName[p.client_id] || '', p.code || '', p.name, decisions.override[p.id] || m.status || '', decisions.wording[p.id] || m.status_basis || '', decisions.resp[p.id] || '',
      m.last_submission_on ? `${m.last_submission_on} ${m.last_submission_title || ''}` : '', m.next_due_on ? `${m.next_due_on} ${m.next_due_title || ''}` : '',
      m.deliverables_overdue || 0, Number(m.budget_total || 0), Number(m.consumed_hours || 0), m.consumed_pct == null ? '' : Number(m.consumed_pct),
      Number(m.eac || 0), m.vo_open || 0, m.incidents_open || 0, m.milestones_late || 0, m.actions_late || 0]);
  });
  const changes = [['Date', 'Project', 'Register', 'Change']];
  projects.forEach((p) => changesSince(D, p.id, since, until).forEach((c) => changes.push([c.at, p.name, c.table, c.text])));
  const open = [['Project', 'Item', 'Title', 'Status', 'Due / date', 'Impact']];
  projects.forEach((p) => {
    (D.variationsBy[p.id] || []).filter((v) => !['approved', 'rejected', 'withdrawn'].includes(v.status))
      .forEach((v) => open.push([p.name, regNo('VO', v.number), v.title, v.status, v.submitted_on || '', `${v.time_impact_days ?? ''} d / ${v.hours_impact ?? ''} h / ${v.fee_impact ?? ''}`]));
    (D.incidentsBy[p.id] || []).filter((i) => i.status !== 'Closed')
      .forEach((i) => open.push([p.name, regNo('INC', i.number), i.title, `${i.status} (${i.origin})`, i.occurred_on || '', `${i.time_impact_days ?? ''} d / ${i.hours_impact ?? ''} h / ${i.cost_impact ?? ''}`]));
    const msBy = Object.fromEntries((D.milestonesBy[p.id] || []).map((x) => [x.id, x]));
    (D.actionsBy[p.id] || []).filter((a) => actionLateReason(a, msBy[a.milestone_id], until))
      .forEach((a) => open.push([p.name, regNo('ACT', a.number), a.title, a.status, a.due_on || '', actionLateReason(a, msBy[a.milestone_id], until)]));
    (D.queriesBy[p.id] || []).filter((q) => q.status === 'Open')
      .forEach((q) => open.push([p.name, regNo('Q', q.number), q.question, q.priority, q.due_on || '', '']));
  });
  return { summary, changes, open };
}
