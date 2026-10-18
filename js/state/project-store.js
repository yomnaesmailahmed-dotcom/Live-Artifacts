// Project page: one project with its components, deliverables, submissions and team, all live,
// plus the metrics row and presence ("who's here, on which tab").
import { createLiveTable } from '../lib/live-table.js';
import { createPageStore } from './page-base.js';
import { joinPresence } from '../services/presence.js';
import { errMsg } from '../lib/store.js';
import { todayIso, displayName } from '../ui/format.js';
import { parseDeliverableRows, nextRevision, deliverablePatchForSubmission, deliverableSort } from '../domain/deliverables.js';

const TABS = ['overview', 'deliverables', 'team'];
const tabFromHash = () => { const t = (window.location.hash || '').replace('#', ''); return TABS.includes(t) ? t : 'overview'; };
const projectIdFromUrl = () => new URL(window.location.href).searchParams.get('id') || '';

const pageInitial = () => ({
  projectId: projectIdFromUrl(), project: null, notFound: false, loaded: false,
  clients: [], components: [], deliverables: [], submissions: [], members: [], invites: [], people: {}, metrics: null,
  presence: [], tab: tabFromHash(),
  expanded: {}, confirmDelete: '', sourceFilter: '', phaseFilter: '',
  pasteOpen: false, pasteText: '', inviteBusy: false, inviteErr: '', inviteMsg: '',
});

const NUM = { planned_hours: 'number', budget_hours: 'number' };
const DATES = ['start_date', 'baseline_finish', 'forecast_finish', 'actual_finish', 'baseline_date', 'forecast_date', 'actual_date', 'submitted_on', 'response_on'];
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
  const TYPED = new Set(['name', 'code', 'location', 'stage', 'scope_summary', 'rfp_ref', 'proposal_ref', 'title', 'phase', 'source_ref', 'notes', 'revision', 'discipline', 'planned_hours', 'budget_hours']);

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
      removeMember: (key) => removeRow('members', key),
      cancelInvite: (id) => removeRow('invites', id),
    },
  };
}
