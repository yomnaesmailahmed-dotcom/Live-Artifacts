// Project page: one project with its components, deliverables, submissions and team, all live,
// plus the metrics row and presence ("who's here, on which tab").
import { createLiveTable } from '../lib/live-table.js';
import { createPageStore } from './page-base.js';
import { joinPresence } from '../services/presence.js';
import { errMsg } from '../lib/store.js';
import { todayIso, displayName } from '../ui/format.js';
import { parseDeliverableRows, nextRevision, deliverablePatchForSubmission, deliverableSort } from '../domain/deliverables.js';
import { voFromCheckpoint, voFromIncident, deliverableFromVo, parsePcuRows, monthToPeriod, currentMonth, snapshotKey } from '../domain/registers.js';

const TABS = ['overview', 'deliverables', 'variations', 'incidents', 'hours', 'team'];
const tabFromHash = () => { const t = (window.location.hash || '').replace('#', ''); return TABS.includes(t) ? t : 'overview'; };
const projectIdFromUrl = () => new URL(window.location.href).searchParams.get('id') || '';

const pageInitial = () => ({
  projectId: projectIdFromUrl(), project: null, notFound: false, loaded: false,
  clients: [], components: [], deliverables: [], submissions: [], members: [], invites: [], people: {}, metrics: null,
  presence: [], tab: tabFromHash(),
  expanded: {}, confirmDelete: '', sourceFilter: '', phaseFilter: '',
  pasteOpen: false, pasteText: '', inviteBusy: false, inviteErr: '', inviteMsg: '',
  variations: [], incidents: [], hours: [],
  checkpoint: null, checkpointBusy: false, checkpointErr: '', highlightVo: '',
  pcuOpen: false, pcuText: '', pcuMsg: '',
});

const NUM = Object.fromEntries(['planned_hours', 'budget_hours', 'hours_impact', 'hours_spent', 'fee_impact', 'cost_impact', 'time_impact_days', 'cumulative_hours', 'progress_pct'].map((k) => [k, 'number']));
const DATES = ['start_date', 'baseline_finish', 'forecast_finish', 'actual_finish', 'baseline_date', 'forecast_date', 'actual_date', 'submitted_on', 'response_on',
  'email_received_on', 'decided_on', 'occurred_on', 'due_on'];
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
      T.hours = mk('hours', { table: 'hours_snapshots', filter: byProject, sort: (a, b) => String(b.period).localeCompare(String(a.period)) || String(a.component_id || '').localeCompare(String(b.component_id || '')), onChange: (r) => { store.set({ hours: r }); scheduleMetrics(); } });
      await Promise.all(Object.values(T).map((t) => t.start()));
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
    const { data } = await sb.from('project_metrics').select('*').eq('project_id', store.get().projectId).maybeSingle();
    store.set({ metrics: data || null });
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
    'hours_impact', 'hours_spent', 'fee_impact', 'cost_impact', 'time_impact_days', 'cumulative_hours', 'progress_pct']);

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
      addIncident, editIncident, incidentToVo,
      addSnapshot, editSnapshot, importPcu,
      togglePcu: () => store.set({ pcuOpen: !store.get().pcuOpen, pcuMsg: '' }),
      setPcuText: (e) => store.set({ pcuText: value(e) }),
      removeMember: (key) => removeRow('members', key),
      cancelInvite: (id) => removeRow('invites', id),
    },
  };
}
