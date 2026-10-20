// Maps the columns of an uploaded sheet onto a register (deliverables, milestones, actions, hours) by header name,
// checks every row and drops what is already in the project. Pure functions: the store does the saving.
import { parseDateLoose } from '../ui/format.js';
import { sourceKey, DELIVERABLE_STATUSES } from './deliverables.js';
import { MILESTONE_KINDS, ACTION_STATUSES } from './schedule.js';
import { toPeriod } from './registers.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// field: [accepted header names…]
export const TARGETS = {
  deliverables: {
    label: 'Deliverables', required: 'title',
    fields: {
      title: ['deliverable', 'deliverable name', 'deliverables', 'title', 'document', 'document title', 'description', 'name'],
      phase: ['phase', 'stage', 'design stage'],
      source: ['source', 'origin', 'contract source'],
      source_ref: ['source ref', 'source reference', 'reference', 'ref', 'clause', 'rfp ref'],
      baseline_date: ['baseline', 'baseline date', 'due', 'due date', 'planned date', 'submission date', 'target date', 'date'],
      forecast_date: ['forecast', 'forecast date', 'revised date'],
      actual_date: ['actual', 'actual date', 'submitted', 'submitted on', 'date submitted'],
      planned_hours: ['planned hours', 'plan hours', 'hours', 'budget hours', 'man hours', 'manhours', 'plan h'],
      status: ['status'],
    },
  },
  milestones: {
    label: 'Milestones', required: 'title',
    fields: {
      title: ['milestone', 'milestone name', 'milestones', 'title', 'activity', 'task name', 'name'],
      phase: ['phase', 'stage'],
      kind: ['kind', 'type', 'category'],
      baseline_start: ['baseline start', 'start', 'start date', 'planned start'],
      baseline_finish: ['baseline finish', 'baseline', 'finish', 'finish date', 'end', 'end date', 'due', 'due date', 'planned finish'],
      forecast_finish: ['forecast finish', 'forecast', 'forecast date', 'revised finish'],
      actual_finish: ['actual finish', 'actual', 'actual date', 'completed', 'completed on'],
    },
  },
  actions: {
    label: 'Actions', required: 'title',
    fields: {
      title: ['action', 'action item', 'actions', 'title', 'task', 'description', 'item'],
      owner_name: ['owner', 'assigned to', 'responsible', 'assignee', 'action by'],
      start_on: ['start', 'start date', 'started'],
      due_on: ['due', 'due date', 'deadline', 'target date', 'finish', 'end date'],
      status: ['status', 'state'],
      planned_hours: ['planned hours', 'plan hours', 'hours', 'estimate', 'plan h'],
      actual_hours: ['actual hours', 'spent', 'hours spent', 'actual h'],
      notes: ['notes', 'comments', 'remarks'],
    },
  },
  hours: {
    label: 'Hours (PCU)', required: 'cumulative_hours',
    fields: {
      period: ['month', 'period', 'date', 'as of'],
      component: ['component', 'component code', 'code', 'package', 'plot'],
      cumulative_hours: ['cumulative hours', 'hours', 'total hours', 'consumed hours', 'consumed', 'hours to date', 'man hours', 'manhours'],
      progress_pct: ['progress', 'progress %', 'progress pct', 'percent complete', '% complete', 'completion'],
    },
  },
};
export const TARGET_OPTIONS = Object.entries(TARGETS).map(([value, t]) => ({ value, label: t.label }));

// Find the header row (first 10 rows) and map each column to at most one field: exact names win, then "contains".
export function mapColumns(target, rows) {
  const def = TARGETS[target];
  let best = { score: -1, row: 0, map: [] };
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const heads = (rows[r] || []).map(norm);
    const used = new Set(), map = [];
    const claim = (exact) => {
      Object.entries(def.fields).forEach(([field, names]) => {
        if (map.some((m) => m.field === field)) return;
        const col = heads.findIndex((h, i) => h && !used.has(i) && (exact ? names.includes(h) : names.some((n) => n.length > 3 && (h.includes(n) || n.includes(h)))));
        if (col >= 0) { used.add(col); map.push({ field, col, header: rows[r][col] }); }
      });
    };
    claim(true); claim(false);
    const score = map.length + (map.some((m) => m.field === def.required) ? 2 : 0);
    if (score > best.score) best = { score, row: r, map };
  }
  return { headerRow: best.row, mapping: best.map, matched: best.score > 0 };
}

// Which register does this sheet look like?
export function detectTarget(rows) {
  let pick = '', top = 0;
  for (const t of Object.keys(TARGETS)) {
    const m = mapColumns(t, rows);
    const s = m.matched ? m.mapping.length + (m.mapping.some((x) => x.field === TARGETS[t].required) ? 2 : 0) : 0;
    if (s > top) { top = s; pick = t; }
  }
  return pick;
}

// Excel stores dates as day numbers (46000 = 2025-12-09); text dates go through the usual loose parser.
export function toIsoDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return { value: null };
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return { value: d.toISOString().slice(0, 10) };
  }
  const p = parseDateLoose(s);
  return p ? { value: p } : { error: s };
}
const toNumber = (v) => {
  const s = String(v ?? '').replace(/[,%\s]/g, '');
  if (s === '') return { value: null };
  const n = Number(s);
  return Number.isNaN(n) || n < 0 ? { error: String(v) } : { value: n };
};
const pickEnum = (v, list) => {
  const s = norm(v);
  return list.find((x) => norm(x) === s) || null;
};

// → { mapping, rows (valid, ready to insert), errors, headerRow, total }
export function buildRows(target, table, ctx = {}) {
  const def = TARGETS[target];
  const { headerRow, mapping, matched } = mapColumns(target, table);
  const out = { mapping, headerRow, rows: [], errors: [], total: 0, ready: false };
  if (!def || !matched || !mapping.some((m) => m.field === def.required)) return out;
  out.ready = true;
  const col = Object.fromEntries(mapping.map((m) => [m.field, m.col]));
  const get = (r, f) => (col[f] === undefined ? '' : String(r[col[f]] ?? '').trim());
  const byCode = new Map((ctx.components || []).map((c) => [String(c.code || '').trim().toLowerCase(), c.id]));

  for (let i = headerRow + 1; i < table.length; i++) {
    const r = table[i] || [];
    if (!r.some((c) => String(c || '').trim())) continue;
    out.total++;
    const at = `Row ${i + 1}`;
    const bad = (m) => out.errors.push(`${at}: ${m}`);
    const date = (f) => { const x = toIsoDate(get(r, f)); if (x.error) { bad(`can’t read the date “${x.error}”`); return undefined; } return x.value; };
    const num = (f) => { const x = toNumber(get(r, f)); if (x.error) { bad(`“${x.error}” isn’t a valid number`); return undefined; } return x.value; };

    if (target === 'deliverables') {
      const title = get(r, 'title');
      if (!title) { bad('no deliverable name'); continue; }
      const baseline = date('baseline_date'), forecast = date('forecast_date'), actual = date('actual_date'), hours = num('planned_hours');
      if ([baseline, forecast, actual, hours].includes(undefined)) continue;
      const row = { phase: get(r, 'phase'), title: title.slice(0, 240), source: sourceKey(get(r, 'source')), source_ref: get(r, 'source_ref'), baseline_date: baseline, forecast_date: forecast, actual_date: actual, planned_hours: hours };
      const st = pickEnum(get(r, 'status'), DELIVERABLE_STATUSES);
      if (st) row.status = st;
      out.rows.push(row);
    } else if (target === 'milestones') {
      const title = get(r, 'title');
      if (!title) { bad('no milestone name'); continue; }
      const bs = date('baseline_start'), bf = date('baseline_finish'), ff = date('forecast_finish'), af = date('actual_finish');
      if ([bs, bf, ff, af].includes(undefined)) continue;
      if (bs && bf && bs > bf) { bad('start is after finish'); continue; }
      out.rows.push({ phase: get(r, 'phase'), title: title.slice(0, 240), kind: pickEnum(get(r, 'kind'), MILESTONE_KINDS) || 'Milestone', baseline_start: bs, baseline_finish: bf, forecast_finish: ff, actual_finish: af });
    } else if (target === 'actions') {
      const title = get(r, 'title');
      if (!title) { bad('no action text'); continue; }
      let s = date('start_on'); const due = date('due_on'); const ph = num('planned_hours'), ah = num('actual_hours');
      if ([s, due, ph, ah].includes(undefined)) continue;
      if (s && due && s > due) s = due;
      out.rows.push({ title: title.slice(0, 240), owner_name: get(r, 'owner_name').slice(0, 120), start_on: s, due_on: due, status: pickEnum(get(r, 'status'), ACTION_STATUSES) || 'Not Started', planned_hours: ph, actual_hours: ah, notes: get(r, 'notes') });
    } else if (target === 'hours') {
      const hours = num('cumulative_hours');
      if (hours === undefined) continue;
      if (hours === null) { bad('no hours'); continue; }
      const pRaw = get(r, 'period');
      let period = toPeriod(pRaw);
      if (!period && pRaw) { const d = toIsoDate(pRaw); if (d.value) period = `${d.value.slice(0, 7)}-01`; }
      if (!period) { bad(`can’t read the month “${pRaw}”`); continue; }
      const code = get(r, 'component');
      let componentId = null;
      if (code) { componentId = byCode.get(code.toLowerCase()) || null; if (!componentId) { bad(`no component with code “${code}”`); continue; } }
      const pr = get(r, 'progress_pct') === '' ? null : Number(get(r, 'progress_pct').replace('%', ''));
      if (pr !== null && (Number.isNaN(pr) || pr < 0 || pr > 100)) { bad('progress must be 0–100'); continue; }
      out.rows.push({ period, component_id: componentId, cumulative_hours: hours, progress_pct: pr });
    }
  }
  return out;
}

// Split valid rows into new ones and ones the project already has (same name — and phase for deliverables).
export function splitDuplicates(target, rows, existing) {
  const key = (t, x) => (target === 'deliverables' ? `${norm(x.phase)}|${norm(x.title)}` : norm(x.title));
  if (target === 'hours') {
    const have = new Map(existing.map((h) => [`${h.component_id || ''}|${h.period}`, h]));
    return { fresh: rows.filter((r) => !have.has(`${r.component_id || ''}|${r.period}`)), duplicates: rows.filter((r) => have.has(`${r.component_id || ''}|${r.period}`)), updates: true };
  }
  const seen = new Set(existing.map((x) => key(target, x)));
  const fresh = [], duplicates = [];
  rows.forEach((r) => { const k = key(target, r); if (seen.has(k)) duplicates.push(r); else { seen.add(k); fresh.push(r); } });
  return { fresh, duplicates, updates: false };
}
