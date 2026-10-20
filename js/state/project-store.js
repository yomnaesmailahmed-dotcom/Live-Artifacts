// Project page: one project with its components, deliverables, submissions and team, all live,
// plus the metrics row and presence ("who's here, on which tab").
import { createLiveTable } from '../lib/live-table.js';
import { createPageStore } from './page-base.js';
import { joinPresence } from '../services/presence.js';
import { errMsg } from '../lib/store.js';
import { todayIso, displayName } from '../ui/format.js';
import { parseDeliverableRows, nextRevision, deliverablePatchForSubmission, deliverableSort } from '../domain/deliverables.js';
import { voFromCheckpoint, voFromIncident, deliverableFromVo, parsePcuRows, monthToPeriod, currentMonth, snapshotKey } from '../domain/registers.js';

import { weekStart } from '../domain/schedule.js';
import { candidateToVo } from '../domain/mail.js';
import * as mail from '../services/mail.js';

const TABS = ['overview', 'deliverables', 'timeline', 'queries', 'variations', 'incidents', 'hours', 'qc', 'team'];
const tabFromHash = () => { const t = (window.location.hash || '').replace('#', ''); return TABS.includes(t) ? t : 'overview'; };
const projectIdFromUrl = () => new URL(window.location.href).searchParams.get('id') || '';

const pageInitial = () => ({
  projectId: projectIdFromUrl(), project: null, notFound: false, loaded: false,
  clients: [], components: [], deliverables: [], submissions: [], members: [], invites: [], people: {}, metrics: null, progress: null,
  presence: [], tab: tabFromHash(),
  expanded: {}, confirmDelete: '', sourceFilter: '', phaseFilter: '',
  pasteOpen: false, pasteText: '', inviteBusy: false, inviteErr: '', inviteMsg: '',
  variations: [], incidents: [], hours: [], qc: [], qcOpen: '',
  checkpoint: null, checkpointBusy: false, checkpointErr: '', highlightVo: '',
  pcuOpen: false, pcuText: '', pcuMsg: '',
  milestones: [], actions: [], queries: [], statuses: [],
  queryBusy: false, queryErr: '', statusBusy: false, statusErr: '', queryFilter: 'open',
  // Outlook scan (phase 5)
  candidates: [], mailFolders: [], mailStatus: null, mailBusy: '', mailErr: '', mailMsg: mail.takeOutlookReturn(),
  folderList: null, folderPick: '', showDecided: false,
});

const NUM = Object.fromEntries(['planned_hours', 'budget_hours', 'hours_impact', 'hours_spent', 'fee_impact', 'cost_impact', 'time_impact_days', 'cumulative_hours', 'progress_pct',
  'actual_hours', 'hours_this_period', 'contract_fee', 'invoiced_to_date', 'cost_to_date'].map((k) => [k, 'number']));
const DATES = ['start_date', 'baseline_finish', 'forecast_finish', 'actual_finish', 'baseline_date', 'forecast_date', 'actual_date', 'submitted_on', 'response_on',
  'email_received_on', 'evidence_received_on', 'checked_on', 'decided_on', 'occurred_on', 'due_on', 'baseline_start', 'start_on', 'done_on', 'period_start'];
const codecs = { ...NUM, ...Object.fromEntries(DATES.map((d) => [d, 'date'])) };

export function createProjectStore(session) {
  let sb = null;
  let T = {};
  let presence = null;
  let metricsTimer = null;

  const { store, trackStatus } = createPageStore({
    session, pageInitial,
    onReset() {
      Object.values(T).forEach((t) => t.close()); T = {};
      if (presence) presence.leave(); presence = null;
      clearTimeout(metricsTimer);
    },
    async onReady(client, s) {
      sb = client;
      const id = store.get().projectId;
      if (!/^[0-9a-f-]{36}$/i.test(id)) { store.set({ notFound: true, loaded: true }); return; }
      const mk = (name, opts) => createLiveTable({ sb, codecs, onStatus: trackStatus(name), ...opts });
      const byProject = { column: 'project_id', value: id };
      T.project = mk('project', { table: 'projects', filter: { column: 'id', value: id }, onChange: (r) => { store.set({ project: r[0] || null }); scheduleMetrics(); } });
      T.clients = mk('clients', { table: 'clients', sort: (a, b) => a.name.localeCompare(b.name), onChange: (r) => store.set({ clients: r }) });
      T.components = mk('components', { table: 'components', filter: byProject, sort: (a, b) => String(a.code).localeCompare(String(b.code)) || a.name.localeCompare(b.name), onChange: (r) => { store.set({ components: r }); scheduleMetrics(); } });
      T.deliverables = mk('deliverables', { table: 'deliverables', filter: byProject, sort: deliverableSort, onChange: (r) => { store.set({ deliverables: r }); scheduleMetrics(); } });
      T.submissions = mk('submissions', { table: 'submissions', filter: byProject, sort: (a, b) => String(a.submitted_on || '').localeCompare(String(b.submitted_on || '')) || String(a.created_at || '').localeCompare(String(b.created_at || '')), onChange: (r) => { store.set({ submissions: r }); scheduleMetrics(); } });
      T.members = mk('members', { table: 'project_members', filter: byProject, keyCols: ['project_id', 'user_id'], hasOrigin: false, onChange: (r) => { store.set({ members: r }); loadPeople(r); } });
      const byNumber = (a, b) => (b.number || 0) - (a.number || 0) || String(b.created_at || '').localeCompare(String(a.created_at || ''));
      T.variations = mk('variations', { table: 'variations', filter: byProject, sort: byNumber, onChange: (r) => { store.set({ variations: r }); scheduleMetrics(); } });
      T.incidents = mk('incidents', { table: 'incidents', filter: byProject, sort: byNumber, onChange: (r) => { store.set({ incidents: r }); scheduleMetrics(); } });
      T.milestones = mk('milestones', { table: 'milestones', filter: byProject, sort: (a, b) => (a.sort_order - b.sort_order) || String(a.baseline_finish || '9999').localeCompare(String(b.baseline_finish || '9999')) || String(a.created_at || '').localeCompare(String(b.created_at || '')), onChange: (r) => { store.set({ milestones: r }); scheduleMetrics(); } });
      T.actions = mk('actions', { table: 'actions', filter: byProject, sort: (a, b) => String(a.due_on || '9999').localeCompare(String(b.due_on || '9999')) || (a.number || 0) - (b.number || 0), onChange: (r) => { store.set({ actions: r }); scheduleMetrics(); } });
      T.queries = mk('queries', { table: 'ptm_queries', filter: byProject, sort: byNumber, onChange: (r) => { store.set({ queries: r }); scheduleMetrics(); loadPeople(r.flatMap((q) => [q.raised_by, q.assigned_to, q.answered_by].filter(Boolean).map((user_id) => ({ user_id })))); } });
      T.statuses = mk('statuses', { table: 'team_status', filter: byProject, sort: (a, b) => String(b.period_start).localeCompare(String(a.period_start)) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')), onChange: (r) => { store.set({ statuses: r }); scheduleMetrics(); loadPeople(r.filter((x) => x.reported_by).map((x) => ({ user_id: x.reported_by }))); } });
      T.hours = mk('hours', { table: 'hours_snapshots', filter: byProject, sort: (a, b) => String(b.period).localeCompare(String(a.period)) || String(a.component_id || '').localeCompare(String(b.component_id || '')), onChange: (r) => { store.set({ hours: r }); scheduleMetrics(); } });
      T.qc = mk('qc', { table: 'qc_checks', filter: byProject, sort: (a, b) => a.gate - b.gate, onChange: (r) => store.set({ qc: r }) });
      T.candidates = mk('candidates', { table: 'mail_candidates', filter: byProject, sort: (a, b) => String(b.received_at || b.created_at || '').localeCompare(String(a.received_at || a.created_at || '')), onChange: (r) => store.set({ candidates: r }) });
      T.mailFolders = mk('mailFolders', { table: 'mail_folders', filter: byProject, columns: 'id, connection_id, project_id, folder_id, folder_name, enabled, last_scan_at, messages_seen, created_at, updated_origin', sort: (a, b) => String(a.folder_name).localeCompare(String(b.folder_name)), onChange: (r) => store.set({ mailFolders: r }) });
      await Promise.all(Object.values(T).map((t) => t.start()));
      refreshMailStatus();
      T.invites = mk('invites', { table: 'project_invites', filter: byProject, hasOrigin: false, onChange: (r) => store.set({ invites: r }) });
      await T.invites.start({ live: false }); // not in the realtime publication; empty unless you manage the project
      if (!store.get().project) { store.set({ notFound: true, loaded: true }); return; }
      await loadMetrics();
      store.set({ loaded: true });
      const me = s.profile || { id: s.user.id, email: s.user.email };
      joinPresence(sb, `project:${id}`, { user_id: s.user.id, email: me.email, name: displayName(me), tab: store.get().tab, at: Date.now() },
        (people) => store.set({ presence: people })).then((p) => { presence = p; }).catch(() => {});
    },
  });

  async function loadMetrics() {
    if (!sb) return;
    const id = store.get().projectId;
    const [m, pr] = await Promise.all([
      sb.from('project_metrics').select('*').eq('project_id', id).maybeSingle(),
      sb.from('project_progress').select('*').eq('project_id', id).maybeSingle(),
    ]);
    store.set({ metrics: m.data || null, progress: pr.data || null });
  }
  function scheduleMetrics() { clearTimeout(metricsTimer); metricsTimer = setTimeout(() => loadMetrics().catch(() => {}), 500); }

  async function loadPeople(rows) {
    const ids = [...new Set(rows.map((r) => r.user_id))].filter((id) => !store.get().people[id]);
    if (!ids.length || !sb) return;
    const { data } = await sb.from('profiles').select('id, email, full_name').in('id', ids);
    if (data) store.set({ people: { ...store.get().people, ...Object.fromEntries(data.map((p) => [p.id, p])) } });
  }

  // ── actions ─────────────────────────────────────────────
  const value = (e) => (e && e.target ? e.target.value : e);
  const TYPED = new Set(['name', 'code', 'location', 'stage', 'scope_summary', 'rfp_ref', 'proposal_ref', 'title', 'phase', 'source_ref', 'notes', 'revision', 'discipline', 'planned_hours', 'budget_hours',
    'description', 'email_from', 'email_subject', 'email_link', 'email_quote', 'client_ref', 'action', 'owner', 'note',
    'hours_impact', 'hours_spent', 'fee_impact', 'cost_impact', 'time_impact_days', 'cumulative_hours', 'progress_pct',
    'contract_fee', 'invoiced_to_date', 'cost_to_date', 'currency', 'checked_by_name', 'evidence_subject', 'evidence_from', 'evidence_link', 'evidence_quote', 'owner_name', 'question', 'context', 'answer', 'team', 'done_text', 'next_text', 'blockers', 'actual_hours', 'hours_this_period']);

  function setTab(tab) {
    store.set({ tab });
    try { window.history.replaceState(window.history.state, '', `#${tab}`); } catch (_) { /* ignore */ }
    if (presence) presence.update({ tab });
  }

  const editProject = (field) => (e) => T.project && T.project.update(store.get().projectId, { [field]: value(e) }, { typing: TYPED.has(field) });

  async function addComponent() {
    const n = store.get().components.length + 1;
    try { await T.components.insert({ project_id: store.get().projectId, code: `C${String(n).padStart(2, '0')}`, name: 'New component' }); } catch (_) { /* shown in header */ }
  }
  const editComponent = (id, field) => (e) => T.components.update(id, { [field]: value(e) }, { typing: TYPED.has(field) });

  async function addDeliverable() {
    const S = store.get();
    const last = S.deliverables[S.deliverables.length - 1];
    const sort = S.deliverables.reduce((m, d) => Math.max(m, d.sort_order || 0), 0) + 1;
    try {
      await T.deliverables.insert({ project_id: S.projectId, phase: S.phaseFilter || (last ? last.phase : ''), title: '', source: S.sourceFilter || 'scope', sort_order: sort });
    } catch (_) { /* shown in header */ }
  }
  const editDeliverable = (id, field) => (e) => T.deliverables.update(id, { [field]: value(e) }, { typing: TYPED.has(field) });

  function askDelete(key) { store.set({ confirmDelete: store.get().confirmDelete === key ? '' : key }); }
  async function removeRow(table, key) { store.set({ confirmDelete: '' }); await T[table].remove(key); }

  function toggleExpand(id) { store.set({ expanded: { ...store.get().expanded, [id]: !store.get().expanded[id] } }); }

  function syncDeliverable(deliverableId, sub) {
    const d = T.deliverables.get(deliverableId);
    if (!d) return;
    const patch = deliverablePatchForSubmission(d, sub);
    if (Object.keys(patch).length) T.deliverables.update(deliverableId, patch);
  }

  async function addSubmission(deliverableId) {
    const S = store.get();
    const subs = S.submissions.filter((x) => x.deliverable_id === deliverableId);
    const sub = { project_id: S.projectId, deliverable_id: deliverableId, revision: nextRevision(subs), submitted_on: todayIso(), client_response: 'Pending' };
    try {
      await T.submissions.insert(sub);
      syncDeliverable(deliverableId, sub);
      store.set({ expanded: { ...S.expanded, [deliverableId]: true } });
    } catch (_) { /* shown in header */ }
  }
  const editSubmission = (id, field) => (e) => {
    T.submissions.update(id, { [field]: value(e) }, { typing: TYPED.has(field) });
    if (field === 'submitted_on' || field === 'client_response') {
      const sub = T.submissions.get(id);
      if (sub) syncDeliverable(sub.deliverable_id, sub);
    }
  };

  async function importPaste() {
    const S = store.get();
    const { rows } = parseDeliverableRows(S.pasteText);
    if (!rows.length) return;
    let sort = S.deliverables.reduce((m, d) => Math.max(m, d.sort_order || 0), 0);
    try {
      await T.deliverables.insertMany(rows.map((r) => ({ ...r, project_id: S.projectId, sort_order: ++sort })));
      store.set({ pasteOpen: false, pasteText: '' });
    } catch (_) { /* shown in header */ }
  }

  async function invite(e) {
    if (e && e.preventDefault) e.preventDefault();
    const el = e && (e.currentTarget || e.target);
    const form = el && (el.tagName === 'FORM' ? el : el.form);
    const email = form ? String(form.elements.email.value || '').trim().toLowerCase() : '';
    const role = form ? form.elements.role.value : 'team';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { store.set({ inviteErr: 'Enter a valid email address.', inviteMsg: '' }); return; }
    store.set({ inviteBusy: true, inviteErr: '', inviteMsg: '' });
    try {
      const { error } = await sb.from('project_invites').insert({ project_id: store.get().projectId, email, role });
      if (error) throw error;
      await Promise.all([T.members.load(), T.invites.load()]);
      const joined = store.get().invites.every((i) => i.email !== email);
      store.set({ inviteBusy: false, inviteMsg: joined ? `${email} has been added.` : `${email} will join when they sign up with that email.` });
      if (form) form.reset();
    } catch (err) {
      store.set({ inviteBusy: false, inviteErr: /duplicate|unique/i.test(errMsg(err)) ? 'That person is already invited.' : errMsg(err) });
    }
  }

  const setMemberRole = (key) => (e) => T.members.update(key, { role: value(e) });

  function toggleArchive() {
    const p = store.get().project;
    if (p) T.project.update(p.id, { archived: !p.archived });
  }
  async function deleteProject() {
    const id = store.get().projectId;
    store.set({ confirmDelete: '' });
    const { error } = await sb.from('projects').delete().eq('id', id);
    if (error) { store.set({ sync: 'error', syncMsg: errMsg(error) }); return; }
    window.location.href = './Projects.dc.html';
  }

  // ── variations: email checkpoint, manual VOs, VO → deliverable ──
  function openCheckpoint({ deliverableId = null, submissionId = null } = {}) {
    store.set({ checkpoint: { deliverableId, submissionId }, checkpointErr: '' });
  }
  function readForm(e) {
    const el = e && (e.currentTarget || e.target);
    const form = el && (el.tagName === 'FORM' ? el : el.form);
    const out = {};
    if (form) [...form.elements].forEach((f) => { if (f.name) out[f.name] = String(f.value || ''); });
    return { form, values: out };
  }
  async function submitCheckpoint(e) {
    if (e && e.preventDefault) e.preventDefault();
    const S = store.get();
    const cp = S.checkpoint;
    if (!cp) return;
    const { values } = readForm(e);
    if (!values.title.trim() && !values.email_quote.trim()) { store.set({ checkpointErr: 'Say what changed, or paste the line from the email.' }); return; }
    const deliverable = cp.deliverableId ? T.deliverables.get(cp.deliverableId) : null;
    const submission = cp.submissionId ? T.submissions.get(cp.submissionId) : null;
    store.set({ checkpointBusy: true, checkpointErr: '' });
    try {
      const id = await T.variations.insert(voFromCheckpoint({ projectId: S.projectId, deliverable, submission, form: values }));
      store.set({ checkpointBusy: false, checkpoint: null, highlightVo: id });
      setTab('variations');
    } catch (err) {
      store.set({ checkpointBusy: false, checkpointErr: errMsg(err) });
    }
  }
  async function addVo() {
    try {
      const id = await T.variations.insert({ project_id: store.get().projectId, direction: 'external', trigger_source: 'manual', status: 'draft', title: '' });
      store.set({ highlightVo: id });
    } catch (_) { /* shown in header */ }
  }
  const editVo = (id, field) => (e) => T.variations.update(id, { [field]: value(e) }, { typing: TYPED.has(field) });
  async function voToDeliverable(id) {
    const S = store.get();
    const vo = T.variations.get(id);
    if (!vo) return;
    const sort = S.deliverables.reduce((m, d) => Math.max(m, d.sort_order || 0), 0) + 1;
    try { await T.deliverables.insert(deliverableFromVo(S.projectId, vo, sort)); } catch (_) { /* shown in header */ }
  }

  // ── Outlook scan: connection, folder → project mapping, candidate inbox ──
  async function refreshMailStatus() {
    if (!sb) return;
    try { store.set({ mailStatus: await mail.mailStatus(sb) }); } catch (err) { store.set({ mailStatus: { unavailable: true, error: errMsg(err) } }); }
  }
  async function mailTask(name, fn) {
    store.set({ mailBusy: name, mailErr: '' });
    try { await fn(); } catch (err) { store.set({ mailErr: errMsg(err) }); }
    store.set({ mailBusy: '' });
  }
  const connectOutlook = () => mailTask('connect', () => mail.connectOutlook(sb));
  const openFolderPicker = () => mailTask('folders', async () => {
    const { folders } = await mail.mailFolders(sb);
    store.set({ folderList: folders || [], folderPick: '' });
  });
  async function mapFolder() {
    const S = store.get();
    const f = (S.folderList || []).find((x) => x.id === S.folderPick);
    const conn = S.mailStatus && S.mailStatus.connection;
    if (!f || !conn) return;
    await mailTask('map', async () => {
      try {
        await T.mailFolders.insert({ connection_id: conn.id, project_id: S.projectId, folder_id: f.id, folder_name: f.path, enabled: true });
      } catch (err) {
        throw new Error(/duplicate|unique/i.test(errMsg(err)) ? 'That folder is already scanned for a project (one folder feeds one project).' : errMsg(err));
      }
      store.set({ folderList: null, folderPick: '', mailMsg: { ok: true, msg: `“${f.path}” will be scanned every 30 minutes. Use Scan now to check it straight away.` } });
    });
  }
  const scanNow = () => mailTask('scan', async () => {
    const r = await mail.scanNow(sb, store.get().projectId);
    store.set({ mailMsg: { ok: !r.error, msg: mail.scanSummary(r) } });
    await T.candidates.load();
  });
  async function acceptCandidate(id) {
    const c = T.candidates.get(id);
    if (!c || c.status !== 'new') return;
    try {
      const voId = await T.variations.insert(candidateToVo(c));
      T.candidates.update(id, { status: 'accepted', variation_id: voId });
      store.set({ highlightVo: voId });
    } catch (_) { /* shown in header */ }
  }
  const setCandidateStatus = (id, status) => T.candidates.update(id, { status });

  // ── QC gates (QC1 → QC2 → QC3, with the sign-off email as evidence) ──
  const qcInserts = new Map(); // "deliverable:gate" -> pending insert, so quick edits never create the same row twice
  async function ensureQc(deliverableId, gate) {
    const key = `${deliverableId}:${gate}`;
    const have = store.get().qc.find((c) => c.deliverable_id === deliverableId && c.gate === gate);
    if (have) return have.id;
    if (!qcInserts.has(key)) {
      const p = T.qc.insert({ project_id: store.get().projectId, deliverable_id: deliverableId, gate }).finally(() => qcInserts.delete(key));
      qcInserts.set(key, p);
    }
    return qcInserts.get(key);
  }
  const editGate = (deliverableId, gate, field) => async (e) => {
    const v = value(e);
    try {
      const id = await ensureQc(deliverableId, gate);
      const patch = { [field]: v };
      if (field === 'status' && v !== 'pending' && !(T.qc.get(id) || {}).checked_on) patch.checked_on = todayIso();
      T.qc.update(id, patch, { typing: TYPED.has(field) });
    } catch (_) { /* shown in header */ }
  };
  const openGate = (key) => store.set({ qcOpen: store.get().qcOpen === key ? '' : key });

  // ── incidents ──
  async function addIncident(origin = 'internal') {
    try { await T.incidents.insert({ project_id: store.get().projectId, origin, title: '', occurred_on: todayIso(), status: 'Open' }); } catch (_) { /* shown in header */ }
  }
  const editIncident = (id, field) => (e) => T.incidents.update(id, { [field]: value(e) }, { typing: TYPED.has(field) });
  async function incidentToVo(id) {
    const inc = T.incidents.get(id);
    if (!inc) return;
    try {
      const voId = await T.variations.insert(voFromIncident(store.get().projectId, inc));
      T.incidents.update(id, { variation_id: voId });
      store.set({ highlightVo: voId });
    } catch (_) { /* shown in header */ }
  }

  // ── hours ledger (PCU) ──
  async function addSnapshot() {
    const S = store.get();
    const period = monthToPeriod(currentMonth());
    const taken = new Set(S.hours.map((h) => snapshotKey(h.component_id, h.period)));
    if (taken.has(snapshotKey(null, period))) { store.set({ pcuMsg: 'This month already has a project-total row — edit it, or pick another month.' }); return; }
    try { await T.hours.insert({ project_id: S.projectId, period, cumulative_hours: 0, source: 'PCU' }); store.set({ pcuMsg: '' }); } catch (_) { /* shown in header */ }
  }
  const editSnapshot = (id, field) => (e) => {
    let v = value(e);
    if (field === 'period') { v = monthToPeriod(v); if (!v) return; }
    if (field === 'component_id' && v === '') v = null;
    T.hours.update(id, { [field]: v }, { typing: TYPED.has(field) });
  };
  async function importPcu() {
    const S = store.get();
    const { rows } = parsePcuRows(S.pcuText, S.components);
    if (!rows.length) return;
    const existing = new Map(S.hours.map((h) => [snapshotKey(h.component_id, h.period), h]));
    const fresh = [];
    rows.forEach((r) => {
      const hit = existing.get(snapshotKey(r.component_id, r.period));
      if (hit) T.hours.update(hit.id, { cumulative_hours: r.cumulative_hours, progress_pct: r.progress_pct });
      else fresh.push({ ...r, project_id: S.projectId, source: 'PCU' });
    });
    try {
      if (fresh.length) await T.hours.insertMany(fresh);
      store.set({ pcuOpen: false, pcuText: '', pcuMsg: `${rows.length} PCU row${rows.length === 1 ? '' : 's'} imported (${rows.length - fresh.length} updated).` });
    } catch (_) { /* shown in header */ }
  }

  // ── timeline: milestones + action plan ──
  async function addMilestone() {
    const S = store.get();
    const sort = S.milestones.reduce((m, x) => Math.max(m, x.sort_order || 0), 0) + 1;
    try { await T.milestones.insert({ project_id: S.projectId, title: '', kind: 'Milestone', sort_order: sort }); } catch (_) { /* shown in header */ }
  }
  // Keep a start ≤ finish pair valid (the tables enforce it): moving one end past the other drags it along.
  function keepOrdered(row, field, v, startKey, endKey) {
    const patch = { [field]: v };
    if (!v || !row) return patch;
    if (field === endKey && row[startKey] && v < row[startKey]) patch[startKey] = v;
    if (field === startKey && row[endKey] && v > row[endKey]) patch[endKey] = v;
    return patch;
  }
  const editMilestone = (id, field) => (e) => {
    let v = value(e);
    if (field === 'component_id' && v === '') v = null;
    T.milestones.update(id, keepOrdered(T.milestones.get(id), field, v, 'baseline_start', 'baseline_finish'), { typing: TYPED.has(field) });
  };
  async function addAction(milestoneId = null) {
    const S = store.get();
    const ms = milestoneId ? S.milestones.find((m) => m.id === milestoneId) : null;
    const due = ms ? (ms.forecast_finish || ms.baseline_finish || null) : null;
    const today = todayIso();
    try {
      // start never after due (the table enforces start_on <= due_on): a past milestone gets start = due
      await T.actions.insert({ project_id: S.projectId, title: '', milestone_id: milestoneId, start_on: due && due < today ? due : today, due_on: due, status: 'Not Started' });
    } catch (_) { /* shown in header */ }
  }
  const editAction = (id, field) => (e) => {
    let v = value(e);
    if (['owner_id', 'milestone_id', 'deliverable_id'].includes(field) && v === '') v = null;
    T.actions.update(id, keepOrdered(T.actions.get(id), field, v, 'start_on', 'due_on'), { typing: TYPED.has(field) });
  };

  // ── PTM queries + team status ──
  async function raiseQuery(e) {
    if (e && e.preventDefault) e.preventDefault();
    const { form, values } = readForm(e);
    if (!values.question || !values.question.trim()) { store.set({ queryErr: 'Write the question for the DM.' }); return; }
    store.set({ queryBusy: true, queryErr: '' });
    try {
      await T.queries.insert({
        project_id: store.get().projectId, question: values.question.trim(), context: (values.context || '').trim(),
        priority: values.priority || 'Normal', assigned_to: values.assigned_to || null, due_on: values.due_on || null,
        deliverable_id: values.deliverable_id || null, milestone_id: values.milestone_id || null, status: 'Open',
      });
      store.set({ queryBusy: false });
      if (form) form.reset();
    } catch (err) { store.set({ queryBusy: false, queryErr: errMsg(err) }); }
  }
  const editQuery = (id, field) => (e) => {
    let v = value(e);
    if (['assigned_to', 'deliverable_id', 'milestone_id'].includes(field) && v === '') v = null;
    T.queries.update(id, { [field]: v }, { typing: TYPED.has(field) });
  };
  async function addStatus(e) {
    if (e && e.preventDefault) e.preventDefault();
    const { form, values } = readForm(e);
    const S = store.get();
    const period = weekStart(values.period_start || todayIso());
    store.set({ statusBusy: true, statusErr: '' });
    try {
      await T.statuses.insert({
        project_id: S.projectId, period_start: period, team: (values.team || '').trim(), status_flag: values.status_flag || 'On Track',
        progress_pct: values.progress_pct === '' ? null : values.progress_pct, hours_this_period: values.hours_this_period === '' ? null : values.hours_this_period,
        done_text: (values.done_text || '').trim(), next_text: (values.next_text || '').trim(), blockers: (values.blockers || '').trim(),
      });
      store.set({ statusBusy: false });
      if (form) form.reset();
    } catch (err) { store.set({ statusBusy: false, statusErr: errMsg(err) }); }
  }
  const editStatus = (id, field) => (e) => T.statuses.update(id, { [field]: value(e) }, { typing: TYPED.has(field) });

  session.setBeforeSignOut(async () => { await Promise.all(Object.values(T).map((t) => t.flushAll())); });
  window.addEventListener('hashchange', () => { const t = tabFromHash(); if (t !== store.get().tab) setTab(t); });

  return {
    store,
    actions: {
      ...session.actions,
      setTab, editProject, addComponent, editComponent, addDeliverable, editDeliverable,
      askDelete, removeRow, toggleExpand, addSubmission, editSubmission,
      setSourceFilter: (v) => store.set({ sourceFilter: store.get().sourceFilter === v ? '' : v }),
      setPhaseFilter: (e) => store.set({ phaseFilter: value(e) }),
      togglePaste: () => store.set({ pasteOpen: !store.get().pasteOpen }),
      setPasteText: (e) => store.set({ pasteText: value(e) }),
      importPaste, invite, setMemberRole, toggleArchive, deleteProject,
      openCheckpoint, closeCheckpoint: () => store.set({ checkpoint: null, checkpointErr: '' }), submitCheckpoint,
      addVo, editVo, voToDeliverable,
      addIncident, editIncident, incidentToVo, editGate, openGate,
      addSnapshot, editSnapshot, importPcu,
      addMilestone, editMilestone, addAction, editAction,
      raiseQuery, editQuery, addStatus, editStatus,
      setQueryFilter: (f) => store.set({ queryFilter: f }),
      togglePcu: () => store.set({ pcuOpen: !store.get().pcuOpen, pcuMsg: '' }),
      setPcuText: (e) => store.set({ pcuText: value(e) }),
      connectOutlook, openFolderPicker, mapFolder, scanNow, acceptCandidate,
      closeFolderPicker: () => store.set({ folderList: null, folderPick: '' }),
      setFolderPick: (e) => store.set({ folderPick: value(e) }),
      toggleFolder: (id) => { const f = T.mailFolders.get(id); if (f) T.mailFolders.update(id, { enabled: !f.enabled }); },
      removeFolder: (id) => removeRow('mailFolders', id),
      dismissCandidate: (id) => setCandidateStatus(id, 'dismissed'),
      restoreCandidate: (id) => setCandidateStatus(id, 'new'),
      toggleDecided: () => store.set({ showDecided: !store.get().showDecided }),
      clearMailMsg: () => store.set({ mailMsg: null, mailErr: '' }),
      removeMember: (key) => removeRow('members', key),
      cancelInvite: (id) => removeRow('invites', id),
    },
  };
}
