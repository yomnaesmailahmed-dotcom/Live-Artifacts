// Deliverable rules: sources, statuses, paste-from-Excel parsing and submission effects.
import { parseDateLoose } from '../ui/format.js';

export const SOURCES = [
  ['rfp', 'RFP'],
  ['proposal', 'Technical proposal'],
  ['scope', 'Scope'],
  ['added', 'Added'],
  ['vo', 'Variation order'],
];
export const SOURCE_SHORT = { rfp: 'RFP', proposal: 'PROPOSAL', scope: 'SCOPE', added: 'ADDED', vo: 'VO' };

export const DELIVERABLE_STATUSES = ['Not Started', 'In Progress', 'Internal Review', 'Submitted', 'Approved', 'Rejected', 'On Hold', 'Cancelled'];
export const SUBMISSION_RESPONSES = ['Pending', 'Approved', 'Approved with comments', 'Revise & resubmit', 'Rejected'];
export const WORK_STATUSES = ['Not Started', 'In Progress', 'On Hold', 'Completed'];
export const CLOSED_STATUSES = new Set(['Submitted', 'Approved', 'Cancelled']);

export function sourceKey(text) {
  const s = String(text || '').trim().toLowerCase();
  if (!s) return 'scope';
  if (s === 'rfp' || s.includes('request for proposal')) return 'rfp';
  if (s.includes('proposal') || s === 'tp' || s === 'technical') return 'proposal';
  if (s.startsWith('vo') || s.includes('variation')) return 'vo';
  if (s.startsWith('add') || s.includes('extra')) return 'added';
  return 'scope';
}

// Late = not closed / on hold and its forecast (or baseline) date has passed.
export function isOverdue(d, today) {
  if (CLOSED_STATUSES.has(d.status) || d.status === 'On Hold') return false;
  const due = d.forecast_date || d.baseline_date;
  return !!due && due < today;
}

// Rows pasted from Excel / Sheets (tab separated; commas also accepted).
// Columns: Phase · Deliverable · Source · Source ref · Baseline date · Planned hours. A header row is skipped.
export function parseDeliverableRows(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  const rows = [], errors = [];
  lines.forEach((line, i) => {
    const cells = (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) => c.trim());
    if (i === 0 && /phase|deliverable|title/i.test(cells.join(' ')) && !parseDateLoose(cells[4])) return;
    const [phase = '', title = '', source = '', ref = '', date = '', hours = ''] = cells;
    if (!title) { errors.push(`Line ${i + 1}: no deliverable name`); return; }
    const baseline = date ? parseDateLoose(date) : null;
    if (date && !baseline) { errors.push(`Line ${i + 1}: can’t read the date “${date}”`); return; }
    const h = hours === '' ? null : Number(String(hours).replace(/,/g, ''));
    if (hours !== '' && (Number.isNaN(h) || h < 0)) { errors.push(`Line ${i + 1}: hours “${hours}” isn’t a number`); return; }
    rows.push({ phase, title: title.slice(0, 240), source: sourceKey(source), source_ref: ref, baseline_date: baseline, planned_hours: h });
  });
  return { rows, errors };
}

export function nextRevision(submissions) {
  const nums = submissions.map((s) => Number((String(s.revision || '').match(/(\d+)/) || [])[1])).filter((n) => !Number.isNaN(n));
  const n = nums.length ? Math.max(...nums) + 1 : 0;
  return `Rev ${String(n).padStart(2, '0')}`;
}

// What a submission (new or edited) means for its deliverable.
export function deliverablePatchForSubmission(deliverable, submission) {
  const patch = {};
  if (!submission || !submission.submitted_on) return patch;
  const r = submission.client_response;
  if (r === 'Approved' || r === 'Approved with comments') patch.status = 'Approved';
  else if (r === 'Revise & resubmit') patch.status = 'In Progress';
  else if (r === 'Rejected') patch.status = 'Rejected';
  else if (!['Approved', 'Cancelled', 'On Hold'].includes(deliverable.status)) patch.status = 'Submitted';
  if (!deliverable.actual_date) patch.actual_date = submission.submitted_on;
  Object.keys(patch).forEach((k) => { if (deliverable[k] === patch[k]) delete patch[k]; });
  return patch;
}

// Entry order (sort_order) follows the real phase sequence; alphabetical phases would put IFC before Schematic.
export function deliverableSort(a, b) {
  return ((a.sort_order || 0) - (b.sort_order || 0))
    || String(a.baseline_date || '9999').localeCompare(String(b.baseline_date || '9999'))
    || String(a.created_at || '').localeCompare(String(b.created_at || ''));
}
