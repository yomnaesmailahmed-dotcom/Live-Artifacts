// Schedule rules (mirror project_metrics in SQL) and the timeline / Gantt layout.

export const MILESTONE_KINDS = ['Phase', 'Milestone', 'Client review', 'Submission', 'Other'];
export const ACTION_STATUSES = ['Not Started', 'In Progress', 'Blocked', 'Done', 'Cancelled'];
export const QUERY_STATUSES = ['Open', 'Answered', 'Closed'];
export const PRIORITIES = ['Normal', 'High', 'Urgent'];
export const STATUS_FLAGS = ['On Track', 'At Risk', 'Blocked'];
const CLOSED_ACTION = new Set(['Done', 'Cancelled']);

const DAY = 86400000;
const toMs = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
const maxIso = (...xs) => xs.filter(Boolean).sort().pop() || null;
const minIso = (...xs) => xs.filter(Boolean).sort()[0] || null;

// An unfinished milestone's effective finish is its forecast (else baseline), never earlier than today.
export function milestoneEffectiveFinish(m, today) {
  if (m.actual_finish) return m.actual_finish;
  const f = m.forecast_finish || m.baseline_finish;
  return f ? maxIso(f, today) : null;
}
export function milestoneSlipDays(m, today) {
  if (m.actual_finish || !m.baseline_finish) return 0;
  return Math.max(0, daysBetween(m.baseline_finish, milestoneEffectiveFinish(m, today)));
}

// An action is late when it is open and past due, or due after the forecast of the milestone it serves.
export function actionLateReason(a, milestone, today) {
  if (CLOSED_ACTION.has(a.status) || !a.due_on) return '';
  if (a.due_on < today) return `${daysBetween(a.due_on, today)} days overdue`;
  const mf = milestone && (milestone.forecast_finish || milestone.baseline_finish);
  if (mf && a.due_on > mf) return `due ${daysBetween(mf, a.due_on)} days after “${milestone.title || 'its milestone'}”`;
  return '';
}

export const isOpenAction = (a) => !CLOSED_ACTION.has(a.status);

// Monday of the ISO week (team status periods).
export function weekStart(iso) {
  const d = new Date(toMs(iso));
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(toMs(iso) - dow * DAY).toISOString().slice(0, 10);
}

// Gantt layout: one shared date range; every bar becomes left/width percentages.
export function timelineRange(milestones, actions, today) {
  const dates = [today];
  milestones.forEach((m) => dates.push(m.baseline_start, m.baseline_finish, m.forecast_finish, m.actual_finish));
  actions.forEach((a) => dates.push(a.start_on, a.due_on, a.done_on));
  let start = minIso(...dates), end = maxIso(...dates);
  if (daysBetween(start, end) < 28) end = new Date(toMs(start) + 28 * DAY).toISOString().slice(0, 10);
  // pad a few days either side so markers aren't on the edge
  start = new Date(toMs(start) - 3 * DAY).toISOString().slice(0, 10);
  end = new Date(toMs(end) + 3 * DAY).toISOString().slice(0, 10);
  return { start, end, days: daysBetween(start, end) };
}

export function pct(range, iso) {
  return Math.min(100, Math.max(0, (daysBetween(range.start, iso) / range.days) * 100));
}

export function span(range, from, to) {
  if (!from && !to) return null;
  const a = from || to, b = to || from;
  const left = pct(range, minIso(a, b)), right = pct(range, maxIso(a, b));
  return { left: round(left), width: round(Math.max(right - left, 0.8)) };
}

export function monthTicks(range) {
  const ticks = [];
  let y = +range.start.slice(0, 4), m = +range.start.slice(5, 7);
  for (let i = 0; i < 60; i++) {
    m += 1; if (m > 12) { m = 1; y += 1; }
    const iso = `${y}-${String(m).padStart(2, '0')}-01`;
    if (iso > range.end) break;
    ticks.push({ iso, left: round(pct(range, iso)) });
  }
  return ticks;
}

const round = (n) => Math.round(n * 100) / 100;
