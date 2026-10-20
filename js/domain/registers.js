// Variation orders, incidents and PCU hours: labels, builders and the PCU paste parser.
import { parseDateLoose } from '../ui/format.js';

export const VO_STATUSES = [
  ['candidate', 'Candidate (from email scan)'],
  ['draft', 'Draft'],
  ['submitted', 'Sent to client'],
  ['approved', 'Approved by client'],
  ['rejected', 'Rejected by client'],
  ['withdrawn', 'Withdrawn'],
];
export const VO_STATUS_SHORT = { candidate: 'CANDIDATE', draft: 'DRAFT', submitted: 'WITH CLIENT', approved: 'APPROVED', rejected: 'REJECTED', withdrawn: 'WITHDRAWN' };
export const VO_DECISIONS = new Set(['approved', 'rejected']);
export const VO_TRIGGERS = { manual: 'Entered manually', checkpoint: 'Email checkpoint', email_scan: 'Outlook scan', incident: 'From an incident' };

export const INCIDENT_CATEGORIES = ['Design error', 'Coordination', 'Rework', 'Resource', 'Late information', 'Client change', 'Client delay', 'Authority / permit', 'Third party', 'Other'];
export const RESPONSIBILITIES = ['To Be Confirmed', 'Client', 'Pinnacle', 'Shared', 'Third party'];
export const RESPONSIBILITY_BASES = ['Not established', 'Cause under review', 'Documented in source'];
export const INCIDENT_STATUSES = ['Open', 'Mitigating', 'Closed'];
export const ORIGINS = [['internal', 'Internal (our cost)'], ['external', 'External (client / third party)']];

export const regNo = (prefix, n) => (n ? `${prefix}-${String(n).padStart(3, '0')}` : `${prefix}-…`);

// <input type="month"> gives "2026-10"; the ledger stores the first of the month.
export const monthToPeriod = (m) => (/^\d{4}-\d{2}$/.test(m || '') ? `${m}-01` : null);
export const periodToMonth = (p) => (p ? String(p).slice(0, 7) : '');
export const currentMonth = () => new Date().toISOString().slice(0, 7);

// A VO drafted at an email checkpoint on a deliverable / submission.
export function voFromCheckpoint({ projectId, deliverable = null, submission = null, form }) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  return {
    project_id: projectId,
    direction: 'external',
    trigger_source: 'checkpoint',
    status: 'draft',
    deliverable_id: deliverable ? deliverable.id : null,
    submission_id: submission ? submission.id : null,
    title: (form.title || '').trim() || (deliverable ? `Client change — ${deliverable.title}` : 'Client change'),
    description: (form.description || '').trim(),
    email_from: (form.email_from || '').trim(),
    email_subject: (form.email_subject || '').trim(),
    email_received_on: form.email_received_on || null,
    email_link: (form.email_link || '').trim(),
    email_quote: (form.email_quote || '').trim().slice(0, 4000),
    time_impact_days: num(form.time_impact_days),
    hours_impact: num(form.hours_impact),
    fee_impact: num(form.fee_impact),
  };
}

// An external incident the client caused → a VO to recover the time and hours.
export function voFromIncident(projectId, incident) {
  return {
    project_id: projectId, direction: 'external', trigger_source: 'incident', status: 'draft',
    deliverable_id: incident.deliverable_id || null,
    title: `Recovery — ${incident.title || 'incident'}`,
    description: incident.description || '',
    time_impact_days: incident.time_impact_days ?? null,
    hours_impact: incident.hours_impact ?? null,
    fee_impact: incident.cost_impact ?? null,
  };
}

// A VO's added scope as a deliverable (source "vo").
export function deliverableFromVo(projectId, vo, sortOrder) {
  return {
    project_id: projectId, source: 'vo', variation_id: vo.id, source_ref: regNo('VO', vo.number),
    title: vo.title, planned_hours: vo.hours_impact ?? null, phase: '', status: 'Not Started', sort_order: sortOrder,
  };
}

// PCU export pasted from Excel: Period · Component code (blank = project total) · Cumulative hours · Progress %.
export function parsePcuRows(text, components) {
  const byCode = new Map(components.map((c) => [String(c.code || '').trim().toLowerCase(), c.id]));
  const rows = [], errors = [];
  String(text || '').split(/\r?\n/).filter((l) => l.trim()).forEach((line, i) => {
    const cells = (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) => c.trim());
    if (i === 0 && /period|month|hours/i.test(cells.join(' ')) && !toPeriod(cells[0])) return;
    const [period = '', code = '', hours = '', progress = ''] = cells;
    const p = toPeriod(period);
    if (!p) { errors.push(`Line ${i + 1}: can’t read the month “${period}”`); return; }
    let componentId = null;
    if (code) {
      componentId = byCode.get(code.toLowerCase()) || null;
      if (!componentId) { errors.push(`Line ${i + 1}: no component with code “${code}”`); return; }
    }
    const h = Number(String(hours).replace(/,/g, ''));
    if (hours === '' || Number.isNaN(h) || h < 0) { errors.push(`Line ${i + 1}: hours “${hours}” isn’t a number`); return; }
    const pr = progress === '' ? null : Number(String(progress).replace('%', ''));
    if (pr !== null && (Number.isNaN(pr) || pr < 0 || pr > 100)) { errors.push(`Line ${i + 1}: progress “${progress}” must be 0–100`); return; }
    rows.push({ period: p, component_id: componentId, cumulative_hours: h, progress_pct: pr });
  });
  return { rows, errors };
}

export function toPeriod(text) {
  const s = String(text || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-01`;
  m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[2]}-${String(m[1]).padStart(2, '0')}-01`;
  const d = parseDateLoose(s) || parseDateLoose(`01 ${s}`) || parseDateLoose(`01-${s}`);
  return d ? `${d.slice(0, 7)}-01` : null;
}

export const snapshotKey = (componentId, period) => `${componentId || 'project'}|${period}`;
